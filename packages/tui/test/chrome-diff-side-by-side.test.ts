import { describe, expect, it } from "bun:test";
import { renderDiff, SIDE_BY_SIDE_MIN_WIDTH } from "@oh-my-pi/pi-tui/chrome/diff";
import { visibleWidth } from "@oh-my-pi/pi-tui/utils";
import { type Theme, type ThemeColor } from "@oh-my-pi/pi-tui/theme";
import { createTheme, getBuiltinThemes } from "@oh-my-pi/pi-tui/theme/loader";
import type { ThemeJson } from "@oh-my-pi/pi-tui/theme/schema";

function themeWith(colors: Partial<ThemeJson["colors"]>): Theme {
	const json = getBuiltinThemes().dark;
	if (!json) throw new Error("dark theme unavailable");
	return createTheme({ ...json, colors: { ...json.colors, ...colors } }, { mode: "truecolor" });
}

const strip = (text: string): string => Bun.stripANSI(text);

/**
 * Layout at the 120-cell threshold with the constant 3-digit gutter: each
 * column is gutter(4) + rail(1) + content, the divider is one cell, so
 * columnWidth = floor((120 - 11) / 2) = 54 and a full row is 119 cells.
 */
const COLUMN_WIDTH = 54;
const GUTTER_WIDTH = 4;
const ROW_WIDTH = 2 * (GUTTER_WIDTH + 1 + COLUMN_WIDTH) + 1;

/** The replacement diff used by the pairing tests. */
const REPLACEMENT_DIFF = [
	" 4|const a = 1;",
	"-5|const oldValue = compute(a, b);",
	"+5|const newValue = compute(a, c);",
	" 6|const tail = tailCall();",
].join("\n");

describe("renderDiff side-by-side layout (GATE-DIM-003)", () => {
	it(`pairs removals and additions on shared rows once the width reaches ${SIDE_BY_SIDE_MIN_WIDTH}`, () => {
		const theme = themeWith({});
		const rows = renderDiff(REPLACEMENT_DIFF, { theme, width: SIDE_BY_SIDE_MIN_WIDTH }).split("\n").map(strip);

		// The `-` and `+` lines of the replacement share one physical row and
		// both gutters keep their own numbers.
		expect(rows).toHaveLength(3);
		expect(rows[1]).toContain("const oldValue");
		expect(rows[1]).toContain("const newValue");
		expect(rows[1]).toContain("-5│");
		expect(rows[1]).toContain("+5│");

		// Context lines repeat on both sides of the divider.
		expect(rows[0]).toContain("const a = 1;");
		expect(rows[2]).toContain("const tail = tailCall();");
		for (const row of rows) expect(row.split("│").length - 1).toBe(3);
	});

	it("keeps every row at or below the usable width and pads columns into a rectangle", () => {
		const theme = themeWith({});
		const rows = renderDiff(REPLACEMENT_DIFF, { theme, width: SIDE_BY_SIDE_MIN_WIDTH }).split("\n");
		for (const row of rows) {
			expect(visibleWidth(row)).toBeLessThanOrEqual(SIDE_BY_SIDE_MIN_WIDTH);
			expect(visibleWidth(strip(row))).toBe(ROW_WIDTH);
		}
	});

	it("falls back to the unified view below the threshold, matching the width-less render", () => {
		const theme = themeWith({});
		const unified = renderDiff(REPLACEMENT_DIFF, { theme, width: SIDE_BY_SIDE_MIN_WIDTH - 1 });
		expect(unified).toBe(renderDiff(REPLACEMENT_DIFF, { theme }));
		const rows = unified.split("\n").map(strip);
		// Unified keeps one gutter per row: old and new never share a line.
		expect(rows.some(row => row.includes("const oldValue") && row.includes("const newValue"))).toBe(false);
		for (const row of rows) expect(row.split("│").length - 1).toBeLessThanOrEqual(1);
	});

	it("derives the right-side number of context rows across a shrinking change", () => {
		// Old lines 2-4 collapse to new line 2: the trailing context ` 5|e` is
		// old line 5 but new line 3 (running old→new offset -2).
		const theme = themeWith({});
		const diff = " 1|a\n-2|b\n-3|c\n-4|d\n+2|X\n 5|e";
		const rows = renderDiff(diff, { theme, width: SIDE_BY_SIDE_MIN_WIDTH }).split("\n").map(strip);

		expect(rows).toHaveLength(5);
		// Pairs: (b, X), then the leftover removals sit alone.
		expect(rows[1]).toContain("│  +2│X");
		expect(rows[2]).not.toContain("+");
		expect(rows[3]).not.toContain("+");
		// The trailing context shows old 5 on the left and derived new 3 on the right.
		expect(rows[4].startsWith("   5│a".replace("a", "e"))).toBe(true);
		expect(rows[4]).toContain("│   3│e");
	});

	it("leaves the opposite side blank for unpaired removals and additions", () => {
		const theme = themeWith({});
		const rows = renderDiff("-1|alpha\n-2|beta\n+1|gamma", { theme, width: SIDE_BY_SIDE_MIN_WIDTH })
			.split("\n")
			.map(strip);

		expect(rows[0]).toContain("alpha");
		expect(rows[0]).toContain("gamma");
		// The second removal has no addition to pair with: blank right cell.
		expect(rows[1]).toContain("beta");
		expect(rows[1]).not.toContain("gamma");
		expect(rows[1].endsWith(`${" ".repeat(GUTTER_WIDTH)}│${" ".repeat(COLUMN_WIDTH)}`)).toBe(true);
	});

	it("keeps standalone additions right-only with a blank left cell", () => {
		const theme = themeWith({});
		const rows = renderDiff(" 1|a\n+2|X\n+3|Y", { theme, width: SIDE_BY_SIDE_MIN_WIDTH }).split("\n").map(strip);
		// Left cell is an all-spaces placeholder; the addition owns the right cell.
		const blankLeft = `${" ".repeat(GUTTER_WIDTH)}│${" ".repeat(COLUMN_WIDTH)}`;
		expect(rows[1].startsWith(blankLeft)).toBe(true);
		expect(rows[1]).toContain("│  +2│X");
		expect(rows[2]).toContain("│  +3│Y");
	});

	it("renders blank-region gaps as a lone ellipsis row that splits pairing", () => {
		const theme = themeWith({});
		const rows = renderDiff("-1|old\n\n+2|new", { theme, width: SIDE_BY_SIDE_MIN_WIDTH }).split("\n").map(strip);
		expect(rows[0]).toContain("old");
		expect(rows[0]).not.toContain("new");
		expect(rows[1]).toBe("…");
		expect(rows[2]).toContain("new");
	});

	it("truncates oversized CJK rows inside the column with an ellipsis instead of wrapping", () => {
		const theme = themeWith({});
		const longCjk = "这是一段非常长的中文内容需要被截断处理因为栏宽有限而每个字符占据两个显示列";
		const diff = `-7|${longCjk}\n+7|中文替换行`;
		const rows = renderDiff(diff, { theme, width: SIDE_BY_SIDE_MIN_WIDTH }).split("\n");
		for (const row of rows) {
			expect(visibleWidth(row)).toBeLessThanOrEqual(SIDE_BY_SIDE_MIN_WIDTH);
			expect(row).not.toContain("\n");
		}
		const stripped = strip(rows[0]);
		// Truncation is flagged inside the column, and the paired short side survives.
		expect(stripped).toContain("…");
		expect(stripped).toContain("中文替换行");
	});

	it("paints word-level emphasis on both sides of a paired row", () => {
		const theme = themeWith({ toolDiffWordAdded: "#00ff88", toolDiffWordRemoved: "#ff4400" });
		const out = renderDiff("-1|alpha\n+1|omega", { theme, width: SIDE_BY_SIDE_MIN_WIDTH });
		expect(out).toContain(theme.fg("toolDiffWordRemoved", "alpha"));
		expect(out).toContain(theme.fg("toolDiffWordAdded", "omega"));
	});

	it("degrades word-level emphasis to whole-line colors when the columns fall below the floor", () => {
		const theme = themeWith({ toolDiffWordAdded: "#00ff88", toolDiffWordRemoved: "#ff4400" });
		const open = (color: ThemeColor): string => theme.fg(color, "X").split("X")[0];
		// A 46-digit line number widens the shared gutter to 47 cells, squeezing
		// each column to 11 cells — below the 16-cell word-emphasis floor.
		const hugeNumber = "9".repeat(46);
		const out = renderDiff(`-${hugeNumber}|alpha\n+${hugeNumber}|omega`, { theme, width: SIDE_BY_SIDE_MIN_WIDTH });
		expect(out).not.toContain(`${open("toolDiffWordRemoved")}alpha`);
		expect(out).not.toContain(`${open("toolDiffWordAdded")}omega`);
		expect(out).toContain(open("toolDiffRemoved"));
		expect(out).toContain(open("toolDiffAdded"));
		for (const row of out.split("\n")) expect(visibleWidth(row)).toBeLessThanOrEqual(SIDE_BY_SIDE_MIN_WIDTH);
	});

	it("renders numberless rows with the marker glued to the content, like the unified fallback", () => {
		const theme = themeWith({});
		const rows = renderDiff("@@\n-old\n+new", { theme, width: SIDE_BY_SIDE_MIN_WIDTH }).split("\n").map(strip);
		expect(rows[0]).toBe("@@");
		expect(rows[1]).toContain("-old");
		expect(rows[1]).toContain("+new");
	});
});
