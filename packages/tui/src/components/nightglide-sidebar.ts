/**
 * Nightglide status sidebar — P2.1 (DEVELOPMENT_PLAN.md 2.1).
 *
 * Paint-only overlay component: no handleInput, so keys keep flowing to the
 * composer while the panel is open (overlay-focus.test.ts "paint-only"
 * semantic). The compositor freezes history commits while any overlay is
 * visible, so sidebar pixels can never enter native scrollback.
 *
 * Honesty contract (PRODUCT_DIRECTION): every value is read from real session
 * state via the injected accessors on each render — no fabricated model,
 * effort, agent, or progress. A missing model renders `no-model` (same literal
 * as the status line); an unknown/unresolvable thinking level renders no rung
 * glyph at all (effort-ladder "no mark rather than a guessed one").
 */
import { theme } from "../theme/theme";
import { effortLadderGlyph } from "../chat/effort-ladder";
import { truncateToWidth } from "../utils";
import type { ThemeColor } from "../theme/schema";
import type { Component } from "../tui";

export interface NightglideSidebarSubagent {
	/** Human label (registry label / agent role). */
	label: string;
	/** Real lifecycle status: active/completed/failed/aborted (registry). */
	status: string;
	/** Current tool the subagent is executing, if any (AgentProgress). */
	currentTool?: string;
}

export interface NightglideSidebarState {
	/** Display name of the selected model (undefined = none selected). */
	model: string | undefined;
	/** Effective thinking level (may be undefined = model cannot think). */
	thinkingLevel: string | undefined;
	/** True while an `auto` thinking selection has not resolved yet. */
	autoPending?: boolean;
	/** Live subagent entries (empty array = no activity). */
	subagents: NightglideSidebarSubagent[];
	/** Real in-flight main-session tool card count (pendingTools, entries
	 * removed at tool end). Undefined/omitted = row hidden. */
	activeTools?: number;
	/** Detailed mode: per-subagent current tool + token counts. */
	detailed?: boolean;
}

const STATUS_MARKS: Record<string, { glyph: string; token: ThemeColor }> = {
	active: { glyph: "●", token: "success" },
	running: { glyph: "●", token: "success" },
	completed: { glyph: "✓", token: "success" },
	failed: { glyph: "✗", token: "error" },
	aborted: { glyph: "—", token: "dim" },
	pending: { glyph: "·", token: "warning" },
};

function statusMark(status: string): { glyph: string; token: ThemeColor } {
	return (
		STATUS_MARKS[status] ?? { glyph: "·", token: "dim" } // unknown → dim dot, no invented state
	);
}

/** Paint-only sidebar overlay component. `render` rebuilds from the injected
 * state accessors every frame; the host invalidates nothing — renders are
 * event-driven, and every session event path already requests one. */
export class NightglideSidebar implements Component {
	#state: () => NightglideSidebarState;

	constructor(state: () => NightglideSidebarState) {
		this.#state = state;
	}

	render(width: number): readonly string[] {
		const w = Math.max(14, width);
		const inner = w - 2;
		const rows: string[] = [];
		const row = (s: string) => truncateToWidth(`${theme.fg("border", "│")}${s}`, w - 1);
		const push = (s: string) => rows.push(row(s));

		rows.push(truncateToWidth(theme.fg("borderAccent", `┌ Nightglide ${"─".repeat(Math.max(0, inner - 13))}┐`), w));
		const st = this.#state();

		// model
		push(theme.fg("muted", " 模型   ") + theme.fg("text", st.model ?? "no-model"));
		// thinking effort — rung only when a real level exists
		if (st.thinkingLevel) {
			const level = String(st.thinkingLevel); // runtime guard: never hand a non-string to theme.fg
			const glyph = effortLadderGlyph(level);
			push(theme.fg("muted", " 强度   ") + (glyph ? theme.fg("accent", glyph + " ") : "") + theme.fg("text", level));
		} else if (st.autoPending) {
			push(theme.fg("muted", " 强度   ") + theme.fg("dim", "auto（解析中）"));
		} else {
			push(theme.fg("muted", " 强度   ") + theme.fg("dim", "未知"));
		}
		// subagents
		push(theme.fg("muted", " 智能体 ") + (st.subagents.length === 0 ? theme.fg("dim", "无活动") : ""));
		for (const s of st.subagents) {
			const mark = statusMark(s.status);
			const head =
				theme.fg(mark.token, mark.glyph) + theme.fg("text", ` ${s.label}`) + theme.fg("dim", ` ${s.status}`);
			push(truncateToWidth(" " + head, inner)); // row() adds the border itself
			if (st.detailed && s.currentTool) {
				push(truncateToWidth(theme.fg("dim", "   ↳ " + s.currentTool), inner));
			}
		}
		// main-session in-flight tools (real count from pendingTools)
		if (typeof st.activeTools === "number" && st.activeTools > 0) {
			push(theme.fg("muted", " 工具   ") + theme.fg("text", `进行中 ${st.activeTools}`));
		}
		rows.push(truncateToWidth(theme.fg("borderAccent", `└${"─".repeat(Math.max(0, w - 2))}┘`), w));
		return rows;
	}
}
