import { beforeAll, describe, expect, it } from "bun:test";
import { ErrorBannerComponent } from "../src/overlays/error-banner";
import type { NativeUiEvent } from "../src/native/node";
import { initTheme, theme } from "../src/theme/theme";

beforeAll(async () => {
	await initTheme(false);
});

function action(act: string): NativeUiEvent {
	return { type: "action", key: "", act, mods: [] };
}

function findRow(rows: readonly string[], needle: string): string | undefined {
	return rows.find(row => Bun.stripANSI(row).includes(needle));
}

const SAMPLE = "Output blocked by content filtering policy";

describe("ErrorBannerComponent title hierarchy", () => {
	it("renders a bold error-colored title layer above the body", () => {
		const banner = new ErrorBannerComponent(SAMPLE);
		const rows = banner.render(100);

		const titleRow = findRow(rows, "错误");
		expect(titleRow).toBeDefined();
		// The title is its own layer: verdict glyph from the theme's `status.error`
		// symbol slot + localized label, bold error — the output-block error-header
		// language ("title carries the verdict").
		expect(Bun.stripANSI(titleRow!).trim()).toBe(`${theme.status.error} 错误`);
		expect(titleRow).toContain(theme.bold(theme.fg("error", `${theme.status.error} 错误`)));
	});

	it("keeps the body in plain error color with no bold and verbatim message text", () => {
		const banner = new ErrorBannerComponent(SAMPLE);
		const rows = banner.render(100);

		const bodyRow = findRow(rows, SAMPLE);
		expect(bodyRow).toBeDefined();
		expect(bodyRow).toContain(theme.fg("error", SAMPLE));
		// Bold belongs to the title layer only; body rows stay uniform.
		expect(bodyRow).not.toContain("\x1b[1m");
	});

	it("renders the localized dismiss hint as a dim meta layer", () => {
		const banner = new ErrorBannerComponent(SAMPLE);
		const rows = banner.render(100);
		const rendered = Bun.stripANSI(rows.join("\n"));

		const metaRow = findRow(rows, "发送下一条消息后自动消失");
		expect(metaRow).toBeDefined();
		expect(metaRow).toContain(theme.fg("dim", "发送下一条消息后自动消失 [Esc 关闭 · Ctrl+O 详情]"));
		expect(Bun.stripANSI(metaRow!).trim()).toBe("发送下一条消息后自动消失 [Esc 关闭 · Ctrl+O 详情]");
		expect(metaRow).not.toContain("\x1b[1m");
		// The hardcoded English hint is gone; body copy is untouched.
		expect(rendered).toContain(SAMPLE);
		expect(rendered).not.toContain("Dismissed when you send your next message.");
	});

	it("layers the banner in output-block order: title, body, dim meta, inside error borders", () => {
		const banner = new ErrorBannerComponent(SAMPLE);
		const rows = banner.render(80);
		const plain = Bun.stripANSI(rows.join("\n")).split("\n");

		const titleIndex = plain.findIndex(line => line.includes("错误"));
		const bodyIndex = plain.findIndex(line => line.includes(SAMPLE));
		const metaIndex = plain.findIndex(line => line.includes("发送下一条消息后自动消失"));
		expect(titleIndex).toBeGreaterThan(-1);
		expect(bodyIndex).toBeGreaterThan(titleIndex);
		expect(metaIndex).toBeGreaterThan(bodyIndex);
	});
});

describe("ErrorBannerComponent frame", () => {
	it("keeps two static border rules styled from the error slot", () => {
		const banner = new ErrorBannerComponent(SAMPLE);
		const rows = banner.render(80);
		// DynamicBorder without a label draws a plain horizontal rule (no corners).
		const borders = rows.filter(row => /^[─]+$/.test(Bun.stripANSI(row).trim()));
		expect(borders.length).toBe(2);
		for (const border of borders) {
			// Border color comes from the theme's `error` slot — no hardcoded ANSI,
			// no borderAccent swap (that slot belongs to live/working frames).
			expect(border).toContain(theme.fg("error", Bun.stripANSI(border).trim()));
		}
	});

	it("caps the body at MAX_BANNER_ROWS with the expand hint and stays within the width", () => {
		const huge = Array.from({ length: 50 }, (_, i) => `error detail line ${i}`).join("\n");
		const banner = new ErrorBannerComponent(huge);
		const rows = banner.render(120);
		const rendered = Bun.stripANSI(rows.join("\n"));

		const detailRows = rendered.split("\n").filter(line => line.includes("error detail line"));
		expect(detailRows.length).toBe(4);
		expect(rendered).toMatch(/\+46 more lines \(.+ to expand\)/);
		for (const row of rows) expect(Bun.stringWidth(row)).toBeLessThanOrEqual(120);
	});

	it("wraps a long single-line error across rows instead of cutting it", () => {
		const body = `400 ${JSON.stringify({
			error: {
				message: "The requested model is not supported.",
				code: "model_not_supported",
				param: "model",
				type: "invalid_request_error",
			},
		})}`;
		const banner = new ErrorBannerComponent(body);
		const rendered = Bun.stripANSI(banner.render(60).join("\n"));
		expect(rendered.replace(/\n\s*/g, "")).toContain('"type":"invalid_request_error"}}');
		expect(rendered).not.toContain("more line");
	});
});

describe("ErrorBannerComponent dismiss behavior (zero-change lock)", () => {
	it("fires onDismiss exactly once on the native dismiss action", () => {
		let calls = 0;
		const banner = new ErrorBannerComponent(SAMPLE, () => {
			calls++;
		});
		banner.handleNativeEvent(action("dismiss"));
		expect(calls).toBe(1);
		// Repeat dispatches still call the callback (same contract as before).
		banner.handleNativeEvent(action("dismiss"));
		expect(calls).toBe(2);
	});

	it("ignores other actions and non-action events without dismissing", () => {
		let calls = 0;
		const banner = new ErrorBannerComponent("a\nb", () => {
			calls++;
		});
		banner.handleNativeEvent({ type: "action", key: "", act: "details", mods: [] });
		banner.handleNativeEvent({ type: "activate", key: "", item: "x", mods: [] } as NativeUiEvent);
		banner.handleNativeEvent(action("unknown"));
		expect(calls).toBe(0);
		// Details toggling stays internal to the native description.
		banner.handleNativeEvent(action("details"));
		expect(calls).toBe(0);
	});

	it("does not crash when dismissing without a callback", () => {
		const banner = new ErrorBannerComponent(SAMPLE);
		expect(() => banner.handleNativeEvent(action("dismiss"))).not.toThrow();
	});

	it("offers no dismiss affordance in the ANSI render", () => {
		const banner = new ErrorBannerComponent(SAMPLE, () => {});
		const rendered = Bun.stripANSI(banner.render(80).join("\n"));
		expect(rendered).not.toMatch(/Dismiss|取消/);
	});

	it("keeps the native description contract: error-tone row, Dismiss only when wired", () => {
		const plain = new ErrorBannerComponent(SAMPLE);
		const described = plain.describe();
		expect(described.k).toBe("row");
		expect(described.p?.role).toBe("omp.errorBanner");
		expect(described.p?.tone).toBe("error");
		expect(JSON.stringify(described)).not.toContain("Dismiss");

		const wired = new ErrorBannerComponent(SAMPLE, () => {});
		expect(JSON.stringify(wired.describe())).toContain("Dismiss");
	});
});

describe("ErrorBannerComponent ANSI keyboard shortcuts and details expansion", () => {
	it("dismisses on Esc key via handleInput", () => {
		let dismissed = false;
		const banner = new ErrorBannerComponent(SAMPLE, () => {
			dismissed = true;
		});

		const consumed = banner.handleInput("\x1b");
		expect(consumed).toBe(true);
		expect(dismissed).toBe(true);
	});

	it("dismisses on explicit dismiss() call", () => {
		let dismissed = false;
		const banner = new ErrorBannerComponent(SAMPLE, () => {
			dismissed = true;
		});

		banner.dismiss();
		expect(dismissed).toBe(true);
	});

	it("toggles details on Ctrl+O via handleInput", () => {
		const huge = Array.from({ length: 10 }, (_, i) => `error line ${i}`).join("\n");
		const banner = new ErrorBannerComponent(huge);

		// Initially collapsed (max 4 rows + expand hint)
		expect(banner.isExpanded).toBe(false);
		let rendered = Bun.stripANSI(banner.render(120).join("\n"));
		expect(rendered).toMatch(/\+6 more lines/);

		// Toggle via Ctrl+O (\x0f)
		const consumed = banner.handleInput("\x0f");
		expect(consumed).toBe(true);
		expect(banner.isExpanded).toBe(true);

		// Expanded shows all lines
		rendered = Bun.stripANSI(banner.render(120).join("\n"));
		expect(rendered).not.toContain("more line");
		for (let i = 0; i < 10; i++) {
			expect(rendered).toContain(`error line ${i}`);
		}

		// Toggle back
		const consumedAgain = banner.handleInput("\x0f");
		expect(consumedAgain).toBe(true);
		expect(banner.isExpanded).toBe(false);
		rendered = Bun.stripANSI(banner.render(120).join("\n"));
		expect(rendered).toMatch(/\+6 more lines/);
	});

	it("toggles details via explicit toggleDetails() method", () => {
		const banner = new ErrorBannerComponent(SAMPLE);
		expect(banner.isExpanded).toBe(false);
		banner.toggleDetails();
		expect(banner.isExpanded).toBe(true);
		banner.toggleDetails();
		expect(banner.isExpanded).toBe(false);
	});

	it("ignores unrelated keystrokes and returns false without dismissing", () => {
		let dismissed = false;
		const banner = new ErrorBannerComponent(SAMPLE, () => {
			dismissed = true;
		});

		expect(banner.handleInput("a")).toBe(false);
		expect(banner.handleInput("\n")).toBe(false);
		expect(banner.handleInput("\x03")).toBe(false); // Ctrl+C
		expect(dismissed).toBe(false);
		expect(banner.isExpanded).toBe(false);
	});
});
