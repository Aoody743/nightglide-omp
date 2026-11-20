/**
 * Nightglide Glide shell — fullscreen window layout (spike).
 *
 * Installed through `TUI.setScreenProvider`, it paints the whole alternate
 * screen: brand header, top scene band, a framed conversation panel next to
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
import { effortLadderToken } from "../chat/effort-ladder";
import type { TranscriptContainer } from "../chrome/transcript-container";
import { motionEffectsEnabled, onMotionEffectsChange } from "../motion-effects";
import { bgAnsi, fgAnsi } from "../theme/color";
import { getCurrentThemeName, theme } from "../theme/theme";
import type { Component, OverlayFocusOwner } from "../tui";
import { truncateToWidth, visibleWidth } from "../utils";
import type { NightglideSidebarState } from "./nightglide-sidebar";
import { type PixelEncoder, type PixelPalette, renderPixelScene } from "./nightglide-pixel-scene";

export interface NightglideShellState extends NightglideSidebarState {
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
	/** Components (the editor) whose hardware cursor this shell owns. */
	focusTargets: () => readonly Component[];
	rows: () => number;
	requestRender: () => void;
}

interface Family {
	label: string;
	dive: boolean;
	/** Frame lines around panels. */
	border: string;
	/** Panel titles and the header rule. */
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
				dive: false,
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
			};
		case "nightglide-abyss":
			return {
				label: "DIVE DARK",
				dive: true,
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
			};
		case "nightglide-daybreak":
			return {
				label: "DIVE LIGHT",
				dive: true,
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
			};
		default:
			return {
				label: "FLIGHT DARK",
				dive: false,
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
					ramp: ["#303050", "#005f87", "#5f87af", "#87afd7", "#d7ffff"],
					accent: "#ffaf5f",
					spark: "#5f5f87",
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
const EFFORT_CELLS = 12;
const SIDE_WIDTH = 30;
const WHEEL_LINES = 3;

export class NightglideShell implements Component, OverlayFocusOwner {
	#deps: NightglideShellDeps;
	#phase = 0;
	#timer: NodeJS.Timeout | undefined;
	#unsubscribe: () => void;
	/** Rows scrolled back from the transcript tail (0 = following). */
	#scroll = 0;
	#lastBodyRows = 10;

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

	#syncTimer(): void {
		if (motionEffectsEnabled()) {
			if (!this.#timer) {
				this.#timer = setInterval(() => {
					this.#phase++;
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

		// --- vertical budget ---------------------------------------------------
		const statusComp = this.#deps.status();
		const statusRows = statusComp ? statusComp.render(W - 2).slice(0, 2) : [];
		const dockRows = this.#renderDock(W - 4);
		const cardRows = dockRows.length + 2;
		let sceneTop = height >= 40 ? 5 : height >= 32 ? 4 : height >= 28 ? 3 : 0;
		let sceneBottom = height >= 36 ? 4 : height >= 30 ? 3 : 0;
		const fixed = 1 + cardRows + statusRows.length;
		while (height - fixed - sceneTop - sceneBottom < 10 && (sceneTop > 0 || sceneBottom > 0)) {
			if (sceneTop >= sceneBottom && sceneTop > 0) sceneTop--;
			else sceneBottom--;
		}
		const bodyRows = Math.max(3, height - fixed - sceneTop - sceneBottom);
		this.#lastBodyRows = bodyRows;
		const phase = motionEffectsEnabled() ? this.#phase : 0;

		const out: string[] = [];
		out.push(onBg(this.#header(W, fam, c), W, page));
		if (sceneTop > 0) out.push(...renderPixelScene(W, sceneTop, phase, fam.dive, "top", scene, enc));

		// --- body: conversation panel + information column --------------------
		const showSide = W >= 100;
		const sideW = showSide ? SIDE_WIDTH : 0;
		const mainW = W - sideW - (showSide ? 1 : 0);
		const mainInner = mainW - 4;
		const convo = this.#conversation(mainInner, bodyRows - 2, c, fam);
		const side = showSide ? this.#sidebar(sideW - 4, bodyRows - 2, c, fam) : [];
		const label = this.#scroll > 0 ? c(fam.warm, ` ↑ 回看中 · 滚轮/PgDn 返回 `) : "";
		for (let r = 0; r < bodyRows; r++) {
			let line = this.#panelRow(r, bodyRows, mainW, convo, border, page, label);
			if (showSide) line += onBg(" ", 1, page) + this.#panelRow(r, bodyRows, sideW, side, border, page, "");
			out.push(line);
		}

		// --- composer card + status line --------------------------------------
		out.push(onBg(`${border}╭${"─".repeat(W - 2)}╮`, W, page));
		for (const row of dockRows) out.push(onBg(`${border}│\x1b[39m ${onBg(row, W - 4, page)}${page}${border} │`, W, page));
		out.push(onBg(`${border}╰${"─".repeat(W - 2)}╯`, W, page));
		for (const row of statusRows) out.push(onBg(` ${row}`, W, page));

		const room = height - out.length;
		if (sceneBottom > 0 && room > 0) {
			out.push(...renderPixelScene(W, Math.min(room, sceneBottom), phase + 53, fam.dive, "bottom", scene, enc));
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

	#header(width: number, fam: Family, c: (hex: string, s: string) => string): string {
		const title = `${c(fam.accent, " ✦ ")}${theme.bold(c(fam.text, "Nightglide"))} `;
		const tag = `${c(fam.title, `[ ${fam.label} ]`)} `;
		const ruleW = Math.max(0, width - visibleWidth(title) - visibleWidth(tag) - 6);
		const rule = `${c(fam.soft, "··")}${c(fam.border, `${"─".repeat(ruleW)}`)}${c(fam.accent, "·")}  `;
		return title + rule + tag;
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
		const tail = this.#deps.transcript.renderTail(width, rows + this.#scroll);
		if (tail.length === 0) return this.#emptyState(width, rows, c, fam);
		// Clamp scroll at the top of the transcript.
		const maxScroll = Math.max(0, tail.length - rows);
		if (this.#scroll > maxScroll) this.#scroll = maxScroll;
		const end = tail.length - this.#scroll;
		const view = tail.slice(Math.max(0, end - rows), end);
		const pad: string[] = [];
		for (let i = view.length; i < rows; i++) pad.push("");
		return [...pad, ...view];
	}

	#emptyState(width: number, rows: number, c: (hex: string, s: string) => string, fam: Family): string[] {
		const lines = [
			theme.bold(c(fam.text, "向未知滑行")),
			c(fam.soft, "在下方输入任务，按 Enter 发送"),
			c(fam.soft, "滚轮 / PgUp 回看 · F2 切回经典模式"),
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
		const out: string[] = [];
		const section = (title: string) => {
			if (out.length > 0) out.push(c(fam.border, "┄".repeat(width)));
			out.push(theme.bold(c(fam.title, title)));
		};

		section("Model");
		out.push(truncateToWidth(`${c(fam.accent, "✦ ")}${c(fam.text, st.model ?? "no-model")}`, width));

		section("Effort");
		const level = st.thinkingLevel ? String(st.thinkingLevel) : undefined;
		if (level && EFFORT_FILL[level] !== undefined) {
			const filled = EFFORT_FILL[level]!;
			const token = effortLadderToken(level) ?? "accent";
			const bar = theme.fg(token, "▰".repeat(filled)) + c(fam.border, "▱".repeat(EFFORT_CELLS - filled));
			out.push(truncateToWidth(`${bar} ${theme.fg(token, level)}`, width));
		} else if (st.autoPending) {
			out.push(c(fam.soft, "auto · 待本轮确定"));
		} else {
			out.push(c(fam.soft, level ?? "未知"));
		}

		section(`Agents (${st.subagents.length})`);
		if (st.subagents.length === 0) out.push(c(fam.soft, "无活动"));
		for (const agent of st.subagents) {
			const hex = agent.status === "failed" ? fam.warm : agent.status === "completed" ? fam.soft : fam.accent;
			const name = truncateToWidth(agent.label, Math.max(4, width - 12));
			const gap = " ".repeat(Math.max(1, width - 2 - visibleWidth(name) - visibleWidth(agent.status)));
			out.push(`${c(hex, "■")} ${c(fam.text, name)}${gap}${c(hex, agent.status)}`);
			if (st.detailed && agent.currentTool) out.push(c(fam.soft, `  ↳ ${agent.currentTool}`));
		}

		section("Status");
		if (st.activeTools && st.activeTools > 0) {
			out.push(c(fam.warm, `◌ 工具执行中 · ${st.activeTools}`));
		} else if (st.streaming) {
			const spin = motionEffectsEnabled() ? "◜◝◞◟"[this.#phase % 4]! : "◌";
			out.push(c(fam.warm, `${spin} Thinking`));
		} else {
			out.push(`${c(fam.accent, "●")} ${c(fam.soft, "空闲")}`);
		}
		return out.slice(0, rows);
	}
}
