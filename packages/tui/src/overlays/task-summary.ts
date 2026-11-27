/**
 * Nightglide on-demand task summary overlay (`/summary` & sidebar action).
 *
 * Displays a local factual summary immediately from real live session state
 * (turn status, prompt/reply counts, active & completed tools, touched files,
 * and subagents) without mutating history or making implicit model calls.
 *
 * Shows the exact context scope (message count & character count) and potential
 * token/cost notice before the user explicitly triggers an on-demand AI
 * summary via `Enter` / `g` or clicking the action button. Supports streaming,
 * `Esc` cancellation via `AbortController`, error reporting, `NO_COLOR`, and
 * `ascii` presets.
 */
import { formatDuration, formatNumber, sanitizeText } from "@oh-my-pi/pi-utils";
import { bottomBorder, divider, row, topBorder } from "../chrome/overlay-box";
import { familyFor, onBg } from "../components/nightglide-shell";
import { ScrollView } from "../components/scroll-view";
import { onLanguageChange, t } from "../i18n";
import { matchesSelectCancel } from "../keybinding-matchers";
import { matchesKey } from "../keys";
import { motionEffectsEnabled, onMotionEffectsChange } from "../motion-effects";
import { routeSgrMouseInput, type SgrMouseEvent } from "../mouse";
import { bgAnsi } from "../theme/color";
import type { ThemeColor } from "../theme/schema";
import { getCurrentThemeName, theme } from "../theme/theme";
import type { Component } from "../tui";
import { replaceTabs, truncateToWidth, visibleWidth, wrapTextWithAnsi } from "../utils";

export type TaskTurnStatus = "in_progress" | "completed" | "failed" | "cancelled" | "empty";

export interface TaskSummaryToolEntry {
	name: string;
	count: number;
	errors: number;
	running: number;
}

export interface TaskSummarySubagent {
	label: string;
	agent?: string;
	status: string;
	currentTool?: string;
	elapsedMs?: number;
	toolCount?: number;
	tokens?: number;
}

export interface TaskSummaryContextScope {
	/** Number of redacted conversation turns/messages included if AI summary runs. */
	messageCount: number;
	/** Character count of the redacted prompt payload that would be sent. */
	charCount: number;
	/** Target model label, or undefined if no model is selected. */
	modelLabel?: string;
	/** Applied Nightglide routing mode, if any. */
	routingMode?: string;
}

export interface TaskSummaryData {
	status: TaskTurnStatus;
	statusDetail?: string;
	sessionTitle?: string;
	modelLabel?: string;
	routingMode?: string;
	userPromptCount: number;
	assistantReplyCount: number;
	latestUserPrompt?: string;
	latestAssistantReply?: string;
	activeTools: readonly string[];
	tools: readonly TaskSummaryToolEntry[];
	touchedFiles: readonly string[];
	subagents: readonly TaskSummarySubagent[];
	scope: TaskSummaryContextScope;
	missingInfo: boolean;
}

export interface TaskSummaryAiCallbacks {
	/**
	 * Run an explicit, non-mutating AI summary on the current model.
	 * Must respect `signal` and emit incremental text via `onDelta`.
	 */
	generate?: (options: { signal: AbortSignal; onDelta: (chunk: string) => void }) => Promise<string>;
}

export interface TaskSummaryOverlayOptions {
	rows?: () => number;
	plain?: boolean;
	requestRender?: () => void;
	onClose: () => void;
}

type AiSummaryPhase = "idle" | "generating" | "done" | "cancelled" | "error";

interface HitBox {
	row: number;
	from: number;
	to: number;
}

function isColorParam(code: number): boolean {
	return (
		(code >= 30 && code <= 39) ||
		(code >= 40 && code <= 49) ||
		(code >= 90 && code <= 97) ||
		(code >= 100 && code <= 107)
	);
}

function stripColorCodes(line: string): string {
	return line.replace(/\x1b\[([0-9;]*)m/g, (whole, params: string) => {
		if (params === "" || params === "0") return params === "0" ? whole : "";
		const parts = params.split(";");
		const kept: string[] = [];
		for (let i = 0; i < parts.length; i++) {
			const code = Number(parts[i]);
			if (!Number.isFinite(code)) return whole;
			if (code === 38 || code === 48) {
				const form = parts[i + 1];
				if (form === "5" || form === "2") {
					i += form === "5" ? 2 : 4;
					continue;
				}
			}
			if (isColorParam(code)) continue;
			kept.push(parts[i]!);
		}
		return kept.length === 0 ? "" : `\x1b[${kept.join(";")}m`;
	});
}

function cleanLine(value: string): string {
	return replaceTabs(sanitizeText(value)).replace(/\r/g, "");
}

export class TaskSummaryOverlayComponent implements Component {
	readonly #data: TaskSummaryData;
	readonly #callbacks: TaskSummaryAiCallbacks;
	readonly #options: TaskSummaryOverlayOptions;
	readonly #rowsProvider: () => number;
	readonly #plain: boolean;
	readonly #scrollView: ScrollView;
	readonly #stopLangListener: () => void;
	readonly #stopMotionListener: () => void;

	#aiPhase: AiSummaryPhase = "idle";
	#aiText = "";
	#aiError: string | undefined;
	#abortController: AbortController | undefined;
	#spinnerTimer: NodeJS.Timeout | undefined;
	#spinnerFrame = 0;

	#actionHit: HitBox | undefined;
	#closeHit: HitBox | undefined;
	#bodyRowRange: { start: number; end: number } | undefined;

	constructor(data: TaskSummaryData, callbacks: TaskSummaryAiCallbacks, options: TaskSummaryOverlayOptions) {
		this.#data = data;
		this.#callbacks = callbacks;
		this.#options = options;
		this.#rowsProvider = options.rows ?? (() => process.stdout.rows || 32);
		const rawNoColor = Bun.env.NO_COLOR;
		this.#plain = options.plain ?? (rawNoColor !== undefined && rawNoColor !== "");
		this.#scrollView = new ScrollView([], {
			height: 10,
			scrollbar: "auto",
			theme: {
				track: text => (this.#plain ? text : theme.fg("dim", text)),
				thumb: text => (this.#plain ? text : theme.fg("accent", text)),
			},
		});
		this.#stopLangListener = onLanguageChange(() => this.#requestRender());
		this.#stopMotionListener = onMotionEffectsChange(() => this.#syncSpinner());
	}

	/** Current AI summary generation phase (useful for inspection & tests). */
	getAiStatus(): AiSummaryPhase {
		return this.#aiPhase;
	}

	/** Current streamed or completed AI summary text. */
	getAiText(): string {
		return this.#aiText;
	}

	invalidate(): void {
		this.#scrollView.invalidate();
	}

	dispose(): void {
		if (this.#abortController) {
			this.#abortController.abort("disposed");
			this.#abortController = undefined;
		}
		this.#stopSpinner();
		this.#stopLangListener();
		this.#stopMotionListener();
		this.#scrollView.dispose();
	}

	#requestRender(): void {
		this.#options.requestRender?.();
	}

	#c(slot: ThemeColor, text: string): string {
		return this.#plain ? text : theme.fg(slot, text);
	}

	#bold(text: string): string {
		return this.#plain ? text : theme.bold(text);
	}

	get #ascii(): boolean {
		return theme.getSymbolPreset() === "ascii";
	}

	#canGenerateAi(): boolean {
		return Boolean(this.#callbacks.generate && this.#data.modelLabel && !this.#data.missingInfo);
	}

	#startGeneration(): void {
		if (this.#aiPhase === "generating") return;
		if (!this.#data.modelLabel) {
			this.#aiPhase = "error";
			this.#aiError = t("summary.errNoModel");
			this.#requestRender();
			return;
		}
		if (this.#data.missingInfo) {
			this.#aiPhase = "error";
			this.#aiError = t("summary.errMissingInfo");
			this.#requestRender();
			return;
		}
		const generate = this.#callbacks.generate;
		if (!generate) {
			this.#aiPhase = "error";
			this.#aiError = t("summary.errUnavailable");
			this.#requestRender();
			return;
		}

		const controller = new AbortController();
		this.#abortController = controller;
		this.#aiPhase = "generating";
		this.#aiText = "";
		this.#aiError = undefined;
		this.#syncSpinner();
		this.#requestRender();

		void generate({
			signal: controller.signal,
			onDelta: chunk => {
				if (this.#abortController !== controller || controller.signal.aborted) return;
				this.#aiText += cleanLine(chunk);
				this.#requestRender();
			},
		})
			.then(finalText => {
				if (this.#abortController !== controller) return;
				if (controller.signal.aborted) {
					this.#aiPhase = "cancelled";
					return;
				}
				const cleaned = cleanLine(finalText).trim();
				if (cleaned) this.#aiText = cleaned;
				this.#aiPhase = "done";
			})
			.catch(err => {
				if (this.#abortController !== controller) return;
				if (controller.signal.aborted || (err instanceof Error && err.name === "AbortError")) {
					this.#aiPhase = "cancelled";
					return;
				}
				this.#aiPhase = "error";
				const raw = err instanceof Error ? err.message : String(err);
				this.#aiError = cleanLine(raw) || t("summary.errRequestFailed");
			})
			.finally(() => {
				if (this.#abortController === controller) {
					this.#abortController = undefined;
					this.#stopSpinner();
					this.#requestRender();
				}
			});
	}

	#cancelGeneration(): void {
		if (this.#aiPhase !== "generating" || !this.#abortController) return;
		this.#abortController.abort("cancelled");
		this.#abortController = undefined;
		this.#aiPhase = "cancelled";
		this.#stopSpinner();
		this.#requestRender();
	}

	#syncSpinner(): void {
		if (this.#aiPhase === "generating" && motionEffectsEnabled()) {
			if (!this.#spinnerTimer) {
				this.#spinnerTimer = setInterval(() => {
					this.#spinnerFrame++;
					this.#requestRender();
				}, 110);
				this.#spinnerTimer.unref();
			}
		} else {
			this.#stopSpinner();
		}
	}

	#stopSpinner(): void {
		if (this.#spinnerTimer) {
			clearInterval(this.#spinnerTimer);
			this.#spinnerTimer = undefined;
		}
	}

	handleInput(data: string): void {
		if (data.startsWith("\x1b[<")) {
			routeSgrMouseInput(data, event => this.#routeMouse(event));
			return;
		}
		if (matchesSelectCancel(data) || matchesKey(data, "escape") || matchesKey(data, "esc")) {
			if (this.#aiPhase === "generating") {
				this.#cancelGeneration();
			} else {
				this.dispose();
				this.#options.onClose();
			}
			return;
		}
		if (matchesKey(data, "enter") || matchesKey(data, "return") || data === "g" || data === "G") {
			if (this.#aiPhase !== "generating") {
				this.#startGeneration();
			}
			return;
		}
		if (this.#scrollView.handleScrollKey(data)) {
			this.#requestRender();
		}
	}

	#routeMouse(event: SgrMouseEvent): boolean {
		if (event.wheel !== null) {
			if (!this.#bodyRowRange || (event.row >= this.#bodyRowRange.start && event.row < this.#bodyRowRange.end)) {
				this.#scrollView.scroll(event.wheel * 3);
				this.#requestRender();
			}
			return true;
		}
		if (!event.leftClick) return true;
		if (
			this.#actionHit &&
			event.row === this.#actionHit.row &&
			event.col >= this.#actionHit.from &&
			event.col < this.#actionHit.to
		) {
			if (this.#aiPhase === "generating") this.#cancelGeneration();
			else this.#startGeneration();
			return true;
		}
		if (
			this.#closeHit &&
			event.row === this.#closeHit.row &&
			event.col >= this.#closeHit.from &&
			event.col < this.#closeHit.to
		) {
			if (this.#aiPhase === "generating") this.#cancelGeneration();
			else {
				this.dispose();
				this.#options.onClose();
			}
			return true;
		}
		return true;
	}

	#statusBadge(): { text: string; color: ThemeColor } {
		const ascii = this.#ascii;
		switch (this.#data.status) {
			case "in_progress":
				return {
					text: `${ascii ? "[~]" : "◌"} ${t("summary.status.inProgress")}`,
					color: "warning",
				};
			case "completed":
				return {
					text: `${ascii ? "[+]" : "✓"} ${t("summary.status.completed")}`,
					color: "success",
				};
			case "failed":
				return {
					text: `${ascii ? "[x]" : "✕"} ${t("summary.status.failed")}`,
					color: "error",
				};
			case "cancelled":
				return {
					text: `${ascii ? "[!]" : "⏹"} ${t("summary.status.cancelled")}`,
					color: "warning",
				};
			case "empty":
				return {
					text: `${ascii ? "[ ]" : "○"} ${t("summary.status.empty")}`,
					color: "dim",
				};
		}
	}

	#buildBodyLines(contentWidth: number): string[] {
		const w = Math.max(16, contentWidth);
		const wrap = (text: string, color?: ThemeColor, indent = "") => {
			const clean = cleanLine(text);
			const innerW = Math.max(8, w - visibleWidth(indent));
			const wrapped = wrapTextWithAnsi(clean, innerW);
			return wrapped.map(line => `${indent}${color ? this.#c(color, line) : line}`);
		};
		const sectionHead = (title: string) => {
			const mark = this.#ascii ? "*" : "✦";
			return `${this.#c("accent", mark)} ${this.#bold(this.#c("accent", title))}`;
		};

		const lines: string[] = [];
		const badge = this.#statusBadge();
		const sessionHead = this.#data.sessionTitle ? `${cleanLine(this.#data.sessionTitle)} · ` : "";
		lines.push(`${sessionHead}${this.#c(badge.color, this.#bold(badge.text))}`);
		if (this.#data.statusDetail) {
			lines.push(...wrap(this.#data.statusDetail, this.#data.status === "failed" ? "error" : "warning", "  "));
		}

		// Overview: model, routing, turn counts
		const modelText = this.#data.modelLabel ? cleanLine(this.#data.modelLabel) : t("shell.noModel");
		const routeText = this.#data.routingMode ? t("summary.routeInline", { mode: this.#data.routingMode }) : "";
		lines.push(...wrap(t("summary.modelLine", { model: modelText, route: routeText }), "muted"));
		lines.push(
			...wrap(
				t("summary.turns", {
					prompts: this.#data.userPromptCount,
					replies: this.#data.assistantReplyCount,
				}),
				"dim",
			),
		);
		lines.push("");

		// Local Factual Summary
		lines.push(sectionHead(t("summary.localSection")));
		if (this.#data.missingInfo) {
			lines.push(...wrap(t("summary.localEmpty"), "dim", "  "));
		} else {
			if (this.#data.latestUserPrompt) {
				lines.push(...wrap(t("summary.latestPrompt", { text: this.#data.latestUserPrompt }), "text", "  "));
			}
			if (this.#data.latestAssistantReply) {
				lines.push(...wrap(t("summary.latestReply", { text: this.#data.latestAssistantReply }), "muted", "  "));
			}
			if (this.#data.activeTools.length > 0) {
				lines.push(
					...wrap(t("summary.runningTools", { tools: this.#data.activeTools.join(", ") }), "warning", "  "),
				);
			}
			if (this.#data.tools.length > 0) {
				const toolSummary = this.#data.tools
					.map(item => {
						const errTag = item.errors > 0 ? t("summary.toolErrors", { count: item.errors }) : "";
						const runTag = item.running > 0 ? t("summary.toolRunning") : "";
						return `${item.name}×${item.count}${errTag}${runTag}`;
					})
					.join(", ");
				lines.push(...wrap(t("summary.toolsLine", { items: toolSummary }), "muted", "  "));
			} else {
				lines.push(...wrap(t("summary.toolsLine", { items: t("summary.noneWord") }), "dim", "  "));
			}
			if (this.#data.touchedFiles.length > 0) {
				lines.push(
					this.#c("muted", `  ${t("summary.touchedFilesCount", { count: this.#data.touchedFiles.length })}`),
				);
				for (const file of this.#data.touchedFiles) {
					lines.push(...wrap(`- ${file}`, "text", "    "));
				}
			} else {
				lines.push(...wrap(t("summary.touchedFilesNone"), "dim", "  "));
			}
			if (this.#data.subagents.length > 0) {
				lines.push(this.#c("muted", `  ${t("summary.subagentsCount", { count: this.#data.subagents.length })}`));
				for (const sub of this.#data.subagents) {
					const extras: string[] = [sub.status];
					if (sub.currentTool) extras.push(sub.currentTool);
					if (sub.elapsedMs !== undefined && sub.elapsedMs >= 0) extras.push(formatDuration(sub.elapsedMs));
					if (sub.toolCount !== undefined) extras.push(t("shell.agentTools", { count: sub.toolCount }));
					if (sub.tokens !== undefined && sub.tokens > 0) extras.push(`${formatNumber(sub.tokens)} tok`);
					lines.push(...wrap(`- ${sub.label} (${extras.join(" · ")})`, "text", "    "));
				}
			} else {
				lines.push(...wrap(t("summary.subagentsNone"), "dim", "  "));
			}
		}

		lines.push("");

		// Context Scope & Cost Notice
		lines.push(sectionHead(t("summary.scopeSection")));
		const scopeModel = this.#data.scope.modelLabel ?? this.#data.modelLabel;
		if (!scopeModel) {
			lines.push(...wrap(t("summary.scopeNoModel"), "warning", "  "));
		} else {
			lines.push(
				...wrap(
					t("summary.scopeWithModel", {
						model: scopeModel,
						messages: this.#data.scope.messageCount,
						chars: formatNumber(this.#data.scope.charCount),
					}),
					"muted",
					"  ",
				),
			);
			lines.push(...wrap(t("summary.scopeCostNote"), "dim", "  "));
		}

		lines.push("");

		// AI Summary Area
		lines.push(sectionHead(t("summary.aiSection")));
		if (this.#aiPhase === "idle") {
			if (this.#canGenerateAi()) {
				lines.push(...wrap(t("summary.aiIdleHint"), "dim", "  "));
			} else {
				lines.push(...wrap(t("summary.aiUnavailable"), "dim", "  "));
			}
		} else if (this.#aiPhase === "generating") {
			const frames = theme.getSpinnerFrames("activity");
			const spin = motionEffectsEnabled()
				? (frames[this.#spinnerFrame % frames.length] ?? "*")
				: this.#ascii
					? "~"
					: "◌";
			lines.push(...wrap(`${spin} ${t("summary.aiGenerating")}`, "accent", "  "));
			if (this.#aiText) {
				lines.push("");
				for (const paragraph of this.#aiText.split("\n")) {
					lines.push(...(paragraph ? wrap(paragraph, "text", "  ") : [""]));
				}
			}
		} else if (this.#aiPhase === "cancelled") {
			lines.push(...wrap(t("summary.aiCancelled"), "warning", "  "));
			if (this.#aiText) {
				for (const paragraph of this.#aiText.split("\n")) {
					lines.push(...(paragraph ? wrap(paragraph, "dim", "  ") : [""]));
				}
			}
		} else if (this.#aiPhase === "error") {
			lines.push(
				...wrap(t("summary.aiFailed", { reason: this.#aiError ?? t("summary.aiUnknownError") }), "error", "  "),
			);
		} else if (this.#aiPhase === "done") {
			if (!this.#aiText.trim()) {
				lines.push(...wrap(t("summary.aiEmptyResponse"), "warning", "  "));
			} else {
				for (const paragraph of this.#aiText.split("\n")) {
					lines.push(...(paragraph ? wrap(paragraph, "text", "  ") : [""]));
				}
			}
		}

		return lines;
	}

	render(width: number): readonly string[] {
		const W = Math.max(24, width);
		const totalHeight = Math.max(14, this.#rowsProvider());
		// Chrome: topBorder (1) + body (H) + divider (1) + footer (1) + bottomBorder (1) = H + 4
		const bodyHeight = Math.max(4, totalHeight - 4);
		const innerWidth = Math.max(12, W - 4);
		const bodyLines = this.#buildBodyLines(Math.max(10, innerWidth - 1));

		this.#scrollView.setHeight(bodyHeight);
		this.#scrollView.setLines(bodyLines);
		const renderedBody = this.#scrollView.render(innerWidth);

		const title = t("summary.title");
		const out: string[] = [topBorder(W, title)];
		this.#bodyRowRange = { start: out.length, end: out.length + bodyHeight };
		for (let i = 0; i < bodyHeight; i++) {
			out.push(row(renderedBody[i] ?? "", W));
		}
		out.push(divider(W));

		// Footer with clickable action pill + close pill + scroll hints
		const footerRowIdx = out.length;
		const ascii = this.#ascii;
		let actionLabel = "";
		let actionColor: ThemeColor = "accent";
		if (this.#aiPhase === "generating") {
			actionLabel = t(ascii ? "summary.btnCancelAscii" : "summary.btnCancel");
			actionColor = "warning";
		} else if (this.#canGenerateAi()) {
			const verb =
				this.#aiPhase === "done" || this.#aiPhase === "error" || this.#aiPhase === "cancelled"
					? t("summary.btnRegenerate")
					: t("summary.btnGenerate");
			actionLabel = ascii ? `[* ${verb} Enter/g]` : `[ ✦ ${verb} Enter/g ]`;
		}

		const closeLabel = t(ascii ? "summary.btnCloseAscii" : "summary.btnClose");
		const scrollHint = t(ascii ? "summary.scrollHintAscii" : "summary.scrollHint");

		this.#actionHit = undefined;
		this.#closeHit = undefined;
		let footer = "";
		let cursorCol = 2; // `row(...)` prepends `│ ` (2 cols)
		if (actionLabel) {
			const styledAction = this.#c(actionColor, this.#bold(actionLabel));
			const aw = visibleWidth(actionLabel);
			if (cursorCol + aw <= W - 2) {
				this.#actionHit = { row: footerRowIdx, from: cursorCol, to: cursorCol + aw };
				footer += styledAction;
				cursorCol += aw;
			}
		}
		const closePrefix = footer ? "  " : "";
		const cw = visibleWidth(closeLabel);
		if (cursorCol + closePrefix.length + cw <= W - 2) {
			cursorCol += closePrefix.length;
			this.#closeHit = { row: footerRowIdx, from: cursorCol, to: cursorCol + cw };
			footer += `${closePrefix}${this.#c("muted", closeLabel)}`;
			cursorCol += cw;
		}
		const sep = ascii ? " - " : " · ";
		if (cursorCol + sep.length + visibleWidth(scrollHint) <= W - 2) {
			footer += this.#c("dim", `${sep}${scrollHint}`);
		}

		out.push(row(truncateToWidth(footer, innerWidth), W));
		out.push(bottomBorder(W));

		if (this.#plain) return out.map(stripColorCodes);
		const fam = familyFor(getCurrentThemeName());
		const page = bgAnsi(fam.scene.page, theme.getColorMode());
		return out.map(line => onBg(line, W, page));
	}
}
