import { afterEach, describe, expect, it } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { resolveThemeName } from "@oh-my-pi/pi-coding-agent/slash-commands/builtin-theme";
import { canonicalThemeName, familyFor } from "@oh-my-pi/pi-tui/components/nightglide-theme-families";
import { gradientEscape } from "@oh-my-pi/pi-tui/prompt/welcome";
import { TERMINAL } from "@oh-my-pi/pi-tui/terminal-capabilities";
import {
	getActiveThemeExportColors,
	getActiveThemePageBgHex,
	getAvailableThemes,
	getCurrentThemeName,
	isLightTheme,
	setTheme,
	setThemeInstance,
} from "@oh-my-pi/pi-tui/theme";
import { resolveThemeColors, resolveVarRefs } from "@oh-my-pi/pi-tui/theme/color";
import { createTheme, getBuiltinThemes, loadThemeJsonSync } from "@oh-my-pi/pi-tui/theme/loader";
import type { ThemeJson } from "@oh-my-pi/pi-tui/theme/schema";
import { validateThemeJson } from "@oh-my-pi/pi-tui/theme/schema-validation";
import { getAgentDir, getCustomThemesDir, removeWithRetries, setAgentDir } from "@oh-my-pi/pi-utils";
import { relativeLuminance } from "@oh-my-pi/pi-utils/color";

const NIGHTGLIDE_SEVEN = [
	{ name: "nightglide-flight", isLight: false, kind: "flight" },
	{ name: "nightglide-cloudlight", isLight: true, kind: "flight" },
	{ name: "nightglide-iris", isLight: true, kind: "flight" },
	{ name: "nightglide-abyss", isLight: false, kind: "dive" },
	{ name: "nightglide-abyss-trench", isLight: false, kind: "dive" },
	{ name: "nightglide-daybreak", isLight: true, kind: "dive" },
	{ name: "nightglide-aurora", isLight: false, kind: "aurora" },
] as const;

const EFFORT_RUNGS = ["thinkingMinimal", "thinkingLow", "thinkingMedium", "thinkingHigh", "thinkingXhigh"] as const;

function contrastRatio(a: string, b: string): number {
	const la = relativeLuminance(a) ?? 0;
	const lb = relativeLuminance(b) ?? 0;
	return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

describe("Nightglide 7 built-in themes", () => {
	it("registers all 7 themes (3 light, 3 dark, 1 aurora) in getAvailableThemes and validates their schemas and contrast", async () => {
		const available = await getAvailableThemes();
		for (const entry of NIGHTGLIDE_SEVEN) {
			expect(available).toContain(entry.name);
			expect(isLightTheme(entry.name)).toBe(entry.isLight);

			const json = loadThemeJsonSync(entry.name);
			expect(() => validateThemeJson(json)).not.toThrow();
			expect(json.export?.pageBg).toBeDefined();
			expect(json.export?.cardBg).toBeDefined();
			expect(json.export?.infoBg).toBeDefined();

			const instance = createTheme(json, { mode: "truecolor" });
			const vars = json.vars ?? {};
			const resolved = resolveThemeColors(json.colors, vars);
			const pageBg = String(resolveVarRefs(json.export!.pageBg!, vars));
			const termBg = String(resolveVarRefs(json.terminal?.background ?? json.colors.statusLineBg, vars));
			const statusBg = String(resolved.statusLineBg);

			// Contrast contracts across text, muted, code fence borders, and all effort rungs.
			expect(contrastRatio(instance.getColorHex("text"), pageBg)).toBeGreaterThanOrEqual(4.5);
			expect(contrastRatio(instance.getColorHex("muted"), pageBg)).toBeGreaterThanOrEqual(4.5);
			expect(contrastRatio(instance.getColorHex("mdCodeBlockBorder"), pageBg)).toBeGreaterThanOrEqual(2.4);
			for (const rung of EFFORT_RUNGS) {
				const hex = instance.getColorHex(rung);
				expect(contrastRatio(hex, termBg), `${entry.name}.${rung} on ${termBg}`).toBeGreaterThanOrEqual(3.0);
				expect(contrastRatio(hex, statusBg), `${entry.name}.${rung} on ${statusBg}`).toBeGreaterThanOrEqual(3.0);
			}

			const fam = familyFor(entry.name);
			expect(fam.kind).toBe(entry.kind);
			expect(fam.page).toBe(pageBg.toLowerCase());
			expect(fam.scene.page).toBe(pageBg.toLowerCase());
		}
	});

	it("resolves aliases including abyss-trench and trench to their canonical families and slash-command targets", () => {
		const builtins = getBuiltinThemes();
		expect(builtins["abyss-trench"]).toBe(builtins["nightglide-abyss-trench"]);
		expect(builtins.trench).toBe(builtins["nightglide-abyss-trench"]);
		expect(canonicalThemeName("trench")).toBe("nightglide-abyss-trench");
		expect(canonicalThemeName("abyss-trench")).toBe("nightglide-abyss-trench");
		expect(familyFor("trench").label).toBe("ABYSS TRENCH");
		expect(familyFor("abyss-trench").border).toBe("#1c324e");
		expect(familyFor("abyss-trench").accent).toBe("#00f0ff");

		const available = NIGHTGLIDE_SEVEN.map(t => t.name);
		expect(resolveThemeName("abyss-trench", available)).toBe("nightglide-abyss-trench");
		expect(resolveThemeName("trench", available)).toBe("nightglide-abyss-trench");
		expect(resolveThemeName("iris", available)).toBe("nightglide-iris");
	});
});

describe("Theme export and G5 frame color exposure", () => {
	const previousTheme = getCurrentThemeName();

	afterEach(async () => {
		if (previousTheme) await setTheme(previousTheme);
	});

	it("exposes resolved export surface colors and page background on the active Theme instance", async () => {
		await setTheme("nightglide-abyss-trench");
		expect(getActiveThemeExportColors()).toEqual({
			pageBg: "#02060d",
			cardBg: "#0b1524",
			infoBg: "#132238",
		});
		expect(getActiveThemePageBgHex()).toBe("#02060d");
	});

	it("falls back cleanly from empty statusLineBg on themes without export or terminal background", () => {
		const flight = loadThemeJsonSync("nightglide-flight");
		const stripped: ThemeJson = {
			...flight,
			export: undefined,
			terminal: undefined,
			colors: { ...flight.colors, statusLineBg: "" },
		};
		const instance = createTheme(stripped, { mode: "truecolor" });
		setThemeInstance(instance);
		expect(instance.getExportColors()).toEqual({ pageBg: undefined, cardBg: undefined, infoBg: undefined });
		expect(instance.getPageBgHex()).toBe("#0b1022");

		const fam = familyFor("<in-memory>");
		expect(fam.page).toBe("#0b1022");
		expect(fam.border).toBe("#2b3360");
	});
});

describe("Dynamic custom theme family resolution", () => {
	let tempAgentDir: string | undefined;
	let previousAgentDir = "";
	let previousEnv: string | undefined;
	const previousTheme = getCurrentThemeName();

	afterEach(async () => {
		if (tempAgentDir) {
			setAgentDir(previousAgentDir);
			if (previousEnv === undefined) delete process.env.PI_CODING_AGENT_DIR;
			else process.env.PI_CODING_AGENT_DIR = previousEnv;
			await removeWithRetries(tempAgentDir);
			tempAgentDir = undefined;
		}
		if (previousTheme) await setTheme(previousTheme);
	});

	it("reads frame colors dynamically from custom themes on disk and reacts to updates", async () => {
		previousAgentDir = getAgentDir();
		previousEnv = process.env.PI_CODING_AGENT_DIR;
		tempAgentDir = await fs.mkdtemp(path.join(os.tmpdir(), "nightglide-custom-theme-"));
		setAgentDir(tempAgentDir);
		await fs.mkdir(getCustomThemesDir(), { recursive: true });

		const base = loadThemeJsonSync("nightglide-flight");
		const customPath = path.join(getCustomThemesDir(), "my-custom-sky.json");
		const customJson: ThemeJson = {
			...base,
			name: "my-custom-sky",
			export: { pageBg: "#091821", cardBg: "#102430", infoBg: "#173242" },
			colors: {
				...base.colors,
				border: "#2a6f8e",
				mdHeading: "#7ce8ff",
				text: "#e6f7ff",
				muted: "#8bb8cc",
				accent: "#38d6ff",
				warning: "#ffb347",
			},
		};
		await Bun.write(customPath, JSON.stringify(customJson));

		const fam = familyFor("my-custom-sky");
		expect(fam.kind).toBe("flight");
		expect(fam.page).toBe("#091821");
		expect(fam.border).toBe("#2a6f8e");
		expect(fam.title).toBe("#7ce8ff");
		expect(fam.text).toBe("#e6f7ff");
		expect(fam.soft).toBe("#8bb8cc");
		expect(fam.accent).toBe("#38d6ff");
		expect(fam.warm).toBe("#ffb347");
		expect(fam.scene.page).toBe("#091821");
		expect(fam.scene256?.quantized).toBe(true);

		const oceanPath = path.join(getCustomThemesDir(), "my-ocean-custom.json");
		await Bun.write(oceanPath, JSON.stringify({ ...customJson, name: "my-ocean-custom" }));
		expect(familyFor("my-ocean-custom").kind).toBe("dive");

		// Modifying the custom theme file on disk refreshes the derived family on next lookup.
		await Bun.sleep(15);
		await Bun.write(
			customPath,
			JSON.stringify({
				...customJson,
				export: { ...customJson.export, pageBg: "#101a2a" },
				colors: { ...customJson.colors, border: "#4d88c4" },
			}),
		);
		const updated = familyFor("my-custom-sky");
		expect(updated.page).toBe("#101a2a");
		expect(updated.border).toBe("#4d88c4");
	});
});

describe("Welcome gradient stops for abyss-trench and iris", () => {
	it("selects distinct truecolor and 256-color stops for nightglide-abyss-trench and nightglide-iris", async () => {
		const previousTheme = getCurrentThemeName();
		const terminal = TERMINAL as unknown as { trueColor: boolean };
		const previousTrueColor = terminal.trueColor;
		const previousNodeEnv = process.env.NODE_ENV;
		process.env.NODE_ENV = "production";
		try {
			terminal.trueColor = true;
			await setTheme("nightglide-abyss-trench");
			expect(gradientEscape(0)).toBe("\x1b[38;2;0;240;255m");
			expect(gradientEscape(1 / 3)).toBe("\x1b[38;2;0;229;163m");

			await setTheme("nightglide-iris");
			expect(gradientEscape(0)).toBe("\x1b[38;2;60;125;187m");
			expect(gradientEscape(1)).toBe("\x1b[38;2;37;145;98m");

			terminal.trueColor = false;
			await setTheme("nightglide-abyss-trench");
			expect(gradientEscape(0)).toBe("\x1b[38;5;51m");
			await setTheme("nightglide-iris");
			expect(gradientEscape(0)).toBe("\x1b[38;5;68m");
		} finally {
			if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
			else process.env.NODE_ENV = previousNodeEnv;
			terminal.trueColor = previousTrueColor;
			if (previousTheme) await setTheme(previousTheme);
		}
	});
});
