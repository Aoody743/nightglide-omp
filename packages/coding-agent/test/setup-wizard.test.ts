import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, mock, vi } from "bun:test";
import { YAML } from "bun";
import type { Model } from "@oh-my-pi/pi-ai";
import { buildModel } from "@oh-my-pi/pi-catalog/build";
import * as updateCli from "@oh-my-pi/pi-coding-agent/cli/update-cli";
import { runOnboardingSetup } from "@oh-my-pi/pi-coding-agent/commands/setup";
import * as customProviders from "@oh-my-pi/pi-coding-agent/config/nightglide-custom-providers";
import { cfgNightglideLocalModel, cfgNightglideRoutingMode } from "@oh-my-pi/pi-coding-agent/config/nightglide-routing";
import { Settings } from "@oh-my-pi/pi-coding-agent/config/settings";
import {
	ALL_SCENES,
	createSetupHost,
	CURRENT_SETUP_VERSION,
	markSetupWizardComplete,
	runSetupWizard,
	type SetupScene,
	type SetupSceneHost,
	selectSetupScenes,
} from "@oh-my-pi/pi-coding-agent/modes/setup";
import { NIGHTGLIDE_WORDMARK } from "@oh-my-pi/pi-tui/prompt/welcome";
import { describeSetupOutro, renderSetupOutro } from "@oh-my-pi/pi-tui/setup/scenes/outro";
import { providersSetupScene } from "@oh-my-pi/pi-tui/setup/scenes/sign-in";
import { describeSetupSplash, renderSetupSplash } from "@oh-my-pi/pi-tui/setup/scenes/splash";
import { themeSetupScene } from "@oh-my-pi/pi-tui/setup/scenes/theme";
import { updatesSetupScene } from "@oh-my-pi/pi-tui/setup/scenes/updates";
import { SetupWizardComponent } from "@oh-my-pi/pi-tui/setup/wizard-overlay";
import { setTerminalGlyphProtocol } from "@oh-my-pi/pi-tui/terminal-capabilities";
import { initTheme, theme } from "@oh-my-pi/pi-tui/theme";
import type { InteractiveModeContext } from "@oh-my-pi/pi-coding-agent/modes/types";

import { cfgSetupVersion, cfgSymbolPreset } from "@oh-my-pi/pi-coding-agent/modes/settings";

type SetupApplicationSceneHost = Omit<SetupSceneHost, "ctx"> & { ctx: InteractiveModeContext };

function bindSceneHost(host: SetupApplicationSceneHost): SetupSceneHost {
	return { ...host, ctx: createSetupHost(host.ctx) };
}

function fakeContextWithConfiguredModel(): InteractiveModeContext {
	return {
		session: {
			modelRegistry: {
				getAvailable: () => [{ provider: "configured", id: "model" }],
			},
		},
	} as unknown as InteractiveModeContext;
}

function testScene(id: string, minVersion: number, shouldRun?: () => boolean): SetupScene {
	return {
		id,
		title: id,
		step: id,
		minVersion,
		shouldRun,
		mount: () => ({
			title: id,
			render: () => [],
			invalidate: () => {},
		}),
	};
}

afterEach(async () => {
	await initTheme(false, "unicode", false, "nightglide-flight", "nightglide-cloudlight");
});

describe("setup wizard scene selection", () => {
	// Tests run from a source checkout, which never updates itself; pin a self-updating install.
	beforeEach(() => {
		vi.spyOn(updateCli, "canSelfUpdate").mockResolvedValue(true);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("runs all v1 scenes for a new user", async () => {
		const scenes = await selectSetupScenes(0, ALL_SCENES, fakeContextWithConfiguredModel(), { isTTY: true });
		expect(scenes.map(scene => scene.id)).toEqual(ALL_SCENES.map(scene => scene.id));
	});

	it("keeps CURRENT_SETUP_VERSION in sync with the highest scene minVersion", () => {
		// main.ts's cold-launch gate sources CURRENT_SETUP_VERSION from the tiny
		// `setup-version` module to decide whether to load the wizard at all. If a
		// new scene raises the bar but the constant is not bumped, stale installs
		// would never see the scene. Guard the invariant the gate relies on.
		const highestMinVersion = Math.max(...ALL_SCENES.map(scene => scene.minVersion));
		expect(CURRENT_SETUP_VERSION).toBe(highestMinVersion);
	});

	it("runs only scenes newer than the stored setup version", async () => {
		const scenes = [testScene("v1-a", 1), testScene("v1-b", 1), testScene("v2", 2)];
		const selected = await selectSetupScenes(1, scenes, fakeContextWithConfiguredModel(), { isTTY: true });
		expect(selected.map(scene => scene.id)).toEqual(["v2"]);
	});

	it("runs no scenes at the current setup version", async () => {
		const scenes = await selectSetupScenes(CURRENT_SETUP_VERSION, ALL_SCENES, fakeContextWithConfiguredModel(), {
			isTTY: true,
		});
		expect(scenes).toEqual([]);
	});

	it("honors hard environment gates", async () => {
		const ctx = fakeContextWithConfiguredModel();
		expect(await selectSetupScenes(0, ALL_SCENES, ctx, { isTTY: false })).toEqual([]);
		expect(await selectSetupScenes(0, ALL_SCENES, ctx, { isTTY: true, resuming: true })).toEqual([]);
		expect(await selectSetupScenes(0, ALL_SCENES, ctx, { isTTY: true, skipEnv: "1" })).toEqual([]);
		expect(await selectSetupScenes(0, ALL_SCENES, ctx, { isTTY: true, setupWizardEnabled: false })).toEqual([]);
	});

	it("force mode ignores version and user skip gates but still requires a TTY", async () => {
		const ctx = fakeContextWithConfiguredModel();
		const selected = await selectSetupScenes(CURRENT_SETUP_VERSION, ALL_SCENES, ctx, {
			isTTY: true,
			setupWizardEnabled: false,
			skipEnv: "1",
			resuming: true,
			force: true,
		});
		expect(selected.map(scene => scene.id)).toEqual(ALL_SCENES.map(scene => scene.id));
		expect(await selectSetupScenes(0, ALL_SCENES, ctx, { isTTY: false, force: true })).toEqual([]);
	});

	it("skips the auto-update question where omp cannot update itself (Tern, Nix, a source checkout)", async () => {
		vi.spyOn(updateCli, "canSelfUpdate").mockResolvedValue(false);
		const scenes = await selectSetupScenes(0, ALL_SCENES, fakeContextWithConfiguredModel(), { isTTY: true });
		expect(scenes.map(scene => scene.id)).toEqual(
			ALL_SCENES.map(scene => scene.id).filter(id => id !== "auto-update"),
		);
	});

	it("drops the glyph scene once the terminal renders omp's bundled icons in-band", async () => {
		setTerminalGlyphProtocol(true);
		try {
			const scenes = await selectSetupScenes(0, ALL_SCENES, fakeContextWithConfiguredModel(), { isTTY: true });
			expect(scenes.map(scene => scene.id)).toEqual(
				ALL_SCENES.map(scene => scene.id).filter(id => id !== "glyph-mode"),
			);
		} finally {
			setTerminalGlyphProtocol(false);
		}
	});

	it("applies scene shouldRun only as a hard environment gate", async () => {
		const selected = await selectSetupScenes(
			0,
			[testScene("blocked", 1, () => false), testScene("allowed", 1, () => true)],
			fakeContextWithConfiguredModel(),
			{ isTTY: true },
		);
		expect(selected.map(scene => scene.id)).toEqual(["allowed"]);
	});
});

describe("setup wizard model selection", () => {
	const CUSTOM_MODEL: Model = buildModel({
		id: "minimax-m3",
		name: "MiniMax M3",
		api: "openai-completions",
		provider: "spark",
		baseUrl: "http://127.0.0.1:8000/v1",
		reasoning: true,
		input: ["text"],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow: 100_000,
		maxTokens: 32_000,
	});

	async function pickModelDuringSetup(settings: Settings): Promise<string> {
		await initTheme(false, "unicode", false, "nightglide-flight", "nightglide-cloudlight");
		let available: Model[] = [];
		const finished = Promise.withResolvers<string>();
		const setModel = mock(
			async (
				selected: Model,
				role: string,
				options?: { selector?: string; persist?: boolean },
			): Promise<{ switched: boolean }> => {
				if (options?.persist) {
					settings.setModelRole(role, options.selector ?? `${selected.provider}/${selected.id}`);
				}
				return { switched: true };
			},
		);
		const host = bindSceneHost({
			ctx: {
				settings,
				session: {
					model: undefined,
					modelRegistry: {
						getAvailable: () => available,
						getAll: () => available,
						refresh: async (strategy: string) => {
							if (strategy === "online-if-uncached") available = [CUSTOM_MODEL];
						},
					},
					setModel,
					effectiveServiceTier: () => undefined,
				},
				ui: { terminal: { rows: 30 } },
			},
			requestRender: () => {},
			finish: (next: string) => finished.resolve(next),
			setFocus: () => {},
			restoreFocus: () => {},
		} as unknown as SetupApplicationSceneHost);
		const scene = ALL_SCENES.find(candidate => candidate.id === "model");
		expect(scene).toBeDefined();

		const controller = scene!.mount(host);
		expect(controller.render?.(120).join("\n")).not.toContain("minimax-m3");
		await controller.onMount?.();
		expect(controller.render?.(120).join("\n")).toContain("minimax-m3");
		controller.handleInput?.("\r");
		return finished.promise;
	}

	it("discovers and saves an uncached custom model as the global default", async () => {
		const settings = Settings.isolated();

		const result = await pickModelDuringSetup(settings);

		expect(result).toBe("done");
		expect(settings.getGlobalModelRole("default")).toBe("spark/minimax-m3");
		expect(settings.getProjectModelRole("default")).toBeUndefined();
	});

	it("saves to the project layer under project role storage", async () => {
		const settings = Settings.isolated({ modelRoleStorage: "project" });

		const result = await pickModelDuringSetup(settings);

		expect(result).toBe("done");
		expect(settings.getProjectModelRole("default")).toBe("spark/minimax-m3");
		expect(settings.getGlobalModelRole("default")).toBeUndefined();
	});
});

describe("setup wizard persistence", () => {
	it("marks the current setup version complete", async () => {
		const settings = Settings.isolated();
		await markSetupWizardComplete(settings);
		expect(cfgSetupVersion.get(settings)).toBe(CURRENT_SETUP_VERSION);
	});

	it("can run a targeted scene without setup-version or welcome-intro side effects", async () => {
		const settings = Settings.isolated({ setupVersion: 0 });
		const hideOverlay = mock(() => {});
		const setFocus = mock((_component: unknown) => {});
		const requestRender = mock(() => {});
		const playWelcomeIntro = mock(() => {});
		let component: SetupWizardComponent | undefined;
		const scene: SetupScene = {
			id: "providers",
			title: "providers",
			step: "providers",
			minVersion: 1,
			mount: host => ({
				title: "providers",
				onMount: () => host.finish("done"),
				render: () => [],
				invalidate: () => {},
			}),
		};
		const ctx = {
			settings,
			playWelcomeIntro,
			ui: {
				terminal: { rows: 24 },
				showOverlay: (nextComponent: SetupWizardComponent) => {
					component = nextComponent;
					return { hide: hideOverlay };
				},
				setFocus,
				requestRender,
			},
		} as unknown as InteractiveModeContext;

		const pending = runSetupWizard(ctx, [scene], { markComplete: false, playWelcomeIntro: false });
		component?.handleInput?.("\n");
		component?.handleInput?.("\n");
		await pending;

		expect(cfgSetupVersion.get(settings)).toBe(0);
		expect(playWelcomeIntro).not.toHaveBeenCalled();
		expect(hideOverlay).toHaveBeenCalledTimes(1);
		expect(setFocus).toHaveBeenCalled();
	});
});
describe("setup wizard mouse routing", () => {
	it("synthesizes arrow keys from wheel notches for scenes without routeMouse", () => {
		const received: string[] = [];
		const scene: SetupScene = {
			id: "scrollable",
			title: "scrollable",
			step: "scrollable",
			minVersion: 1,
			mount: () => ({
				title: "scrollable",
				handleInput: (data: string) => received.push(data),
				render: () => [],
				invalidate: () => {},
			}),
		};
		const ctx = {
			settings: Settings.isolated(),
			ui: {
				terminal: { rows: 24 },
				setFocus: () => {},
				requestRender: () => {},
			},
		} as unknown as InteractiveModeContext;
		const component = new SetupWizardComponent(createSetupHost(ctx), [scene]);
		try {
			void component.run();
			// Left click during the splash advances into the scene, like Enter.
			component.handleInput("\x1b[<0;5;5M");
			component.handleInput("\x1b[<64;10;5M"); // wheel up
			component.handleInput("\x1b[<65;10;5M"); // wheel down
			component.handleInput("\x1b[<35;10;5M"); // pointer motion — swallowed
			component.handleInput("\x1b[<0;10;5M"); // click in scene — swallowed
			expect(received).toEqual(["\x1b[A", "\x1b[B"]);
		} finally {
			component.dispose();
		}
	});

	it("routes hit-tested mouse events at scene-local coordinates to scenes with routeMouse", async () => {
		await initTheme(false, "unicode", false, "nightglide-flight", "nightglide-cloudlight");
		const routed: { kind: string; line: number; col: number }[] = [];
		const keys: string[] = [];
		const scene: SetupScene = {
			id: "mouse",
			title: "mouse",
			step: "mouse",
			minVersion: 1,
			mount: () => ({
				title: "mouse",
				handleInput: (data: string) => keys.push(data),
				routeMouse: (event, line, col) => {
					const kind =
						event.wheel !== null
							? `wheel:${event.wheel}`
							: event.motion
								? "motion"
								: event.leftClick
									? "click"
									: "other";
					routed.push({ kind, line, col });
				},
				render: () => ["MARKER-ROW"],
				invalidate: () => {},
			}),
		};
		const ctx = {
			settings: Settings.isolated(),
			ui: {
				terminal: { rows: 24 },
				setFocus: () => {},
				requestRender: () => {},
			},
		} as unknown as InteractiveModeContext;
		const component = new SetupWizardComponent(createSetupHost(ctx), [scene]);
		try {
			void component.run();
			component.handleInput("\r"); // splash → scene
			await Bun.sleep(500); // let the splash→scene dissolve (420ms) finish so the frame is the scene
			const frame = component.render(80);
			const row = frame.findIndex(line => line.includes("MARKER-ROW"));
			expect(row).toBeGreaterThan(0);
			const indent = /^ */.exec(frame[row])?.[0].length ?? 0;
			expect(indent).toBeGreaterThan(0);
			// SGR reports are 1-based; two columns into the marker text.
			component.handleInput(`\x1b[<35;${indent + 3};${row + 1}M`);
			component.handleInput(`\x1b[<0;${indent + 3};${row + 1}M`);
			component.handleInput("\x1b[<64;1;1M"); // wheel forwards regardless of pointer position
			expect(routed.slice(0, 2)).toEqual([
				{ kind: "motion", line: 0, col: 2 },
				{ kind: "click", line: 0, col: 2 },
			]);
			expect(routed[2]?.kind).toBe("wheel:-1");
			// routeMouse scenes get no synthesized arrows and no raw SGR bytes.
			expect(keys).toEqual([]);
		} finally {
			component.dispose();
		}
	});
});
describe("setup wizard short terminals", () => {
	function shortTerminalCtx(rows: number): InteractiveModeContext {
		return {
			settings: Settings.isolated(),
			ui: {
				terminal: { rows },
				setFocus: () => {},
				requestRender: () => {},
				invalidate: () => {},
			},
			session: {
				modelRegistry: {
					authStorage: {
						credentials: { has: () => false },
						keys: { source: () => undefined },
					},
				},
			},
			openInBrowser: () => {},
		} as unknown as InteractiveModeContext;
	}

	/**
	 * Advance the wizard's dissolve clock past SCENE_TRANSITION_MS so render()
	 * shows the fully revealed scene without waiting real time. Activate after
	 * the splash→scene input (the transition timestamps itself on entry).
	 */
	function skipDissolve(): { mockRestore(): void } {
		const realNow = performance.now.bind(performance);
		return vi.spyOn(performance, "now").mockImplementation(() => realNow() + 1_000);
	}

	it("keeps the selected provider row visible while navigating on a 24-row terminal", async () => {
		await initTheme(false, "unicode", false, "nightglide-flight", "nightglide-cloudlight");
		const component = new SetupWizardComponent(createSetupHost(shortTerminalCtx(24)), [providersSetupScene]);
		void component.run();
		component.handleInput("\r"); // splash → scene
		const nowSpy = skipDissolve();
		try {
			// Walk down past a full wrap and back up; the selection must stay
			// inside the 24-row frame on every step (the list window used to
			// assume ten visible rows and the wizard clipped the cursor off).
			for (const key of [...Array(45).fill("\x1b[B"), "\x1b[A", "\x1b[A"]) {
				component.handleInput(key);
				const frame = component.render(80).map(line => Bun.stripANSI(line));
				expect(frame.length).toBe(24);
				expect(frame.some(line => line.includes(`${theme.nav.cursor} `))).toBe(true);
			}
		} finally {
			nowSpy.mockRestore();
			component.dispose();
		}
	});

	it("keeps the curated theme list and its selection visible on a 24-row terminal", async () => {
		await initTheme(false, "unicode", false, "nightglide-flight", "nightglide-cloudlight");
		const component = new SetupWizardComponent(createSetupHost(shortTerminalCtx(24)), [themeSetupScene]);
		void component.run();
		component.handleInput("\r"); // splash → scene
		const nowSpy = skipDissolve();
		try {
			const frame = component.render(80).map(line => Bun.stripANSI(line));
			expect(frame.length).toBe(24);
			expect(frame.some(line => line.trimStart().startsWith(theme.nav.cursor))).toBe(true);
			for (const label of [
				"Match terminal",
				"Flight",
				"Cloudlight",
				"Colorblind colors",
				"ANSI-safe",
				"Browse all",
			]) {
				expect(frame.some(line => line.includes(label))).toBe(true);
			}
		} finally {
			nowSpy.mockRestore();
			component.dispose();
		}
	});
});

describe("setup wizard theme previews", () => {
	it("restores the selected glyph preset after previewing ANSI-safe mode", async () => {
		await initTheme(false, "nerd", false, "nightglide-flight", "nightglide-cloudlight");
		const settings = Settings.isolated({ symbolPreset: "nerd", colorBlindMode: false });
		const setupScene = ALL_SCENES.find(scene => scene.id === "theme");
		expect(setupScene).toBeDefined();

		const host = bindSceneHost({
			ctx: {
				settings,
				ui: {
					invalidate: () => {},
					requestRender: () => {},
				},
			},
			requestRender: () => {},
			finish: () => {},
			setFocus: () => {},
			restoreFocus: () => {},
		} as unknown as SetupApplicationSceneHost);

		const controller = setupScene!.mount(host);
		controller.handleInput?.("5");
		await Bun.sleep(20);
		expect(theme.getSymbolPreset()).toBe("ascii");

		controller.handleInput?.("2");
		await Bun.sleep(20);
		expect(cfgSymbolPreset.get(settings)).toBe("nerd");
		expect(theme.getSymbolPreset()).toBe("nerd");
	});
});

describe("setup wizard glyph scene", () => {
	it("lists Nerd Font first and commits the chosen preset", async () => {
		await initTheme(false, "unicode", false, "nightglide-flight", "nightglide-cloudlight");
		const settings = Settings.isolated();
		const scene = ALL_SCENES.find(s => s.id === "glyph-mode");
		expect(scene).toBeDefined();

		let finished = false;
		const host = bindSceneHost({
			ctx: {
				settings,
				ui: { invalidate: () => {}, requestRender: () => {} },
			},
			requestRender: () => {},
			finish: () => {
				finished = true;
			},
			setFocus: () => {},
			restoreFocus: () => {},
		} as unknown as SetupApplicationSceneHost);

		const controller = scene!.mount(host);
		// Row "1" is now Nerd Font (it must lead the list).
		controller.handleInput?.("1");
		await Bun.sleep(20);
		expect(theme.getSymbolPreset()).toBe("nerd");

		controller.handleInput?.("\n");
		await Bun.sleep(20);
		expect(cfgSymbolPreset.get(settings)).toBe("nerd");
		expect(finished).toBe(true);
	});
});

describe("omp setup onboarding trigger", () => {
	it("starts the normal interactive command with forced setup wizard", async () => {
		let forceSetupWizard: boolean | undefined;
		await runOnboardingSetup({
			stdinIsTTY: true,
			stdoutIsTTY: true,
			runRoot: async (_parsed, _rawArgs, deps) => {
				forceSetupWizard = deps?.forceSetupWizard;
			},
		});
		expect(forceSetupWizard).toBe(true);
	});

	it("rejects onboarding setup without an interactive TTY", async () => {
		let stderr = "";
		let exitCode: number | undefined;
		await expect(
			runOnboardingSetup({
				stdinIsTTY: false,
				stdoutIsTTY: true,
				writeStderr: text => {
					stderr += text;
				},
				exit: code => {
					exitCode = code;
					throw new Error("exit");
				},
			}),
		).rejects.toThrow("exit");
		expect(exitCode).toBe(1);
		expect(stderr).toContain("interactive TTY");
	});
});

describe("setup wizard Nightglide branding", () => {
	it("uses Nightglide branding across splash, outro, updates, and header", async () => {
		await initTheme(false, "unicode", false, "nightglide-flight", "nightglide-cloudlight");

		const fullSplash = renderSetupSplash(80, 26, 0)
			.map(line => Bun.stripANSI(line))
			.join("\n");
		expect(fullSplash).toContain(NIGHTGLIDE_WORDMARK[0]!.trim());
		expect(fullSplash.toLowerCase()).not.toContain("omp");

		const compactSplash = renderSetupSplash(40, 12, 0)
			.map(line => Bun.stripANSI(line))
			.join("\n");
		expect(compactSplash).toContain("nightglide");
		expect(compactSplash.toLowerCase()).not.toContain("omp");

		expect(JSON.stringify(describeSetupSplash())).toContain("nightglide");

		const ansiOutro = renderSetupOutro(80, 24, 0)
			.map(line => Bun.stripANSI(line))
			.join("\n");
		expect(ansiOutro).toContain("Starting nightglide…");
		expect(ansiOutro.toLowerCase()).not.toContain("omp");
		expect(JSON.stringify(describeSetupOutro("omlx/qwen3"))).toContain("Starting nightglide…");

		const updatesController = updatesSetupScene.mount({
			ctx: { autoUpdate: false } as unknown as SetupSceneHost["ctx"],
			requestRender: () => {},
			finish: () => {},
			setFocus: () => {},
			restoreFocus: () => {},
		});
		const updatesFrame = updatesController
			.render(80)
			.map(line => Bun.stripANSI(line))
			.join("\n");
		expect(updatesSetupScene.title).toBe("Keep nightglide up to date");
		expect(updatesFrame).toContain("whatever installed nightglide");
		expect(updatesFrame.toLowerCase()).not.toContain("omp");

		const component = new SetupWizardComponent(
			createSetupHost({
				settings: Settings.isolated(),
				ui: { terminal: { rows: 24 }, setFocus: () => {}, requestRender: () => {} },
			} as unknown as InteractiveModeContext),
			[updatesSetupScene],
		);
		try {
			void component.run();
			component.handleInput("\r");
			const realNow = performance.now.bind(performance);
			vi.spyOn(performance, "now").mockImplementation(() => realNow() + 1_000);
			const sceneFrame = component
				.render(80)
				.map(line => Bun.stripANSI(line))
				.join("\n");
			expect(sceneFrame).toContain("nightglide");
			expect(sceneFrame).not.toMatch(/\bomp\b/i);
		} finally {
			vi.restoreAllMocks();
			component.dispose();
		}
	});
});

describe("setup wizard routing scene", () => {
	const LOCAL_MODEL: Model = buildModel({
		id: "qwen3-local",
		name: "Qwen3 Local",
		api: "openai-completions",
		provider: "omlx",
		baseUrl: "http://127.0.0.1:8000/v1",
		reasoning: false,
		input: ["text"],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow: 32_000,
		maxTokens: 4_096,
	});
	const CLOUD_MODEL: Model = buildModel({
		id: "claude-sonnet-4-5",
		name: "Claude Sonnet 4.5",
		api: "anthropic-messages",
		provider: "anthropic",
		baseUrl: "https://api.anthropic.com",
		reasoning: true,
		input: ["text"],
		cost: { input: 3, output: 15, cacheRead: 0, cacheWrite: 0 },
		contextWindow: 200_000,
		maxTokens: 8_192,
	});

	function mountRouting(settings: Settings, available: Model[], current?: Model) {
		const finished: string[] = [];
		const host = bindSceneHost({
			ctx: {
				settings,
				session: {
					model: current,
					modelRegistry: {
						getAvailable: () => available,
						getAll: () => available,
					},
					effectiveServiceTier: () => undefined,
				},
				ui: { terminal: { rows: 30 } },
			},
			requestRender: () => {},
			finish: (next: string) => finished.push(next),
			setFocus: () => {},
			restoreFocus: () => {},
		} as unknown as SetupApplicationSceneHost);
		const scene = ALL_SCENES.find(candidate => candidate.id === "routing");
		expect(scene).toBeDefined();
		return { controller: scene!.mount(host), finished };
	}

	it("selects the routing scene for users upgrading from setupVersion 3", async () => {
		vi.spyOn(updateCli, "canSelfUpdate").mockResolvedValue(false);
		try {
			const selected = await selectSetupScenes(3, ALL_SCENES, fakeContextWithConfiguredModel(), { isTTY: true });
			expect(selected.map(scene => scene.id)).toEqual(["routing"]);
		} finally {
			vi.restoreAllMocks();
		}
	});

	it("shows cloud vs local disclosure and persists explicit localModel pin and auto-detect reset", async () => {
		await initTheme(false, "unicode", false, "nightglide-flight", "nightglide-cloudlight");
		const settings = Settings.isolated();
		cfgNightglideLocalModel.set(settings, "omlx/stale");
		const { controller, finished } = mountRouting(settings, [CLOUD_MODEL, LOCAL_MODEL], CLOUD_MODEL);

		// Quick key "2" highlights Local and updates the cloud vs local disclosure without committing.
		controller.handleInput?.("2");
		const disclosure = controller
			.render(100, 24)
			.map(line => Bun.stripANSI(line))
			.join("\n");
		expect(disclosure).toContain("Where requests go (cloud vs local):");
		expect(disclosure).toContain("1 local chat model detected");
		expect(cfgNightglideRoutingMode.get(settings)).toBe("manual");

		// Enter enters the optional localModel step; Esc returns to mode selection without saving.
		controller.handleInput?.("\r");
		const localStep = controller
			.render(100, 24)
			.map(line => Bun.stripANSI(line))
			.join("\n");
		expect(localStep).toContain("Auto-detect local model");
		expect(localStep).toContain("omlx/qwen3-local");
		controller.handleInput?.("\x1b");
		expect(finished).toEqual([]);

		// Enter Local again, pick "omlx/qwen3-local", and verify both settings persist.
		controller.handleInput?.("\r");
		controller.handleInput?.("\x1b[B");
		controller.handleInput?.("\r");
		await Bun.sleep(10);
		expect(finished).toEqual(["done"]);
		expect(cfgNightglideRoutingMode.get(settings)).toBe("local");
		expect(cfgNightglideLocalModel.get(settings)).toBe("omlx/qwen3-local");

		// Choosing Auto-detect clears an explicit nightglide.localModel pin (the existing pin starts preselected).
		const next = mountRouting(settings, [LOCAL_MODEL]);
		next.controller.handleInput?.("\r"); // Local is preselected -> opens localModel list
		next.controller.handleInput?.("\x1b[A"); // Move up from preselected omlx/qwen3-local to Auto-detect
		next.controller.handleInput?.("\r");
		await Bun.sleep(10);
		expect(next.finished).toEqual(["done"]);
		expect(cfgNightglideLocalModel.get(settings)).toBeUndefined();
	});

	it("warns when Local is chosen without local models and persists balanced/performance directly", async () => {
		await initTheme(false, "unicode", false, "nightglide-flight", "nightglide-cloudlight");
		const settings = Settings.isolated();
		const { controller, finished } = mountRouting(settings, [CLOUD_MODEL], CLOUD_MODEL);

		controller.handleInput?.("2");
		controller.handleInput?.("\r");
		const warningFrame = controller
			.render(100, 24)
			.map(line => Bun.stripANSI(line))
			.join("\n");
		expect(warningFrame).toContain("No local model is currently reachable");
		expect(warningFrame).toContain("Choose another routing mode");

		// Go back to mode list via the second option, then pick Balanced ("3").
		controller.handleInput?.("\x1b[B");
		controller.handleInput?.("\r");
		controller.handleInput?.("3");
		controller.handleInput?.("\r");
		await Bun.sleep(10);
		expect(finished).toEqual(["done"]);
		expect(cfgNightglideRoutingMode.get(settings)).toBe("balanced");
	});

	it("skips without persisting when Esc is pressed on mode selection and warns when overridden", async () => {
		await initTheme(false, "unicode", false, "nightglide-flight", "nightglide-cloudlight");
		const settings = Settings.isolated({ "nightglide.routingMode": "performance" });
		const { controller, finished } = mountRouting(settings, [CLOUD_MODEL]);

		const frame = controller
			.render(100, 24)
			.map(line => Bun.stripANSI(line))
			.join("\n");
		expect(frame).toContain("runtime config currently overrides nightglide.routingMode");

		const globalOnly = Settings.isolated();
		cfgNightglideRoutingMode.set(globalOnly, "performance");
		const next = mountRouting(globalOnly, [CLOUD_MODEL]);
		next.controller.handleInput?.("1");
		next.controller.handleInput?.("\x1b");
		expect(next.finished).toEqual(["skipped"]);
		expect(cfgNightglideRoutingMode.get(globalOnly)).toBe("performance");
		expect(finished).toEqual([]);
	});
});

describe("setup wizard custom provider sign-in", () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ng-setup-custom-provider-"));
	});

	afterEach(async () => {
		vi.restoreAllMocks();
		await fs.rm(tempDir, { recursive: true, force: true });
	});

	function mountSignInWithTempRegistry(
		options: {
			onRefresh?: (modelsMap: Map<string, Model[]>, discoveryErrors: Map<string, string>) => void;
		} = {},
	) {
		const storedKeys = new Map<string, unknown>();
		const modelsByProvider = new Map<string, Model[]>();
		const discoveryErrors = new Map<string, string>();
		const origList = customProviders.listCustomProviders;
		const origSave = customProviders.saveCustomProvider;
		const origRemove = customProviders.removeCustomProvider;
		vi.spyOn(customProviders, "listCustomProviders").mockImplementation(() => origList(tempDir));
		vi.spyOn(customProviders, "saveCustomProvider").mockImplementation(input => origSave(input, tempDir));
		vi.spyOn(customProviders, "removeCustomProvider").mockImplementation(id => origRemove(id, tempDir));

		const state = {
			focus: undefined as { handleInput?(data: string): void; pasteText?(text: string): void } | undefined,
			finished: [] as string[],
		};
		const ctx = {
			settings: Settings.isolated(),
			ui: { terminal: { rows: 30 }, setFocus: () => {}, requestRender: () => {} },
			session: {
				effectiveServiceTier: () => undefined,
				refreshScopedModels: async () => {},
				modelRegistry: {
					authStorage: {
						credentials: {
							has: (id: string) => storedKeys.has(id),
							set: async (id: string, cred: unknown) => {
								storedKeys.set(id, cred);
							},
							remove: async (id: string) => {
								storedKeys.delete(id);
							},
						},
						keys: { source: () => undefined },
					},
					getAvailable: () => [...modelsByProvider.values()].flat(),
					getAll: () => [...modelsByProvider.values()].flat(),
					refresh: async () => {
						options.onRefresh?.(modelsByProvider, discoveryErrors);
					},
					getProviderDiscoveryState: (id: string) => {
						const err = discoveryErrors.get(id);
						return err ? { provider: id, status: "unavailable", error: err } : undefined;
					},
				},
			},
		} as unknown as InteractiveModeContext;

		const scene = providersSetupScene.mount({
			ctx: createSetupHost(ctx),
			requestRender: () => {},
			finish: res => state.finished.push(res),
			setFocus: component => {
				state.focus = component ?? undefined;
			},
			restoreFocus: () => {
				state.focus = undefined;
			},
		});
		return { scene, state, storedKeys };
	}

	async function flushAsync() {
		for (let i = 0; i < 6; i++) await Bun.sleep(5);
	}

	it("adds a custom provider with masked key, writes models.yml, stores key, and reports discovered models", async () => {
		await initTheme(false, "unicode", false, "nightglide-flight", "nightglide-cloudlight");
		const secret = `sk-test-${crypto.randomUUID()}`;
		const { scene, state, storedKeys } = mountSignInWithTempRegistry({
			onRefresh: modelsMap => {
				modelsMap.set("my-relay", [
					buildModel({
						id: "qwen3-coder",
						name: "Qwen3 Coder",
						api: "openai-completions",
						provider: "my-relay",
						baseUrl: "http://127.0.0.1:8000/v1",
						reasoning: false,
						input: ["text"],
						cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
						contextWindow: 64_000,
						maxTokens: 8_192,
					}),
				]);
			},
		});
		try {
			// Leading item is "+ Add custom provider (Base URL + key)".
			expect(
				scene
					.render(100)
					.map(l => Bun.stripANSI(l))
					.join("\n"),
			).toContain("Add custom provider");
			scene.handleInput?.("\r");
			await flushAsync();

			// Step 1: provider name
			state.focus?.pasteText?.("my-relay");
			scene.handleInput?.("\r");
			// Step 2: Base URL
			state.focus?.pasteText?.("http://127.0.0.1:8000/v1");
			scene.handleInput?.("\r");
			// Step 3: API type (default OpenAI-compatible)
			scene.handleInput?.("\r");
			// Step 4: masked API key — secret must never render in plaintext
			state.focus?.pasteText?.(secret);
			const keyFrame = scene
				.render(100)
				.map(l => Bun.stripANSI(l))
				.join("\n");
			expect(keyFrame).not.toContain(secret);
			scene.handleInput?.("\r");
			await flushAsync();

			const yml = YAML.parse(await Bun.file(path.join(tempDir, "models.yml")).text()) as Record<
				string,
				Record<string, unknown>
			>;
			expect(yml.providers["my-relay"]).toEqual({
				baseUrl: "http://127.0.0.1:8000/v1",
				api: "openai-completions",
				discovery: { type: "openai-models-list" },
			});
			expect(storedKeys.get("my-relay")).toEqual({ type: "api_key", key: secret });
			const backFrame = scene
				.render(100)
				.map(l => Bun.stripANSI(l))
				.join("\n");
			expect(backFrame).toContain("Configured my-relay (1 model discovered)");
			scene.handleInput?.("\x1b");
			expect(state.finished).toEqual(["done"]);
		} finally {
			scene.dispose?.();
		}
	});

	it("redacts keys on discovery failure and lets the user edit settings and retry", async () => {
		await initTheme(false, "unicode", false, "nightglide-flight", "nightglide-cloudlight");
		const secret = `sk-leak-${crypto.randomUUID()}`;
		let attempt = 0;
		const { scene, state } = mountSignInWithTempRegistry({
			onRefresh: (modelsMap, errors) => {
				attempt++;
				if (attempt === 1) {
					errors.set("relay-fail", `401 invalid bearer ${secret}`);
				} else {
					errors.delete("relay-fail");
					modelsMap.set("relay-fail", [
						buildModel({
							id: "m1",
							name: "M1",
							api: "openai-completions",
							provider: "relay-fail",
							baseUrl: "http://127.0.0.1:9000/v1",
							reasoning: false,
							input: ["text"],
							cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
							contextWindow: 32_000,
							maxTokens: 4_096,
						}),
					]);
				}
			},
		});
		try {
			scene.handleInput?.("\r");
			await flushAsync();
			state.focus?.pasteText?.("relay-fail");
			scene.handleInput?.("\r");
			state.focus?.pasteText?.("http://127.0.0.1:9999/v1");
			scene.handleInput?.("\r");
			scene.handleInput?.("\r");
			state.focus?.pasteText?.(secret);
			scene.handleInput?.("\r");
			await flushAsync();

			const errorFrame = scene
				.render(100)
				.map(l => Bun.stripANSI(l))
				.join("\n");
			expect(errorFrame).toContain("model discovery failed");
			expect(errorFrame).toContain("[redacted]");
			expect(errorFrame).not.toContain(secret);

			// Choose "Edit settings & retry" and update URL
			scene.handleInput?.("\r");
			expect(
				scene
					.render(100)
					.map(l => Bun.stripANSI(l))
					.join("\n"),
			).toContain("Base URL");
			scene.handleInput?.("\r"); // submit Base URL
			scene.handleInput?.("\r"); // submit API type
			scene.handleInput?.("\r"); // empty key keeps existing stored key
			await flushAsync();

			expect(
				scene
					.render(100)
					.map(l => Bun.stripANSI(l))
					.join("\n"),
			).toContain("Configured relay-fail (1 model discovered)");
		} finally {
			scene.dispose?.();
		}
	});

	it("cancels custom provider setup on Esc without writing models.yml", async () => {
		await initTheme(false, "unicode", false, "nightglide-flight", "nightglide-cloudlight");
		const { scene, state } = mountSignInWithTempRegistry();
		try {
			scene.handleInput?.("\r");
			await flushAsync();
			state.focus?.pasteText?.("aborted-relay");
			scene.handleInput?.("\x1b");
			expect(state.focus).toBeUndefined();
			expect(await Bun.file(path.join(tempDir, "models.yml")).exists()).toBe(false);
		} finally {
			scene.dispose?.();
		}
	});

	it("lists existing custom providers and deletes one on confirmation", async () => {
		await initTheme(false, "unicode", false, "nightglide-flight", "nightglide-cloudlight");
		await customProviders.saveCustomProvider(
			{ id: "old-local", baseUrl: "http://127.0.0.1:8000/v1", api: "openai-completions" },
			tempDir,
		);
		const { scene, state, storedKeys } = mountSignInWithTempRegistry();
		await storedKeys.set("old-local", { type: "api_key", key: "k" });
		try {
			scene.handleInput?.("\r");
			await flushAsync();
			const menuFrame = scene
				.render(100)
				.map(l => Bun.stripANSI(l))
				.join("\n");
			expect(menuFrame).toContain("old-local");

			// Move down to "old-local" -> Enter -> move down to "Delete custom provider" -> Enter -> move down to "Delete old-local" -> Enter
			scene.handleInput?.("\x1b[B");
			scene.handleInput?.("\r");
			scene.handleInput?.("\x1b[B");
			scene.handleInput?.("\r");
			scene.handleInput?.("\x1b[B");
			scene.handleInput?.("\r");
			await flushAsync();

			expect(state.focus).toBeUndefined();
			expect(storedKeys.has("old-local")).toBe(false);
			expect(await customProviders.listCustomProviders(tempDir)).toEqual([]);
			expect(
				scene
					.render(100)
					.map(l => Bun.stripANSI(l))
					.join("\n"),
			).toContain("Removed custom provider old-local.");
		} finally {
			scene.dispose?.();
		}
	});
});
