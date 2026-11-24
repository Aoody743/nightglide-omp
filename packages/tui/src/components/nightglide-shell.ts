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
import { effortLadderGlyph, effortLadderToken, effortRung } from "../chat/effort-ladder";
import type { AnimationFrame, TranscriptContainer } from "../chrome/transcript-container";
import { motionEffectsEnabled, onMotionEffectsChange } from "../motion-effects";
import { bgAnsi, fgAnsi } from "../theme/color";
import { getCurrentThemeName, theme } from "../theme/theme";
import type { Component, OverlayFocusOwner } from "../tui";
import { truncateToWidth, visibleWidth } from "../utils";
import { type PixelEncoder, type PixelPalette, renderPixelScene, type SceneKind } from "./nightglide-pixel-scene";

/** A subagent row in the information column, read from the live registry. */
export interface NightglideShellSubagent {
	label: string;
	/** Registry status as reported (active, running, completed, failed, …). */
	status: string;
	/** The tool the agent is running right now, when known. */
	currentTool?: string;
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
	subagents: NightglideShellSubagent[];
	/** Main-session tools currently executing. */
	activeTools?: number;
	/** True while the main session is streaming a response. */
	streaming: boolean;
}

export interface NightglideShellDeps {
	transcript: TranscriptContainer;
	/** Editor-anchored roots shown inside the composer card, in order. */
	dock: () => readonly Component[];
	/** Session status line, drawn under the composer card. */
	status: () => Component | undefined;
	/** Live session facts for the information column. */
	state: () => NightglideShellState;
	/** Told whenever the information column appears or disappears (narrow windows drop it). */
	sidebarShown?: (shown: boolean) => void;
	/** Components (the editor) whose hardware cursor this shell owns. */
	focusTargets: () => readonly Component[];
	rows: () => number;
	requestRender: () => void;
}

interface Family {
	label: string;
	/** Scene the bands draw. */
	kind: SceneKind;
	/** Frame lines around panels. */
	border: string;
	/** Panel titles. */
	title: string;
	/** Primary readable text on the page. */
	text: string;
	/** Secondary text: still readable, never faint. */
	soft: string;
	accent: string;
	warm: string;
	/** Truecolor scene palette. */
	scene: PixelPalette;
	/** Override for 256-color terminals, picked from colors that exist on the 256 grid. */
	scene256?: PixelPalette;
}

/** Surfaces per theme family; tuned to survive 256-color quantization. */
function familyFor(name: string | undefined): Family {
	switch (name) {
		case "nightglide-cloudlight":
			return {
				label: "FLIGHT LIGHT",
				kind: "flight",
				border: "#7d9fe0",
				title: "#1d4fbf",
				text: "#14213d",
				soft: "#46557a",
				accent: "#1f6fe0",
				warm: "#d97a00",
				scene: {
					page: "#f5f8ff",
					ramp: ["#d7d7ff", "#afd7ff", "#87afff", "#5f87d7", "#005fd7"],
					accent: "#ffaf00",
					spark: "#87afd7",
				},
				scene256: {
					page: "#ffffff",
					ramp: ["#d7d7ff", "#afd7ff", "#87afff", "#5f87d7", "#005fd7"],
					accent: "#ffaf00",
					spark: "#87afd7",
					blends: { glow: ["#ffd7af", "#ffd787", "#ffaf00"] },
				},
			};
		case "nightglide-abyss":
			return {
				label: "DIVE DARK",
				kind: "dive",
				border: "#1e7a78",
				title: "#5fe0c8",
				text: "#e3f6f2",
				soft: "#9cc9c1",
				accent: "#3fe0c0",
				warm: "#ff8a5c",
				scene: {
					page: "#041519",
					ramp: ["#005f5f", "#008787", "#00afaf", "#5fd7d7"],
					accent: "#ff875f",
					spark: "#afffff",
					plants: ["#00875f", "#00af87", "#5fd787"],
				},
				scene256: {
					page: "#121212",
					ramp: ["#005f5f", "#008787", "#00afaf", "#5fd7d7"],
					accent: "#ff875f",
					spark: "#afffff",
					plants: ["#00875f", "#00af87", "#5fd787"],
					blends: {
						far: ["#005f5f"],
						shaft: ["#1c1c1c", "#262626", "#303030"],
						mote: "#5f8787",
					},
				},
			};
		case "nightglide-daybreak":
			return {
				label: "DIVE LIGHT",
				kind: "dive",
				border: "#5fb8a8",
				title: "#0b7a6c",
				text: "#0f2e2a",
				soft: "#3f6a63",
				accent: "#0e9c88",
				warm: "#f0623f",
				scene: {
					page: "#f2fbf9",
					ramp: ["#d7ffff", "#afd7d7", "#87d7d7", "#5fafaf"],
					accent: "#ff5f5f",
					spark: "#5fafaf",
					plants: ["#5faf87", "#00875f", "#005f5f"],
				},
				scene256: {
					page: "#ffffff",
					ramp: ["#d7ffff", "#afd7d7", "#87d7d7", "#5fafaf"],
					accent: "#ff5f5f",
					spark: "#5fafaf",
					plants: ["#5faf87", "#00875f", "#005f5f"],
					blends: {
						far: ["#d7ffff"],
						shaft: ["#eeeeee", "#e4e4e4", "#d7ffff"],
						mote: "#87d7d7",
					},
				},
			};
		case "nightglide-aurora":
			return {
				label: "AURORA",
				kind: "aurora",
				border: "#35276b",
				title: "#d5a6ff",
				text: "#ece6ff",
				soft: "#b8aad6",
				accent: "#78e5d8",
				warm: "#f2c98a",
				scene: {
					page: "#0b0819",
					// Curtain light, faint → the bright lower edge.
					ramp: ["#123f3a", "#1c8a6c", "#34d399", "#c4ffe6"],
					// Upper rays, faint → bright.
					upper: ["#24194f", "#4b3596", "#8c6ee0"],
					// Near range, far range, lit far crest.
					ground: ["#050409", "#17122f", "#3a2f6e"],
					accent: "#f2c98a",
					spark: "#d9d0ff",
				},
				scene256: {
					page: "#080808",
					// Few, dark-leaning grid steps: the 256-color version stays calm rather than busy.
					ramp: ["#005f5f", "#00875f", "#5fd7af"],
					// Grid violets: off-grid ones round to grays on 256-color terminals.
					upper: ["#00005f", "#5f5faf"],
					ground: ["#000000", "#1c1c1c", "#5f5f87"],
					accent: "#ffd787",
					spark: "#d7d7ff",
					quantized: true,
				},
			};
		default:
			return {
				label: "FLIGHT DARK",
				kind: "flight",
				border: "#2f5f95",
				title: "#6fd6ea",
				text: "#e8ecfa",
				soft: "#a7b3d6",
				accent: "#6fd6ea",
				warm: "#f5b94c",
				scene: {
					page: "#0b1022",
					ramp: ["#18244e", "#22417e", "#2f6daf", "#5fb0dc", "#b8ecf7"],
					accent: "#f5b94c",
					spark: "#6c78b0",
				},
				scene256: {
					page: "#121212",
					ramp: ["#303030", "#005f87", "#5f87af", "#87afd7", "#d7ffff"],
					accent: "#ffaf5f",
					spark: "#5f5f87",
					blends: { far: ["#262626", "#303030"], glow: ["#875f5f", "#af875f", "#ffaf5f"] },
				},
			};
	}
}

const SGR = /\x1b\[([0-9;:]*)m/g;

/**
 * Fit `line` to exactly `width` cells on background `bg`: every SGR that
 * clears the background (full reset or 49) re-asserts it, then pad.
 */
function onBg(line: string, width: number, bg: string): string {
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
 * cell paints its background only. `NIGHTGLIDE_SCENE_PIXELS=1|2` overrides the choice.
 */
function sceneCellPixels(env: NodeJS.ProcessEnv = process.env): 1 | 2 {
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
const EFFORT_CELLS = 12;
const SIDE_WIDTH = 30;
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

	constructor(deps: NightglideShellDeps) {
		this.#deps = deps;
		this.#unsubscribe = onMotionEffectsChange(() => this.#syncTimer());
		this.#syncTimer();
	}

	ownsOverlayFocusTarget(component: Component): boolean {
		return this.#deps.focusTargets().includes(component);
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
	 * Left click at a 0-based screen cell. Clicking the conversation panel's top
	 * border while scrolled back (where the "回看中" label sits) returns to the
	 * live tail. Returns whether the click was used.
	 */
	click(row: number, _col: number): boolean {
		if (this.#scroll === 0 || row !== this.#bodyTop) return false;
		this.scrollToBottom();
		return true;
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
		const enc: PixelEncoder = { fg: hex => fgAnsi(hex, mode), bg: hex => bgAnsi(hex, mode) };
		const scene = mode === "truecolor" ? fam.scene : (fam.scene256 ?? fam.scene);
		const page = enc.bg(scene.page);
		const c = (hex: string, s: string) => `${enc.fg(hex)}${s}\x1b[39m`;
		const border = enc.fg(fam.border);
		const W = Math.max(20, width);

		// The information column decides what the status line repeats, so settle it first.
		const showSide = W >= SIDE_MIN_WIDTH;
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
		if (sceneTop > 0) out.push(...renderPixelScene(W, sceneTop, fam.kind, "top", scene, enc, sceneOpts));
		this.#bodyTop = out.length;

		// --- body: conversation panel + information column --------------------
		const sideW = showSide ? SIDE_WIDTH : 0;
		const mainW = W - sideW - (showSide ? 1 : 0);
		const mainInner = mainW - 4;
		const convo = this.#conversation(mainInner, bodyRows - 2, c, fam);
		const side = showSide ? this.#sidebar(sideW - 4, bodyRows - 2, c, fam) : [];
		const label = this.#scroll > 0 ? c(fam.warm, ` ↑ 回看中 · End 或点此回到底部 `) : "";
		for (let r = 0; r < bodyRows; r++) {
			let line = this.#panelRow(r, bodyRows, mainW, convo, border, page, label);
			if (showSide)
				line += onBg(" ", 1, page) + this.#panelRow(r, bodyRows, sideW, side, border, page, c(fam.title, " 会话 "));
			out.push(line);
		}

		// --- composer card + status line --------------------------------------
		out.push(onBg(`${border}╭${"─".repeat(W - 2)}╮`, W, page));
		for (const row of dockRows)
			out.push(onBg(`${border}│\x1b[39m ${onBg(row, W - 4, page)}${page}${border} │`, W, page));
		out.push(onBg(`${border}╰${"─".repeat(W - 2)}╯`, W, page));
		for (const row of statusRows) out.push(onBg(` ${row}`, W, page));

		const room = height - out.length;
		if (sceneBottom > 0 && room > 0) {
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

	#panelRow(
		r: number,
		rows: number,
		width: number,
		content: readonly string[],
		border: string,
		page: string,
		label: string,
	): string {
		if (r === 0) {
			const rest = width - 2 - visibleWidth(label);
			return onBg(`${border}╭${label}${border}${"─".repeat(Math.max(0, rest))}╮`, width, page);
		}
		if (r === rows - 1) return onBg(`${border}╰${"─".repeat(width - 2)}╯`, width, page);
		return onBg(`${border}│\x1b[39m ${onBg(content[r - 1] ?? "", width - 4, page)}${page}${border} │`, width, page);
	}

	#renderDock(width: number): string[] {
		const rows: string[] = [];
		for (const comp of this.#deps.dock()) rows.push(...comp.render(width));
		// Collapse leading/trailing blank rows so the card hugs the editor.
		while (rows.length > 1 && visibleWidth(rows[0]!) === 0) rows.shift();
		while (rows.length > 1 && visibleWidth(rows[rows.length - 1]!) === 0) rows.pop();
		return rows;
	}

	#conversation(width: number, rows: number, c: (hex: string, s: string) => string, fam: Family): string[] {
		if (rows <= 0) return [];
		const now = performance.now();
		const frame: AnimationFrame = { now, tick: Math.floor(now / FRAME_TICK_MS) };
		const slack = this.#anchor ? ANCHOR_SLACK : 0;
		const tail = this.#deps.transcript.renderTail(width, rows + this.#scroll + slack, frame);
		if (tail.length === 0) {
			this.#anchor = undefined;
			return this.#emptyState(width, rows, c, fam);
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

	#emptyState(width: number, rows: number, c: (hex: string, s: string) => string, fam: Family): string[] {
		const lines = [
			theme.bold(c(fam.text, "向未知滑行")),
			c(fam.soft, "在下方输入任务，按 Enter 发送"),
			c(fam.soft, "滚轮 / PgUp 回看 · /copy 复制 · /theme 换主题"),
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

	#sidebar(width: number, rows: number, c: (hex: string, s: string) => string, fam: Family): string[] {
		const st = this.#deps.state();
		const fit = (line: string) => truncateToWidth(line, width);
		const sections: string[][] = [];
		/** Section heading: glyph, title, then a rule to the column edge. */
		const head = (glyph: string, title: string, hex = fam.accent) => {
			const lead = `${c(hex, glyph)} ${theme.bold(c(fam.title, title))} `;
			return fit(lead + c(fam.border, "─".repeat(Math.max(0, width - visibleWidth(lead)))));
		};
		const body = (line: string) => fit(`  ${line}`);

		// Model: name, provider, and anything that changes who is answering.
		const model: string[] = [head("✦", "模型")];
		if (st.model) {
			const badges = `${st.fast ? c(fam.warm, " ⚡") : ""}${
				st.advisor
					? c(
							st.advisor === "error" || st.advisor === "quota"
								? fam.warm
								: st.advisor === "running"
									? fam.accent
									: fam.soft,
							" ◉",
						)
					: ""
			}`;
			model.push(body(`${theme.bold(c(fam.text, st.model))}${badges}`));
			if (st.provider) model.push(body(c(fam.soft, st.provider)));
			if (st.fallback) model.push(body(c(fam.warm, `↩ 回退 ${st.fallback}`)));
			if (st.notice) model.push(body(c(fam.warm, st.notice)));
		} else {
			model.push(body(c(fam.warm, "未选择模型")));
		}
		sections.push(model);

		// Effort: the level the session actually uses, never a configured wish.
		const level = st.thinkingLevel;
		const rung = effortRung(level);
		const effort: string[] = [head(rung ? effortLadderGlyph(level) : "○", "思考强度")];
		if (level && rung && EFFORT_FILL[level] !== undefined) {
			const filled = EFFORT_FILL[level]!;
			const token = effortLadderToken(level) ?? "accent";
			const cells = Math.max(6, Math.min(EFFORT_CELLS, width - 2 - visibleWidth(level) - 1));
			const on = Math.round((filled / EFFORT_CELLS) * cells);
			effort.push(
				body(
					`${theme.fg(token, "▰".repeat(on))}${c(fam.border, "▱".repeat(cells - on))} ${theme.fg(token, level)}`,
				),
			);
		} else if (st.autoPending) {
			effort.push(body(c(fam.soft, "auto · 本轮确定后显示")));
		} else if (!st.model || st.thinkingSupported === false) {
			effort.push(body(c(fam.soft, st.model ? "此模型不支持" : "—")));
		} else {
			effort.push(body(c(fam.soft, level ?? "未知")));
		}
		sections.push(effort);

		// Subagents: real registry entries only.
		const running = st.subagents.filter(a => a.status !== "completed" && a.status !== "failed").length;
		const agents: string[] = [
			head("◇", st.subagents.length > 0 ? `子智能体 ${running}/${st.subagents.length}` : "子智能体"),
		];
		if (st.subagents.length === 0) agents.push(body(c(fam.soft, "暂无")));
		for (const agent of st.subagents) {
			const failed = agent.status === "failed";
			const done = agent.status === "completed";
			const mark = failed ? c(fam.warm, "✕") : done ? c(fam.soft, "✓") : c(fam.accent, "●");
			const name = truncateToWidth(agent.label, Math.max(4, width - 6 - visibleWidth(agent.status)));
			const gap = " ".repeat(Math.max(1, width - 4 - visibleWidth(name) - visibleWidth(agent.status)));
			agents.push(
				body(
					`${mark} ${c(done ? fam.soft : fam.text, name)}${gap}${c(failed ? fam.warm : fam.soft, agent.status)}`,
				),
			);
			if (agent.currentTool) agents.push(body(c(fam.soft, `  ↳ ${agent.currentTool}`)));
		}
		sections.push(agents);

		// Status of the main session.
		const status: string[] = [];
		if (st.activeTools && st.activeTools > 0) {
			status.push(head("◌", "状态", fam.warm), body(c(fam.warm, `工具执行中 · ${st.activeTools}`)));
		} else if (st.streaming) {
			const spin = motionEffectsEnabled() ? "◜◝◞◟"[this.#phase % 4]! : "◌";
			status.push(head(spin, "状态", fam.warm), body(c(fam.warm, "思考中")));
		} else {
			status.push(head("●", "状态"), body(c(fam.soft, "空闲")));
		}
		sections.push(status);

		// A blank row under the frame and between sections when the column has room for them.
		const needed = sections.reduce((n, sec) => n + sec.length, 0);
		const gap = needed + sections.length <= rows;
		const out: string[] = gap ? [""] : [];
		for (const sec of sections) {
			if (out.length > 1 && gap) out.push("");
			out.push(...sec);
		}
		return out.slice(0, rows);
	}
}
