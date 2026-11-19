import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "bun:test";
import type { AssistantMessage } from "@oh-my-pi/pi-ai";
import { AssistantMessageComponent } from "../src/chat/assistant-message";
import {
	effortPulseFrames,
	resetActiveThinkingEffortForTests,
	setActiveThinkingEffort,
} from "../src/chat/effort-ladder";
import { DEFAULT_SPINNER_INTERVAL_MS, setSpinnerInterval, SPINNER_INTERVAL_STATIC } from "../src/spinner-clock";
import { initTheme, theme } from "../src/theme";

const RENDER_WIDTH = 80;

function streamingThinking(output = 0): AssistantMessage {
	return {
		role: "assistant",
		content: [{ type: "thinking", thinking: "private reasoning" }],
		api: "anthropic-messages",
		provider: "anthropic",
		model: "claude-sonnet-4-5",
		usage: {
			input: 0,
			output,
			cacheRead: 0,
			cacheWrite: 0,
			totalTokens: output,
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
		},
		stopReason: "stop",
		timestamp: Date.now(),
	};
}

/**
 * Render the hidden-thinking pulse with spinners static: the pulse holds frame
 * 0 of the active ladder frame set, so the label bytes are deterministic and no
 * timer is scheduled (`--motion none` presents the static form immediately).
 */
function pulseLine(level: string | undefined): string {
	setActiveThinkingEffort(level);
	const component = new AssistantMessageComponent(undefined, true);
	try {
		component.updateContent(streamingThinking());
		const rows = component.render(RENDER_WIDTH).join("\n").split("\n");
		const line = rows.find(row => Bun.stripANSI(row).includes("Thinking"));
		expect(line).toBeDefined();
		return line!.trim();
	} finally {
		component.dispose();
	}
}

beforeAll(async () => {
	await initTheme();
});

/** Restore the process-wide theme and clock so later suites see defaults. */
afterAll(() => {
	setSpinnerInterval(DEFAULT_SPINNER_INTERVAL_MS);
});

beforeEach(() => {
	vi.useFakeTimers({ now: 0 });
	setSpinnerInterval(SPINNER_INTERVAL_STATIC);
});

afterEach(() => {
	resetActiveThinkingEffortForTests();
	setSpinnerInterval(DEFAULT_SPINNER_INTERVAL_MS);
	vi.useRealTimers();
});

describe("thinking pulse effort ladder", () => {
	it("keeps the historical baseline when no effort is published", () => {
		const line = pulseLine(undefined);
		expect(Bun.stripANSI(line)).toContain("✻ Thinking");
		// No rung badge: no ladder mark is invented for an unknown level.
		expect(Bun.stripANSI(line)).not.toContain("minimal");
		expect(line).toContain(theme.fg("thinkingText", "✻"));
	});

	it("keeps the historical baseline when thinking is off", () => {
		const line = pulseLine("off");
		expect(Bun.stripANSI(line)).toContain("✻ Thinking");
		expect(Bun.stripANSI(line)).not.toContain("off");
	});

	it("quietens the pulse on the minimal rung: quiet frames, dim badge", () => {
		const line = pulseLine("minimal");
		const frames = effortPulseFrames("minimal");
		expect(line).toContain(theme.fg("thinkingMinimal", frames[0]!));
		expect(line).toContain(theme.fg("dim", " · "));
		// The badge word reuses the symbol preset's own vocabulary ("○ min").
		expect(line).toContain(theme.fg("dim", "· min"));
	});

	it("quietens the pulse on the low rung", () => {
		const line = pulseLine("low");
		expect(line).toContain(theme.fg("thinkingLow", "·"));
		expect(line).toContain(theme.fg("dim", "◦ low"));
	});

	it("paints the medium rung with its slot and a starburst subset", () => {
		const line = pulseLine("medium");
		expect(line).toContain(theme.fg("thinkingMedium", "✻"));
		expect(line).toContain(theme.fg("thinkingMedium", "○ med"));
	});

	it("paints the high rung with the full starburst", () => {
		const line = pulseLine("high");
		expect(line).toContain(theme.fg("thinkingHigh", "✻"));
		expect(line).toContain(theme.fg("thinkingHigh", "◎ high"));
	});

	it("opens the xhigh rung on the alternating frame color and the ornamental glyph", () => {
		const line = pulseLine("xhigh");
		// Frame 0 is even: thinkingXhigh; the accent swap hits odd frames.
		expect(line).toContain(theme.fg("thinkingXhigh", "✻"));
		expect(line).toContain(theme.fg("thinkingXhigh", "✦ xhigh"));
	});

	it("folds max onto the xhigh rung", () => {
		const line = pulseLine("max");
		expect(line).toContain(theme.fg("thinkingXhigh", "✦ max"));
	});

	it("keeps the pulse on one row for every rung (Zero Jitter in place)", () => {
		for (const level of [undefined, "minimal", "low", "medium", "high", "xhigh"]) {
			const plain = Bun.stripANSI(pulseLine(level));
			expect(plain).not.toContain("\n");
			expect(plain).toContain("Thinking");
		}
	});
});
