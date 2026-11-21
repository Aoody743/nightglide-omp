import { afterAll, afterEach, beforeAll, describe, expect, it } from "bun:test";
import { Markdown } from "@oh-my-pi/pi-tui/components/markdown";
import { createTheme, getBuiltinThemes } from "@oh-my-pi/pi-tui/theme/loader";
import { getMarkdownTheme, setMarkdownColorful, setThemeInstance, theme } from "@oh-my-pi/pi-tui/theme";
import type { Theme } from "@oh-my-pi/pi-tui/theme";

const DOC = [
	"# One",
	"",
	"## Two",
	"",
	"###### Six",
	"",
	"**loud `code` tail** and *soft*",
	"",
	"| Head |",
	"| ---- |",
	"| cell |",
].join("\n");

let previous: Theme;
let celestial: Theme;

beforeAll(() => {
	previous = theme;
	const json = getBuiltinThemes()["nightglide-flight"];
	if (!json) throw new Error("nightglide-flight theme unavailable");
	celestial = createTheme(json, { mode: "truecolor" });
	setThemeInstance(celestial);
});

afterEach(() => setMarkdownColorful(true));

afterAll(() => setThemeInstance(previous));

describe("colorful Markdown", () => {
	it("paints headings by depth, emphasis, inline code and table headers from the theme palette", () => {
		const t = celestial;
		const out = new Markdown(DOC, 0, 0, getMarkdownTheme()).render(60).join("\n");

		expect(out).toContain(t.ansiFg("magenta", t.bold(t.underline("One"))));
		expect(out).toContain(t.ansiFg("yellow", t.bold("Two")));
		// Depths past the ladder reuse its last hue.
		expect(out).toContain(t.ansiFg("blue", t.bold("###### Six")));
		expect(out).toContain(t.ansiFg("magenta", t.italic("soft")));
		// Cell wrapping closes styles after the text, so match the opening color only.
		const yellow = t.ansiFg("yellow", "").replace("\x1b[39m", "");
		expect(out).toContain(`${yellow}${t.bold("Head").replace("\x1b[22m", "")}`);
		// The strong span's color resumes after the nested code span resets the foreground.
		const magenta = t.ansiFg("magenta", "").replace("\x1b[39m", "");
		expect(out).toContain(`${t.ansiFg("green", "code")}${magenta} tail`);
	});

	it("keeps the single heading token and uncolored emphasis when disabled", () => {
		setMarkdownColorful(false);
		const t = celestial;
		const out = new Markdown(DOC, 0, 0, getMarkdownTheme()).render(60).join("\n");

		expect(out).toContain(t.fg("mdHeading", t.bold("Two")));
		// Deep headings fade toward dim instead of the single heading color.
		expect(out).toContain(t.fg("dim", t.bold("###### Six")));
		expect(out).not.toContain(t.fg("mdHeading", t.bold("###### Six")));
		expect(out).toContain(t.fg("mdCode", "code"));
		expect(out).not.toContain(t.ansiFg("magenta", ""));
	});

	it("fades heading color by depth across all six levels when disabled", () => {
		setMarkdownColorful(false);
		const t = celestial;
		const ladder = ["# One", "", "## Two", "", "### Three", "", "#### Four", "", "##### Five", "", "###### Six"].join(
			"\n",
		);
		const out = new Markdown(ladder, 0, 0, getMarkdownTheme()).render(60).join("\n");

		// H1/H2 keep the heading slot; markdown.ts owns the weight (bold, plus
		// underline on H1), so the adapter never re-applies bold itself.
		expect(out).toContain(t.fg("mdHeading", t.bold(t.underline("One"))));
		expect(out).toContain(t.fg("mdHeading", t.bold("Two")));
		// H3 settles on plain text, H4 mutes, and the two deepest levels dim.
		expect(out).toContain(t.fg("text", t.bold("### Three")));
		expect(out).toContain(t.fg("muted", t.bold("#### Four")));
		expect(out).toContain(t.fg("dim", t.bold("##### Five")));
		expect(out).toContain(t.fg("dim", t.bold("###### Six")));
	});

	it("falls back to the terminal's own palette when a theme ships no terminal.ansi", () => {
		const json = getBuiltinThemes()["nightglide-flight"];
		if (!json) throw new Error("nightglide-flight theme unavailable");
		const bare = createTheme({ ...json, terminal: undefined }, { mode: "truecolor" });

		expect(bare.ansiFg("magenta", "x")).toBe("\x1b[38;5;5mx\x1b[39m");
		expect(celestial.ansiFg("magenta", "x")).not.toBe(bare.ansiFg("magenta", "x"));
	});
});
