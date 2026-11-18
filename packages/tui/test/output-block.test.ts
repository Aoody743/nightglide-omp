import { beforeAll, describe, expect, it } from "bun:test";
import { stripVTControlCharacters } from "node:util";
import { getThemeByName, initTheme } from "@oh-my-pi/pi-tui/theme";
import { renderMarkdownCell } from "@oh-my-pi/pi-tui/render/code-cell";
import { renderOutputBlock } from "@oh-my-pi/pi-tui/render/output-block";
import { OverlayPanel, PanelRows } from "@oh-my-pi/pi-tui/chrome/overlay-box";
import { visibleWidth } from "@oh-my-pi/pi-tui/utils";

describe("renderOutputBlock", () => {
	beforeAll(async () => {
		await initTheme();
	});

	it("keeps tool and overlay frame rows inside a one-column viewport", async () => {
		const theme = (await getThemeByName("dark"))!;
		const panel = new OverlayPanel("Heading");
		const body = new PanelRows();
		body.setLines(["x"]);
		panel.addChild(body);

		const frames = [
			renderOutputBlock({ width: 1, header: "Heading", sections: [{ lines: ["x"] }] }, theme),
			panel.render(1),
		];
		for (const rows of frames) {
			expect(Math.max(...rows.map(line => visibleWidth(line)))).toBe(1);
		}
	});

	it("reserves symmetric default padding inside content borders", async () => {
		const theme = (await getThemeByName("dark"))!;
		const lines = renderOutputBlock(
			{
				width: 16,
				applyBg: false,
				sections: [{ lines: ["abcdefghijklmnop"] }],
			},
			theme,
		).map(line => stripVTControlCharacters(line));

		expect(lines.filter(line => line.startsWith("│"))).toEqual(["│ abcdefghijkl │", "│ mnop         │"]);
	});

	it("draws footer meta inside the bottom border at full width", async () => {
		const theme = (await getThemeByName("dark"))!;
		const lines = renderOutputBlock(
			{ width: 30, applyBg: false, footerMeta: "Wall 0.16s", sections: [{ lines: ["out"] }] },
			theme,
		).map(line => stripVTControlCharacters(line));

		expect(lines.at(-1)).toBe("╰─── Wall 0.16s ─────────────╯");
		expect(lines.some(line => line.startsWith("│") && line.includes("Wall"))).toBe(false);
	});

	it("wraps footer meta that overflows the border into body rows instead of clipping it", async () => {
		const theme = (await getThemeByName("dark"))!;
		const meta = "Wall: 1.20s · Timeout: 300s · Artifact: a123 · Exit: 7";
		const lines = renderOutputBlock(
			{ width: 40, applyBg: false, footerMeta: meta, sections: [{ lines: ["out"] }] },
			theme,
		).map(line => stripVTControlCharacters(line));

		expect(lines.at(-1)).toBe(`╰${"─".repeat(38)}╯`);
		const body = lines.filter(line => line.startsWith("│")).join(" ");
		expect(body).toContain("Artifact: a123");
		expect(body).toContain("Exit: 7");
	});

	it("keeps explicitly flush content flush on both sides", async () => {
		const theme = (await getThemeByName("dark"))!;
		const lines = renderOutputBlock(
			{
				width: 16,
				applyBg: false,
				contentPaddingLeft: 0,
				sections: [{ lines: ["abcdefghijklmn"] }],
			},
			theme,
		).map(line => stripVTControlCharacters(line));

		expect(lines.filter(line => line.startsWith("│"))).toEqual(["│abcdefghijklmn│"]);
	});

	it("budgets collapsed Markdown rows against the padded block width", async () => {
		const theme = (await getThemeByName("dark"))!;
		const lines = renderMarkdownCell(
			{
				content: "x".repeat(27),
				contentMaxLines: 1,
				status: "complete",
				title: "Read",
				width: 30,
			},
			theme,
		).map(line => stripVTControlCharacters(line));

		expect(lines[1]).toBe(`│ ${"x".repeat(26)} │`);
		expect(lines[2]).toStartWith("│ … 1 more line");
	});
});

describe("renderOutputBlock state header hierarchy", () => {
	beforeAll(async () => {
		await initTheme();
	});

	it("styles running headers with an accent title and a dim meta", async () => {
		const theme = (await getThemeByName("dark"))!;
		const lines = renderOutputBlock(
			{ width: 40, header: "Bash", headerMeta: "2.1s", state: "running", sections: [{ lines: ["out"] }] },
			theme,
		);
		expect(lines[0]).toContain(theme.fg("accent", "╭───"));
		expect(lines[0]).toContain(theme.fg("accent", "Bash"));
		expect(lines[0]).toContain(theme.fg("dim", "2.1s"));
	});

	it("settles success cards into a muted border with a text-level title", async () => {
		const theme = (await getThemeByName("dark"))!;
		const lines = renderOutputBlock(
			{ width: 40, header: "Read", headerMeta: "120 lines", state: "success", sections: [{ lines: ["out"] }] },
			theme,
		);
		expect(lines[0]).toContain(theme.fg("borderMuted", "╭───"));
		expect(lines[0]).toContain(theme.fg("text", "Read"));
		expect(lines[0]).toContain(theme.fg("dim", "120 lines"));
	});

	it("keeps the key color on error titles while the meta recedes", async () => {
		const theme = (await getThemeByName("dark"))!;
		const lines = renderOutputBlock(
			{ width: 40, header: "Bash", headerMeta: "exit 7", state: "error", sections: [{ lines: ["out"] }] },
			theme,
		);
		expect(lines[0]).toContain(theme.fg("error", "╭───"));
		expect(lines[0]).toContain(theme.fg("error", "Bash"));
		expect(lines[0]).toContain(theme.fg("dim", "exit 7"));
	});

	it("leaves headers untouched when the caller overrides the border color", async () => {
		const theme = (await getThemeByName("dark"))!;
		const lines = renderOutputBlock(
			{
				width: 40,
				header: "Read",
				headerMeta: "120 lines",
				state: "success",
				borderColor: "dim",
				sections: [{ lines: ["out"] }],
			},
			theme,
		);
		expect(lines[0]).not.toContain(theme.fg("text", "Read"));
		expect(lines[0]).not.toContain(theme.fg("dim", "120 lines"));
	});

	it("does not restyle headers that already carry their own ANSI styling", async () => {
		const theme = (await getThemeByName("dark"))!;
		const styled = theme.fg("muted", "Read");
		const lines = renderOutputBlock(
			{
				width: 40,
				header: styled,
				headerMeta: "120 lines",
				state: "success",
				sections: [{ lines: ["out"] }],
			},
			theme,
		);
		expect(lines[0]).toContain(styled);
		expect(lines[0]).not.toContain(theme.fg("text", "Read"));
	});
});
