/**
 * Tool-approval prompt in the composer's place, presented like the ask
 * dialog: the approval title and its details over a list of choices —
 * optional grants (led by a toggle that keeps them across sessions), Approve,
 * an optional "approve for this session", and Deny — and an action
 * bar. The arrows move between the choices and Enter takes the highlighted
 * one; `app.approval.approve` (Ctrl+Enter by default) approves this call
 * outright and Esc denies. Enter and the approve chord only arm
 * {@link APPROVE_ARM_MS} after mount, so a key meant for the composer (Enter,
 * or the follow-up chord pressed mid-run) as the prompt appears never answers
 * it. With an {@link ApprovalDialogDraft}, every other key edits the composer
 * mounted beneath the dialog, so a message can deny the call and steer the
 * turn instead: while the composer holds a draft, the arrows and Enter edit and
 * send it, and the highlight sits on Deny, relabeled to say Enter sends.
 * The prompt stays a few rows so the composer keeps its room; Page Up/Down
 * scroll the details, and with a full prompt the expand key
 * (`app.tools.expand`) swaps it in, wrapped.
 */
import {
	type Component,
	Ellipsis,
	ScrollView,
	type TUI,
	truncateToWidth,
	visibleWidth,
	wrapTextWithAnsi,
} from "../index";
import { formatKeyHints, formatTooltipKey } from "../app-keybindings";
import { bottomBorder, divider, OverlayPanel, PanelDivider, PanelRows, row, topBorder } from "../chrome/overlay-box";
import { editorKey, editorKeys } from "../chrome/keybinding-hints";
import { getKeybindings } from "../keybindings";
import {
	appApproveKeys,
	appToolsExpandKey,
	matchesAppApprove,
	matchesAppToolsExpand,
	matchesSelectCancel,
	matchesSelectDown,
	matchesSelectPageDown,
	matchesSelectPageUp,
	matchesSelectUp,
} from "../keybinding-matchers";
import type { TspSpan } from "@oh-my-pi/pi-wire";
import { col, item, node, span } from "../native/describe";
import { leafKey, type NativeNode, type NativeUiEvent } from "../native/node";
import { actionBar, actionButton } from "../native/overlay";
import { PREVIEW_LIMITS, sanitizeDisplayLines } from "../render/render-utils";
import { theme } from "../theme/theme";
import { CountdownTimer } from "../chrome/countdown-timer";
import { getLanguage, type Language, t } from "../i18n";

/** Detail rows shown before the rest scrolls, so the composer beneath keeps its room. */
const MAX_DETAIL_ROWS: number = PREVIEW_LIMITS.COLLAPSED_ITEMS;
/** Enter and the approve key are ignored this long after mount, so a key sent as the prompt appears cannot answer it. */
export const APPROVE_ARM_MS = 500;

function localizeApprovalTitle(rawTitle: string): string {
	const match = /^Allow tool: (.+)$/.exec(rawTitle);
	if (!match) return rawTitle;
	return t("approval.allowTool", { name: match[1]! });
}

const NO_LINES: readonly string[] = [];

/**
 * Built-in tools whose approval writes files or executes commands — the panel
 * frame paints warning while one of these asks (the dialog knows a call only by
 * its `Allow tool: <name>` header). Read-only prompts — reads, searches,
 * queries, MCP calls — keep the shared border chrome.
 */
const WRITE_OR_EXECUTE_TOOLS: ReadonlySet<string> = new Set([
	"bash",
	"write",
	"edit",
	"ast_edit",
	"memory_edit",
	"eval",
	"manage_skill",
]);

/** True when the prompt's `Allow tool: <name>` header names a write/execute tool. */
function isWriteOrExecuteApproval(prompt: string): boolean {
	const name = /^Allow tool: (\S+)\s*$/.exec(prompt.split("\n", 1)[0] ?? "")?.[1];
	return name !== undefined && WRITE_OR_EXECUTE_TOOLS.has(name);
}

/** True when the prompt's `Allow tool: <name>` header names bash. */
function isBashApproval(prompt: string): boolean {
	const name = /^Allow tool: (\S+)\s*$/.exec(prompt.split("\n", 1)[0] ?? "")?.[1];
	return name === "bash";
}

/**
 * The approval panel: identical chrome to {@link OverlayPanel}, except a
 * write/execute approval paints its border and title in the warning color — a
 * static caution frame, no animation and no timers. The inner section divider
 * keeps the default border so the frame alone carries the state, and read-only
 * approvals render exactly the shared overlay chrome.
 */
class ApprovalOverlayPanel extends OverlayPanel {
	readonly #danger: boolean;

	constructor(title: string, role: string, danger: boolean) {
		super(title, role);
		this.#danger = danger;
	}

	override render(width: number): readonly string[] {
		if (!this.#danger) return super.render(width);
		width = Number.isFinite(width) ? Math.max(0, Math.trunc(width)) : 0;
		const innerWidth = Math.max(1, width - 4);
		const childLines = this.children.map(child =>
			child instanceof PanelDivider ? NO_LINES : child.render(innerWidth),
		);
		const result: string[] = [topBorder(width, this.title, "warning")];
		for (let i = 0; i < this.children.length; i++) {
			if (this.children[i] instanceof PanelDivider) {
				result.push(divider(width));
				continue;
			}
			for (const line of childLines[i] ?? NO_LINES) result.push(row(line, width, "warning"));
		}
		result.push(bottomBorder(width, "warning"));
		if (width < 4) {
			for (let index = 0; index < result.length; index++) {
				result[index] = truncateToWidth(result[index]!, width, Ellipsis.Omit);
			}
		}
		return result;
	}
}

/** `grant<N>` takes the Nth of {@link ApprovalDialogOptions.grants}; `remember` toggles their lifetime. */
type ApprovalAnswer = "once" | "session" | "deny" | "remember" | `grant${number}`;

interface ApprovalChoice {
	readonly label: string;
	readonly answer: ApprovalAnswer;
}

interface ApprovalDialogCallbacks {
	onApprove(): void;
	onDeny(): void;
}

/** A choice that approves the call and remembers more than it: a folder, or the exact target. */
export interface ApprovalDialogGrant {
	/** Label while the grant is remembered for this session. */
	readonly label: string;
	/** Label once the remember toggle keeps it across sessions. */
	readonly alwaysLabel: string;
}

/** The composer mounted beneath the dialog: it receives every key the dialog does not own. */
export interface ApprovalDialogDraft {
	/** True while the composer holds a draft — text, attachments, or a paste still landing: keys then edit and send it. */
	hasDraft(): boolean;
	handleInput(keyData: string): void;
}

interface ApprovalDialogOptions {
	tui?: TUI;
	/** The prompt with every detail in full, which the expand key swaps in (wrapped) for the summarized one. */
	fullPrompt?: string;
	/** Deny once this many ms pass without input (any key restarts the countdown). */
	timeout?: number;
	/** Called when {@link timeout} expires, before the dialog denies. */
	onTimeout?: () => void;
	/** Called when the countdown starts, as the dialog mounts. */
	onTimeoutStart?: () => void;
	/** Called each time a key restarts the countdown. */
	onTimeoutReset?: () => void;
	/** Route typing to the composer instead of dropping it. */
	draft?: ApprovalDialogDraft;
	/** Offer to approve this and later like calls for the rest of the session, as the row between Approve and Deny. */
	session?: { label: string; onApprove(): void };
	/**
	 * Grants to offer above Approve, led by a toggle that keeps them across sessions; Approve then
	 * reads "Approve Once". `onGrant` gets the chosen grant and whether the toggle was on.
	 */
	grants?: readonly ApprovalDialogGrant[];
	onGrant?(grant: ApprovalDialogGrant, always: boolean): void;
}

/** A prompt's detail rows: every line after the title, trailing blanks dropped. */
function promptDetails(lines: string[]): string[] {
	const details = lines.slice(1);
	while (details.length > 0 && details[details.length - 1]!.trim() === "") details.pop();
	return details;
}

const ALLOWED_SEGMENT_RE = /^(\s*)✓(\s+)(.+)(\s+\((?:allowed: .*|\d+ allowed segments?)\))$/u;
const PROMPTED_SEGMENT_RE = /^(\s*)\?(\s+)(.+)(\s+\((?:requires approval|prompt: .*|critical pattern)\))$/u;
const KEY_VALUE_RE = /^(\s*)([A-Za-z0-9_.-]+:)(?:(\s+)(.*))?$/;

function styleKeyValueLine(line: string): { ansi: string; spans?: TspSpan[] } {
	const match = KEY_VALUE_RE.exec(line);
	if (!match) {
		return { ansi: line === "" ? "" : theme.fg("text", line) };
	}
	const [, indent = "", label = "", space = " ", value] = match;
	if (value !== undefined) {
		return {
			ansi: `${indent}${theme.fg("dim", label)}${space}${theme.fg("text", value)}`,
		};
	}
	return {
		ansi: `${indent}${theme.fg("dim", label)}`,
	};
}

/**
 * Indexes `[start, end)` of compound bash segment rows: the indented rows right after the first
 * `Command:` row, when that row is bare. Lines elsewhere (a multi-line command, code, file
 * content) are never styled as covered or prompted, however they read.
 */
function segmentRowRange(details: readonly string[]): readonly [number, number] {
	const label = details.findIndex(line => line.startsWith("Command:"));
	if (label < 0 || details[label] !== "Command:") return [0, 0];
	let end = label + 1;
	while (end < details.length && details[end]!.startsWith("  ")) end++;
	return [label + 1, end];
}

/** Styles each detail row: segment rows by their covered/prompted marker, bash command rows in accent, non-bash key-value rows with dim labels and text values. */
function styleApprovalDetails(details: readonly string[], isBash = false): { ansi: string; spans?: TspSpan[] }[] {
	if (isBash) {
		const [start, end] = segmentRowRange(details);
		return details.map((line, index) =>
			index >= start && index < end ? styleSegmentLine(line) : { ansi: theme.fg("accent", line) },
		);
	}
	return details.map(line => styleKeyValueLine(line));
}

function getChoiceShortcut(answer: ApprovalAnswer, hasDraftSupport: boolean): string | undefined {
	if (hasDraftSupport) return undefined;
	if (answer === "once") return "y";
	if (answer === "session") return "s";
	if (answer === "deny") return "n";
	return undefined;
}

function styleSegmentLine(line: string): { ansi: string; spans?: TspSpan[] } {
	const allowed = ALLOWED_SEGMENT_RE.exec(line);
	if (allowed) {
		const [, indent = "", space = " ", command = "", suffix = ""] = allowed;
		return {
			ansi: `${indent}${theme.fg("success", "✓")}${space}${theme.fg("dim", `${command}${suffix}`)}`,
			spans: [
				...(indent ? [span(indent)] : []),
				span("✓", "success"),
				span(space),
				span(`${command}${suffix}`, "dim"),
			],
		};
	}
	const prompted = PROMPTED_SEGMENT_RE.exec(line);
	if (prompted) {
		const [, indent = "", space = " ", command = "", suffix = ""] = prompted;
		return {
			ansi: `${indent}${theme.fg("warning", "?")}${space}${theme.bold(theme.fg("accent", command))}${theme.fg("warning", suffix)}`,
			spans: [
				...(indent ? [span(indent)] : []),
				span("?", "warning"),
				span(space),
				span(command, "accent strong"),
				span(suffix, "warning"),
			],
		};
	}
	return { ansi: theme.fg("accent", line) };
}

export class ApprovalDialogComponent implements Component {
	readonly #rawTitle: string;
	readonly #summary: readonly string[];
	readonly #full: readonly string[] | undefined;
	#expanded = false;
	readonly #panel: OverlayPanel;
	readonly #body = new PanelRows();
	readonly #choiceRows = new PanelRows();
	readonly #footer = new PanelRows();
	#scrollOffset = 0;
	#bodyRows = MAX_DETAIL_ROWS;
	/** In list order: the remember toggle and grants (when offered), Approve (highlighted on mount), the session row, Deny last. */
	#choices: readonly ApprovalChoice[];
	#choicesLanguage: Language;
	#choice = 0;
	/** The remember toggle: grants are kept across sessions while it is on. */
	#rememberAlways = false;
	#closed = false;
	#native: NativeNode | undefined;
	/** Whether a draft held the keys when {@link #native} was described: it moves the highlight. */
	#nativeDrafting = false;
	#nativeLanguage: Language | undefined;
	#remainingSeconds: number | undefined;
	readonly #armedAt = performance.now() + APPROVE_ARM_MS;
	readonly #countdown: CountdownTimer | undefined;

	/** `prompt`: the approval title on its first line, the details after it. */
	constructor(
		prompt: string,
		private readonly callbacks: ApprovalDialogCallbacks,
		private readonly options: ApprovalDialogOptions = {},
	) {
		const lines = sanitizeDisplayLines(prompt);
		const title = lines[0] ?? "";
		const lang = getLanguage();
		this.#rawTitle = title;
		this.#summary = promptDetails(lines);
		this.#full =
			options.fullPrompt === undefined ? undefined : promptDetails(sanitizeDisplayLines(options.fullPrompt));
		const [segmentStart, segmentEnd] = segmentRowRange(this.#summary);
		const firstPrompted = this.#summary
			.slice(segmentStart, segmentEnd)
			.findIndex(line => PROMPTED_SEGMENT_RE.test(line));
		if (firstPrompted >= 0 && segmentStart + firstPrompted >= MAX_DETAIL_ROWS) {
			this.#scrollOffset = segmentStart + firstPrompted - MAX_DETAIL_ROWS + 1;
		}
		this.#choicesLanguage = lang;
		this.#choices = this.#buildChoices();
		this.#choice = this.#choices.findIndex(choice => choice.answer === "once");
		this.#panel = new ApprovalOverlayPanel(
			this.#panelTitle(),
			"omp.overlay.approval",
			isWriteOrExecuteApproval(this.#rawTitle),
		);
		this.#footer.setHeight(1);
		this.#panel.addChild(this.#body);
		this.#panel.addChild(this.#choiceRows);
		this.#panel.addChild(new PanelDivider());
		this.#panel.addChild(this.#footer);
		if (options.timeout && options.timeout > 0) {
			options.onTimeoutStart?.();
			this.#countdown = new CountdownTimer(
				options.timeout,
				options.tui,
				seconds => {
					this.#remainingSeconds = seconds;
					this.#panel.title = this.#panelTitle();
				},
				() => {
					options.onTimeout?.();
					this.#finish("deny");
				},
			);
		}
	}

	#panelTitle(): string {
		const base = localizeApprovalTitle(this.#rawTitle);
		if (this.#remainingSeconds === undefined) return base;
		return `${base} (${t("approval.secondsRemaining", { seconds: String(this.#remainingSeconds) })})`;
	}

	#buildChoices(): ApprovalChoice[] {
		const grants = this.options.grants ?? [];
		const glyph = this.#rememberAlways ? theme.checkbox.checked : theme.checkbox.unchecked;
		return [
			...(grants.length > 0
				? [{ label: `${glyph} ${t("approval.rememberAlways")}`, answer: "remember" as const }]
				: []),
			...grants.map((grant, index) => ({
				label: this.#rememberAlways ? grant.alwaysLabel : grant.label,
				answer: `grant${index}` as const,
			})),
			{ label: grants.length > 0 ? t("approval.approveOnce") : t("approval.approve"), answer: "once" },
			...(this.options.session ? [{ label: this.options.session.label, answer: "session" as const }] : []),
			{ label: t("approval.deny"), answer: "deny" },
		];
	}

	/** Run a choice: the remember toggle flips the grants' lifetime in place, every other choice answers. */
	#take(answer: ApprovalAnswer): void {
		if (answer !== "remember") {
			this.#finish(answer);
			return;
		}
		this.#rememberAlways = !this.#rememberAlways;
		this.#choicesLanguage = getLanguage();
		this.#choices = this.#buildChoices();
		this.#native = undefined;
		this.options.tui?.requestRender();
	}

	invalidate(): void {
		this.#native = undefined;
		this.#panel.invalidate();
	}

	dispose(): void {
		this.#closed = true;
		this.#countdown?.dispose();
		this.#panel.dispose();
	}

	handleInput(keyData: string): void {
		if (this.#closed) return;
		this.#restartCountdown();
		if (matchesAppApprove(keyData)) {
			if (performance.now() >= this.#armedAt) this.#finish("once");
			return;
		}
		if (this.#full && matchesAppToolsExpand(keyData)) {
			this.#toggleExpanded();
			return;
		}
		const draft = this.options.draft;
		// The composer's clear key (Ctrl+C, also a cancel key) clears a draft before it denies.
		if (draft?.hasDraft() && getKeybindings().matches(keyData, "app.clear")) {
			this.#editDraft(draft, keyData);
			return;
		}
		if (matchesSelectCancel(keyData)) {
			this.#finish("deny");
			return;
		}
		if (draft?.hasDraft()) {
			this.#editDraft(draft, keyData);
			return;
		}
		if (!draft) {
			if (keyData === "y" || keyData === "Y") {
				if (performance.now() >= this.#armedAt) this.#finish("once");
				return;
			}
			if ((keyData === "s" || keyData === "S") && this.options.session) {
				if (performance.now() >= this.#armedAt) this.#finish("session");
				return;
			}
			if (keyData === "n" || keyData === "N") {
				this.#finish("deny");
				return;
			}
		}
		const page = Math.max(1, this.#bodyRows - 1);
		if (matchesSelectUp(keyData)) this.#moveChoice(-1);
		else if (matchesSelectDown(keyData)) this.#moveChoice(1);
		else if (matchesSelectPageUp(keyData)) this.#scroll(-page);
		else if (matchesSelectPageDown(keyData)) this.#scroll(page);
		else if (getKeybindings().matches(keyData, "tui.select.confirm")) {
			if (performance.now() >= this.#armedAt) this.#take(this.#choices[this.#choice]!.answer);
		}
		// Enter never reaches an empty composer: it would submit nothing, or interrupt the run.
		else if (draft && !getKeybindings().matches(keyData, "tui.input.submit")) this.#editDraft(draft, keyData);
	}

	#moveChoice(delta: number): void {
		const count = this.#choices.length;
		this.#choice = (this.#choice + delta + count) % count;
		this.#native = undefined;
		this.options.tui?.requestRender();
	}

	#editDraft(draft: ApprovalDialogDraft, keyData: string): void {
		draft.handleInput(keyData);
		this.options.tui?.requestRender();
	}

	/**
	 * Swap the summarized prompt for every detail, wrapped, or back, as the expand key does here;
	 * for hosts that intercept that key first. Restarts the countdown like any key. False (nothing
	 * changes) without a full prompt, so the host's own expand handling (tool previews) can run.
	 */
	toggleDetails(): boolean {
		if (this.#closed || !this.#full) return false;
		this.#restartCountdown();
		this.#toggleExpanded();
		return true;
	}

	/** Any user input restarts the countdown (and its described form). */
	#restartCountdown(): void {
		if (!this.#countdown) return;
		this.#countdown.reset();
		this.options.onTimeoutReset?.();
		this.#native = undefined;
	}

	#toggleExpanded(): void {
		this.#expanded = !this.#expanded;
		this.#scrollOffset = 0;
		this.#native = undefined;
		this.options.tui?.requestRender();
	}

	/** The rows on show: the summary, or every detail once expanded. */
	get #details(): readonly string[] {
		return this.#expanded && this.#full ? this.#full : this.#summary;
	}

	get #isBash(): boolean {
		return isBashApproval(this.#rawTitle);
	}

	#syncLanguageChoices(lang: Language): void {
		if (lang === this.#choicesLanguage) return;
		this.#choicesLanguage = lang;
		this.#choices = this.#buildChoices();
		this.#choice = Math.min(this.#choice, this.#choices.length - 1);
	}

	render(width: number): readonly string[] {
		const lang = getLanguage();
		this.#syncLanguageChoices(lang);
		this.#panel.title = this.#panelTitle();
		const innerWidth = Math.max(1, width - 4);
		let lines = this.#detailLines(innerWidth);
		const rows = Math.max(1, Math.min(lines.length, MAX_DETAIL_ROWS));
		const overflows = lines.length > rows;
		// Leave a column for the scrollbar once the details overflow.
		if (overflows && innerWidth > 1) lines = this.#detailLines(innerWidth - 1);
		this.#bodyRows = rows;
		this.#scrollOffset = Math.max(0, Math.min(this.#scrollOffset, lines.length - rows));
		if (overflows) {
			const view = new ScrollView(lines, {
				height: rows,
				scrollbar: "auto",
				theme: { track: s => theme.fg("muted", s), thumb: s => theme.fg("accent", s) },
			});
			view.setScrollOffset(this.#scrollOffset);
			this.#body.setLines(view.render(innerWidth));
		} else {
			this.#body.setLines(lines);
		}
		this.#body.setHeight(rows);
		const hasDraftSupport = this.options.draft !== undefined;
		const drafting = this.options.draft?.hasDraft() ?? false;
		// While a draft holds Enter the highlight sits on Deny (sending the draft denies), else on the arrows' choice.
		const shown = drafting ? this.#choices.length - 1 : this.#choice;
		this.#choiceRows.setLines(
			this.#choices.map((choice, index) => {
				const label = drafting && choice.answer === "deny" ? t("approval.denyAndSend") : choice.label;
				const shortcut = getChoiceShortcut(choice.answer, hasDraftSupport);
				const badge = shortcut ? ` [${shortcut}]` : "";
				if (index !== shown) {
					const unselected = `  ${label}${badge ? theme.fg("dim", badge) : ""}`;
					return truncateToWidth(unselected, innerWidth, Ellipsis.Unicode);
				}
				const color = choice.answer === "deny" ? "error" : "accent";
				const selectedText = `${theme.nav.cursor} ${label}${badge}`;
				const truncated = truncateToWidth(selectedText, innerWidth, Ellipsis.Unicode);
				const styled = theme.bold(theme.fg(color, truncated));
				const widthDiff = innerWidth - visibleWidth(styled);
				const padded = widthDiff > 0 ? styled + " ".repeat(widthDiff) : styled;
				return theme.bgFill("selectedBg", padded);
			}),
		);
		this.#footer.setLines([theme.fg("dim", this.#footerHint(overflows, drafting))]);
		return this.#panel.render(width);
	}

	/**
	 * In the dock, in the composer's place and framed as the composer is (an
	 * `omp.editor.*` root role), like the ask dialog, rather than a card over
	 * the transcript: the title, the details, the choices with the keyboard's
	 * highlight (a click takes one), then Details (with a full prompt), Deny,
	 * and the primary Approve, whose keys show in their tooltips.
	 */
	describe(): NativeNode {
		const lang = getLanguage();
		const drafting = this.options.draft?.hasDraft() ?? false;
		if (this.#native && this.#nativeDrafting === drafting && this.#nativeLanguage === lang) return this.#native;
		this.#syncLanguageChoices(lang);
		const cancelKey = getKeybindings().getKeys("tui.select.cancel")[0];
		const approveKey = appApproveKeys()[0];
		const deny = actionButton(t("approval.deny"), "deny", {
			...(cancelKey ? { keys: cancelKey } : {}),
			tone: "error",
			title: `${t("approval.denyBtnTitle")}${cancelKey ? `  ${formatTooltipKey(cancelKey)}` : ""}`,
		});
		const approve = actionButton(
			this.options.grants?.length ? t("approval.approveOnce") : t("approval.approve"),
			"approve",
			{
				...(approveKey ? { keys: approveKey } : {}),
				tone: "accent",
				title: `${t("approval.approveBtnTitle")}${approveKey ? `  ${formatTooltipKey(approveKey)}` : ""}`,
			},
		);
		const expandKey = appToolsExpandKey();
		const expand = this.#full
			? [
					actionButton(this.#expanded ? t("approval.less") : t("approval.details"), "expand", {
						keys: expandKey,
						title: `${t(this.#expanded ? "approval.summarizeCall" : "approval.showDetails")}  ${formatTooltipKey(expandKey)}`,
					}),
				]
			: [];
		const children: NativeNode[] = [
			node(
				"text",
				{ text: localizeApprovalTitle(this.#rawTitle), role: "omp.approval.title", tone: "accent" },
				undefined,
				"title",
			),
		];
		if (this.#details.length > 0) {
			// One clipped row per detail like the text view; expanded details wrap.
			const styledRows = styleApprovalDetails(this.#details, this.#isBash);
			const rows = this.#details.map((line, index) => {
				const styled = styledRows[index]!;
				const content = styled.spans ? { spans: styled.spans } : { text: line };
				return node("text", this.#expanded ? content : { ...content, truncate: "end" }, undefined, String(index));
			});
			children.push(node("col", { role: "omp.approval.details" }, rows, "details"));
		}
		const choices = this.#choices.map(choice =>
			item(choice.answer, {
				label: drafting && choice.answer === "deny" ? t("approval.denyAndSend") : choice.label,
				role: "omp.approval.choice",
				tone: choice.answer === "deny" ? "error" : "accent",
			}),
		);
		const selected = drafting ? "deny" : this.#choices[this.#choice]!.answer;
		children.push(node("list", { selected, role: "omp.approval.choices" }, choices, "choices"));
		// The countdown, when one runs, leads the bar like the ask dialog's.
		children.push(
			actionBar([...(this.#countdown ? [this.#countdown.describe()] : []), null, ...expand, deny, approve]),
		);
		// Under the `omp.editor.ask` prefix: Tern's console layout sizes an ask's rows to the
		// composer column by that prefix, where a bare `omp.editor.*` role spans the whole dock.
		this.#native = col(children, { role: "omp.editor.ask.approval", gap: "md" });
		this.#nativeDrafting = drafting;
		this.#nativeLanguage = lang;
		return this.#native;
	}

	/** Deny, Approve, and Details run exactly what Esc, the approve key, and the expand key run; a click on a choice takes it. */
	handleNativeEvent(event: NativeUiEvent): void {
		if (this.#closed) return;
		if (event.type === "action") {
			if (event.act === "approve") this.#finish("once");
			else if (event.act === "deny") this.#finish("deny");
			else if (event.act === "expand") this.toggleDetails();
			return;
		}
		if ((event.type !== "select" && event.type !== "activate") || leafKey(event.key) !== "choices") return;
		const choice = this.#choices.find(candidate => candidate.answer === event.item);
		if (choice) this.#take(choice.answer);
	}

	/** Detail rows at `width`: one clipped row per detail, or wrapped rows once expanded. */
	#detailLines(width: number): string[] {
		if (!this.#expanded) {
			return styleApprovalDetails(this.#details, this.#isBash).map(styled =>
				truncateToWidth(styled.ansi, width, Ellipsis.Unicode),
			);
		}
		const styledRows = styleApprovalDetails(this.#details, this.#isBash);
		return this.#details.flatMap((line, index) =>
			line === "" ? [""] : wrapTextWithAnsi(styledRows[index]!.ansi, width),
		);
	}

	#footerHint(overflows: boolean, drafting: boolean): string {
		const approve = formatKeyHints(appApproveKeys());
		const expand = this.#full
			? ` · ${formatKeyHints([appToolsExpandKey()])} ${t(this.#expanded ? "approval.lessLower" : "approval.detailsLower")}`
			: "";
		const keys = `${approve} ${t("approval.hintApprove")} · ${editorKey("tui.select.cancel")} ${t("approval.hintDeny")}${expand}`;
		if (drafting) return `${editorKey("tui.input.submit")} ${t("approval.hintDenyAndSend")} · ${keys}`;
		const choose = `${editorKeys("tui.select.up", "tui.select.down")} ${t("approval.hintChoose")} · ${editorKey("tui.select.confirm")} ${t("approval.hintSelect")}`;
		const scroll = overflows
			? ` · ${editorKeys("tui.select.pageUp", "tui.select.pageDown")} ${t("approval.hintScroll")}`
			: "";
		return `${choose} · ${keys}${scroll}${this.options.draft ? ` · ${t("approval.hintTypeToDeny")}` : ""}`;
	}

	#scroll(delta: number): void {
		this.#scrollOffset = Math.max(0, this.#scrollOffset + delta);
		this.options.tui?.requestRender();
	}

	#finish(answer: ApprovalAnswer): void {
		if (this.#closed) return;
		this.#closed = true;
		this.#countdown?.dispose();
		if (answer === "once") this.callbacks.onApprove();
		else if (answer === "session") this.options.session?.onApprove();
		else if (answer.startsWith("grant")) {
			const grant = this.options.grants?.[Number(answer.slice("grant".length))];
			if (grant) this.options.onGrant?.(grant, this.#rememberAlways);
			else this.callbacks.onDeny();
		} else this.callbacks.onDeny();
	}
}
