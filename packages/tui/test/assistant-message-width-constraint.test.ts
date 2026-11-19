import { beforeAll, describe, expect, it } from "bun:test";
import type { AssistantMessage } from "@oh-my-pi/pi-ai";
import { AssistantMessageComponent } from "@oh-my-pi/pi-tui/chat/assistant-message";
import { initTheme } from "@oh-my-pi/pi-tui/theme";
import { visibleWidth } from "@oh-my-pi/pi-tui";

function assistantMessage(text: string): AssistantMessage {
	return {
		role: "assistant",
		content: [{ type: "text", text }],
		api: "anthropic-messages",
		provider: "anthropic",
		model: "claude-sonnet-4-5",
		usage: {
			input: 0,
			output: 0,
			cacheRead: 0,
			cacheWrite: 0,
			totalTokens: 0,
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
		},
		stopReason: "stop",
		timestamp: Date.now(),
	};
}

beforeAll(async () => {
	await initTheme(false);
});

describe("GATE-DIM-003 wide-screen prose width constraint", () => {
	it("constrains prose typesetting width to at most 90 columns on wide terminals", () => {
		// A 130-char sentence with no newlines
		const prose =
			"This is a long sentence of continuous assistant prose designed to test line wrapping under ultra-wide viewport terminal settings.";
		expect(prose.length).toBeGreaterThan(90);

		const component = new AssistantMessageComponent(assistantMessage(prose));

		// On a 140-column ultra-wide terminal, prose must not stretch across 140 columns.
		// It must be constrained to Math.min(140, 90) = 90 columns.
		const rows140 = component.render(140).map(row => Bun.stripANSI(row));
		expect(rows140.length).toBeGreaterThan(1);
		for (const row of rows140) {
			expect(visibleWidth(row)).toBeLessThanOrEqual(90);
		}

		// On a 160-column terminal, it should also be constrained to <= 90 columns.
		component.invalidate();
		const rows160 = component.render(160).map(row => Bun.stripANSI(row));
		expect(rows160.length).toBeGreaterThan(1);
		for (const row of rows160) {
			expect(visibleWidth(row)).toBeLessThanOrEqual(90);
		}
	});

	it("preserves normal wrapping when terminal width <= 90 columns", () => {
		const prose = "This is a paragraph that wraps at seventy columns when the screen width is eighty columns wide.";
		const component = new AssistantMessageComponent(assistantMessage(prose));

		const rows80 = component.render(80).map(row => Bun.stripANSI(row));
		for (const row of rows80) {
			expect(visibleWidth(row)).toBeLessThanOrEqual(80);
		}

		component.invalidate();
		const rows60 = component.render(60).map(row => Bun.stripANSI(row));
		for (const row of rows60) {
			expect(visibleWidth(row)).toBeLessThanOrEqual(60);
		}
	});

	it("publishes stable scrollback rows conforming to the 90-column constraint", () => {
		const full =
			"The first paragraph of a streaming turn is long enough to wrap onto several lines in wide viewports. ".repeat(
				2,
			) + "\n\nThe second paragraph continues streaming here.";

		const component = new AssistantMessageComponent();
		component.updateContent(assistantMessage(`${full.slice(0, 80)}\n\nSecond`), { transient: true });
		component.render(140);
		component.updateContent(assistantMessage(full), { transient: true });
		component.render(140);

		const stableCount = component.getTranscriptStableRows().length;
		expect(stableCount).toBeGreaterThan(0);
		const stableRows = component.renderTranscriptStableRows(stableCount, 140).map(row => Bun.stripANSI(row));
		for (const row of stableRows) {
			expect(visibleWidth(row)).toBeLessThanOrEqual(90);
		}
	});

	it("keeps table layouts within the 90-column constraint on wide screens without horizontal overflow", () => {
		const tableMd =
			"| Feature | Status | Description |\n" +
			"| :--- | :--- | :--- |\n" +
			"| GATE-DIM-003 | Enabled | Constrains wide screen assistant prose typesetting column width to 90 columns. |\n" +
			"| Viewport 80x24 | Compact | Single line header fold for constrained vertical viewports. |";

		const component = new AssistantMessageComponent(assistantMessage(tableMd));
		const rows140 = component.render(140).map(row => Bun.stripANSI(row));
		expect(rows140.length).toBeGreaterThan(0);
		for (const row of rows140) {
			expect(visibleWidth(row)).toBeLessThanOrEqual(90);
		}
	});
});
