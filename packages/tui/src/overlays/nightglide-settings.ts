/**
 * Nightglide: the graphical `/settings` page (S4).
 *
 * A Glide-styled fullscreen page that replaces the old "常用" tab: seven
 * categories (外观 / 模型 / 审批 / 通知 / 会话 / 语言 / 高级设置) in a left rail, the
 * focused category's controls on the right, and a bilingual key-hint footer.
 * Under 100 columns the two columns collapse into one: pick a category, Enter
 * opens it, Esc returns. Every control edits an existing setting through the
 * same `SettingsHost` the tabbed page uses — `set` + `onChange` on the spot, so
 * Esc never reverts a saved value. Themes preview through `onThemePreview`
 * (hover) and commit through the `theme.dark`/`theme.light` effects, exactly
 * like the upstream theme submenu. "高级设置" is an entry, not a page: it embeds
 * the upstream `SettingsSelectorComponent`, and Esc there returns here instead
 * of closing the overlay.
 *
 * Colors come from the active theme's slots; the ASCII symbol preset swaps
 * every control glyph (●/○ → [x]/[ ], ▰/▱ → =/-, box borders), and `NO_COLOR`
 * renders the page monochrome with text markers standing in for highlights
 * (`*current*`, the ❯/> cursor). All widths go through `visibleWidth` /
 * `truncateToWidth`, so CJK labels count double-wide.
 */
import { effortLadderToken } from "../chat/effort-ladder";
import { formTheme } from "../chrome/form-theme";
import { editorKey } from "../chrome/keybinding-hints";
import {
	bottomBorder,
	divider,
	dividerSplit,
	row,
	splitBodyWidth,
	splitRow,
	topBorder,
	topBorderSplit,
} from "../chrome/overlay-box";
import { TextFormField } from "../components/form";
import { type PixelEncoder, renderPixelScene } from "../components/nightglide-pixel-scene";
import { renderNightglideRobot } from "../components/nightglide-robot";
import { familyFor, onBg, sceneCellPixels } from "../components/nightglide-shell";
import { getLanguage, onLanguageChange, setLanguage, t, type TextKey } from "../i18n";
import { formatKeyHints, type KeyName } from "../key-hint-format";
import { getKeybindings } from "../keybindings";
import { matchesKey } from "../keys";
import { routeSgrMouseInput, type SgrMouseEvent } from "../mouse";
import type { DescribeContext, NativeNode, NativeUiEvent } from "../native/node";
import { padToWidth } from "../render/utils";
import { SettingsSelectorComponent } from "./settings-selector";
import type { SettingsCallbacks, SettingsRuntimeContext } from "./settings-selector";
import { bgAnsi, fgAnsi } from "../theme/color";
import type { ThemeColor } from "../theme/schema";
import {
	detectTerminalBackground,
	getCurrentThemeName,
	getThemeByName,
	getThemeEpoch,
	isLightTheme,
	theme,
} from "../theme/theme";
import type { Component } from "../tui";
import { Ellipsis, getSegmenter, stripTerminalSequences, truncateToWidth, visibleWidth } from "../utils";
import { getComposerShapeOptions } from "./composer-shape-registry";

/** SGR parameters that set a color (dropped under NO_COLOR); attributes stay. */
function isColorParam(code: number): boolean {
	return (
		(code >= 30 && code <= 39) ||
		(code >= 40 && code <= 49) ||
		(code >= 90 && code <= 97) ||
		(code >= 100 && code <= 107)
	);
}

/** Drop color escapes from one rendered line, keeping attributes like bold. */
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
					// Extended color: 38;5;n or 38;2;r;g;b.
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

/** Entry buttons on the Model page; the controller closes the page, then opens each flow. */
export type NightglideSettingsAction = "login" | "provider" | "model";

/** Runtime facts the Model page's read-only card shows, on top of the selector's context. */
export interface NightglideSettingsContext extends SettingsRuntimeContext {
	/** Label of the model currently answering (`name`, else id); undefined when none. */
	modelLabel?: string;
	/** Provider of the current model. */
	modelProvider?: string;
	/** The effective thinking word (`high`, `off`, `auto` while unresolved), like the status line's. */
	effortWord?: string;
	/** True while an `auto` effort has not resolved for the current model yet. */
	effortAutoPending?: boolean;
}

export interface NightglideSettingsCallbacks extends SettingsCallbacks {
	/** Entry button pressed: close the settings page, then run the command's flow. */
	onAction?: (action: NightglideSettingsAction) => void;
}

/** Constructor options beyond the context/callbacks. */
export interface NightglideSettingsOptions {
	/** Terminal rows the frame fills; default `process.stdout.rows || 40`. */
	rows?: () => number;
	/** Render without color (test seam); default reads `NO_COLOR`. */
	plain?: boolean;
}

// ────────────────────────────────────────────────────────────────────────────
// Categories, rows, cards
// ────────────────────────────────────────────────────────────────────────────

type CategoryId = "appearance" | "model" | "approval" | "notify" | "session" | "language" | "advanced";

/** The settings page's categories, in rail order. */
export const CATEGORIES: readonly CategoryId[] = [
	"appearance",
	"model",
	"approval",
	"notify",
	"session",
	"language",
	"advanced",
];

const CATEGORY_LABEL: Record<CategoryId, TextKey> = {
	appearance: "set.cat.appearance",
	model: "set.cat.model",
	approval: "set.cat.approval",
	notify: "set.cat.notify",
	session: "set.cat.session",
	language: "set.cat.language",
	advanced: "set.cat.advanced",
};

/** One choice of a segmented control or level bar. */
interface SegmentOption {
	value: string;
	label: string;
	desc?: string;
}

/** How a toggle stores its value in the settings file. */
type ToggleStorage = "boolean" | "onoff";

interface ToggleRow {
	kind: "toggle";
	path: string;
	label: TextKey;
	desc?: TextKey;
	storage: ToggleStorage;
}

interface SegmentRow {
	kind: "segment";
	path: string;
	label: TextKey;
	desc?: TextKey;
	options: () => readonly SegmentOption[];
	preview?: (value: string, plain: boolean, ascii: boolean) => readonly string[];
}

interface LevelRow {
	kind: "level";
	path: string;
	label: TextKey;
	desc?: TextKey;
	levels: () => readonly string[];
}

interface TextRow {
	kind: "text";
	path: string;
	label: TextKey;
	desc?: TextKey;
}

interface ThemeRow {
	kind: "theme";
	path: "theme.dark" | "theme.light";
	label: TextKey;
	desc?: TextKey;
}

interface ApprovalRow {
	kind: "approval";
	path: string;
	label: TextKey;
}

interface ModelInfoRow {
	kind: "modelInfo";
}

interface ActionsRow {
	kind: "actions";
	buttons: readonly { action: NightglideSettingsAction; label: TextKey; desc: TextKey }[];
}

interface AdvancedEntryRow {
	kind: "advanced";
}

type SettingRow =
	| ToggleRow
	| SegmentRow
	| LevelRow
	| TextRow
	| ThemeRow
	| ApprovalRow
	| ModelInfoRow
	| ActionsRow
	| AdvancedEntryRow;

/** The setting path a row edits, if any. */
function rowPath(row: SettingRow): string | undefined {
	return "path" in row ? row.path : undefined;
}

/** The row's label key, if it has one. */
function rowLabel(row: SettingRow): TextKey | undefined {
	return "label" in row ? row.label : undefined;
}

/** One card of a theme or approval control. */
interface CardSpec {
	title: string;
	/** Body lines below the title (plain text; wrapped by the card renderer). */
	body: readonly string[];
	/** Scene preview lines (theme cards only), padded to the card's inner width. */
	scene?: readonly string[];
	/** Swatch hexes (theme cards only). */
	swatches?: readonly string[];
	/** Whether the card is the setting's current value. */
	current: boolean;
	/** Dim marker appended to the title (e.g. the default tier). */
	marker?: string;
}

/** A clickable region of the last rendered frame, in content-local coordinates. */
type HitTarget =
	| { kind: "row"; row: number }
	| { kind: "toggle"; row: number }
	| { kind: "option"; row: number; index: number }
	| { kind: "card"; row: number; index: number }
	| { kind: "button"; row: number; index: number }
	| { kind: "cat"; index: number };

interface Hit {
	/** Content-local line of the region. */
	line: number;
	/** Content-local column range [from, to). */
	from: number;
	to: number;
	target: HitTarget;
}

/** Mouse geometry of the last rendered frame (the frame paints from screen row 0). */
interface FrameGeometry {
	/** Frame row of content line 0. */
	contentStart: number;
	/** Frame column of content column 0. */
	bodyCol: number;
	/** Sidebar frame-column range, wide layout only. */
	sidebar?: { from: number; to: number; cats: number[] };
	hits: readonly Hit[];
	/** Content-local line range of each visible row (windowed coordinates). */
	spans: readonly (readonly [number, number] | undefined)[];
	/** Rows in the window [first, last). */
	visibleRows: readonly [number, number];
}

interface RenderedRows {
	lines: string[];
	hits: Hit[];
	spans: (readonly [number, number] | undefined)[];
	visibleRows: readonly [number, number];
}

/** Thinking-level words that carry a translated label. */
const EFFORT_LABEL: Record<string, TextKey> = {
	auto: "common.effort.auto",
	minimal: "common.effort.minimal",
	low: "common.effort.low",
	medium: "common.effort.medium",
	high: "common.effort.high",
	xhigh: "common.effort.xhigh",
	max: "common.effort.max",
	off: "common.effort.off",
};

function effortLabel(level: string): string {
	const key = EFFORT_LABEL[level];
	return key ? t(key) : level;
}

/** The three approval tiers, in display order (values are `tools.approvalMode`'s). */
const APPROVAL_TIERS = [
	{
		value: "always-ask",
		label: "common.approval.alwaysAsk",
		runs: "set.approval.alwaysAsk.runs",
		asks: "set.approval.alwaysAsk.asks",
	},
	{
		value: "write",
		label: "common.approval.write",
		runs: "set.approval.write.runs",
		asks: "set.approval.write.asks",
		marker: "set.default",
	},
	{ value: "yolo", label: "common.approval.yolo", runs: "set.approval.yolo.runs", asks: "set.approval.yolo.asks" },
] as const;

function motionOptions(): SegmentOption[] {
	return [
		{ value: "full", label: t("common.motion.full"), desc: t("common.motion.fullDesc") },
		{ value: "reduced", label: t("common.motion.reduced"), desc: t("common.motion.reducedDesc") },
		{ value: "none", label: t("common.motion.none"), desc: t("common.motion.noneDesc") },
	];
}

function symbolOptions(): SegmentOption[] {
	return [
		{ value: "unicode", label: "Unicode", desc: t("common.symbols.unicodeDesc") },
		{ value: "nerd", label: "Nerd Font", desc: t("common.symbols.nerdDesc") },
		{ value: "ascii", label: "ASCII", desc: t("common.symbols.asciiDesc") },
	];
}

function routingOptions(): SegmentOption[] {
	return (["manual", "local", "balanced", "performance"] as const).map(value => ({
		value,
		label: t(`common.routing.${value}` as TextKey),
		desc: t(`common.routing.${value}Desc` as TextKey),
	}));
}

/** Each language names itself, so either can be found from the other. */
function languageOptions(): SegmentOption[] {
	return [
		{ value: "zh", label: "中文" },
		{ value: "en", label: "English" },
		{ value: "auto", label: t("common.language.auto"), desc: t("common.language.autoDesc") },
	];
}

function composerOptions(): SegmentOption[] {
	return getComposerShapeOptions().map(option => ({
		value: option.value,
		label: option.label,
		desc: option.description,
	}));
}

function robotStyleOptions(): SegmentOption[] {
	return (["auto", "glider", "cat", "owl", "diver", "prism"] as const).map(value => ({
		value,
		label: t(`common.robotStyle.${value}` as TextKey),
		desc: t(`common.robotStyle.${value}Desc` as TextKey),
	}));
}

/** A setting's value as display text (undefined becomes ""). */
function textValue(value: unknown): string {
	if (value === undefined || value === null) return "";
	return String(value);
}

/** Wrap plain text to `width` cells, breaking anywhere (CJK labels have no spaces). */
function wrapCells(text: string, width: number): string[] {
	if (width <= 0) return [""];
	const lines: string[] = [];
	let line = "";
	let lineW = 0;
	for (const part of getSegmenter().segment(text)) {
		const grapheme = part.segment;
		const w = visibleWidth(grapheme);
		if (lineW + w > width && lineW > 0) {
			lines.push(line);
			line = "";
			lineW = 0;
		}
		if (w > width) {
			lines.push(truncateToWidth(grapheme, width, Ellipsis.Omit));
			continue;
		}
		line += grapheme;
		lineW += w;
	}
	lines.push(line);
	return lines;
}

/** Short display name: `nightglide-flight` → `Flight`, `nightglide-abyss-trench` → `Abyss Trench`; custom themes keep their name. */
function displayName(name: string): string {
	if (!name.startsWith("nightglide-")) return name.charAt(0).toUpperCase() + name.slice(1);
	const short = name.slice("nightglide-".length);
	return short
		.split("-")
		.map(part => part.charAt(0).toUpperCase() + part.slice(1))
		.join(" ");
}

/** Card grid for `count` cards on `width`: cards per line and each card's width. */
function cardGrid(width: number, count: number): { perLine: number; cw: number } {
	const byWidth = Math.max(1, Math.floor((width + CARD_GAP) / (MIN_CARD_WIDTH + CARD_GAP)));
	const perLine = Math.max(1, Math.min(count, byWidth));
	const cw = Math.min(
		MAX_CARD_WIDTH,
		Math.min(width, Math.max(MIN_CARD_WIDTH, Math.floor((width - (perLine - 1) * CARD_GAP) / perLine))),
	);
	return { perLine, cw };
}

/** Column where the wide layout's split puts the body content. */
function bodyColumn(sidebarWidth: number): number {
	return sidebarWidth + 5;
}

/** The wide layout kicks in at this many columns (plan: category rail + controls). */
const WIDE_MIN_COLUMNS = 100;
/** Scene rows on a theme card. */
const CARD_SCENE_ROWS = 3;
/** Narrowest usable card. */
const MIN_CARD_WIDTH = 15;
/** Widest useful card: few cards never stretch one across the whole column. */
const MAX_CARD_WIDTH = 34;
/** Gap between cards on one line. */
const CARD_GAP = 2;

/**
 * The graphical Nightglide settings page.
 */
export class NightglideSettingsComponent implements Component {
	readonly #context: NightglideSettingsContext;
	readonly #callbacks: NightglideSettingsCallbacks;
	readonly #rowsProvider: () => number;
	readonly #plain: boolean;
	readonly #stopLanguageListener: () => void;

	#category: CategoryId = "appearance";
	/** Wide layout: which column holds ↑↓. Narrow: the cats list or category content. */
	#focus: "sidebar" | "content" = "content";
	/** Narrow starts on the category list; Enter opens, Esc returns. */
	#pane: "cats" | "content" = "cats";
	/** Set at the start of each render: this frame is the single-column layout. */
	#narrow: boolean | undefined;
	/** Focused row within the category (never the read-only model card). */
	#cursor = 0;
	/** Focused card / button within the focused row. */
	#colCursor = 0;
	/** First visible row of the scrolled window. */
	#scrollRow = 0;
	/** Bumped on every state change, so the render memo retires. */
	#version = 0;
	#editor: TextFormField | undefined;
	#advanced: SettingsSelectorComponent | undefined;
	#advancedOpen = false;
	/** Theme card data, filled as `getThemeByName` resolves. */
	readonly #themeLight = new Map<string, boolean>();
	readonly #themeSwatches = new Map<string, string[]>();
	/** Theme whose preview a hover is holding (undefined: none). */
	#hoveredTheme: string | undefined;
	/** Mouse geometry of the last rendered frame. */
	#geo: FrameGeometry | undefined;
	#lastFrame: { width: number; height: number; contentRows: number } | undefined;
	#memo: { key: string; lines: readonly string[] } | undefined;

	constructor(
		context: NightglideSettingsContext,
		callbacks: NightglideSettingsCallbacks,
		options?: NightglideSettingsOptions,
	) {
		this.#context = context;
		this.#callbacks = callbacks;
		this.#rowsProvider = options?.rows ?? (() => process.stdout.rows || 40);
		const rawNoColor = Bun.env.NO_COLOR;
		this.#plain = options?.plain ?? (rawNoColor !== undefined && rawNoColor !== "");
		this.#stopLanguageListener = onLanguageChange(() => {
			// A language change made anywhere (this page or the advanced tabs) relabels here.
			this.#version++;
			this.#requestRender();
		});
		// Start with the cursor on the first focusable row, holding the current
		// value's card (the model page's read-only card is never focused).
		const initialRows = this.#rows(this.#category);
		this.#cursor = this.#focusableIndexes(initialRows)[0] ?? 0;
		this.#colCursor = this.#defaultCard(this.#cursor);
		// Card palettes load asynchronously; the page re-renders once they land.
		for (const name of context.availableThemes) {
			void getThemeByName(name).then(instance => {
				if (!instance) return;
				this.#themeLight.set(name, instance.isLight);
				const hex = (pick: () => string) => {
					try {
						return pick();
					} catch {
						return "";
					}
				};
				this.#themeSwatches.set(name, [
					hex(() => instance.getBgHex("statusLineBg")),
					hex(() => instance.getColorHex("accent")),
					hex(() => instance.getColorHex("mdLink")),
					hex(() => instance.getColorHex("mdHeading")),
					hex(() => instance.getColorHex("success")),
				]);
				this.#version++;
				this.#requestRender();
			});
		}
	}

	// ────────────────────────────────────────────────────────────────────────
	// Component surface
	// ────────────────────────────────────────────────────────────────────────

	debugId = "nightglide-settings";

	debugState(): Record<string, unknown> {
		return {
			category: this.#category,
			focus: this.#focus,
			pane: this.#pane,
			cursor: this.#cursor,
			card: this.#colCursor,
			scrollRow: this.#scrollRow,
			editor: this.#editor !== undefined,
			advanced: this.#advancedOpen,
			frame: this.#lastFrame,
			visibleRows: this.#geo?.visibleRows,
			focusedSpan: this.#geo?.spans[this.#cursor],
		};
	}

	invalidate(): void {
		this.#memo = undefined;
		this.#advanced?.invalidate();
	}

	dispose(): void {
		this.#restoreThemePreview();
		this.#stopLanguageListener();
	}

	/** The embedded upstream page keeps its native prefs sheet while it is up. */
	describe(cx: DescribeContext): NativeNode | null {
		return this.#advancedOpen && this.#advanced ? this.#advanced.describe(cx) : null;
	}

	nativeSheet(cx: DescribeContext): boolean {
		return this.#advancedOpen && this.#advanced ? this.#advanced.nativeSheet(cx) : false;
	}

	handleNativeEvent(event: NativeUiEvent): void {
		if (this.#advancedOpen && this.#advanced) this.#advanced.handleNativeEvent(event);
	}

	render(width: number): readonly string[] {
		if (this.#advancedOpen && this.#advanced) return this.#advanced.render(width);
		const height = Math.max(14, this.#rowsProvider());
		const key = this.#memoKey(width, height);
		if (this.#memo?.key === key) return this.#memo.lines;
		const lines = this.#renderFrame(width, height);
		this.#memo = { key, lines };
		return lines;
	}

	// ────────────────────────────────────────────────────────────────────────
	// Styling helpers
	// ────────────────────────────────────────────────────────────────────────

	#requestRender(): void {
		this.#context.requestRender?.();
	}

	get ascii(): boolean {
		return theme.getSymbolPreset() === "ascii";
	}

	/** Separator between footer hints and inline tails. */
	#sep(): string {
		return this.ascii ? " - " : " · ";
	}

	#c(slot: ThemeColor, text: string): string {
		return this.#plain ? text : theme.fg(slot, text);
	}

	/** Selected-row band; plain mode falls back to the cursor glyph alone. */
	#band(text: string): string {
		return this.#plain ? text : theme.bgFill("selectedBg", text);
	}

	#bold(text: string): string {
		return this.#plain ? text : theme.bold(text);
	}

	#memoKey(width: number, height: number): string {
		const values = this.#rows(this.#category)
			.map(rowPath)
			.filter((path): path is string => path !== undefined)
			.map(path => `${path}=${textValue(this.#context.settings.get(path))}`)
			.join(",");
		return [
			width,
			height,
			this.#version,
			getLanguage(),
			getThemeEpoch(),
			theme.getSymbolPreset(),
			this.#themeSwatches.size,
			this.#context.availableThemes.length,
			values,
		].join("|");
	}

	// ────────────────────────────────────────────────────────────────────────
	// Row model
	// ────────────────────────────────────────────────────────────────────────

	#rows(category: CategoryId): SettingRow[] {
		switch (category) {
			case "appearance":
				return [
					{ kind: "theme", path: "theme.dark", label: "common.themeDark", desc: "common.themeDark.desc" },
					{ kind: "theme", path: "theme.light", label: "common.themeLight", desc: "common.themeLight.desc" },
					{
						kind: "segment",
						path: "tui.motion",
						label: "common.motion",
						desc: "common.motion.desc",
						options: motionOptions,
					},
					{
						kind: "segment",
						path: "symbolPreset",
						label: "common.symbols",
						desc: "common.symbols.desc",
						options: symbolOptions,
					},
					{
						kind: "segment",
						path: "composer.shape",
						label: "common.composer",
						desc: "common.composer.desc",
						options: composerOptions,
					},
					{
						kind: "segment",
						path: "nightglide.robotStyle",
						label: "common.robotStyle",
						desc: "common.robotStyle.desc",
						options: robotStyleOptions,
						preview: (value, plain, ascii) => {
							const active = getCurrentThemeName();
							const fam = familyFor(active);
							const mode = theme.getColorMode();
							const light = active ? isLightTheme(active) : false;
							const sprite = renderNightglideRobot({
								kind: fam.kind,
								style: value || "auto",
								light,
								state: "idle",
								motion: false,
								colorMode: mode,
								cellPixels: ascii ? 1 : plain ? 2 : sceneCellPixels(),
								plain,
								ascii,
								pageBg: fam.scene.page,
							});
							return sprite.map(line => (plain ? stripTerminalSequences(line) : line));
						},
					},
				];
			case "model":
				return [
					{ kind: "modelInfo" },
					{
						kind: "level",
						path: "defaultThinkingLevel",
						label: "common.effort",
						desc: "common.effort.desc",
						levels: () => ["auto", ...this.#context.availableThinkingLevels],
					},
					{
						kind: "segment",
						path: "nightglide.routingMode",
						label: "common.routing",
						desc: "common.routing.desc",
						options: routingOptions,
					},
					{
						kind: "text",
						path: "nightglide.localModel",
						label: "common.localModel",
						desc: "common.localModel.desc",
					},
					{
						kind: "toggle",
						path: "hideThinkingBlock",
						label: "common.hideThinking",
						desc: "common.hideThinking.desc",
						storage: "boolean",
					},
					{
						kind: "actions",
						buttons: [
							{ action: "login", label: "set.action.login", desc: "cmd.login" },
							{ action: "provider", label: "set.action.provider", desc: "cmd.provider" },
							{ action: "model", label: "set.action.model", desc: "cmd.model" },
						],
					},
				];
			case "approval":
				return [{ kind: "approval", path: "tools.approvalMode", label: "common.approval" }];
			case "notify":
				return [
					{
						kind: "toggle",
						path: "completion.notify",
						label: "common.notifyDone",
						desc: "common.notifyDone.desc",
						storage: "onoff",
					},
					{
						kind: "toggle",
						path: "ask.notify",
						label: "common.notifyAsk",
						desc: "common.notifyAsk.desc",
						storage: "onoff",
					},
					{
						kind: "toggle",
						path: "error.notify",
						label: "common.notifyError",
						desc: "common.notifyError.desc",
						storage: "onoff",
					},
				];
			case "session":
				return [
					{
						kind: "toggle",
						path: "autoResume",
						label: "set.session.autoResume",
						desc: "set.session.autoResume.desc",
						storage: "boolean",
					},
					{
						kind: "toggle",
						path: "compaction.enabled",
						label: "set.session.compaction",
						desc: "set.session.compaction.desc",
						storage: "boolean",
					},
					{
						kind: "toggle",
						path: "retry.enabled",
						label: "set.session.retry",
						desc: "set.session.retry.desc",
						storage: "boolean",
					},
					{
						kind: "toggle",
						path: "display.showTokenUsage",
						label: "set.session.tokenUsage",
						desc: "set.session.tokenUsage.desc",
						storage: "boolean",
					},
					{
						kind: "toggle",
						path: "display.showTurnTime",
						label: "set.session.turnTime",
						desc: "set.session.turnTime.desc",
						storage: "boolean",
					},
				];
			case "language":
				return [
					{
						kind: "segment",
						path: "nightglide.language",
						label: "common.language",
						desc: "common.language.desc",
						options: languageOptions,
					},
				];
			case "advanced":
				return [{ kind: "advanced" }];
		}
	}

	/** Row indexes the ↑↓ cursor can land on (the read-only model card cannot). */
	#focusableIndexes(rows: readonly SettingRow[]): number[] {
		const indexes: number[] = [];
		for (let i = 0; i < rows.length; i++) if (rows[i]!.kind !== "modelInfo") indexes.push(i);
		return indexes;
	}

	#isLight(name: string): boolean {
		const cached = this.#themeLight.get(name);
		if (cached !== undefined) return cached;
		const light = isLightTheme(name);
		this.#themeLight.set(name, light);
		return light;
	}

	/** Theme names one theme row shows, in card order. */
	#themesFor(row: ThemeRow): string[] {
		const wantLight = row.path === "theme.light";
		return this.#context.availableThemes.filter(name => this.#isLight(name) === wantLight);
	}

	// ────────────────────────────────────────────────────────────────────────
	// Value plumbing (改即保存: set + onChange on the spot)
	// ────────────────────────────────────────────────────────────────────────

	#toggleValue(row: ToggleRow): boolean {
		const value = this.#context.settings.get(row.path);
		return row.storage === "boolean" ? value === true : value !== "off";
	}

	#save(path: string, value: unknown): void {
		this.#context.settings.set(path, value);
		this.#callbacks.onChange(path, value);
		// The host's effect chain applies the language too; tests have no host
		// effects, so apply it directly like the tabbed page's own wrapper.
		if (path === "nightglide.language") setLanguage(String(value));
		this.#version++;
		this.#requestRender();
	}

	#applyToggle(row: ToggleRow): void {
		const on = !this.#toggleValue(row);
		this.#save(row.path, row.storage === "boolean" ? on : on ? "on" : "off");
	}

	#applyTheme(row: ThemeRow, name: string): void {
		// End any hover preview first: the saved slot applies through the theme
		// effects when it is the slot matching the terminal background, exactly
		// like the upstream submenu's commit; a commit to the other background's
		// slot takes effect when the terminal switches, so the active look never
		// sticks to a previewed theme.
		this.#restoreThemePreview();
		this.#save(row.path, name);
	}

	/** The theme the current terminal background actually uses, as saved. */
	#savedActiveTheme(): string {
		const path = detectTerminalBackground() === "light" ? "theme.light" : "theme.dark";
		return textValue(this.#context.settings.get(path));
	}

	#restoreThemePreview(): void {
		if (this.#hoveredTheme === undefined) return;
		this.#hoveredTheme = undefined;
		void this.#callbacks.onThemePreview?.(this.#savedActiveTheme());
	}

	/** Hovering a theme card previews it; any other pointer position restores the saved one. */
	#hoverTheme(name: string | undefined): void {
		if (name === this.#hoveredTheme) return;
		this.#hoveredTheme = name;
		void this.#callbacks.onThemePreview?.(name === undefined ? this.#savedActiveTheme() : name);
	}

	// ────────────────────────────────────────────────────────────────────────
	// Frame rendering
	// ────────────────────────────────────────────────────────────────────────

	#renderFrame(width: number, height: number): readonly string[] {
		const wide = width >= WIDE_MIN_COLUMNS;
		this.#narrow = !wide;
		const categories = CATEGORIES.map(id => t(CATEGORY_LABEL[id]));
		const labelWidth = Math.max(0, ...categories.map(label => visibleWidth(label)));
		const sidebarW = Math.max(14, Math.min(20, labelWidth + 4));
		const lines: string[] = [];
		const title = this.#pageTitle(wide);
		if (wide) lines.push(topBorderSplit(width, title, sidebarW));
		else lines.push(topBorder(width, title));

		const contentRows = height - 4;
		const contentW = wide ? splitBodyWidth(width, sidebarW) : Math.max(1, width - 4);
		const sidebar = this.#renderSidebar(categories, contentRows, wide, sidebarW);
		const content = this.#renderContent(contentW, contentRows);
		// The footer reads the geometry of THIS frame (visible rows, scroll), so
		// publish it before the footer line is built.
		this.#geo = {
			contentStart: 1,
			bodyCol: wide ? bodyColumn(sidebarW) : 2,
			sidebar: wide ? { from: 2, to: 2 + sidebarW, cats: sidebar.cats } : undefined,
			hits: content.hits,
			spans: content.spans,
			visibleRows: content.visibleRows,
		};
		this.#lastFrame = { width, height, contentRows };
		for (let i = 0; i < contentRows; i++) {
			const body = content.lines[i] ?? "";
			if (wide) lines.push(splitRow(sidebar.lines[i] ?? "", body, width, sidebarW));
			else lines.push(row(body, width));
		}
		if (wide) lines.push(dividerSplit(width, sidebarW));
		else lines.push(divider(width));
		lines.push(row(this.#footer(wide), width));
		lines.push(bottomBorder(width));
		// NO_COLOR drops every color escape. Otherwise the whole frame carries the
		// theme family's page background, so the page reads the same on any
		// terminal background — the same treatment the Glide shell gives every cell.
		if (this.#plain) return lines.map(stripColorCodes);
		const page = bgAnsi(familyFor(getCurrentThemeName()).scene.page, theme.getColorMode());
		return lines.map(line => onBg(line, width, page));
	}

	#pageTitle(wide: boolean): string {
		const title = t("set.title");
		if (wide || this.#pane === "cats") return title;
		return `${title} ${this.#c("dim", theme.symbol("nav.cursor"))} ${t(CATEGORY_LABEL[this.#category])}`;
	}

	/** The sidebar rail (wide); the narrow layout keeps the category list in the content column. */
	#renderSidebar(
		categories: readonly string[],
		contentRows: number,
		wide: boolean,
		sidebarW: number,
	): { lines: string[]; cats: number[] } {
		if (!wide) return { lines: [], cats: [] };
		const lines: string[] = [""];
		const cats: number[] = [-1];
		for (let i = 0; i < categories.length; i++) {
			const current = CATEGORIES[i] === this.#category;
			const focused = current && this.#focus === "sidebar";
			const cursor = focused ? `${this.#c("accent", theme.symbol("nav.cursor"))} ` : "  ";
			const label = this.#c(current ? "accent" : "dim", categories[i]!);
			const line = `${cursor}${label}`;
			lines.push(current ? this.#band(padToWidth(line, sidebarW)) : line);
			cats.push(i);
		}
		while (lines.length < contentRows) {
			lines.push("");
			cats.push(-1);
		}
		return { lines: lines.slice(0, contentRows), cats: cats.slice(0, contentRows) };
	}

	/**
	 * The content column: the category's rows windowed by whole rows (a control
	 * is never cut in half), or the open text editor, or the narrow category list.
	 * The window follows the focused row: it never scrolls past the cursor, and
	 * re-windows from the cursor when the row fell below it.
	 */
	#renderContent(width: number, contentRows: number): RenderedRows {
		if (this.#narrow && this.#pane === "cats") return this.#renderCategoryList(width, contentRows);
		if (this.#editor) return this.#renderEditor(width, contentRows);
		const rows = this.#rows(this.#category);
		// The read-only model card never holds the cursor; normalize it away.
		if (rows[this.#cursor]?.kind === "modelInfo") {
			this.#cursor = this.#focusableIndexes(rows)[0] ?? 0;
			this.#colCursor = this.#defaultCard(this.#cursor);
		}
		const labelW = Math.max(8, ...rows.map(r => (rowLabel(r) ? visibleWidth(t(rowLabel(r)!)) : 0)));
		const built = rows.map((r, index) => this.#renderRow(r, index, width, labelW));
		const windowFrom = (scroll: number): RenderedRows => {
			const spans: (readonly [number, number] | undefined)[] = Array.from({ length: rows.length }, () => undefined);
			const windowed: string[] = [];
			const windowedHits: Hit[] = [];
			let last = rows.length;
			for (let i = 0; i < rows.length; i++) {
				const rowLines = built[i]!.lines;
				if (i < scroll) continue;
				if (windowed.length + rowLines.length > contentRows) {
					last = i;
					break;
				}
				const offset = windowed.length;
				windowed.push(...rowLines);
				for (const hit of built[i]!.hits) windowedHits.push({ ...hit, line: offset + hit.line });
				spans[i] = [offset, offset + rowLines.length];
			}
			while (windowed.length < contentRows) windowed.push("");
			return { lines: windowed, hits: windowedHits, spans, visibleRows: [scroll, last] };
		};
		if (this.#scrollRow > this.#cursor) this.#scrollRow = this.#cursor;
		let out = windowFrom(this.#scrollRow);
		if (this.#cursor < rows.length && out.spans[this.#cursor] === undefined) {
			this.#scrollRow = this.#cursor;
			out = windowFrom(this.#scrollRow);
		}
		return out;
	}

	/** The narrow layout's category menu. */
	#renderCategoryList(width: number, contentRows: number): RenderedRows {
		const categories = CATEGORIES.map(id => t(CATEGORY_LABEL[id]));
		const lines: string[] = [];
		const hits: Hit[] = [];
		const spans: (readonly [number, number] | undefined)[] = [];
		for (let i = 0; i < categories.length && lines.length < contentRows; i++) {
			const current = CATEGORIES[i] === this.#category;
			const cursor = current ? `${theme.symbol("nav.cursor")} ` : "  ";
			const label = this.#c(current ? "accent" : "dim", categories[i]!);
			const line = `${cursor}${label}`;
			const offset = lines.length;
			lines.push(current ? this.#band(padToWidth(line, width)) : padToWidth(line, width));
			spans.push([offset, offset + 1]);
			hits.push({ line: offset, from: 0, to: width, target: { kind: "cat", index: i } });
		}
		while (lines.length < contentRows) lines.push("");
		return { lines, hits, spans, visibleRows: [0, categories.length] };
	}

	/** The open text field fills the content column. */
	#renderEditor(width: number, contentRows: number): RenderedRows {
		const lines: string[] = this.#editor!.render(width).slice(0, contentRows);
		while (lines.length < contentRows) lines.push("");
		return { lines, hits: [], spans: [], visibleRows: [0, 0] };
	}

	// ────────────────────────────────────────────────────────────────────────
	// Row renderers
	// ────────────────────────────────────────────────────────────────────────

	#renderRow(row: SettingRow, index: number, width: number, labelW: number): { lines: string[]; hits: Hit[] } {
		switch (row.kind) {
			case "toggle":
				return this.#renderToggle(row, index, width, labelW);
			case "segment":
				return this.#renderSegmentRow(row, index, width, labelW);
			case "level":
				return this.#renderLevel(row, index, width, labelW);
			case "text":
				return this.#renderText(row, index, width, labelW);
			case "theme":
				return this.#renderTheme(row, index, width);
			case "approval":
				return this.#renderApproval(row, index, width);
			case "modelInfo":
				return this.#renderModelInfo(width);
			case "actions":
				return this.#renderActions(row, index, width, labelW);
			case "advanced":
				return this.#renderAdvanced(index, width, labelW);
		}
	}

	/** `❯ label …`, the shared shape of a one-line control's first row. */
	#labelLine(label: string, labelW: number, focused: boolean): string {
		const cursor = focused ? `${this.#c("accent", theme.symbol("nav.cursor"))} ` : "  ";
		const text = focused
			? this.#bold(this.#c("accent", padToWidth(label, labelW)))
			: this.#c("text", padToWidth(label, labelW));
		return `${cursor}${text}`;
	}

	/** Focused-row band with full-width padding. */
	#paintRow(line: string, width: number, focused: boolean): string {
		const padded = padToWidth(truncateToWidth(line, width), width);
		return focused ? this.#band(padded) : padded;
	}

	/** Description lines under a control, wrapped, indented two columns. */
	#descTextLines(text: string, width: number): string[] {
		return wrapCells(text, Math.max(4, width - 2)).map(line => `  ${this.#c("muted", line)}`);
	}

	#descKeyLines(key: TextKey, width: number): string[] {
		return this.#descTextLines(t(key), width);
	}

	#renderToggle(row: ToggleRow, index: number, width: number, labelW: number): { lines: string[]; hits: Hit[] } {
		const focused = this.#rowFocused(index);
		const on = this.#toggleValue(row);
		const box = this.ascii ? (on ? "[x]" : "[ ]") : on ? "●" : "○";
		const word = on ? t("common.on") : t("common.off");
		const control = on
			? `${this.#c("success", box)} ${this.#c("accent", word)}`
			: `${this.#c("dim", box)} ${this.#c("dim", word)}`;
		const line = `${this.#labelLine(t(row.label), labelW, focused)}  ${control}`;
		const hits: Hit[] = [
			{
				line: 0,
				from: labelW + 4,
				to: labelW + 4 + visibleWidth(box) + 1 + visibleWidth(word),
				target: { kind: "toggle", row: index },
			},
		];
		return { lines: [this.#paintRow(line, width, focused), ...this.#descKeyLinesIf(row.desc, width)], hits };
	}

	#descKeyLinesIf(key: TextKey | undefined, width: number): string[] {
		return key ? this.#descKeyLines(key, width) : [];
	}

	#renderSegmentRow(row: SegmentRow, index: number, width: number, labelW: number): { lines: string[]; hits: Hit[] } {
		const focused = this.#rowFocused(index);
		const options = row.options();
		const current = textValue(this.#context.settings.get(row.path));
		const ctrlCol = labelW + 4;
		const ctrlW = Math.max(6, width - ctrlCol - 2);
		const { lines: segmentLines, hits } = this.#renderSegment(options, current, ctrlW, ctrlCol, index, focused);
		const lines = [`${this.#labelLine(t(row.label), labelW, focused)}  ${segmentLines[0] ?? ""}`];
		for (const extra of segmentLines.slice(1)) lines.push(`${" ".repeat(ctrlCol)}${extra}`);
		const currentOption = options.find(option => option.value === current);
		const desc = currentOption
			? (currentOption.desc ?? (row.desc ? t(row.desc) : undefined))
			: t("set.other", { value: current });
		const previewLines = row.preview ? row.preview(current, this.#plain, this.ascii).map(line => `  ${line}`) : [];
		return {
			lines: [
				this.#paintRow(lines[0]!, width, focused),
				...lines.slice(1),
				...previewLines,
				...this.#descTextLinesIf(desc, width),
			],
			hits,
		};
	}

	#descTextLinesIf(text: string | undefined, width: number): string[] {
		return text === undefined ? [] : this.#descTextLines(text, width);
	}

	/** `[ a │ b │ c ]`, wrapped to further bracketed lines when the labels are wide. */
	#renderSegment(
		options: readonly SegmentOption[],
		current: string,
		ctrlW: number,
		ctrlCol: number,
		rowIndex: number,
		focused: boolean,
	): { lines: string[]; hits: Hit[] } {
		const sep = this.ascii ? " | " : " │ ";
		const groups: SegmentOption[][] = [];
		let group: SegmentOption[] = [];
		let groupW = 2; // "[ "
		for (const option of options) {
			const mark = this.#plain && option.value === current ? 2 : 0;
			const w = visibleWidth(option.label) + mark + sep.length;
			if (groupW + w > ctrlW && group.length > 0) {
				groups.push(group);
				group = [];
				groupW = 2;
			}
			group.push(option);
			groupW += w;
		}
		if (group.length > 0) groups.push(group);
		const lines: string[] = [];
		const hits: Hit[] = [];
		for (const g of groups) {
			let line = "[ ";
			let col = 2;
			for (let i = 0; i < g.length; i++) {
				const option = g[i]!;
				const isCurrent = option.value === current;
				const label = isCurrent
					? this.#plain
						? `*${option.label}*`
						: this.#bold(this.#c("accent", option.label))
					: this.#c(focused ? "text" : "dim", option.label);
				hits.push({
					line: lines.length,
					from: ctrlCol + col - 1,
					to: ctrlCol + col + visibleWidth(option.label) + 1,
					target: { kind: "option", row: rowIndex, index: options.indexOf(option) },
				});
				line += label;
				col += visibleWidth(option.label) + (isCurrent && this.#plain ? 2 : 0);
				if (i < g.length - 1) {
					line += this.#c("borderMuted", sep);
					col += sep.length;
				}
			}
			lines.push(`${line} ]`);
		}
		return { lines, hits };
	}

	#renderLevel(row: LevelRow, index: number, width: number, labelW: number): { lines: string[]; hits: Hit[] } {
		const focused = this.#rowFocused(index);
		const levels = row.levels();
		const current = textValue(this.#context.settings.get(row.path));
		const at = levels.indexOf(current);
		const ctrlCol = labelW + 4;
		const cells = Math.max(1, Math.min(levels.length, width - ctrlCol - 14));
		const filledGlyph = this.ascii ? "=" : "▰";
		const emptyGlyph = this.ascii ? "-" : "▱";
		let bar: string;
		let desc: string | undefined = row.desc ? t(row.desc) : undefined;
		if (at < 0) {
			bar = this.#c("dim", emptyGlyph.repeat(cells));
			desc =
				levels.length <= 1
					? t("set.effort.noLevels")
					: t("set.effort.unsupported", { level: effortLabel(current) });
		} else {
			const filled = levels.length > 1 ? Math.round((at / (levels.length - 1)) * cells) : 0;
			const token = effortLadderToken(current) ?? "accent";
			bar = `${this.#c(token, filledGlyph.repeat(filled))}${this.#c("borderMuted", emptyGlyph.repeat(Math.max(0, cells - filled)))} ${this.#c("accent", effortLabel(current))}`;
		}
		const line = `${this.#labelLine(t(row.label), labelW, focused)}  ${bar}`;
		return { lines: [this.#paintRow(line, width, focused), ...this.#descTextLinesIf(desc, width)], hits: [] };
	}

	#renderText(row: TextRow, index: number, width: number, labelW: number): { lines: string[]; hits: Hit[] } {
		const focused = this.#rowFocused(index);
		const value = textValue(this.#context.settings.get(row.path));
		const shown = value ? this.#c(focused ? "accent" : "text", value) : this.#c("dim", t("set.text.placeholder"));
		const line = `${this.#labelLine(t(row.label), labelW, focused)}  ${shown}`;
		return { lines: [this.#paintRow(line, width, focused), ...this.#descKeyLinesIf(row.desc, width)], hits: [] };
	}

	#renderTheme(row: ThemeRow, index: number, width: number): { lines: string[]; hits: Hit[] } {
		const focused = this.#rowFocused(index);
		const themes = this.#themesFor(row);
		const current = textValue(this.#context.settings.get(row.path));
		const { cw } = cardGrid(width, themes.length);
		const inner = Math.max(6, cw - 2);
		const mode = theme.getColorMode();
		const enc: PixelEncoder = { fg: hex => fgAnsi(hex, mode), bg: hex => bgAnsi(hex, mode) };
		const cards: CardSpec[] = themes.map(name => {
			const fam = familyFor(name);
			const palette = mode === "truecolor" ? fam.scene : (fam.scene256 ?? fam.scene);
			const scene = renderPixelScene(inner, CARD_SCENE_ROWS, fam.kind, "top", palette, enc, {
				time: 60,
				intensity: 0.6,
				intro: 1,
				// Whole-cell pixels under the ASCII preset (no `▀` blocks), half-cell
				// texture when only the colors are gone.
				cellPixels: this.ascii ? 1 : this.#plain ? 2 : sceneCellPixels(),
			}).map(line => (this.#plain ? stripTerminalSequences(line) : line));
			return {
				title: displayName(name),
				body: [],
				scene,
				swatches: this.#themeSwatches.get(name),
				current: name === current,
			};
		});
		const lines: string[] = [];
		const hits: Hit[] = [];
		const cursor = focused ? `${this.#c("accent", theme.symbol("nav.cursor"))} ` : "  ";
		const caption = `${cursor}${this.#bold(this.#c("mdHeading", t(row.label)))}`;
		const tail = current ? `${this.#sep()}${displayName(current)}` : "";
		lines.push(this.#paintRow(`${caption}${this.#c("dim", tail)}`, width, focused));
		if (row.desc) lines.push(...this.#descKeyLines(row.desc, width));
		lines.push(...this.#renderCards(cards, width, index, hits, lines.length));
		return { lines, hits };
	}

	#renderApproval(row: ApprovalRow, index: number, width: number): { lines: string[]; hits: Hit[] } {
		const focused = this.#rowFocused(index);
		const current = textValue(this.#context.settings.get(row.path));
		const lines: string[] = [];
		const hits: Hit[] = [];
		const cursor = focused ? `${this.#c("accent", theme.symbol("nav.cursor"))} ` : "  ";
		lines.push(this.#paintRow(`${cursor}${this.#bold(this.#c("mdHeading", t(row.label)))}`, width, focused));
		lines.push(...this.#descKeyLines("set.approval.lead", width));
		const cards: CardSpec[] = APPROVAL_TIERS.map(tier => ({
			title: t(tier.label),
			body: [`${t("set.approval.runs")} ${t(tier.runs)}`, `${t("set.approval.asks")} ${t(tier.asks)}`],
			current: tier.value === current,
			marker: "marker" in tier ? t(tier.marker) : undefined,
		}));
		lines.push(...this.#renderCards(cards, width, index, hits, lines.length));
		if (!APPROVAL_TIERS.some(tier => tier.value === current)) {
			lines.push(`  ${this.#c("warning", t("set.approval.other", { value: current }))}`);
		}
		return { lines, hits };
	}

	#renderModelInfo(width: number): { lines: string[]; hits: Hit[] } {
		const ctx = this.#context;
		const modelLine = ctx.modelLabel
			? `${this.#bold(this.#c("text", ctx.modelLabel))}${ctx.modelProvider ? this.#c("dim", ` · ${ctx.modelProvider}`) : ""}`
			: this.#c("warning", t("shell.noModel"));
		let effort: string;
		const word = ctx.effortWord;
		if (word === undefined) {
			effort = ctx.modelLabel === undefined ? this.#c("dim", "-") : t("shell.effortUnsupported");
		} else if (word === "auto" && ctx.effortAutoPending) {
			effort = t("shell.effortAutoPending");
		} else {
			effort = this.#c("accent", effortLabel(word));
		}
		const body = [` ${modelLine}`, ` ${this.#c("muted", `${t("set.model.effort")}: `)}${effort}`];
		return this.#renderInfoCard(t("set.model.current"), width, body);
	}

	/** A read-only card the width of the content column (the Model page's summary). */
	#renderInfoCard(title: string, width: number, body: readonly string[]): { lines: string[]; hits: Hit[] } {
		const box = theme.boxRound;
		const vbar = this.#c("border", box.vertical);
		const inner = Math.max(4, width - 2);
		const titleText = ` ${theme.symbol("icon.omp")} ${title} `;
		const top =
			this.#c("border", `${box.topLeft}${box.horizontal}`) +
			this.#bold(this.#c("accent", truncateToWidth(titleText, inner - 4))) +
			this.#c("border", box.horizontal.repeat(Math.max(0, width - 3 - visibleWidth(titleText)))) +
			this.#c("border", box.topRight);
		const lines = [top];
		for (const line of body) {
			lines.push(`${vbar}${padToWidth(truncateToWidth(line, inner), inner)}${vbar}`);
		}
		lines.push(this.#c("border", `${box.bottomLeft}${box.horizontal.repeat(inner)}${box.bottomRight}`));
		return { lines, hits: [] };
	}

	#renderActions(row: ActionsRow, index: number, width: number, labelW: number): { lines: string[]; hits: Hit[] } {
		const focused = this.#rowFocused(index);
		const hits: Hit[] = [];
		let line = `${this.#labelLine("", labelW, false)}  `;
		let col = labelW + 4;
		for (let i = 0; i < row.buttons.length; i++) {
			const button = row.buttons[i]!;
			const selected = focused && i === this.#colCursor;
			const inner = ` ${t(button.label)} `;
			// The focused row already carries the full-width band; a second band
			// around the selected button would end the row band mid-line.
			const painted = selected ? this.#bold(this.#c("accent", inner)) : this.#c("text", inner);
			const edge = this.#c(selected ? "accent" : "borderMuted", "[");
			const edge2 = this.#c(selected ? "accent" : "borderMuted", "]");
			const control = `${edge}${painted}${edge2}  `;
			hits.push({
				line: 0,
				from: col,
				to: col + visibleWidth(control),
				target: { kind: "button", row: index, index: i },
			});
			line += control;
			col += visibleWidth(control);
		}
		const selectedButton = focused ? row.buttons[this.#colCursor] : row.buttons[0];
		const desc = selectedButton ? t(selectedButton.desc) : undefined;
		return { lines: [this.#paintRow(line, width, focused), ...this.#descTextLinesIf(desc, width)], hits };
	}

	#renderAdvanced(index: number, width: number, labelW: number): { lines: string[]; hits: Hit[] } {
		const focused = this.#rowFocused(index);
		const arrow = this.#c("accent", theme.symbol("nav.expand"));
		const line = `${this.#labelLine(t("set.cat.advanced"), labelW, focused)}  ${arrow}`;
		return {
			lines: [this.#paintRow(line, width, focused), ...this.#descKeyLines("set.advanced.desc", width)],
			hits: [],
		};
	}

	#rowFocused(index: number): boolean {
		// The sidebar rail takes the cursor keys in wide mode; the narrow cats
		// list is its own pane. Either way, the content rows only own focus when
		// they are the pane being shown.
		return index === this.#cursor && (this.#narrow !== true || this.#pane === "content");
	}

	// ────────────────────────────────────────────────────────────────────────
	// Cards
	// ────────────────────────────────────────────────────────────────────────

	/**
	 * Cards laid out on lines of `width`: a grid that wraps when the control
	 * area cannot fit them all. Every card on a line has the same height; the
	 * focused card carries an accent border and the nav cursor in its top rule,
	 * the current one a radio marker before its title.
	 */
	#renderCards(
		cards: readonly CardSpec[],
		width: number,
		rowIndex: number,
		hits: Hit[],
		lineOffset: number,
	): string[] {
		if (cards.length === 0) return [];
		const { perLine, cw } = cardGrid(width, cards.length);
		const inner = cw - 2;
		const box = theme.boxRound;
		const lines: string[] = [];
		for (let start = 0; start < cards.length; start += perLine) {
			const group = cards.slice(start, start + perLine);
			const bodies = group.map(card => card.body.flatMap(text => wrapCells(text, inner - 2)));
			const sceneRows = group.some(card => card.scene !== undefined) ? CARD_SCENE_ROWS : 0;
			const swatchRows = group.some(card => card.swatches !== undefined && !this.#plain) ? 1 : 0;
			const bodyRows = Math.max(0, ...bodies.map(body => body.length));
			const cardHeight = 2 + sceneRows + 1 + bodyRows + swatchRows;
			const grid: string[][] = Array.from({ length: cardHeight }, () => []);
			for (let i = 0; i < group.length; i++) {
				const card = group[i]!;
				const index = start + i;
				const focusedCard = this.#rowFocused(rowIndex) && index === this.#colCursor;
				const slot: ThemeColor = focusedCard ? "accent" : card.current ? "border" : "borderMuted";
				const vbar = this.#c(slot, box.vertical);
				const cursor = focusedCard ? theme.symbol("nav.cursor") : "";
				grid[0]!.push(
					this.#c(
						slot,
						`${box.topLeft}${cursor}${box.horizontal.repeat(Math.max(0, inner - visibleWidth(cursor)))}${box.topRight}`,
					),
				);
				let at = 1;
				for (let s = 0; s < sceneRows; s++) {
					const sceneLine = card.scene?.[s] ?? "";
					grid[at]!.push(`${vbar}${padToWidth(sceneLine, inner)}${vbar}`);
					at++;
				}
				const radio = card.current ? (this.ascii ? "(o)" : "◉") : this.ascii ? "( )" : "○";
				const marker = card.marker ? this.#c("dim", ` (${card.marker})`) : "";
				const title = truncateToWidth(
					`${this.#c(card.current ? "accent" : "text", radio)} ${this.#c(card.current ? "accent" : "text", card.title)}${marker}`,
					inner,
				);
				grid[at]!.push(`${vbar}${padToWidth(title, inner)}${vbar}`);
				at++;
				const body = bodies[i]!;
				for (let b = 0; b < bodyRows; b++) {
					grid[at]!.push(`${vbar}${padToWidth(this.#c("muted", body[b] ?? ""), inner)}${vbar}`);
					at++;
				}
				if (swatchRows) {
					let swatchLine = "";
					for (const hex of card.swatches ?? []) {
						if (!hex) continue;
						swatchLine += this.#plain ? "" : `${bgAnsi(hex, theme.getColorMode())}  \x1b[49m`;
					}
					grid[at]!.push(`${vbar}${padToWidth(swatchLine, inner)}${vbar}`);
					at++;
				}
				grid[cardHeight - 1]!.push(
					this.#c(slot, `${box.bottomLeft}${box.horizontal.repeat(inner)}${box.bottomRight}`),
				);
			}
			for (let r = 0; r < cardHeight; r++) {
				let line = "";
				for (let i = 0; i < group.length; i++) {
					line += grid[r]![i]!;
					if (i < group.length - 1) line += " ".repeat(CARD_GAP);
				}
				// Clicking anywhere on a card applies it.
				for (let i = 0; i < group.length; i++) {
					hits.push({
						line: lineOffset + lines.length,
						from: i * (cw + CARD_GAP),
						to: i * (cw + CARD_GAP) + cw,
						target: { kind: "card", row: rowIndex, index: start + i },
					});
				}
				lines.push(line);
			}
		}
		return lines;
	}

	// ────────────────────────────────────────────────────────────────────────
	// Footer
	// ────────────────────────────────────────────────────────────────────────

	#footer(wide: boolean): string {
		const sep = this.#sep();
		const keys = (list: KeyName | readonly KeyName[]) => this.#c("dim", formatKeyHints(list));
		const word = (id: TextKey) => this.#c("muted", t(id));
		const confirm = this.#c("dim", editorKey("tui.select.confirm"));
		const cancel = this.#c("dim", editorKey("tui.select.cancel"));
		let parts: string[];
		if (this.#editor) {
			parts = [`${confirm} ${word("set.key.confirm")}`, `${cancel} ${word("set.key.back")}`];
		} else if (!wide && this.#pane === "cats") {
			parts = [
				`${keys(["up", "down"])} ${word("set.key.select")}`,
				`${confirm} ${word("set.key.open")}`,
				`${cancel} ${word("set.key.close")}`,
			];
		} else if (wide && this.#focus === "sidebar") {
			parts = [
				`${keys(["up", "down"])} ${word("set.key.switchCat")}`,
				`${confirm}/${keys("tab")} ${word("set.key.open")}`,
				`${cancel} ${word("set.key.close")}`,
			];
		} else if (wide) {
			parts = [
				`${keys(["up", "down"])} ${word("set.key.select")}`,
				`${keys(["left", "right"])} ${word("set.key.change")}`,
				`${confirm} ${word("set.key.confirm")}`,
				`${keys("tab")} ${word("set.key.categories")}`,
				`${cancel} ${word("set.key.close")}`,
			];
		} else {
			parts = [
				`${keys(["up", "down"])} ${word("set.key.select")}`,
				`${keys(["left", "right"])} ${word("set.key.change")}`,
				`${confirm} ${word("set.key.confirm")}`,
				`${cancel} ${word("set.key.back")}`,
			];
		}
		let footer = parts.join(sep);
		const visible = this.#geo?.visibleRows;
		const totalRows = this.#rows(this.#category).length;
		const hidden: string[] = [];
		const above = visible ? visible[0] : 0;
		const below = visible ? totalRows - visible[1] : 0;
		if (above > 0) hidden.push(t("set.scroll.above", { count: above }));
		if (below > 0) hidden.push(t("set.scroll.below", { count: below }));
		if (hidden.length > 0) footer = `${footer}${sep}${this.#c("dim", hidden.join(sep))}`;
		return footer;
	}

	// ────────────────────────────────────────────────────────────────────────
	// Input
	// ────────────────────────────────────────────────────────────────────────

	handleInput(data: string): void {
		if (this.#advancedOpen && this.#advanced) {
			this.#advanced.handleInput(data);
			return;
		}
		if (data.startsWith("\x1b[<")) {
			routeSgrMouseInput(data, event => this.#routeMouse(event));
			return;
		}
		if (this.#editor) {
			this.#editor.handleInput(data);
			return;
		}
		const kb = getKeybindings();
		const cancel = kb.matches(data, "tui.select.cancel");
		const confirm = kb.matches(data, "tui.select.confirm") || data === "\n" || data === "\r";
		const tab = matchesKey(data, "tab") || matchesKey(data, "shift+tab");
		const up = kb.matches(data, "tui.select.up") || matchesKey(data, "up");
		const down = kb.matches(data, "tui.select.down") || matchesKey(data, "down");
		const left = matchesKey(data, "left");
		const right = matchesKey(data, "right");

		if (cancel) {
			this.#onCancel();
			return;
		}
		if (up || down) {
			this.#move(up ? -1 : 1);
			return;
		}
		if (tab) {
			if (!this.#isWideInput()) return;
			this.#focus = this.#focus === "sidebar" ? "content" : "sidebar";
			this.#version++;
			this.#requestRender();
			return;
		}
		if (confirm) {
			this.#confirm();
			return;
		}
		if (left || right) {
			this.#adjust(right ? 1 : -1);
		}
	}

	/** The last rendered frame decides wide/narrow input semantics. */
	#isWideInput(): boolean {
		return this.#narrow !== true;
	}

	#onCancel(): void {
		if (!this.#isWideInput() && this.#pane === "content") {
			this.#pane = "cats";
			this.#version++;
			this.#requestRender();
			return;
		}
		this.#restoreThemePreview();
		this.#callbacks.onCancel();
	}

	#move(delta: number): void {
		if (this.#isWideInput() && this.#focus === "sidebar") {
			this.#switchCategory(delta, "sidebar");
			return;
		}
		if (!this.#isWideInput() && this.#pane === "cats") {
			this.#switchCategory(delta);
			return;
		}
		const rows = this.#rows(this.#category);
		const focusable = this.#focusableIndexes(rows);
		if (focusable.length === 0) return;
		const at = focusable.indexOf(this.#cursor);
		const next = Math.max(0, Math.min(focusable.length - 1, (at < 0 ? 0 : at) + delta));
		this.#cursor = focusable[next]!;
		this.#colCursor = this.#defaultCard(this.#cursor);
		this.#scrollRow = Math.min(this.#scrollRow, this.#cursor);
		this.#version++;
		this.#requestRender();
	}

	/** Card/button the focused row starts on: the current value's, else the first. */
	#defaultCard(rowIndex: number): number {
		const row = this.#rows(this.#category)[rowIndex];
		if (!row) return 0;
		if (row.kind === "theme") {
			const current = textValue(this.#context.settings.get(row.path));
			return Math.max(0, this.#themesFor(row).indexOf(current));
		}
		if (row.kind === "approval") {
			const current = textValue(this.#context.settings.get(row.path));
			return Math.max(
				0,
				APPROVAL_TIERS.findIndex(tier => tier.value === current),
			);
		}
		return 0;
	}

	#switchCategory(delta: number, focus?: "sidebar"): void {
		const at = CATEGORIES.indexOf(this.#category);
		const next = Math.max(0, Math.min(CATEGORIES.length - 1, at + delta));
		if (CATEGORIES[next] !== this.#category) {
			// Narrow stays on the category list (Enter opens); the wide rail's
			// content column follows the selection either way.
			this.#category = CATEGORIES[next]!;
			const rows = this.#rows(this.#category);
			this.#cursor = this.#focusableIndexes(rows)[0] ?? 0;
			this.#colCursor = this.#defaultCard(this.#cursor);
			this.#scrollRow = 0;
		}
		this.#focus = focus ?? "content";
		this.#version++;
		this.#requestRender();
	}

	#confirm(): void {
		if (this.#isWideInput() && this.#focus === "sidebar") {
			this.#focus = "content";
			this.#version++;
			this.#requestRender();
			return;
		}
		if (!this.#isWideInput() && this.#pane === "cats") {
			this.#pane = "content";
			this.#cursor = 0;
			this.#colCursor = 0;
			this.#scrollRow = 0;
			this.#version++;
			this.#requestRender();
			return;
		}
		const row = this.#rows(this.#category)[this.#cursor];
		if (!row) return;
		switch (row.kind) {
			case "toggle":
				this.#applyToggle(row);
				return;
			case "text":
				this.#openEditor(row);
				return;
			case "theme": {
				const name = this.#themesFor(row)[this.#colCursor];
				if (name) this.#applyTheme(row, name);
				return;
			}
			case "approval": {
				const tier = APPROVAL_TIERS[this.#colCursor];
				if (tier) this.#save(row.path, tier.value);
				return;
			}
			case "actions": {
				const button = row.buttons[this.#colCursor];
				if (button) this.#callbacks.onAction?.(button.action);
				return;
			}
			case "advanced":
				this.#enterAdvanced();
				return;
			default:
				return;
		}
	}

	#adjust(delta: number): void {
		const row = this.#rows(this.#category)[this.#cursor];
		if (!row) return;
		switch (row.kind) {
			case "toggle":
				this.#applyToggle(row);
				return;
			case "segment": {
				const options = row.options();
				const current = textValue(this.#context.settings.get(row.path));
				const at = options.findIndex(option => option.value === current);
				const option = options[Math.max(0, Math.min(options.length - 1, (at < 0 ? 0 : at) + delta))];
				if (option) this.#save(row.path, option.value);
				return;
			}
			case "level": {
				const levels = row.levels();
				if (levels.length < 2) return;
				const current = textValue(this.#context.settings.get(row.path));
				const at = levels.indexOf(current);
				const level = levels[Math.max(0, Math.min(levels.length - 1, (at < 0 ? 0 : at) + delta))];
				if (level !== undefined && level !== current) this.#save(row.path, level);
				return;
			}
			case "theme": {
				const themes = this.#themesFor(row);
				if (themes.length === 0) return;
				const next = Math.max(0, Math.min(themes.length - 1, this.#colCursor + delta));
				const name = themes[next];
				if (name) {
					this.#colCursor = next;
					this.#applyTheme(row, name);
				}
				return;
			}
			case "approval": {
				const next = Math.max(0, Math.min(APPROVAL_TIERS.length - 1, this.#colCursor + delta));
				this.#colCursor = next;
				const tier = APPROVAL_TIERS[next];
				if (tier) this.#save(row.path, tier.value);
				return;
			}
			case "actions": {
				this.#colCursor = Math.max(0, Math.min(row.buttons.length - 1, this.#colCursor + delta));
				this.#version++;
				this.#requestRender();
				return;
			}
			default:
				return;
		}
	}

	// ────────────────────────────────────────────────────────────────────────
	// Text editor
	// ────────────────────────────────────────────────────────────────────────

	#openEditor(row: TextRow): void {
		const current = textValue(this.#context.settings.get(row.path));
		const save = editorKey("tui.input.submit");
		const cancel = editorKey("tui.select.cancel");
		this.#editor = new TextFormField({
			theme: formTheme,
			label: t(row.label),
			description: row.desc ? t(row.desc) : undefined,
			initialValue: current || undefined,
			empty: "submit",
			hint: `  ${t("set.text.hint", { save, cancel })}`,
			onSubmit: value => {
				if (value.trim() === "") {
					this.#context.settings.unset(row.path);
					this.#callbacks.onChange(row.path, this.#context.settings.get(row.path));
				} else {
					this.#save(row.path, value.trim());
				}
				this.#closeEditor();
			},
			onCancel: () => this.#closeEditor(),
			requestRender: () => this.#requestRender(),
		});
		this.#version++;
		this.#requestRender();
	}

	#closeEditor(): void {
		this.#editor = undefined;
		this.#version++;
		this.#requestRender();
	}

	// ────────────────────────────────────────────────────────────────────────
	// Advanced settings
	// ────────────────────────────────────────────────────────────────────────

	#enterAdvanced(): void {
		this.#editor = undefined;
		this.#advancedOpen = true;
		if (!this.#advanced) {
			const base = this.#callbacks;
			const callbacks: SettingsCallbacks = {
				onChange: base.onChange,
				onThemePreview: base.onThemePreview,
				onStatusLinePreview: base.onStatusLinePreview,
				getStatusLinePreview: base.getStatusLinePreview,
				describeStatusLinePreview: base.describeStatusLinePreview,
				onPluginsChanged: base.onPluginsChanged,
				// Nightglide: Esc inside the tabs returns to this page, not out of it.
				onCancel: () => this.#leaveAdvanced(),
			};
			this.#advanced = new SettingsSelectorComponent(this.#context, callbacks);
		}
		this.#version++;
		this.#requestRender();
	}

	#leaveAdvanced(): void {
		this.#advancedOpen = false;
		// Re-apply the saved status-line settings the way the tabs' own close
		// handler does, so a preview left behind there does not persist here.
		this.#callbacks.onStatusLinePreview?.({});
		this.#version++;
		this.#requestRender();
	}

	// ────────────────────────────────────────────────────────────────────────
	// Mouse
	// ────────────────────────────────────────────────────────────────────────

	#routeMouse(event: SgrMouseEvent): boolean {
		if (this.#editor) {
			// Text fields ignore routed events (same as the upstream text submenus).
			return true;
		}
		const geo = this.#geo;
		if (!geo) return true;
		const contentRows = this.#lastFrame?.contentRows ?? 0;
		const contentLine = event.row - geo.contentStart;
		const overContent = contentLine >= 0 && contentLine < contentRows;

		if (event.wheel !== null) {
			if (overContent && !this.#editor) {
				// Everything already on screen: the wheel stays put instead of
				// scrolling an empty page in.
				const total = this.#rows(this.#category).length;
				const atEnd = (this.#geo?.visibleRows[1] ?? 0) >= total;
				const delta = event.wheel > 0 && atEnd ? 0 : event.wheel;
				this.#scrollRow = Math.max(0, this.#scrollRow + delta);
				this.#version++;
				this.#requestRender();
			}
			return true;
		}

		if (event.motion) {
			if (overContent) {
				const col = event.col - geo.bodyCol;
				const hit = geo.hits.find(
					h => h.line === contentLine && col >= h.from && col < h.to && h.target.kind === "card",
				);
				if (hit && hit.target.kind === "card") {
					const row = this.#rows(this.#category)[hit.target.row];
					if (row?.kind === "theme") {
						this.#hoverTheme(this.#themesFor(row)[hit.target.index]);
						return true;
					}
				}
			}
			this.#hoverTheme(undefined);
			return true;
		}
		if (!event.leftClick) return true;

		// Sidebar click (wide): pick the category.
		if (geo.sidebar && event.col >= geo.sidebar.from && event.col < geo.sidebar.to) {
			const index = geo.sidebar.cats[contentLine];
			if (index !== undefined && index >= 0) {
				this.#selectCategory(CATEGORIES[index]!);
				this.#focus = "content";
			}
			return true;
		}

		if (!overContent) return true;
		const col = event.col - geo.bodyCol;
		const hit = geo.hits.find(h => h.line === contentLine && col >= h.from && col < h.to);
		if (hit) {
			this.#applyHit(hit.target);
			return true;
		}
		// A click on a row's other lines selects it; on the already-selected row
		// it activates, mirroring the upstream settings list.
		const spanIndex = geo.spans.findIndex(
			span => span !== undefined && contentLine >= span[0] && contentLine < span[1],
		);
		if (spanIndex < 0) return true;
		if (spanIndex === this.#cursor && this.#pane === "content") {
			const row = this.#rows(this.#category)[spanIndex];
			if (row && (row.kind === "text" || row.kind === "advanced" || row.kind === "actions")) {
				this.#confirm();
			}
		} else {
			this.#cursor = spanIndex;
			this.#colCursor = this.#defaultCard(spanIndex);
			this.#version++;
			this.#requestRender();
		}
		return true;
	}

	#selectCategory(category: CategoryId): void {
		this.#category = category;
		this.#pane = "content";
		const rows = this.#rows(category);
		this.#cursor = this.#focusableIndexes(rows)[0] ?? 0;
		this.#colCursor = this.#defaultCard(this.#cursor);
		this.#scrollRow = 0;
		this.#version++;
		this.#requestRender();
	}

	#applyHit(target: HitTarget): void {
		switch (target.kind) {
			case "cat":
				this.#selectCategory(CATEGORIES[target.index]!);
				return;
			case "row": {
				this.#cursor = target.row;
				this.#colCursor = this.#defaultCard(target.row);
				this.#version++;
				this.#requestRender();
				return;
			}
			case "toggle": {
				const row = this.#rows(this.#category)[target.row];
				if (row?.kind !== "toggle") return;
				this.#cursor = target.row;
				this.#applyToggle(row);
				return;
			}
			case "option": {
				const row = this.#rows(this.#category)[target.row];
				if (row?.kind !== "segment") return;
				this.#cursor = target.row;
				const option = row.options()[target.index];
				if (option) this.#save(row.path, option.value);
				return;
			}
			case "card": {
				const row = this.#rows(this.#category)[target.row];
				if (!row) return;
				this.#cursor = target.row;
				this.#colCursor = target.index;
				if (row.kind === "theme") {
					const name = this.#themesFor(row)[target.index];
					if (name) this.#applyTheme(row, name);
				} else if (row.kind === "approval") {
					const tier = APPROVAL_TIERS[target.index];
					if (tier) this.#save(row.path, tier.value);
				}
				return;
			}
			case "button": {
				const row = this.#rows(this.#category)[target.row];
				if (row?.kind !== "actions") return;
				this.#cursor = target.row;
				this.#colCursor = target.index;
				const button = row.buttons[target.index];
				if (button) this.#callbacks.onAction?.(button.action);
				return;
			}
		}
	}
}
