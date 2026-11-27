/**
 * Nightglide Glide shell — fullscreen window layout (spike).
 *
 * Installed through `TUI.setScreenProvider`, it paints the whole alternate
 * screen: top scene band (from the window edge; no header row), a framed conversation panel next to
 * an information column, a framed composer card, the status line and a bottom
 * scene band. Every cell carries the theme family's page background so the
 * look no longer depends on the user's terminal colors.
 *
 * Colors go through the theme's color mode (truecolor or 256), so terminals
 * without 24-bit color render the intended palette instead of garbage.
 *
 * Content is never re-implemented here: the conversation is the real
 * `TranscriptContainer` (rendered with `renderTail`), the composer card hosts
 * the real editor / HUD components, and the information column reads live
 * session state through an injected accessor (no fabricated values).
 */
import { formatDuration, formatNumber } from "@oh-my-pi/pi-utils";
import { effortLadderGlyph, effortLadderToken, effortRung } from "../chat/effort-ladder";
import { t } from "../i18n";
import { formatKeyHints } from "../key-hint-format";
import { getKeybindings } from "../keybindings";
import type { AnimationFrame, TranscriptContainer } from "../chrome/transcript-container";
import { motionEffectsEnabled, onMotionEffectsChange } from "../motion-effects";
import { bgAnsi, fgAnsi } from "../theme/color";
import { getCurrentThemeName, theme } from "../theme/theme";
import type { Component, OverlayFocusOwner } from "../tui";
import { truncateToWidth, visibleWidth } from "../utils";
import { type PixelEncoder, renderPixelScene, type SceneKind } from "./nightglide-pixel-scene";
import { type Family, familyFor } from "./nightglide-theme-families";

export { type Family, familyFor };
import {
	deriveRobotState,
	renderNightglideRobot,
	renderNightglideRobotCompact,
	ROBOT_ROWS,
	ROBOT_WIDTH,
	type RobotState,
	type RobotStyleSetting,
} from "./nightglide-robot";

/** A subagent row in the information column, read from the live registry. */
export interface NightglideShellSubagent {
	label: string;
	/** Registry status as reported (active, running, completed, failed, …). */
	status: string;
	/** The tool the agent is running right now, when known. */
	currentTool?: string;
	/** Agent template/role name when available. */
	agent?: string;
	/** Elapsed duration in milliseconds when reported by progress. */
	elapsedMs?: number;
	/** Number of tool calls completed/started when reported. */
	toolCount?: number;
	/** Cumulative token count when reported. */
	tokens?: number;
}

/** Live session facts the information column shows; nothing here is invented. */
export interface NightglideShellState {
	model: string | undefined;
	/** Provider of the selected model. */
	provider?: string;
	/** The model a retry fallback is actually serving, when it is not the selected one. */
	fallback?: string;
	/** False when the selected model has no thinking control. */
	thinkingSupported?: boolean;
	/** Fast mode is active for this session. */
	fast?: boolean;
	/** Worst advisor status, when advisors are configured. */
	advisor?: "running" | "quota" | "error" | "paused";
	/** Provider service notice that must stay visible (e.g. a usage-limit stage). */
	notice?: string;
	/** Effective thinking level; undefined when it is not known. */
	thinkingLevel: string | undefined;
	/** Auto effort that resolves on the next turn. */
	autoPending?: boolean;
	/** Applied Nightglide routing mode for this session, when available. */
	routingMode?: "manual" | "local" | "balanced" | "performance";
	/** Explicit non-local default selector retained under `local` routing. */
	routingNonLocalDefault?: string;
	/** Abbreviated workspace path (shown inside the collapsible sidebar). */
	cwd?: string;
	/** Current session context token count (shown cleanly when window is known). */
	contextTokens?: number;
	/** Active model context window size; omitted/zero renders `—` cleanly instead of `/?`. */
	contextWindow?: number;
	/** Current context usage percentage when available. */
	contextPercent?: number | null;
	/** Selected pixel companion avatar style (`auto` matches the theme family). */
	robotStyle?: RobotStyleSetting;
	subagents: NightglideShellSubagent[];
	/** Main-session tools currently executing. */
	activeTools?: number;
	/** True while the main session is streaming a response. */
	streaming: boolean;
	/** True when the latest turn finished cleanly and the session is idle. */
	turnDone?: boolean;
	/** Explicit robot state override (primarily for deterministic testing). */
	robotState?: RobotState;
}

export interface NightglideShellDeps {
	transcript: TranscriptContainer;
	/** Editor-anchored roots shown inside the composer card, in order. */
	dock: () => readonly Component[];
	/** Session status line, drawn under the composer card. */
	status: () => Component | undefined;
	/** Live session facts for the information column. */
	state: () => NightglideShellState;
	/** Told whenever the information column appears or disappears (collapsed or narrow). */
	sidebarShown?: (shown: boolean) => void;
	/** Triggered when the user clicks the task summary pill in the sidebar. */
	onSummary?: () => void;
	/** Render monochrome without ANSI color codes (test seam); defaults to `NO_COLOR`. */
	plain?: boolean;
	/** Components (the editor) whose hardware cursor this shell owns. */
	focusTargets: () => readonly Component[];
	rows: () => number;
	requestRender: () => void;
}

const SGR = /\x1b\[([0-9;:]*)m/g;

/**
 * Fit `line` to exactly `width` cells on background `bg`: every SGR that
 * clears the background (full reset or 49) re-asserts it, then pad. Shared by
 * the Glide shell and the settings page's themed surface.
 */
export function onBg(line: string, width: number, bg: string): string {
	const fitted = visibleWidth(line) > width ? truncateToWidth(line, width, "") : line;
	const painted = fitted.replace(SGR, (seq, params: string) => {
		const parts = params.split(/[;:]/);
		return params === "" || parts[0] === "0" || parts.includes("49") ? seq + bg : seq;
	});
	return `${bg}${painted}${" ".repeat(Math.max(0, width - visibleWidth(fitted)))}\x1b[0m`;
}

const EFFORT_FILL: Record<string, number> = { minimal: 2, low: 4, medium: 7, high: 10, xhigh: 12, max: 12 };
/** Scene intensity per effort rung; levels without a rung (off, unknown, unresolved auto) add nothing. */
const SCENE_INTENSITY: Record<string, number> = { minimal: 0.15, low: 0.3, medium: 0.5, high: 0.75, xhigh: 1 };
/** Scene clock advance per animation tick at intensity 0 and 1. */
const SCENE_SPEED_MIN = 1;
const SCENE_SPEED_MAX = 1.8;
/**
 * Scene pixels per cell. Terminal.app draws `▀` with the font's own glyph, which in many fonts
 * (NeoX Mono among them) does not fill its half cell, leaving gaps between pixel rows; there each
 * cell paints its background only. `NIGHTGLIDE_SCENE_PIXELS=1|2` overrides the choice. Exported for
 * the settings page's theme-card previews.
 */
export function sceneCellPixels(env: NodeJS.ProcessEnv = process.env): 1 | 2 {
	const forced = env.NIGHTGLIDE_SCENE_PIXELS;
	if (forced === "1" || forced === "2") return Number(forced) as 1 | 2;
	return env.TERM_PROGRAM === "Apple_Terminal" ? 1 : 2;
}

/** Scene-clock span of a launch animation: about 3.5 s at the base speed. */
const SCENE_INTRO_TICKS = 32;

/** 0–1 scene intensity for an effective thinking level. */
export function sceneIntensity(level: string | undefined): number {
	const rung = effortRung(level);
	return rung ? (SCENE_INTENSITY[rung] ?? 0) : 0;
}
const EFFORT_SCALE = 12;
const SIDE_WIDTH = 32;
/** Narrowest window that still shows the information column. */
const SIDE_MIN_WIDTH = 100;
const WHEEL_LINES = 3;
/** Consecutive rows that identify the scrolled-back view's position. */
const ANCHOR_ROWS = 3;
/** Rows of new output an anchored view can absorb in one paint before it drifts. */
const ANCHOR_SLACK = 200;
/** Same cadence the normal-screen viewport derives its animation tick from. */
const FRAME_TICK_MS = 80;

/** Index of `anchor` in `rows` nearest to `expected`, or -1. */
function findAnchor(rows: readonly string[], anchor: readonly string[], expected: number): number {
	const last = rows.length - anchor.length;
	const matches = (at: number) => anchor.every((line, i) => rows[at + i] === line);
	for (let d = 0; d <= Math.max(expected, last - expected); d++) {
		if (expected - d >= 0 && expected - d <= last && matches(expected - d)) return expected - d;
		if (d > 0 && expected + d <= last && expected + d >= 0 && matches(expected + d)) return expected + d;
	}
	return -1;
}

/** First run of {@link ANCHOR_ROWS} rows in `view` with visible text; blank rows match too often. */
function captureAnchor(view: readonly string[]): { rows: readonly string[]; offset: number } | undefined {
	for (let i = 0; i + ANCHOR_ROWS <= view.length; i++) {
		const rows = view.slice(i, i + ANCHOR_ROWS);
		if (rows.every(row => visibleWidth(row) > 0)) return { rows, offset: i };
	}
	return undefined;
}

const LOCAL_PROVIDER_IDS = new Set([
	"omlx",
	"ollama",
	"lm-studio",
	"lmstudio",
	"vllm",
	"llamacpp",
	"llama.cpp",
	"jan",
	"gpustack",
	"localai",
]);

/** Safe symbolic glyph paired with explicit provider text (never the sole cue). */
function providerGlyph(provider: string | undefined, ascii: boolean): string {
	const id = provider?.toLowerCase() ?? "";
	if (ascii) {
		return LOCAL_PROVIDER_IDS.has(id) ? "[L]" : "[M]";
	}
	if (LOCAL_PROVIDER_IDS.has(id)) return "◈";
	if (id.includes("anthropic")) return "✦";
	if (id.includes("openai")) return "◎";
	if (id.includes("google") || id.includes("gemini")) return "◇";
	return theme.icon.model || "⬢";
}

function routingBadgeText(
	mode: NonNullable<NightglideShellState["routingMode"]>,
	nonLocalDefault: string | undefined,
): string {
	const modeLabel = t(`shell.routeMode.${mode}`);
	const base = t("shell.route", { mode: modeLabel });
	return nonLocalDefault ? `${base}${t("shell.routeExplicit")}` : base;
}

function robotStateLabel(state: RobotState): string {
	return t(`shell.robot.${state}`);
}

function sidebarToggleText(open: boolean, ascii: boolean, compact: boolean): string {
	if (compact) {
		if (ascii) return open ? "[-]" : "[+]";
		return open ? "[ ▾ ]" : "[ ▸ ]";
	}
	if (open) {
		return t(ascii ? "shell.sidebarHideAscii" : "shell.sidebarHide");
	}
	const keys = getKeybindings().getKeys("app.sidebar.toggle");
	const keyLabel = formatKeyHints(keys.length > 0 ? keys : ["ctrl+n"]);
	return t(ascii ? "shell.sidebarShowAscii" : "shell.sidebarShow", { key: keyLabel });
}

function summaryPillText(ascii: boolean): string {
	return t(ascii ? "shell.summaryPillAscii" : "shell.summaryPill");
}

/** Preserve the directory tail when a workspace path is wider than `maxWidth`. */
function shortenPathTail(path: string, maxWidth: number): string {
	if (visibleWidth(path) <= maxWidth) return path;
	if (maxWidth <= 2) return truncateToWidth(path, maxWidth, "");
	const chars = Array.from(path);
	let tail = "";
	for (let i = chars.length - 1; i >= 0; i--) {
		const candidate = `…${chars[i]}${tail}`;
		if (visibleWidth(candidate) > maxWidth) break;
		tail = `${chars[i]}${tail}`;
	}
	return tail ? `…${tail}` : truncateToWidth(path, maxWidth, "");
}

/** Format context usage for the sidebar (`% · window` when known, `—` when unset). */
function formatSidebarContext(
	st: NightglideShellState,
	maxWidth: number,
	ascii: boolean,
): { text: string; warn: boolean } {
	const window = st.contextWindow;
	if (!window || !Number.isFinite(window) || window <= 0) {
		return { text: ascii ? "-" : "—", warn: false };
	}
	const pct = st.contextPercent;
	if (pct === undefined || pct === null || !Number.isFinite(pct)) {
		return { text: formatNumber(window), warn: false };
	}
	const pctRounded = `${Math.round(pct)}%`;
	const warn = pct >= 70;
	const full = `${pctRounded} · ${formatNumber(st.contextTokens ?? 0)}/${formatNumber(window)}`;
	if (visibleWidth(full) <= maxWidth) return { text: full, warn };
	const compact = `${pctRounded} · ${formatNumber(window)}`;
	return { text: visibleWidth(compact) <= maxWidth ? compact : pctRounded, warn };
}

interface HitRect {
	row: number;
	from: number;
	to: number;
}

export class NightglideShell implements Component, OverlayFocusOwner {
	#deps: NightglideShellDeps;
	#phase = 0;
	/** Scene clock: advances faster at higher effort, so a level change never jumps the picture. */
	#sceneTime = 0;
	/** Scene clock when the current scene appeared; its launch animation runs from here. */
	#sceneStart = 0;
	#lastSceneKind: SceneKind | undefined;
	#timer: NodeJS.Timeout | undefined;
	#unsubscribe: () => void;
	/** Rows scrolled back from the transcript tail (0 = following). */
	#scroll = 0;
	/** Collapsible sidebar preference (defaults to collapsed). */
	#sidebarOpen = false;
	/** Expandable subagent details toggle inside the sidebar. */
	#subagentDetailsOpen = false;
	/** Last information-column visibility reported to the host. */
	#sideShown: boolean | undefined;
	/**
	 * While scrolled back: rows at the top of the view and their offset in it.
	 * New output grows the tail below, so `#scroll` alone would slide the view
	 * forward; each paint relocates these rows and corrects `#scroll`.
	 */
	#anchor: { rows: readonly string[]; offset: number } | undefined;
	#lastBodyRows = 10;
	/** Screen row of the conversation panel's top border in the last frame. */
	#bodyTop = -1;
	/** Width of the conversation panel in the last frame. */
	#mainWidth = 0;
	/** Click hit targets from the last rendered frame. */
	#toggleHit: HitRect | undefined;
	#summaryHit: HitRect | undefined;
	#agentsHit: { rowFrom: number; rowTo: number; colFrom: number; colTo: number } | undefined;

	constructor(deps: NightglideShellDeps) {
		this.#deps = deps;
		this.#unsubscribe = onMotionEffectsChange(() => this.#syncTimer());
		this.#syncTimer();
	}

	ownsOverlayFocusTarget(component: Component): boolean {
		return this.#deps.focusTargets().includes(component);
	}

	/** Whether the user has expanded the information sidebar (independent of terminal width). */
	isSidebarOpen(): boolean {
		return this.#sidebarOpen;
	}

	/** Expand or collapse the information sidebar. */
	setSidebarOpen(open: boolean): void {
		if (open === this.#sidebarOpen) return;
		this.#sidebarOpen = open;
		this.#deps.requestRender();
	}

	/** Toggle the information sidebar open/closed. */
	toggleSidebar(): void {
		this.setSidebarOpen(!this.#sidebarOpen);
	}

	/** Whether subagent detail lines are expanded in the sidebar. */
	isSubagentDetailsOpen(): boolean {
		return this.#subagentDetailsOpen;
	}

	/** Toggle detailed subagent metrics in the sidebar. */
	toggleSubagentDetails(): void {
		this.#subagentDetailsOpen = !this.#subagentDetailsOpen;
		this.#deps.requestRender();
	}

	/** Scroll the conversation by lines (+ = back in time). */
	scrollLines(lines: number): void {
		const next = Math.max(0, this.#scroll + lines);
		if (next === this.#scroll) return;
		this.#scroll = next;
		// The view moved on purpose: the next paint re-captures the anchor.
		this.#anchor = undefined;
		this.#deps.requestRender();
	}

	/** Mouse wheel: -1 up (back in time), 1 down. */
	wheel(direction: -1 | 1): void {
		this.scrollLines(-direction * WHEEL_LINES);
	}

	/** Scroll the conversation by pages (+ = back in time). */
	scrollPages(pages: number): void {
		this.scrollLines(pages * Math.max(1, this.#lastBodyRows - 3));
	}

	scrollToBottom(): void {
		this.scrollLines(-this.#scroll);
	}

	/** Pin the scene clock (still frames for previews and tests); the timer keeps advancing it. */
	setSceneTime(time: number): void {
		this.#sceneTime = time;
	}

	/** True while the conversation is scrolled back from the live tail. */
	isScrolledBack(): boolean {
		return this.#scroll > 0;
	}

	/**
	 * Left click at a 0-based screen cell. Handles the sidebar toggle pill on the
	 * conversation top border, the scrollback return label, the summary pill in
	 * the sidebar, and clicking the subagents section to expand/collapse details.
	 */
	click(row: number, col: number): boolean {
		if (this.#toggleHit && row === this.#toggleHit.row && col >= this.#toggleHit.from && col < this.#toggleHit.to) {
			this.toggleSidebar();
			return true;
		}
		if (
			this.#summaryHit &&
			row === this.#summaryHit.row &&
			col >= this.#summaryHit.from &&
			col < this.#summaryHit.to
		) {
			this.#deps.onSummary?.();
			return true;
		}
		if (
			this.#agentsHit &&
			row >= this.#agentsHit.rowFrom &&
			row < this.#agentsHit.rowTo &&
			col >= this.#agentsHit.colFrom &&
			col < this.#agentsHit.colTo
		) {
			this.toggleSubagentDetails();
			return true;
		}
		if (this.#scroll > 0 && row === this.#bodyTop && col >= 0 && col < this.#mainWidth) {
			this.scrollToBottom();
			return true;
		}
		return false;
	}

	#syncTimer(): void {
		if (motionEffectsEnabled()) {
			if (!this.#timer) {
				this.#timer = setInterval(() => {
					this.#phase++;
					const intensity = sceneIntensity(this.#deps.state().thinkingLevel);
					this.#sceneTime += SCENE_SPEED_MIN + (SCENE_SPEED_MAX - SCENE_SPEED_MIN) * intensity;
					this.#deps.requestRender();
				}, 110);
				this.#timer.unref();
			}
		} else if (this.#timer) {
			clearInterval(this.#timer);
			this.#timer = undefined;
		}
		this.#deps.requestRender();
	}

	dispose(): void {
		if (this.#timer) clearInterval(this.#timer);
		this.#timer = undefined;
		this.#unsubscribe();
	}

	render(width: number): readonly string[] {
		const height = this.#deps.rows();
		const fam = familyFor(getCurrentThemeName());
		const mode = theme.getColorMode();
		const ascii = theme.getSymbolPreset() === "ascii";
		const rawNoColor = Bun.env.NO_COLOR;
		const plain = this.#deps.plain ?? (rawNoColor !== undefined && rawNoColor !== "");
		const enc: PixelEncoder = plain
			? { fg: () => "", bg: () => "" }
			: { fg: hex => fgAnsi(hex, mode), bg: hex => bgAnsi(hex, mode) };
		const scene = mode === "truecolor" ? fam.scene : (fam.scene256 ?? fam.scene);
		const page = plain ? "" : enc.bg(scene.page);
		const c = (hex: string, s: string) => (plain ? s : `${enc.fg(hex)}${s}\x1b[39m`);
		const border = plain ? "" : enc.fg(fam.border);
		const W = Math.max(20, width);

		this.#toggleHit = undefined;
		this.#summaryHit = undefined;
		this.#agentsHit = undefined;

		// The information column decides what the status line repeats, so settle it first.
		const showSide = this.#sidebarOpen && W >= SIDE_MIN_WIDTH;
		if (showSide !== this.#sideShown) {
			this.#sideShown = showSide;
			this.#deps.sidebarShown?.(showSide);
		}

		// --- vertical budget ---------------------------------------------------
		const statusComp = this.#deps.status();
		const statusRows = statusComp ? statusComp.render(W - 2).slice(0, 2) : [];
		const dockRows = this.#renderDock(W - 4);
		const cardRows = dockRows.length + 2;
		// No header row: the top scene starts at the window edge and takes that row.
		let sceneTop = height >= 40 ? 6 : height >= 32 ? 5 : height >= 28 ? 4 : 0;
		let sceneBottom = height >= 36 ? 4 : height >= 30 ? 3 : 0;
		const fixed = cardRows + statusRows.length;
		while (height - fixed - sceneTop - sceneBottom < 10 && (sceneTop > 0 || sceneBottom > 0)) {
			if (sceneTop >= sceneBottom && sceneTop > 0) sceneTop--;
			else sceneBottom--;
		}
		const bodyRows = Math.max(3, height - fixed - sceneTop - sceneBottom);
		this.#lastBodyRows = bodyRows;
		// Motion off freezes the clock; effort still shows as density and highlights.
		// A scene that just appeared (launch or theme switch) plays its intro from here.
		if (fam.kind !== this.#lastSceneKind) {
			this.#lastSceneKind = fam.kind;
			this.#sceneStart = this.#sceneTime;
		}
		const motion = motionEffectsEnabled();
		const sceneOpts = {
			time: motion ? this.#sceneTime : 0,
			intensity: sceneIntensity(this.#deps.state().thinkingLevel),
			// Motion off shows the finished scene at once.
			intro: motion ? Math.min(1, (this.#sceneTime - this.#sceneStart) / SCENE_INTRO_TICKS) : 1,
			cellPixels: sceneCellPixels(),
		};

		const out: string[] = [];
		if (sceneTop > 0 && !plain) {
			out.push(...renderPixelScene(W, sceneTop, fam.kind, "top", scene, enc, sceneOpts));
		} else if (sceneTop > 0) {
			for (let i = 0; i < sceneTop; i++) out.push(onBg("", W, page));
		}
		this.#bodyTop = out.length;

		// --- body: conversation panel + information column --------------------
		const sideW = showSide ? SIDE_WIDTH : 0;
		const mainW = W - sideW - (showSide ? 1 : 0);
		this.#mainWidth = mainW;
		const mainInner = mainW - 4;
		const convo = this.#conversation(mainInner, bodyRows - 2, c, fam, plain);
		const sideStartCol = mainW + 1;
		const side = showSide
			? this.#sidebar(sideW - 4, bodyRows - 2, c, fam, {
					ascii,
					plain,
					motion,
					mode,
					light: theme.isLight || fam.label.includes("LIGHT"),
					pageBg: scene.page,
					sideStartCol,
				})
			: [];

		const leftLabel = this.#scroll > 0 ? c(fam.warm, t("shell.scrollback")) : "";
		let rightPill = "";
		if (W >= SIDE_MIN_WIDTH) {
			const fullPill = sidebarToggleText(showSide, ascii, false);
			const shortPill = sidebarToggleText(showSide, ascii, true);
			const innerTop = mainW - 2;
			const leftW = visibleWidth(leftLabel);
			const chosen =
				leftW + visibleWidth(fullPill) + 2 <= innerTop
					? fullPill
					: leftW + visibleWidth(shortPill) + 2 <= innerTop
						? shortPill
						: "";
			if (chosen) {
				rightPill = c(showSide ? fam.title : fam.accent, chosen);
			}
		}

		for (let r = 0; r < bodyRows; r++) {
			let line: string;
			if (r === 0) {
				line = this.#mainTopBorder(mainW, border, page, leftLabel, rightPill);
			} else {
				line = this.#panelRow(r, bodyRows, mainW, convo, border, page, "", ascii);
			}
			if (showSide) {
				line +=
					onBg(" ", 1, page) +
					this.#panelRow(r, bodyRows, sideW, side, border, page, c(fam.title, t("shell.panelTitle")), ascii);
			}
			out.push(line);
		}

		// --- composer card + status line --------------------------------------
		const tl = ascii ? "+" : "╭";
		const tr = ascii ? "+" : "╮";
		const bl = ascii ? "+" : "╰";
		const br = ascii ? "+" : "╯";
		const hz = ascii ? "-" : "─";
		const vt = ascii ? "|" : "│";
		out.push(onBg(`${border}${tl}${hz.repeat(W - 2)}${tr}`, W, page));
		for (const row of dockRows)
			out.push(
				onBg(`${border}${vt}${plain ? "" : "\x1b[39m"} ${onBg(row, W - 4, page)}${page}${border} ${vt}`, W, page),
			);
		out.push(onBg(`${border}${bl}${hz.repeat(W - 2)}${br}`, W, page));
		for (const row of statusRows) out.push(onBg(` ${row}`, W, page));

		const room = height - out.length;
		if (sceneBottom > 0 && room > 0 && !plain) {
			out.push(
				...renderPixelScene(W, Math.min(room, sceneBottom), fam.kind, "bottom", scene, enc, {
					...sceneOpts,
					time: sceneOpts.time + 53,
				}),
			);
		}
		while (out.length < height) out.push(onBg("", W, page));
		return out.slice(0, height);
	}

	#mainTopBorder(width: number, border: string, page: string, leftLabel: string, rightPill: string): string {
		const ascii = theme.getSymbolPreset() === "ascii";
		const tl = ascii ? "+" : "╭";
		const tr = ascii ? "+" : "╮";
		const hz = ascii ? "-" : "─";
		const inner = Math.max(0, width - 2);
		const leftW = visibleWidth(leftLabel);
		const pillW = visibleWidth(rightPill);
		if (pillW > 0 && leftW + pillW + 1 <= inner) {
			const trail = leftW + pillW + 2 <= inner ? 1 : 0;
			const mid = Math.max(0, inner - leftW - pillW - trail);
			const from = 1 + leftW + mid;
			this.#toggleHit = { row: this.#bodyTop, from, to: from + pillW };
			return onBg(
				`${border}${tl}${leftLabel}${border}${hz.repeat(mid)}${rightPill}${border}${hz.repeat(trail)}${tr}`,
				width,
				page,
			);
		}
		const rest = Math.max(0, inner - leftW);
		return onBg(`${border}${tl}${leftLabel}${border}${hz.repeat(rest)}${tr}`, width, page);
	}

	#panelRow(
		r: number,
		rows: number,
		width: number,
		content: readonly string[],
		border: string,
		page: string,
		label: string,
		ascii = false,
	): string {
		const tl = ascii ? "+" : "╭";
		const tr = ascii ? "+" : "╮";
		const bl = ascii ? "+" : "╰";
		const br = ascii ? "+" : "╯";
		const hz = ascii ? "-" : "─";
		const vt = ascii ? "|" : "│";
		if (r === 0) {
			const rest = width - 2 - visibleWidth(label);
			return onBg(`${border}${tl}${label}${border}${hz.repeat(Math.max(0, rest))}${tr}`, width, page);
		}
		if (r === rows - 1) return onBg(`${border}${bl}${hz.repeat(width - 2)}${br}`, width, page);
		return onBg(
			`${border}${vt}${border ? "\x1b[39m" : ""} ${onBg(content[r - 1] ?? "", width - 4, page)}${page}${border} ${vt}`,
			width,
			page,
		);
	}

	#renderDock(width: number): string[] {
		const rows: string[] = [];
		for (const comp of this.#deps.dock()) rows.push(...comp.render(width));
		// Collapse leading/trailing blank rows so the card hugs the editor.
		while (rows.length > 1 && visibleWidth(rows[0]!) === 0) rows.shift();
		while (rows.length > 1 && visibleWidth(rows[rows.length - 1]!) === 0) rows.pop();
		return rows;
	}

	#conversation(
		width: number,
		rows: number,
		c: (hex: string, s: string) => string,
		fam: Family,
		plain: boolean,
	): string[] {
		if (rows <= 0) return [];
		const now = performance.now();
		const frame: AnimationFrame = { now, tick: Math.floor(now / FRAME_TICK_MS) };
		const slack = this.#anchor ? ANCHOR_SLACK : 0;
		const tail = this.#deps.transcript.renderTail(width, rows + this.#scroll + slack, frame);
		if (tail.length === 0) {
			this.#anchor = undefined;
			return this.#emptyState(width, rows, c, fam, plain);
		}
		if (this.#anchor && this.#scroll > 0) {
			const expected = tail.length - this.#scroll - rows + this.#anchor.offset;
			const at = findAnchor(tail, this.#anchor.rows, expected);
			if (at >= 0) this.#scroll = Math.max(0, tail.length - rows - (at - this.#anchor.offset));
		}
		// Clamp scroll at the top of the transcript.
		const maxScroll = Math.max(0, tail.length - rows);
		if (this.#scroll > maxScroll) this.#scroll = maxScroll;
		const end = tail.length - this.#scroll;
		const view = tail.slice(Math.max(0, end - rows), end);
		this.#anchor = this.#scroll > 0 ? captureAnchor(view) : undefined;
		const pad: string[] = [];
		for (let i = view.length; i < rows; i++) pad.push("");
		return [...pad, ...view];
	}

	#emptyState(
		width: number,
		rows: number,
		c: (hex: string, s: string) => string,
		fam: Family,
		plain: boolean,
	): string[] {
		const title = c(fam.text, t("shell.welcomeTitle"));
		const lines = [
			plain ? title : theme.bold(title),
			c(fam.soft, t("shell.welcomeInput")),
			c(fam.soft, t("shell.welcomeKeys")),
		];
		const out: string[] = [];
		const top = Math.max(0, Math.floor((rows - lines.length) / 2));
		for (let i = 0; i < top; i++) out.push("");
		for (const line of lines) {
			const pad = Math.max(0, Math.floor((width - visibleWidth(line)) / 2));
			out.push(" ".repeat(pad) + line);
		}
		return out;
	}

	#sidebar(
		width: number,
		rows: number,
		c: (hex: string, s: string) => string,
		fam: Family,
		opts: {
			ascii: boolean;
			plain: boolean;
			motion: boolean;
			mode: "truecolor" | "256color";
			light: boolean;
			pageBg: string;
			sideStartCol: number;
		},
	): string[] {
		if (rows <= 0) return [];
		const st = this.#deps.state();
		const { ascii, plain, motion, mode, light, pageBg, sideStartCol } = opts;
		const fit = (line: string) => truncateToWidth(line, width);
		const bold = (s: string) => (plain ? s : theme.bold(s));
		const ruleChar = ascii ? "-" : "─";
		const hairline = c(fam.border, ruleChar.repeat(Math.max(1, width)));
		const indent = (line: string) => fit(`  ${line}`);
		const fgToken = (token: Parameters<typeof theme.fg>[0], text: string) => (plain ? text : theme.fg(token, text));
		const kvRows = (glyph: string, label: string, value: string, glyphHex = fam.accent): string[] => {
			const left = `${glyph ? `${c(glyphHex, glyph)} ` : ""}${c(fam.soft, label)}`;
			const gapCols = width - visibleWidth(left) - visibleWidth(value);
			if (gapCols >= 1) return [fit(`${left}${" ".repeat(gapCols)}${value}`)];
			return [fit(left), indent(value)];
		};

		const robotState =
			st.robotState ??
			deriveRobotState({
				streaming: st.streaming,
				activeTools: st.activeTools,
				turnDone: st.turnDone,
			});

		// Unified live session status pill shown inside the Hero Companion header.
		const spinFrames = ascii ? "-\\|/" : "◜◝◞◟";
		let statusMark: string;
		let statusHex: string;
		let statusLabel: string;
		if (st.activeTools && st.activeTools > 0) {
			statusMark = ascii ? "~" : "◌";
			statusHex = fam.warm;
			statusLabel = t("shell.toolsRunning", { count: st.activeTools });
		} else if (st.streaming) {
			statusMark = motion ? spinFrames[this.#phase % spinFrames.length]! : ascii ? "o" : "◌";
			statusHex = fam.warm;
			statusLabel = robotStateLabel("thinking");
		} else if (st.turnDone) {
			statusMark = ascii ? "+" : "✓";
			statusHex = fam.accent;
			statusLabel = robotStateLabel("done");
		} else {
			statusMark = ascii ? "*" : "●";
			statusHex = fam.soft;
			statusLabel = robotStateLabel("idle");
		}

		// Model section: clean single inline row when unset, rich hierarchy when active.
		const model: string[] = [];
		const modelGlyph = providerGlyph(st.provider, ascii);
		if (st.model) {
			const fastMark = ascii ? " >>" : " ⚡";
			const advMark = ascii ? " (*)" : " ◉";
			const badges = `${st.fast ? c(fam.warm, fastMark) : ""}${
				st.advisor
					? c(
							st.advisor === "error" || st.advisor === "quota"
								? fam.warm
								: st.advisor === "running"
									? fam.accent
									: fam.soft,
							advMark,
						)
					: ""
			}`;
			model.push(fit(`${c(fam.accent, modelGlyph)} ${c(fam.soft, t("shell.model"))}`));
			model.push(indent(`${bold(c(fam.text, st.model))}${badges}`));
			if (st.provider && st.routingMode) {
				const routeText = routingBadgeText(st.routingMode, st.routingNonLocalDefault);
				const routeHex = st.routingMode === "manual" ? fam.soft : fam.accent;
				const combined = `${st.provider} · ${routeText}`;
				if (visibleWidth(combined) <= width - 2) {
					model.push(indent(`${c(fam.soft, `${st.provider} · `)}${c(routeHex, routeText)}`));
				} else {
					model.push(indent(c(fam.soft, st.provider)), indent(c(routeHex, routeText)));
				}
			} else if (st.provider) {
				model.push(indent(c(fam.soft, st.provider)));
			} else if (st.routingMode) {
				const routeHex = st.routingMode === "manual" ? fam.soft : fam.accent;
				model.push(indent(c(routeHex, routingBadgeText(st.routingMode, st.routingNonLocalDefault))));
			}
			if (st.fallback) model.push(indent(c(fam.warm, t("shell.fallback", { model: st.fallback }))));
			if (st.notice) model.push(indent(c(fam.warm, st.notice)));
		} else {
			model.push(...kvRows(modelGlyph, t("shell.model"), c(fam.soft, t("shell.noModel"))));
		}

		// Effort row: inline segmented meter beside label when space allows.
		const level = st.thinkingLevel;
		const rung = effortRung(level);
		const effortGlyph = rung ? (ascii ? "*" : effortLadderGlyph(level)) : ascii ? "o" : "○";
		const fillOn = ascii ? "=" : "▰";
		const fillOff = ascii ? "-" : "▱";
		let effortValue: string;
		if (level && rung && EFFORT_FILL[level] !== undefined) {
			const filled = EFFORT_FILL[level]!;
			const token = effortLadderToken(level) ?? "accent";
			const labelCols = visibleWidth(t("shell.effort")) + 2;
			const maxInlineCells = Math.max(5, Math.min(8, width - labelCols - visibleWidth(level) - 2));
			const on = Math.round((filled / EFFORT_SCALE) * maxInlineCells);
			effortValue = `${fgToken(token, fillOn.repeat(on))}${c(fam.border, fillOff.repeat(maxInlineCells - on))} ${fgToken(token, level)}`;
		} else if (st.autoPending) {
			effortValue = c(fam.soft, t("shell.effortAutoPending"));
		} else if (!st.model || st.thinkingSupported === false) {
			effortValue = c(fam.soft, st.model ? t("shell.effortUnsupported") : ascii ? "-" : "—");
		} else {
			effortValue = c(fam.soft, level ?? t("shell.unknown"));
		}
		const effort = kvRows(effortGlyph, t("shell.effort"), effortValue);

		// Context usage row: percent & window when known, calm dash when unset (never `/?`).
		const contextLabelWidth = visibleWidth(t("shell.context")) + 3;
		const ctxFmt = formatSidebarContext(st, Math.max(4, width - contextLabelWidth), ascii);
		const context = kvRows(
			ascii ? "%" : "◔",
			t("shell.context"),
			c(ctxFmt.warn ? fam.warm : st.contextWindow ? fam.text : fam.soft, ctxFmt.text),
		);

		// Workspace directory (tail-preserving so folder name stays legible).
		const workspace: string[] = st.cwd
			? [
					fit(`${c(fam.accent, ascii ? ">" : "▸")} ${c(fam.soft, t("shell.workspace"))}`),
					indent(c(fam.soft, shortenPathTail(st.cwd, Math.max(4, width - 2)))),
				]
			: [];

		// Bottom summary pill button.
		const rawSummary = summaryPillText(ascii);
		const pillInner = fit(ascii ? rawSummary : ` ${rawSummary} `);
		const pillPadLeft = Math.max(0, Math.floor((width - visibleWidth(pillInner)) / 2));
		const pillBg = plain || ascii ? "" : bgAnsi(fam.scene.ramp[0] ?? pageBg, mode);
		const pageRestoreBg = plain || ascii ? "" : bgAnsi(pageBg, mode);
		const summaryRendered = pillBg
			? `${" ".repeat(pillPadLeft)}${pillBg}${c(fam.title, pillInner)}${pageRestoreBg}`
			: `${" ".repeat(pillPadLeft)}${c(fam.accent, pillInner)}`;

		// Subagents section: sleek single line when none, expandable list when active.
		const buildSubagents = (maxAgentRows: number): string[] => {
			const running = st.subagents.filter(
				a => a.status !== "completed" && a.status !== "failed" && a.status !== "aborted",
			).length;
			if (st.subagents.length === 0) {
				return kvRows(ascii ? "<>" : "◇", t("shell.subagents"), c(fam.soft, t("shell.none")));
			}
			const cue = this.#subagentDetailsOpen ? (ascii ? "[-]" : "▾") : ascii ? "[+]" : "▸";
			const titleText = t("shell.subagentsCount", { running, total: st.subagents.length });
			const headerLeft = `${c(fam.accent, ascii ? "<>" : "◇")} ${bold(c(fam.title, titleText))}`;
			const headerRight = c(fam.soft, cue);
			const headerGap = Math.max(1, width - visibleWidth(headerLeft) - visibleWidth(headerRight));
			const agents: string[] = [fit(`${headerLeft}${" ".repeat(headerGap)}${headerRight}`)];

			let used = 0;
			let shownAgents = 0;
			for (const agent of st.subagents) {
				const extraLines: string[] = [];
				if (agent.currentTool) {
					extraLines.push(indent(c(fam.soft, `  ${ascii ? "->" : "↳"} ${agent.currentTool}`)));
				}
				if (this.#subagentDetailsOpen) {
					const parts: string[] = [];
					if (agent.agent && agent.agent !== agent.label) parts.push(agent.agent);
					if (agent.elapsedMs !== undefined && agent.elapsedMs >= 0) parts.push(formatDuration(agent.elapsedMs));
					if (agent.toolCount !== undefined) {
						parts.push(t("shell.agentTools", { count: agent.toolCount }));
					}
					if (agent.tokens !== undefined && agent.tokens > 0) {
						parts.push(`${formatNumber(agent.tokens)} tok`);
					}
					if (parts.length > 0) {
						const maxPartWidth = Math.max(8, width - 4);
						let currentLine = "";
						for (const part of parts) {
							if (!currentLine) {
								currentLine = part;
								continue;
							}
							const candidate = `${currentLine} · ${part}`;
							if (visibleWidth(candidate) <= maxPartWidth) {
								currentLine = candidate;
							} else {
								extraLines.push(indent(c(fam.soft, `  ${currentLine}`)));
								currentLine = part;
							}
						}
						if (currentLine) {
							extraLines.push(indent(c(fam.soft, `  ${currentLine}`)));
						}
					}
				}
				const neededForAgent = 1 + extraLines.length;
				const remainingAgents = st.subagents.length - shownAgents;
				const reserveMore = remainingAgents > 1 ? 1 : 0;
				if (used + neededForAgent + reserveMore > maxAgentRows && shownAgents > 0) {
					const hidden = st.subagents.length - shownAgents;
					agents.push(indent(c(fam.soft, t("shell.agentsMore", { count: hidden }))));
					break;
				}
				const failed = agent.status === "failed" || agent.status === "aborted";
				const done = agent.status === "completed";
				const mark = failed
					? c(fam.warm, ascii ? "x" : "✕")
					: done
						? c(fam.soft, ascii ? "+" : "✓")
						: c(fam.accent, ascii ? "*" : "●");
				const name = truncateToWidth(agent.label, Math.max(4, width - 6 - visibleWidth(agent.status)));
				const gap = " ".repeat(Math.max(1, width - 4 - visibleWidth(name) - visibleWidth(agent.status)));
				agents.push(
					indent(
						`${mark} ${c(done ? fam.soft : fam.text, name)}${gap}${c(failed ? fam.warm : fam.soft, agent.status)}`,
					),
				);
				for (const extra of extraLines) agents.push(extra);
				used += neededForAgent;
				shownAgents++;
			}
			return agents;
		};

		// Hero companion block: 10x5 sprite paired with Nightglide identity, live status, and theme family.
		const spriteRows = renderNightglideRobot({
			kind: fam.kind,
			style: st.robotStyle,
			light,
			state: robotState,
			phase: this.#phase,
			motion,
			cellPixels: sceneCellPixels(),
			colorMode: mode,
			plain,
			ascii,
			pageBg,
		});
		const robotCaption1 = `${c(fam.accent, ascii ? "*" : "✦")} ${bold(c(fam.title, "Nightglide"))}`;
		const robotCaption2 = `${c(statusHex === fam.soft ? fam.accent : statusHex, statusMark)} ${c(statusHex, statusLabel)}`;
		const robotCaption3 = c(fam.soft, fam.label);
		const robotFullBlock = spriteRows.map((spriteLine, idx) => {
			if (width < ROBOT_WIDTH + 4) return fit(spriteLine);
			const caption = idx === 1 ? robotCaption1 : idx === 2 ? robotCaption2 : idx === 3 ? robotCaption3 : "";
			return caption ? fit(`${spriteLine}  ${caption}`) : fit(spriteLine);
		});
		const compactBadge = renderNightglideRobotCompact({
			kind: fam.kind,
			style: st.robotStyle,
			light,
			state: robotState,
			phase: this.#phase,
			motion,
			colorMode: mode,
			plain,
			ascii,
		});
		const robotCompactBlock = [fit(`${compactBadge} ${c(fam.title, "Nightglide")} · ${c(statusHex, statusLabel)}`)];

		// Vertical budget: calm dividers when breathing room permits, tight compact fallback when short.
		const specsLines = model.length + effort.length + context.length + workspace.length;
		const collapsedAgentRows =
			st.subagents.length === 0
				? 1
				: 1 + st.subagents.slice(0, 2).reduce((sum, a) => sum + 1 + (a.currentTool ? 1 : 0), 0);
		// Airy layout: 1 blank + hero + divider + specs + divider + agents + bottom divider + summary (with breathing gaps).
		const dividerRows = 3;
		const blankGapRows = 3;
		const withSpacious = ROBOT_ROWS + specsLines + collapsedAgentRows + dividerRows + blankGapRows + 1;
		const withHairlines = ROBOT_ROWS + specsLines + collapsedAgentRows + dividerRows + 1;
		const withFullTight = ROBOT_ROWS + specsLines + collapsedAgentRows + 1;

		let robotSec: string[];
		let useHairlines = false;
		let useSpacious = false;
		if (withSpacious <= rows) {
			robotSec = robotFullBlock;
			useHairlines = true;
			useSpacious = true;
		} else if (withHairlines <= rows) {
			robotSec = robotFullBlock;
			useHairlines = true;
		} else if (withFullTight <= rows) {
			robotSec = robotFullBlock;
		} else {
			const remainingForCompactAndAgents = rows - specsLines - 1;
			robotSec = remainingForCompactAndAgents >= 2 ? robotCompactBlock : [];
		}

		const chromeOverhead = (useHairlines ? dividerRows : 0) + (useSpacious ? 2 : 0) + 1;
		const maxAgentRows = Math.max(1, rows - robotSec.length - specsLines - chromeOverhead - 1);
		const agents = buildSubagents(maxAgentRows);

		const out: string[] = [];
		const specsGap = useSpacious && model.length + effort.length + context.length + workspace.length > 0;
		if (useSpacious) out.push("");
		out.push(...robotSec);
		if (useHairlines) out.push(hairline);
		out.push(...model);
		if (specsGap) out.push("");
		out.push(...effort, ...context, ...workspace);
		if (useHairlines) out.push(hairline);
		const agentsStart = out.length;
		out.push(...agents);
		const agentsEnd = out.length;

		const sideInnerCol = sideStartCol + 2;
		if (agentsEnd > agentsStart && agentsStart < rows) {
			this.#agentsHit = {
				rowFrom: this.#bodyTop + 1 + agentsStart,
				rowTo: this.#bodyTop + 1 + Math.min(rows, agentsEnd),
				colFrom: sideInnerCol,
				colTo: sideInnerCol + width,
			};
		}

		// Pin subtle hairline + summary button at bottom cleanly.
		if (rows >= 2) {
			const reserveBottom = useHairlines && out.length + 2 <= rows ? 2 : 1;
			while (out.length < rows - reserveBottom) out.push("");
			if (reserveBottom === 2 && out.length < rows - 1) out.push(hairline);
			const summaryIdx = Math.min(out.length, rows - 1);
			if (out.length < rows) {
				out.push(summaryRendered);
			} else {
				out[rows - 1] = summaryRendered;
			}
			this.#summaryHit = {
				row: this.#bodyTop + 1 + summaryIdx,
				from: sideInnerCol + pillPadLeft,
				to: sideInnerCol + pillPadLeft + visibleWidth(pillInner),
			};
		}

		return out.slice(0, rows);
	}
}
