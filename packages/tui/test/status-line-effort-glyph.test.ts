import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { ThinkingLevel } from "@oh-my-pi/pi-agent-core";
import type { SegmentContext } from "../src/status-line/segments";
import { describeSegment, renderSegment, thinkingLevelWord } from "../src/status-line/segments";
import {
	activeThinkingEffort,
	resetActiveThinkingEffortForTests,
	themeThinkingWord,
} from "../src/chat/effort-ladder";
import { getThemeByName, initTheme, setThemeInstance, theme } from "../src/theme";

beforeAll(async () => {
	await initTheme();
});

/** Restore the process-wide theme and clear the ambient effort slot. */
afterAll(async () => {
	resetActiveThinkingEffortForTests();
	const dark = await getThemeByName("dark");
	if (dark) setThemeInstance(dark);
});

/** The symbol preset's own word for a level ("◒ high" → `high`, "◑ med" → `med`). */
function levelWord(level: string): string {
	return themeThinkingWord(theme.thinking[level as keyof typeof theme.thinking] ?? level, level);
}

function createContext(level: ThinkingLevel | undefined, auto?: { resolved?: string }): SegmentContext {
	return {
		session: {
			state: {
				model: { id: "test-model", name: "Test Model", thinking: true },
				thinkingLevel: level,
			},
			isFastModeActive: () => false,
			isAutoThinking: auto !== undefined,
			autoResolvedThinkingLevel: () => auto?.resolved,
			isAdvisorActive: () => false,
			getAdvisorStatusOverview: () => ({ configured: false, advisors: [] }),
		} as unknown as SegmentContext["session"],
		width: 120,
		compactThinkingLevel: false,
		options: {},
		planMode: null,
		loopMode: null,
		prewalk: null,
		goalMode: null,
		vibeMode: null,
		vim: null,
		collab: null,
		stream: null,
		recording: false,
		usageStats: {
			input: 0,
			output: 0,
			cacheRead: 0,
			cacheWrite: 0,
			totalTokens: 0,
			orchestrationInput: 0,
			orchestrationOutput: 0,
			orchestrationCacheRead: 0,
			premiumRequests: 0,
			cost: 0,
			tokensPerSecond: null,
		},
		contextPercent: 0,
		contextTokens: 0,
		contextWindow: 0,
		autoCompactEnabled: false,
		compactionSpeculation: "idle",
		speculationBlinkOn: true,
		subagentCount: 0,
		activeMs: 0,
		turnElapsedMs: null,
		activeRepo: null,
		worktree: null,
		git: { branch: null, status: null, pr: null },
		usage: null,
	};
}

/** Every rung and its ladder glyph, least to most ornate. */
const RUNGS: Array<[ThinkingLevel, string]> = [
	[ThinkingLevel.Minimal, "·"],
	[ThinkingLevel.Low, "◦"],
	[ThinkingLevel.Medium, "○"],
	[ThinkingLevel.High, "◎"],
	[ThinkingLevel.XHigh, "✦"],
];

describe("status line model segment effort glyph", () => {
	it("renders the rung glyph in its slot color beside the dim level word", () => {
		const rendered = renderSegment("model", createContext(ThinkingLevel.High));
		const plain = Bun.stripANSI(rendered.content);
		expect(plain).toContain(`◎ ${levelWord("high")}`);
		expect(rendered.content).toContain(theme.fg("thinkingHigh", "◎"));
	});

	it("marks each rung with its own glyph", () => {
		for (const [level, glyph] of RUNGS) {
			const plain = Bun.stripANSI(renderSegment("model", createContext(level)).content);
			expect(plain, `level ${level}`).toContain(`${glyph} ${levelWord(level)}`);
		}
	});

	it("folds max onto the xhigh glyph while naming the level", () => {
		const plain = Bun.stripANSI(renderSegment("model", createContext(ThinkingLevel.Max)).content);
		expect(plain).toContain(`✦ ${levelWord("max")}`);
	});

	it("keeps the disabled off display without a rung glyph", () => {
		const plain = Bun.stripANSI(renderSegment("model", createContext(ThinkingLevel.Off)).content);
		expect(plain).toContain(`${theme.status.disabled} off`);
		// No rung badge: none of the ladder's glyph+word pairs appear.
		for (const [level, glyph] of RUNGS) {
			expect(plain, `glyph ${glyph}`).not.toContain(`${glyph} ${levelWord(level)}`);
		}
	});

	it("shows the rung glyph for a resolved auto level and stays quiet while pending", () => {
		const resolved = Bun.stripANSI(renderSegment("model", createContext(undefined, { resolved: "medium" })).content);
		expect(resolved).toContain(`○ ${levelWord("medium")}`);
		const pending = Bun.stripANSI(renderSegment("model", createContext(undefined, {})).content);
		expect(pending).toContain("auto");
		expect(pending).not.toContain("○");
	});

	it("publishes the viewed session's effort for the transcript's ladder (production context)", () => {
		resetActiveThinkingEffortForTests();
		renderSegment("model", createContext(ThinkingLevel.XHigh));
		expect(activeThinkingEffort()).toBe("xhigh");
	});

	it("does not publish from preview fixtures (deterministic now)", () => {
		resetActiveThinkingEffortForTests();
		const ctx = createContext(ThinkingLevel.High);
		ctx.now = new Date(0);
		renderSegment("model", ctx);
		expect(activeThinkingEffort()).toBeUndefined();
	});

	it("publishes off and clears when the model cannot think", () => {
		renderSegment("model", createContext(ThinkingLevel.Off));
		expect(activeThinkingEffort()).toBe("off");
		const noThinking = createContext(ThinkingLevel.High);
		(noThinking.session.state as { model?: { id: string; name: string; thinking?: boolean } }).model = { id: "m", name: "M" };
		renderSegment("model", noThinking);
		expect(activeThinkingEffort()).toBeUndefined();
	});

	it("exposes the same level word the describe path shows", () => {
		expect(thinkingLevelWord(createContext(ThinkingLevel.High).session)).toBe("high");
		expect(thinkingLevelWord(createContext(ThinkingLevel.Off).session)).toBe("off");
		// No model thinking capability: no word at all, nothing to publish.
		const noThinking = createContext(ThinkingLevel.High);
		(noThinking.session.state as { model?: { id: string; name: string; thinking?: boolean } }).model = { id: "m", name: "M" };
		expect(thinkingLevelWord(noThinking.session)).toBeUndefined();
	});
});

describe("status line model segment native describe", () => {
	it("sends the rung glyph in its slot color and the word dim as spans", () => {
		const view = describeSegment("model", createContext(ThinkingLevel.High));
		expect(view).not.toBeNull();
		const texts = view!.spans.map(s => s.t).join("|");
		expect(texts).toContain("◎");
		expect(texts).toContain(` ${levelWord("high")}`);
		const glyphSpan = view!.spans.find(s => s.t === "◎");
		expect(glyphSpan?.s).toBe("thinkingHigh");
		const wordSpan = view!.spans.find(s => s.t === ` ${levelWord("high")}`);
		expect(wordSpan?.s).toBe("dim");
	});

	it("keeps the off level all-dim without a glyph span", () => {
		const view = describeSegment("model", createContext(ThinkingLevel.Off));
		expect(view).not.toBeNull();
		// The off word travels dim; no rung glyph span exists.
		const offSpan = view!.spans.find(s => s.t === "off");
		expect(offSpan?.s).toBe("dim");
		for (const glyph of ["·", "◦", "○", "◎", "✦"]) {
			expect(view!.spans.some(s => s.t === glyph), `glyph ${glyph}`).toBe(false);
		}
	});
});
