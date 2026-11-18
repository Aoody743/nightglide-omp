import { beforeAll, describe, expect, it } from "bun:test";
import type { Theme } from "@oh-my-pi/pi-tui/theme";
import { getThemeByName, initTheme } from "@oh-my-pi/pi-tui/theme";
import { plainToolCard, renderStatusLine, type StatusLineOptions } from "@oh-my-pi/pi-tui/render";
import type { TspSpan, TspText } from "@oh-my-pi/pi-wire";

/**
 * The third-round card hierarchy settles success headers onto the text layer
 * (success = borderMuted frame + text title) instead of the accent reserved
 * for live states; error/warning keep their key colors. Both title-color paths
 * must agree: the ANSI path (`renderStatusLine`, self-styled headers) and the
 * native TSP path (ToolCard `statusSpans`).
 */

let uiTheme: Theme;

beforeAll(async () => {
	await initTheme();
	uiTheme = (await getThemeByName("dark"))!;
	expect(uiTheme).toBeDefined();
});

/** Native head spans of a card whose snapshot carries only a structured status. */
function nativeHeadSpans(status: StatusLineOptions): TspSpan[] {
	const card = plainToolCard(uiTheme, () => ({ status, phase: "success", body: ["out"] }));
	const node = card.describe({ cols: 80 } as never);
	card.dispose();
	const head = (node.p as { head?: TspText }).head;
	expect(head).toBeDefined();
	return head as TspSpan[];
}

describe("renderStatusLine success title settles onto the text layer", () => {
	it("styles success titles with text, not accent", () => {
		const rendered = renderStatusLine({ icon: "success", title: "Read", description: "120 lines" }, uiTheme);
		expect(rendered).toContain(uiTheme.fg("text", "Read"));
		expect(rendered).not.toContain(uiTheme.fg("accent", "Read"));
	});

	it("keeps key colors on error and warning titles", () => {
		const error = renderStatusLine({ icon: "error", title: "Bash", description: "exit 7" }, uiTheme);
		expect(error).toContain(uiTheme.fg("error", "Bash"));
		const warning = renderStatusLine({ icon: "warning", title: "Ask", description: "timeout 10s" }, uiTheme);
		expect(warning).toContain(uiTheme.fg("warning", "Ask"));
	});

	it("keeps live states on the accent title", () => {
		const running = renderStatusLine({ icon: "running", title: "Bash", spinnerFrame: 0 }, uiTheme);
		expect(running).toContain(uiTheme.fg("accent", "Bash"));
		const info = renderStatusLine({ icon: "info", title: "Note" }, uiTheme);
		expect(info).toContain(uiTheme.fg("accent", "Note"));
	});

	it("respects an explicit titleColor over the success default", () => {
		const rendered = renderStatusLine({ icon: "success", title: "Read", titleColor: "muted" }, uiTheme);
		expect(rendered).toContain(uiTheme.fg("muted", "Read"));
		expect(rendered).not.toContain(uiTheme.fg("text", "Read"));
	});
});

describe("ToolCard statusSpans success title settles onto the text layer", () => {
	it("emits a text-styled success title span, not accent", () => {
		expect(nativeHeadSpans({ icon: "success", title: "Read", description: "120 lines" })).toEqual([
			{ t: "Read", s: "text" },
			{ t: ": " },
			{ t: "120 lines", s: "muted" },
		]);
	});

	it("keeps key colors on error and warning title spans", () => {
		expect(nativeHeadSpans({ icon: "error", title: "Bash" })).toEqual([{ t: "Bash", s: "error" }]);
		expect(nativeHeadSpans({ icon: "warning", title: "Ask" })).toEqual([{ t: "Ask", s: "warning" }]);
	});

	it("keeps live states on the accent title span", () => {
		expect(nativeHeadSpans({ icon: "running", title: "Bash" })).toEqual([{ t: "Bash", s: "accent" }]);
		expect(nativeHeadSpans({ icon: "info", title: "Note" })).toEqual([{ t: "Note", s: "accent" }]);
	});

	it("respects an explicit titleColor span over the success default", () => {
		expect(nativeHeadSpans({ icon: "success", title: "Read", titleColor: "muted" })).toEqual([
			{ t: "Read", s: "muted" },
		]);
	});
});
