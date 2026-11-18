/**
 * Effort Glow Ladder — the shared visual rung for reasoning effort.
 *
 * Every rung of the thinking ladder gets one glyph, colored by that rung's
 * theme slot (`thinkingMinimal` … `thinkingXhigh`), so the level reads at a
 * glance without words: `·` minimal, `◦` low, `○` medium, `◎` high, `✦` xhigh
 * (the ornamental top rung). `off` shows nothing — an absent mark is the mark
 * of no reasoning — and `max` folds onto the `xhigh` rung (themes style them
 * alike; see `thinkingLevelToken`). Low rungs render dim rather than in their
 * slot color: quiet levels stay quiet, glow is reserved for focus.
 *
 * Consumers: the thinking pulse and its collapse head
 * (`chat/assistant-message.ts`), the Task tool's subagent cards
 * (`tools/task.ts`), and the status line's model segment
 * (`status-line/segments.ts`). All read the same pure mappings so the ladder
 * cannot drift between surfaces.
 *
 * The ambient level ({@link setActiveThinkingEffort}) follows the process-wide
 * display-preferences pattern (`chat/display-preferences.ts`): the host pushes
 * the viewed session's resolved effort, components read it synchronously at
 * render time. The status line's model segment publishes it from real session
 * state every frame (see `segments.ts`), which is what keeps the transcript's
 * thinking pulse in lockstep with the level the user set — no new plumbing, no
 * timer of its own. Unknown/never-published levels simply keep the historical
 * baseline (full frame set, `thinkingText` color) instead of guessing.
 */

import type { ThemeColor } from "../theme/schema";

/** The ladder rungs, least to most ornate. `max` shares the `xhigh` rung. */
export type EffortRung = "minimal" | "low" | "medium" | "high" | "xhigh";

/** One glyph per rung; every glyph is single-column (Zero Jitter). */
const RUNG_GLYPHS: Record<EffortRung, string> = {
	minimal: "·",
	low: "◦",
	medium: "○",
	high: "◎",
	xhigh: "✦",
} as const;

/** Theme slot of each rung. */
const RUNG_TOKENS: Record<EffortRung, ThemeColor> = {
	minimal: "thinkingMinimal",
	low: "thinkingLow",
	medium: "thinkingMedium",
	high: "thinkingHigh",
	xhigh: "thinkingXhigh",
} as const;

/**
 * Reduce a configured thinking level to its ladder rung. `max` rides the
 * `xhigh` rung; `off`, `inherit`, `auto` (until it resolves), and anything
 * unknown return undefined — no rung, no mark, no fabrication.
 */
function effortRung(level: string | undefined | null): EffortRung | undefined {
	switch (level) {
		case "minimal":
			return "minimal";
		case "low":
			return "low";
		case "medium":
			return "medium";
		case "high":
			return "high";
		case "xhigh":
		case "max":
			return "xhigh";
		default:
			return undefined;
	}
}

/** The rung's ladder glyph (`·◦○◎✦`), or "" when the level shows no rung. */
export function effortLadderGlyph(level: string | undefined | null): string {
	const rung = effortRung(level);
	return rung ? RUNG_GLYPHS[rung] : "";
}

/** The rung's theme slot (`thinkingLow` …); undefined when the level shows no rung. */
export function effortLadderToken(level: string | undefined | null): ThemeColor | undefined {
	const rung = effortRung(level);
	return rung ? RUNG_TOKENS[rung] : undefined;
}

/**
 * The bare word of a theme thinking display, reusing the symbol preset's own
 * vocabulary ("◒ high" → `high`, "◑ med" → `med`, "[med]" → the fallback) so
 * ladder badges never invent a second set of level words. Themes that render
 * no glyph+word pair (ascii bracket forms) fall back to the raw level.
 */
export function themeThinkingWord(themeDisplay: string, fallback: string): string {
	const space = themeDisplay.indexOf(" ");
	return space === -1 ? fallback : themeDisplay.slice(space + 1);
}

/**
 * Token a ladder *badge* paints with: medium and up carry their slot color,
 * while minimal/low render dim — low rungs stay quiet (the glyph dims with
 * the rest of the head instead of glowing). Undefined when there is no rung.
 */
export function effortLadderBadgeToken(level: string | undefined | null): ThemeColor | undefined {
	const rung = effortRung(level);
	if (!rung) return undefined;
	return rung === "minimal" || rung === "low" ? "dim" : RUNG_TOKENS[rung];
}

/**
 * Pulse frames per rung, all single-column (Zero Jitter — callers render the
 * indicator in place, so unequal widths would jitter the line). The ladder
 * escalates from quiet dots to the full starburst:
 *
 * - minimal: two faint dots, barely breathing
 * - low: three quiet dots, the ladder's own glyph family
 * - medium: a three-frame subsequence (stride 3) of the full revolution
 * - high/xhigh: the complete starburst ✻✼❉❊✺✹✸✶
 * - unknown/off: the full starburst — the historical baseline, kept byte-identical
 */
const PULSE_FRAMES_FULL = ["✻", "✼", "❉", "❊", "✺", "✹", "✸", "✶"] as const;
const PULSE_FRAMES_MEDIUM = ["✻", "❊", "✸"] as const;
const PULSE_FRAMES_LOW = ["·", "◦", "•"] as const;
const PULSE_FRAMES_MINIMAL = ["·", "•"] as const;

export function effortPulseFrames(level: string | undefined | null): readonly string[] {
	const rung = effortRung(level);
	switch (rung) {
		case "minimal":
			return PULSE_FRAMES_MINIMAL;
		case "low":
			return PULSE_FRAMES_LOW;
		case "medium":
			return PULSE_FRAMES_MEDIUM;
		default:
			return PULSE_FRAMES_FULL;
	}
}

/**
 * Theme token of pulse frame `frameIndex` for the given level. `xhigh` (and
 * `max`) alternate their frame color between `thinkingXhigh` and `accent` —
 * one swap per frame of the cycle, not per tick, so the hue change is part of
 * the frame sequence itself. Unknown levels return `thinkingText`, the
 * historical pulse color.
 */
export function effortPulseFrameToken(level: string | undefined | null, frameIndex: number): ThemeColor {
	const rung = effortRung(level);
	if (!rung) return "thinkingText";
	if (rung === "xhigh") return frameIndex % 2 === 0 ? "thinkingXhigh" : "accent";
	return RUNG_TOKENS[rung];
}

// ═══════════════════════════════════════════════════════════════════════════
// Ambient effort: the viewed session's resolved level, published per frame.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * The level the host's status line last observed on the viewed session, as the
 * raw configured token (`"high"`, `"off"`, `"auto"`, …). Undefined before the
 * first publication or when the session has no model.
 */
let ambientEffort: string | undefined;

/**
 * Publish the viewed session's thinking level. Idempotent and cheap: the
 * status line calls this every frame from its model segment, so the
 * transcript's pulse and collapse heads track the live level with no timer of
 * their own. Preview/test fixtures (which carry a deterministic `now`) must
 * not publish — callers gate on that.
 */
export function setActiveThinkingEffort(level: string | undefined): void {
	ambientEffort = level;
}

/** The published ambient level, or undefined when nothing was published yet. */
export function activeThinkingEffort(): string | undefined {
	return ambientEffort;
}

/** Clear the ambient level so tests start from the unpublished baseline. */
export function resetActiveThinkingEffortForTests(): void {
	ambientEffort = undefined;
}
