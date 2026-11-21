import { describe, expect, test } from "bun:test";
import { relativeLuminance } from "@oh-my-pi/pi-utils";
import { resolveVarRefs } from "@oh-my-pi/pi-tui/theme/color";
import { loadTheme, loadThemeJson } from "@oh-my-pi/pi-tui/theme/loader";

/**
 * Regression test for #6334: markdown code fence header lines (mdCodeBlockBorder)
 * were nearly invisible on the default dark theme (and several bundled dark themes)
 * because the token was mapped to a near-background surface color.
 *
 * The fence border paints the whole ```lang / ```start:end:path info-string line
 * (see getMarkdownTheme() -> codeBlockBorder in pi-tui theme/tui-adapters.ts), so it carries
 * real navigation info and must stay legible as secondary chrome. This test resolves
 * the token for each affected theme and asserts a minimum WCAG contrast ratio against
 * the theme's own page background, so a palette change can't silently regress it back
 * below the legibility floor.
 */

/** Every theme Nightglide ships; #6334 was a near-bg mdCodeBlockBorder on bundled themes. */
const AFFECTED_THEMES = [
	"nightglide-flight",
	"nightglide-cloudlight",
	"nightglide-abyss",
	"nightglide-daybreak",
	"nightglide-aurora",
];
/** Just below Nord's 2.43:1, the lowest contrast available in its muted palette. */
const MIN_CONTRAST = 2.4;

describe("code fence border contrast (#6334)", () => {
	for (const name of AFFECTED_THEMES) {
		test(`${name}: mdCodeBlockBorder is legible against the theme page background`, async () => {
			const [theme, themeJson] = await Promise.all([loadTheme(name, { mode: "truecolor" }), loadThemeJson(name)]);
			const border = theme.getColorHex("mdCodeBlockBorder");
			const pageBgToken = themeJson.export?.pageBg;
			expect(pageBgToken).toBeDefined();
			if (pageBgToken === undefined) throw new Error(`${name} does not define export.pageBg`);
			const pageBg = resolveVarRefs(pageBgToken, themeJson.vars ?? {});
			expect(typeof pageBg).toBe("string");
			if (typeof pageBg !== "string") throw new Error(`${name} export.pageBg is not an RGB color`);

			const borderLuminance = relativeLuminance(border);
			const pageBgLuminance = relativeLuminance(pageBg);
			expect(borderLuminance).toBeDefined();
			expect(pageBgLuminance).toBeDefined();
			if (borderLuminance === undefined || pageBgLuminance === undefined) {
				throw new Error(`${name} has an invalid code-fence border or page background color`);
			}
			const ratio =
				(Math.max(borderLuminance, pageBgLuminance) + 0.05) / (Math.min(borderLuminance, pageBgLuminance) + 0.05);
			expect(ratio).toBeGreaterThanOrEqual(MIN_CONTRAST);
		});
	}
});
