import { describe, expect, it } from "bun:test";
import { renderDiff } from "@oh-my-pi/pi-tui/chrome/diff";
import { type Theme } from "@oh-my-pi/pi-tui/theme";
import { createTheme, getBuiltinThemes } from "@oh-my-pi/pi-tui/theme/loader";
import type { ThemeJson } from "@oh-my-pi/pi-tui/theme/schema";

/** The Flight theme without its word slots, plus `colors`. */
function themeWith(colors: Partial<ThemeJson["colors"]>): Theme {
	const json = getBuiltinThemes()["nightglide-flight"];
	if (!json) throw new Error("nightglide-flight theme unavailable");
	const { toolDiffWordAdded: _added, toolDiffWordRemoved: _removed, ...base } = json.colors;
	return createTheme({ ...json, colors: { ...base, ...colors } }, { mode: "truecolor" });
}

/** A single-line replacement routes through renderIntraLineDiff: one `-` row, one `+` row. */
function renderReplacement(t: Theme): string {
	return renderDiff("-1|alpha\n+1|omega", { theme: t });
}

describe("toolDiffWord* intra-line emphasis", () => {
	it("falls back to the line-level diff foregrounds when a theme omits the word slots", () => {
		// A theme that declares no word slots: `hasColor()` reports them unset, so
		// changed words keep the row's own foreground — the pre-refinement palette,
		// minus the old inverse video.
		const t = themeWith({});
		expect(t.hasColor("toolDiffWordAdded")).toBe(false);
		expect(t.hasColor("toolDiffWordRemoved")).toBe(false);
		const out = renderReplacement(t);
		expect(out).toContain(t.fg("toolDiffRemoved", "alpha"));
		expect(out).toContain(t.fg("toolDiffAdded", "omega"));
		expect(out).not.toContain("\x1b[7m");
	});

	it("paints changed words with the declared word slots instead of the line colors", () => {
		const t = themeWith({ toolDiffWordAdded: "#00ff88", toolDiffWordRemoved: "#ff4400" });
		expect(t.hasColor("toolDiffWordAdded")).toBe(true);
		expect(t.hasColor("toolDiffWordRemoved")).toBe(true);
		const out = renderReplacement(t);
		expect(out).toContain(t.fg("toolDiffWordAdded", "omega"));
		expect(out).toContain(t.fg("toolDiffWordRemoved", "alpha"));
		// Declared slots take over from the line-level colors on the changed words.
		expect(out).not.toContain(t.fg("toolDiffRemoved", "alpha"));
		expect(out).not.toContain("\x1b[7m");
	});
});

describe("nightglide themes declare refined word slots", () => {
	const EXPECTED: Record<string, { added: string; removed: string }> = {
		"nightglide-flight": { added: "#86efac", removed: "#fca5a5" },
		"nightglide-abyss": { added: "#6ee7b7", removed: "#fda4af" },
		"nightglide-aurora": { added: "#6ee7b7", removed: "#fda4af" },
		"nightglide-cloudlight": { added: "#0d5c2c", removed: "#7f1d1d" },
		"nightglide-daybreak": { added: "#0b4f24", removed: "#7f1d1d" },
	};

	for (const [name, expected] of Object.entries(EXPECTED)) {
		it(`${name}: toolDiffWordAdded ${expected.added} / toolDiffWordRemoved ${expected.removed}`, () => {
			const json = getBuiltinThemes()[name];
			if (!json) throw new Error(`${name} theme unavailable`);
			const t = createTheme(json, { mode: "truecolor" });
			expect(t.hasColor("toolDiffWordAdded")).toBe(true);
			expect(t.hasColor("toolDiffWordRemoved")).toBe(true);
			expect(t.getColorHex("toolDiffWordAdded")).toBe(expected.added);
			expect(t.getColorHex("toolDiffWordRemoved")).toBe(expected.removed);
		});
	}
});
