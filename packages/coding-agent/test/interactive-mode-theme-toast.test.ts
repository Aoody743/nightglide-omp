import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "bun:test";
import * as path from "node:path";
import { Agent } from "@oh-my-pi/pi-agent-core";
import { resetSettingsForTest, Settings } from "@oh-my-pi/pi-coding-agent/config/settings";
import { AgentSession } from "@oh-my-pi/pi-coding-agent/session/agent-session";
import { AuthStorage } from "@oh-my-pi/pi-coding-agent/session/auth-storage";
import { SessionManager } from "@oh-my-pi/pi-coding-agent/session/session-manager";
import { initTheme, previewTheme, setTheme } from "@oh-my-pi/pi-tui/theme";
import { TempDir } from "@oh-my-pi/pi-utils";
import { ModelRegistry } from "../src/config/model-registry";
import { InteractiveMode } from "../src/modes/interactive-mode";

/**
 * The theme-commit toast is wired where the committed palette lands: the mode's
 * `onThemeChange` subscription in `init()`. Only a non-ephemeral notification —
 * `setTheme` resolving (or falling back) — toasts `主题：<name>`; `previewTheme`
 * rides the same notification with `ephemeral` set and must stay silent, so
 * browsing palettes in the settings selector never claims a pick was made.
 */
describe("InteractiveMode theme commit toast", () => {
	let tempDir: TempDir;
	let authStorage: AuthStorage;
	let mode: InteractiveMode | undefined;
	let session: AgentSession | undefined;

	beforeAll(() => {
		void initTheme();
	});

	beforeEach(async () => {
		vi.spyOn(process.stdout, "write").mockReturnValue(true);
		vi.spyOn(process.stdin, "resume").mockReturnValue(process.stdin);
		vi.spyOn(process.stdin, "pause").mockReturnValue(process.stdin);
		vi.spyOn(process.stdin, "setEncoding").mockReturnValue(process.stdin);
		if (typeof process.stdin.setRawMode === "function") {
			vi.spyOn(process.stdin, "setRawMode").mockReturnValue(process.stdin);
		}

		resetSettingsForTest();
		tempDir = TempDir.createSync("@pi-theme-toast-");
		await Settings.init({ inMemory: true, cwd: tempDir.path() });
		authStorage = await AuthStorage.create(path.join(tempDir.path(), "testauth.db"));
		authStorage.keys.setRuntime("anthropic", "test-key");
		const registry = new ModelRegistry(authStorage, path.join(tempDir.path(), `models-${Bun.nanoseconds()}.yml`));
		const model = registry.find("anthropic", "claude-sonnet-4-5");
		if (!model) throw new Error("Expected anthropic model claude-sonnet-4-5 to exist");
		session = new AgentSession({
			agent: new Agent({ initialState: { model, systemPrompt: ["Test"], tools: [], messages: [] } }),
			sessionManager: SessionManager.create(
				tempDir.path(),
				path.join(tempDir.path(), `active-${Bun.nanoseconds()}`),
			),
			settings: Settings.instance,
			modelRegistry: registry,
		});
		mode = new InteractiveMode(session, "test");
		await mode.init({ suppressWelcomeIntro: true });
	});

	afterEach(async () => {
		vi.restoreAllMocks();
		mode?.stop();
		await session?.dispose();
		authStorage?.close();
		tempDir?.removeSync();
		mode = undefined;
		session = undefined;
		resetSettingsForTest();
	});

	it("toasts 主题：<name> when a committed setTheme lands", async () => {
		const showToast = vi.spyOn(mode!, "showToast");
		const result = await setTheme("dark", false);
		expect(result.success).toBe(true);
		expect(showToast).toHaveBeenCalledTimes(1);
		expect(showToast).toHaveBeenCalledWith("主题：dark");
	});

	it("does not toast for a previewTheme browsing pick", async () => {
		const showToast = vi.spyOn(mode!, "showToast");
		const result = await previewTheme("light");
		expect(result.success).toBe(true);
		expect(showToast).not.toHaveBeenCalled();
	});
});
