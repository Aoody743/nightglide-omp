import { describe, expect, it } from "bun:test";
import { fileURLToPath } from "node:url";

/**
 * Effort Glow Ladder contrast audit (Nightglide direction: bright color is
 * reserved for focus, and every rung it does paint must be legible). Each
 * thinking tier color must hold WCAG contrast ≥ 3.0 against both surfaces a
 * rung renders on: the terminal's default background (thinking pulse, collapse
 * heads, task cards) and the status-line fill (the model segment's rung glyph).
 *
 * The audit reads the shipped theme JSONs and resolves `vars` references the
 * way the loader does, so a future palette tweak that drops a rung below the
 * floor fails here instead of washing out on a real terminal.
 */

const THEME_DIR = fileURLToPath(new URL("../src/theme/", import.meta.url));
const THEMES = [
	"nightglide-flight",
	"nightglide-abyss",
	"nightglide-aurora",
	"nightglide-cloudlight",
	"nightglide-daybreak",
] as const;

const TIERS = ["thinkingMinimal", "thinkingLow", "thinkingMedium", "thinkingHigh", "thinkingXhigh"] as const;

const CONTRAST_FLOOR = 3.0;

type Color = string | number;

/** WCAG relative luminance of a resolved hex color. */
function relativeLuminance(hex: string): number {
	const value = hex.replace("#", "");
	const channels = [0, 2, 4].map(offset => Number.parseInt(value.slice(offset, offset + 2), 16) / 255);
	const [r, g, b] = channels.map(channel =>
		channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
	);
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two resolved hex colors. */
function contrastRatio(a: string, b: string): number {
	const [l1, l2] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
	return (l1 + 0.05) / (l2 + 0.05);
}

/** Hex `#rrggbb` for an xterm 256-palette index. */
function xterm256(index: number): string {
	const cube = [0, 95, 135, 175, 215, 255];
	const basics = [0x000000, 0xcd0000, 0x00cd00, 0xcdcd00, 0x0000ee, 0xcd00cd, 0x00cdcd, 0xe5e5e5];
	let rgb: readonly number[];
	if (index < 8) rgb = [basics[index]!];
	else if (index < 16) rgb = [basics[index - 8]!];
	else if (index < 232) {
		const n = index - 16;
		rgb = [cube[Math.floor(n / 36)]!, cube[Math.floor((n % 36) / 6)]!, cube[n % 6]!];
	} else {
		const gray = Math.round(((index - 232) / 23) * 255);
		rgb = [gray, gray, gray];
	}
	const hex = (channel: number): string => channel.toString(16).padStart(2, "0");
	return `#${hex(rgb[0]!)}${hex(rgb[1]!)}${hex(rgb[2]!)}`;
}

/** Resolve one `colors` entry through the theme's `vars` map (loader behavior). */
function resolveColor(value: Color, vars: Record<string, Color>): string {
	if (typeof value === "number") return xterm256(value);
	if (value.startsWith("#") || value === "") return value;
	return resolveColor(vars[value.startsWith("$") ? value.slice(1) : value] ?? value, vars);
}

for (const name of THEMES) {
	const themeJson = (await Bun.file(`${THEME_DIR}${name}.json`).json()) as {
		vars?: Record<string, Color>;
		colors: Record<string, Color>;
		terminal?: { background?: Color };
	};

	describe(`${name} effort rung contrast`, () => {
		const vars = themeJson.vars ?? {};
		const terminalBg = resolveColor(themeJson.terminal?.background ?? themeJson.colors.statusLineBg, vars);
		const statusLineBg = resolveColor(themeJson.colors.statusLineBg, vars);

		for (const tier of TIERS) {
			it(`${tier} holds ≥ ${CONTRAST_FLOOR} on both the terminal background and the status line`, () => {
				const hex = resolveColor(themeJson.colors[tier], vars);
				expect(hex, `${tier} must resolve to a concrete color`).toMatch(/^#[0-9a-fA-F]{6}$/);
				const onTerminal = contrastRatio(hex, terminalBg);
				const onStatusLine = contrastRatio(hex, statusLineBg);
				expect(onTerminal, `${tier} ${hex} on ${terminalBg}`).toBeGreaterThanOrEqual(CONTRAST_FLOOR);
				expect(onStatusLine, `${tier} ${hex} on ${statusLineBg}`).toBeGreaterThanOrEqual(CONTRAST_FLOOR);
			});
		}
	});
}
