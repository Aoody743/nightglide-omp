import { beforeAll, describe, expect, it } from "bun:test";
import { nightglideComposerStyle } from "../src/components/composer/nightglide";
import { renderTopRule, ruleComposerStyle } from "../src/components/composer/rule";
import type { ComposerChromeContext } from "../src/components/composer/types";
import { renderComposerShapePreview } from "../src/overlays/composer-shape-preview";
import { getComposerShapeOptions, installExtensionComposerShape } from "../src/overlays/composer-shape-registry";
import { initTheme, setTheme, theme } from "../src/theme/theme";
import { type ComposerStyle, truncateToWidth, visibleWidth } from "../src/index";

beforeAll(async () => {
	await initTheme();
});

describe("composer shape preview", () => {
	it("resolves transparent composer preview text away from the terminal default", async () => {
		// The built-in `light` theme leaves `text` empty; a transparent shape must
		// still emit an explicit contrast foreground instead of ESC[39m, matching
		// the live editor so the preview stays readable on a light terminal.
		await setTheme("light");
		const box = renderComposerShapePreview("box", 80).join("\n");
		expect(box).not.toContain("\x1b[39mAsk anything");
		expect(box).toMatch(/\x1b\[38[;0-9]*mAsk anything/);
	});

	it("borrows status rows from the live status source per shape layout", async () => {
		await setTheme("dark");
		// Echo mocks: the stand-in title must be forwarded as a prop to every
		// title-bearing status call, not glued onto the rendered content.
		const status = {
			getTopBorder: (_width: number, previewTitle?: string) => {
				const content = `TOPBAR ${previewTitle ?? ""}`;
				return { content, width: content.length };
			},
			getStandaloneTopBorder: (_width: number, previewTitle?: string) => {
				const content = `CHIP ${previewTitle ?? ""}`;
				return { content, width: content.length };
			},
			getBandTopBorder: (_width: number, previewTitle?: string) => {
				const content = `BAND ${previewTitle ?? ""}`;
				return { content, width: content.length };
			},
			renderBottomBar: (_width: number, groups: "left" | "full", previewTitle?: string) =>
				`BOTTOM-${groups.toUpperCase()} ${previewTitle ?? ""}`,
		};

		const box = renderComposerShapePreview("box", 80, status).join("\n");
		expect(box).toContain("TOPBAR"); // embedded in the top border
		expect(box).toContain("nightglide"); // stand-in title forwarded to the status source
		expect(box).not.toContain("BOTTOM"); // box has no standalone bottom bar
		const band = renderComposerShapePreview("band", 80, status).join("\n");
		expect(band).toContain("BAND"); // flush band row above the prompt
		expect(band).toContain("nightglide");
		expect(band).not.toContain("BOTTOM"); // the band replaces the bottom bar

		const claude = renderComposerShapePreview("claude", 80, status).join("\n");
		expect(claude).toContain("CHIP"); // right group chips onto the top rule
		expect(claude).toContain("nightglide");
		expect(claude).toContain("BOTTOM-LEFT"); // left group only on the bottom bar

		const rule = renderComposerShapePreview("rule", 80, status);
		expect(rule.join("\n")).toContain("CHIP");
		expect(rule.join("\n")).toContain("nightglide");
		expect(rule.join("\n")).toContain("BOTTOM-LEFT");
		expect(rule[rule.length - 2]).toBe(""); // spacer row: rule has no bottom chrome

		const pi = renderComposerShapePreview("pi", 80, status);
		expect(pi.join("\n")).not.toContain("CHIP");
		expect(pi.join("\n")).toContain("nightglide");
		expect(pi.join("\n")).toContain("BOTTOM-FULL"); // both groups on the bottom bar
		expect(pi[pi.length - 2]).not.toBe(""); // bottom rule already separates the bar

		const borderless = renderComposerShapePreview("borderless", 80, status).join("\n");
		expect(borderless).toContain("nightglide");
		expect(borderless).toContain("BOTTOM-FULL");

		for (const shape of ["field", "rail"]) {
			const rendered = renderComposerShapePreview(shape, 80, status);
			expect(rendered.join("\n")).not.toContain("CHIP");
			expect(rendered.join("\n")).toContain("nightglide");
			expect(rendered.join("\n")).toContain("BOTTOM-FULL");
			expect(rendered[rendered.length - 2]).toBe(""); // spacer row before the bar
		}
	});

	it("installs extension shapes into both selectors and live rendering", async () => {
		await setTheme("dark");
		const style: ComposerStyle = {
			id: "extension-dock",
			sideBorders: false,
			verticalChrome: 1,
			statusAttachment: "none",
			bottomBar: "full",
			bottomBarGap: false,
			defaultPromptGutter: "EXT ",
			defaultPaddingX: () => 0,
			sideChromeWidth: () => 0,
			renderTop: context => context.borderColor("=".repeat(context.width)),
			renderRow: context => [context.gutter + context.text + context.pad],
			renderBottom: () => undefined,
		};
		const dispose = installExtensionComposerShape({
			label: "Extension Dock",
			description: "Custom extension composer",
			style,
		});

		try {
			expect(getComposerShapeOptions().at(-1)).toEqual({
				value: "extension-dock",
				label: "Extension Dock",
				description: "Custom extension composer",
			});
			const rendered = renderComposerShapePreview("extension-dock", 76).join("\n");
			expect(rendered).toContain("=".repeat(76));
			expect(rendered).toContain("EXT ");
			expect(rendered).toContain("Ask anything");
		} finally {
			dispose();
		}

		expect(getComposerShapeOptions().some(option => option.value === "extension-dock")).toBe(false);
	});

	it("uses the full overlay width instead of clipping the status band (issue #12500)", async () => {
		await setTheme("dark");
		const status = {
			getTopBorder: (width: number) => ({ content: "", width }),
			getStandaloneTopBorder: (width: number) => ({ content: "", width }),
			getBandTopBorder: (width: number) => ({ content: " ".repeat(width - 6) + "STATUS", width }),
			renderBottomBar: () => "",
		};

		const [statusBand] = renderComposerShapePreview("band", 200, status);

		expect(visibleWidth(statusBand ?? "")).toBe(200);
		expect(statusBand).toEndWith("STATUS");
	});
});

describe("nightglide composer working state", () => {
	const box = {
		topLeft: "╭",
		topRight: "╮",
		bottomLeft: "╰",
		bottomRight: "╯",
		horizontal: "─",
		vertical: "│",
	};

	/** Chrome context mirroring the live editor wiring: borderMuted-family border,
	 *  stable accent, right-docked status chip. */
	function ctx(working?: boolean, width = 80): ComposerChromeContext {
		return {
			width,
			paddingX: 0,
			borderColor: (str: string) => theme.fg("borderMuted", str),
			accentColor: (str: string) => theme.fg("accent", str),
			surfaceColor: (str: string) => str,
			box,
			topBorder: { content: "CHIP", width: 4 },
			working,
		};
	}

	it("keeps the quiet border rule when idle (no working mark)", async () => {
		await setTheme("dark");
		// nightglide's renderTop never returns undefined; `?? ""` only satisfies
		// the ComposerStyle interface's optional return for type checking.
		const idle = nightglideComposerStyle.renderTop(ctx(false)) ?? "";
		// Idle is exactly the shared rule rendering: border-colored stroke, chip
		// docked at the right edge, no working mark.
		expect(idle).toBe(renderTopRule(ctx(false)));
		expect(idle).toContain(theme.fg("borderMuted", "─"));
		expect(idle).not.toContain("✦");
		expect(idle.endsWith(`CHIP${theme.fg("borderMuted", "─")}`)).toBe(true);
		expect(visibleWidth(idle)).toBe(80);

		// The overlay path passes no working state; undefined must read as idle.
		expect(renderComposerShapePreview("nightglide", 80).join("\n")).not.toContain("✦");
	});

	it("switches a working session to the accent rule with a static mark", async () => {
		await setTheme("dark");
		const working = nightglideComposerStyle.renderTop(ctx(true)) ?? "";
		// Stable accent stroke plus the static working mark; the mutable border
		// color stays out of the working treatment.
		expect(working).toContain(theme.fg("accent", "✦ "));
		expect(working).toContain(theme.fg("accent", "─"));
		expect(working).not.toContain(theme.fg("borderMuted", "─"));
		// Status chip still docks at the right edge and the rule stays full width.
		expect(working.endsWith(`CHIP${theme.fg("accent", "─")}`)).toBe(true);
		expect(visibleWidth(working)).toBe(80);
		expect(working).not.toBe(nightglideComposerStyle.renderTop(ctx(false)));
	});

	it("truncates an over-wide status chip in the working rule like the idle rule", async () => {
		await setTheme("dark");
		const narrow = ctx(true, 30);
		narrow.topBorder = { content: "X".repeat(60), width: 60 };
		const working = nightglideComposerStyle.renderTop(narrow) ?? "";
		expect(working).toContain(theme.fg("accent", "✦ "));
		// Chip budget: mark (2 cells) plus one trailing rule cell on a 30-wide rule.
		const chipBudget = 30 - visibleWidth("✦ ") - 1;
		expect(working.endsWith(`${truncateToWidth("X".repeat(60), chipBudget)}${theme.fg("accent", "─")}`)).toBe(true);
		expect(visibleWidth(working)).toBe(30);

		// Terminals too narrow for the mark drop the mark, not the rule.
		const tiny = ctx(true, 2);
		tiny.topBorder = { content: "CHIP", width: 4 };
		expect(nightglideComposerStyle.renderTop(tiny)).toBe(theme.fg("accent", "──"));
	});

	it("leaves the rule shape untouched by the working state", async () => {
		await setTheme("dark");
		const working = ruleComposerStyle.renderTop(ctx(true));
		expect(working).toBe(renderTopRule(ctx(true)));
		expect(working).not.toContain("✦");
		expect(working).toContain(theme.fg("borderMuted", "─"));
	});
});
