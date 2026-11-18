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

	it("keeps the key color on warning titles while the meta recedes", async () => {
		const theme = (await getThemeByName("dark"))!;
		const lines = renderOutputBlock(
			{ width: 40, header: "Ask", headerMeta: "timeout 10s", state: "warning", sections: [{ lines: ["out"] }] },
			theme,
		);
		expect(lines[0]).toContain(theme.fg("warning", "╭───"));
		expect(lines[0]).toContain(theme.fg("warning", "Ask"));
		expect(lines[0]).toContain(theme.fg("dim", "timeout 10s"));
	});

	it("styles the separator dot between title and meta with dim", async () => {
		const theme = (await getThemeByName("dark"))!;
		const lines = renderOutputBlock(
			{ width: 40, header: "Read", headerMeta: "120 lines", state: "success", sections: [{ lines: ["out"] }] },
			theme,
		);
		expect(lines[0]).toContain(theme.fg("dim", theme.sep.dot));
	});

	it("styles unstyled footer meta with dim on the bottom border", async () => {
		const theme = (await getThemeByName("dark"))!;
		const lines = renderOutputBlock(
			{ width: 40, footerMeta: "Wall 0.16s", state: "success", sections: [{ lines: ["out"] }] },
			theme,
		);
		expect(lines.at(-1)).toContain(theme.fg("dim", "Wall 0.16s"));
	});
});

describe("renderOutputBlock narrow viewport responsiveness", () => {
	beforeAll(async () => {
		await initTheme();
	});

	it("truncates long headers with ellipsis in narrow viewports (80, 60, 40 cols)", async () => {
		const theme = (await getThemeByName("dark"))!;
		const header = "Read src/auth/session/token_provider_factory.ts";
		const headerMeta = "240 lines · 8.2kb";

		for (const width of [80, 60, 40]) {
			const lines = renderOutputBlock(
				{ width, header, headerMeta, state: "success", sections: [{ lines: ["content row"] }] },
				theme,
			);
			for (const line of lines) {
				expect(visibleWidth(line)).toBeLessThanOrEqual(width);
			}
			if (width <= 60) {
				const stripped = stripVTControlCharacters(lines[0]);
				expect(stripped).toContain("…");
			}
		}
	});

	it("wraps overflowing unstyled footer meta into dimmed body rows", async () => {
		const theme = (await getThemeByName("dark"))!;
		const meta = "Wall 1.20s · Timeout 300s · Artifact a123 · Exit 7";
		const lines = renderOutputBlock(
			{ width: 35, footerMeta: meta, state: "error", sections: [{ lines: ["failure details"] }] },
			theme,
		);
		// Bottom border should collapse to plain border
		expect(stripVTControlCharacters(lines.at(-1)!)).toBe(`╰${"─".repeat(33)}╯`);
		// And should have error border color
		expect(lines.at(-1)).toContain(theme.fg("error", "╰───"));
		// Body row should contain dimmed footer meta text
		const metaRow = lines.find(line => line.includes("Artifact a123"))!;
		expect(metaRow).toBeDefined();
		expect(metaRow).toContain(theme.fg("dim", "Artifact a123 · Exit 7"));
	});

	it("collapses frame cleanly without overflow in extreme narrow viewports (20, 10, 5, 2, 1)", async () => {
		const theme = (await getThemeByName("dark"))!;
		for (const width of [20, 10, 5, 2, 1]) {
			const lines = renderOutputBlock(
				{
					width,
					header: "Bash command",
					headerMeta: "0.5s",
					footerMeta: "Wall 0.5s",
					state: "running",
					sections: [{ lines: ["echo hello world"] }],
				},
				theme,
			);
			for (const line of lines) {
				expect(visibleWidth(line)).toBeLessThanOrEqual(width);
			}
		}
	});
});
