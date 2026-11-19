import { ThinkingLevel } from "@oh-my-pi/pi-agent-core";
import type { TspSpan, TspTone } from "@oh-my-pi/pi-wire";
import { effortLadderBadgeToken, effortLadderGlyph, effortLadderToken, themeThinkingWord } from "../chat/effort-ladder";
import { span } from "../native/describe";
import { Ellipsis, visibleWidth } from "../utils";
import { formatMetricRow } from "../components/metric";
import { renderProgressBar } from "../components/progress-bar";
import { renderTableRow } from "../components/table";
import { formatDuration, formatNumber } from "@oh-my-pi/pi-utils";
import type { ThemeColor } from "../theme/theme";
import { type AgentRecordLike, type AgentStatus, MAIN_AGENT_ID } from "./agent-hub-types";
import { parseThinkingLevel } from "../thinking";
import { TRUNCATE_LENGTHS, truncateToWidth } from "../render/render-utils";
import { sanitizeDisplaySingleLine } from "./extensions/display-text";
import type { ObservableSession } from "./session-observer-registry";
import { theme } from "../theme/theme";
import type { AgentMetrics } from "./agent-hub-projection";

export interface RosterRender {
	lines: string[];
	hitRows: Array<number | undefined>;
}

/** Legacy progress snapshots may omit counters; snapshot absence remains distinct. */
function metricNumber(value: number | undefined): number {
	return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/** Compute the max content width for the current terminal, accounting for chrome. */
export function contentWidth(): number {
	return Math.max(TRUNCATE_LENGTHS.SHORT, (process.stdout.columns || 80) - 6);
}

/** Sanitize a line for TUI display and truncate it to the viewport width. */
export function sanitizeLine(text: string, maxWidth?: number): string {
	return truncateToWidth(sanitizeDisplaySingleLine(text), maxWidth ?? contentWidth());
}

export function clampHubLine(line: string, width: number): string {
	return truncateToWidth(line.replace(/[\r\n]+/g, " "), Math.max(1, width), Ellipsis.Omit);
}

/**
 * Semantic tone of each roster status; shared by the ANSI glyphs and native
 * spans. Three states, one bright: running is the only live thing on the panel
 * and keeps the accent; settled agents go quiet (dim), parked ones shadow
 * further (muted), and aborts keep the error key color.
 */
const STATUS_TONE = {
	running: "accent",
	idle: "dim",
	parked: "muted",
	aborted: "error",
} as const satisfies Record<AgentStatus, ThemeColor>;

function statusSymbol(status: AgentStatus): string {
	switch (status) {
		case "running":
			return theme.status.running;
		case "idle":
			return theme.status.enabled;
		case "parked":
			return theme.status.shadowed;
		case "aborted":
			return theme.status.aborted;
	}
}

/** Status glyph, colored per theme status conventions. The title-line counts spell out the words. */
export function statusGlyph(status: AgentRecordLike["status"]): string {
	return theme.fg(STATUS_TONE[status], statusSymbol(status));
}

/** Native span style for a roster status (the dim settled state is style-only). */
export function statusTone(status: AgentStatus): string {
	return STATUS_TONE[status];
}

/** Picker status dot per roster status: running agents take the live `pending` dot (§9.1). */
const STATUS_DOT = {
	running: "pending",
	idle: "success",
	parked: "muted",
	aborted: "error",
} as const satisfies Record<AgentStatus, TspTone>;

/** Picker row dot for a roster status. */
export function statusDot(status: AgentStatus): TspTone {
	return STATUS_DOT[status];
}

const ASSIGNMENT_PREFIX = /^\s*Complete assignment thoroughly:\s*/i;

/** One-line task summary: the subagent prompt's fixed assignment preamble is not part of the task. */
export function taskSummary(task: string): string {
	return sanitizeDisplaySingleLine(task.replace(ASSIGNMENT_PREFIX, ""));
}

/** Native span of {@link statusGlyph}. */
export function statusGlyphSpan(status: AgentStatus): TspSpan {
	return span(statusSymbol(status), STATUS_TONE[status]);
}

export function statusText(status: AgentRecordLike["status"], text: string): string {
	switch (status) {
		case "running":
			return theme.fg("accent", text);
		case "idle":
			return theme.fg("success", text);
		case "parked":
			return theme.fg("muted", text);
		case "aborted":
			return theme.fg("error", text);
	}
}

function showsThinkingLevel(level: ThinkingLevel | undefined): level is Exclude<ThinkingLevel, "off" | "inherit"> {
	return level !== undefined && level !== ThinkingLevel.Off && level !== ThinkingLevel.Inherit;
}

/** The effort-ladder badge (`◎ high`): one rung glyph plus the symbol preset's
 * own word, dim on the quiet rungs — the same badge the Task cards and thinking
 * collapse heads render, so the panel cannot drift from the ladder. */
function effortBadgeLabel(level: ThinkingLevel): string {
	const glyph = effortLadderGlyph(level);
	const word = themeThinkingWord(theme.thinking[level as keyof typeof theme.thinking] ?? level, level);
	return glyph ? `${glyph} ${word}` : word;
}

/** Model id + effort rung (`sonnet-4-6 ◎ high`), rung colored per the effort ladder. */
function formatModelBadge(modelId: string, level: ThinkingLevel | undefined): string {
	const model = theme.fg("dim", sanitizeDisplaySingleLine(modelId));
	if (!showsThinkingLevel(level)) return model;
	return `${model} ${theme.fg(effortLadderBadgeToken(level) ?? "dim", effortBadgeLabel(level))}`;
}

/** Host-resolved model-role label and color. */
export interface AgentRoleDisplay {
	color?: ThemeColor;
	tag?: string;
	name?: string;
}

/** Textual model-role tag; color reinforces (but never replaces) the label. */
export function formatRoleBadge(role: string, info: AgentRoleDisplay): string {
	return theme.fg(info.color ?? "muted", sanitizeDisplaySingleLine(info.tag ?? info.name ?? role));
}

/** Native span of {@link formatRoleBadge}. */
export function roleBadgeSpan(role: string, info: AgentRoleDisplay): TspSpan {
	return span(sanitizeDisplaySingleLine(info.tag ?? info.name ?? role), info.color ?? "muted");
}

/** Model label and reasoning level a hub row reports; `fallback` marks a fallback model serving. */
interface ResolvedModelBadge {
	model: string;
	level: ThinkingLevel | undefined;
	fallback: boolean;
}

/** Resolve a selector, preserving provider identity when requested. */
function resolveSelectorBadge(
	resolved: string,
	fallback: boolean,
	preserveProvider: boolean,
	fallbackLevel: ThinkingLevel | undefined,
): ResolvedModelBadge {
	const cleanResolved = sanitizeDisplaySingleLine(resolved);
	// Model ids may themselves contain colons (`qwen3:14b`), so only treat the
	// suffix as a thinking level when it parses as one.
	const colon = cleanResolved.lastIndexOf(":");
	const explicitLevel = colon >= 0 ? parseThinkingLevel(cleanResolved.slice(colon + 1)) : undefined;
	const selector = explicitLevel !== undefined ? cleanResolved.slice(0, colon) : cleanResolved;
	const label = preserveProvider ? selector : selector.slice(selector.indexOf("/") + 1);
	return { model: label, level: explicitLevel ?? fallbackLevel, fallback };
}

/**
 * Resolved model + reasoning level for a hub row. Exact executor progress is
 * authoritative (and survives completion); direct live sessions are the
 * fallback for agents without an observer snapshot — the main session has no
 * snapshot at all, so its row is read straight off the live session.
 *
 * Every source reports the model that produced the row's work, never the one
 * the session merely points at: an armed fallback that has not served yet stays
 * attributed to whichever model last actually spoke.
 */
function resolveModelBadge(
	ref: AgentRecordLike,
	observed: ObservableSession | undefined,
): ResolvedModelBadge | undefined {
	const progress = observed?.progress;
	const liveThinkingLevel = ref.session?.thinkingLevel;
	const serving = ref.session?.servingModel;
	const fallbackSelector =
		(serving?.isFallback ? serving.selector : undefined) ??
		(progress?.resolvedModelIsFallback ? progress.resolvedModel : undefined) ??
		(ref.history?.resolvedModelIsFallback ? ref.history.resolvedModel : undefined);
	if (fallbackSelector) return resolveSelectorBadge(fallbackSelector, true, true, liveThinkingLevel);
	const resolvedModel = progress?.resolvedModel ?? ref.history?.resolvedModel ?? serving?.selector;
	if (resolvedModel) return resolveSelectorBadge(resolvedModel, false, false, liveThinkingLevel);
	const model = ref.session?.model;
	if (!model) return undefined;
	return { model: model.id, level: model.thinking ? liveThinkingLevel : undefined, fallback: false };
}

export function modelBadge(ref: AgentRecordLike, observed: ObservableSession | undefined): string | undefined {
	const badge = resolveModelBadge(ref, observed);
	if (!badge) return undefined;
	const text = formatModelBadge(badge.model, badge.level);
	return badge.fallback ? `${theme.fg("warning", "fallback →")} ${text}` : text;
}

/** A picker chip for the model that produced a row's work: label plus thinking-level colour token. */
export interface ModelChip {
	text: string;
	/** Thinking level shown next to the model (`low`), when the model reasons. */
	level?: string;
	/** Theme token of {@link level}. */
	dot?: string;
	fallback: boolean;
}

/** Structured {@link modelBadge} for picker chips. */
export function modelChip(ref: AgentRecordLike, observed: ObservableSession | undefined): ModelChip | undefined {
	const badge = resolveModelBadge(ref, observed);
	if (!badge) return undefined;
	return {
		text: sanitizeDisplaySingleLine(badge.model),
		level: showsThinkingLevel(badge.level) ? badge.level : undefined,
		dot: showsThinkingLevel(badge.level) ? effortLadderToken(badge.level) : undefined,
		fallback: badge.fallback,
	};
}

/** Native spans of {@link modelBadge}. */
export function modelBadgeSpans(ref: AgentRecordLike, observed: ObservableSession | undefined): TspSpan[] | undefined {
	const badge = resolveModelBadge(ref, observed);
	if (!badge) return undefined;
	const spans: TspSpan[] = [];
	if (badge.fallback) spans.push(span("fallback → ", "warning"));
	spans.push(span(sanitizeDisplaySingleLine(badge.model), "dim"));
	if (showsThinkingLevel(badge.level)) {
		spans.push(span(` ${effortBadgeLabel(badge.level)}`, effortLadderBadgeToken(badge.level) ?? "dim"));
	}
	return spans;
}

export function formatMetricDuration(metrics: AgentMetrics): string | undefined {
	const durationMs = metricNumber(metrics.durationMs);
	if (durationMs <= 0) return undefined;
	const label = metrics.durationKind === "active" ? "active" : metrics.durationKind === "span" ? "span" : "duration";
	return `${formatDuration(durationMs)} ${label}`;
}

export function formatCost(cost: number): string {
	const amount = metricNumber(cost);
	if (amount < 0.01) return `$${amount.toFixed(4)}`;
	if (amount < 1) return `$${amount.toFixed(3)}`;
	return `$${amount.toFixed(2)}`;
}

export function formatMetrics(metrics: AgentMetrics): string {
	return formatMetricRow(
		[
			{ value: formatCost(metrics.cost) },
			{ value: formatMetricDuration(metrics) ?? "time —" },
			{ value: `${formatNumber(metrics.requests)} req` },
			{ value: `${formatNumber(metrics.tools)} tools` },
			{ value: `${formatNumber(metrics.tokens)} tok` },
		],
		{ separator: theme.sep.dot },
	);
}

/** Plain-text {@link formatMetrics} for native spans. */
export function metricsText(metrics: AgentMetrics): string {
	return [
		formatCost(metrics.cost),
		formatMetricDuration(metrics) ?? "time —",
		`${formatNumber(metrics.requests)} req`,
		`${formatNumber(metrics.tools)} tools`,
		`${formatNumber(metrics.tokens)} tok`,
	].join(theme.sep.dot);
}

/** Row-grid variant of {@link formatMetrics}: fixed-width cells so every agent's metadata
 * line shares one column layout instead of flowing after wrapped text. Cost is left-aligned
 * so the line starts flush; the numeric cells are right-aligned so units line up.
 *
 * With `maxWidth`, cells shed whole (never truncated mid-word) when the row
 * cannot fit, lowest priority first — `tools`, `req`, `tok`, `age`, `time`,
 * `cost` — mirroring the native picker's column priorities. */
export function formatMetricColumns(metrics: AgentMetrics, age: string, maxWidth?: number): string {
	const cells = [
		{ text: formatCost(metrics.cost), width: 8, align: "left" as const, overflow: "allow" as const, priority: 6 },
		{
			text: formatMetricDuration(metrics) ?? "—",
			width: 13,
			align: "right" as const,
			overflow: "truncate" as const,
			priority: 5,
		},
		{
			text: `${formatNumber(metrics.requests)} req`,
			width: 8,
			align: "right" as const,
			overflow: "truncate" as const,
			priority: 2,
		},
		{
			text: `${formatNumber(metrics.tools)} tools`,
			width: 9,
			align: "right" as const,
			overflow: "truncate" as const,
			priority: 1,
		},
		{
			text: `${formatNumber(metrics.tokens)} tok`,
			width: 8,
			align: "right" as const,
			overflow: "truncate" as const,
			priority: 3,
		},
		{ text: age, width: 8, align: "right" as const, overflow: "truncate" as const, priority: 4 },
	];
	if (maxWidth !== undefined) {
		const max = Math.max(1, maxWidth);
		const rowWidth = (list: typeof cells): number =>
			list.reduce((sum, cell) => sum + cell.width, 0) + Math.max(0, list.length - 1);
		while (cells.length > 1 && rowWidth(cells) > max) {
			let drop = 0;
			for (let i = 1; i < cells.length; i++) if (cells[i]!.priority < cells[drop]!.priority) drop = i;
			cells.splice(drop, 1);
		}
	}
	return renderTableRow(cells, cells, undefined, { gap: " ", fit: false });
}

export function contextGauge(tokens: number, window: number): string {
	const ratio = Math.max(0, Math.min(1, tokens / window));
	const bar = renderProgressBar(ratio, 10, {
		min: 0,
		max: 1,
		style: {
			filled: "━",
			empty: "─",
			styleFilled: text => theme.fg("accent", text),
			styleEmpty: text => theme.fg("dim", text),
		},
	});
	return `${bar} ${formatNumber(tokens)}/${formatNumber(window)} ${Math.round(ratio * 100)}%`;
}

/** Fit a child-id preview without joining an arbitrarily large child set. */
export function formatChildIds(children: readonly AgentRecordLike[], width: number): string {
	const max = Math.max(1, width);
	let shown = 0;
	let text = "";
	while (shown < children.length) {
		const id = sanitizeLine(children[shown].id, max);
		const candidate = text ? `${text}, ${id}` : id;
		const remaining = children.length - shown - 1;
		const suffix = remaining > 0 ? `, … +${remaining}` : "";
		if (visibleWidth(candidate + suffix) > max) {
			const includesCurrent = text.length === 0;
			const omitted = children.length - shown - Number(includesCurrent);
			return truncateToWidth(`${includesCurrent ? id : text}${omitted > 0 ? `, … +${omitted}` : ""}`, max);
		}
		text = candidate;
		shown++;
	}
	return text;
}
const TREE_SEGMENT_WIDTH = 4;
const TREE_DETAIL_BASE_INDENT = 4;

/** Build one bash `tree`-style ancestry prefix. Continuation rows replace the
 * node's own branch with a rail only when a later sibling still needs it. */
function treePrefix(
	ref: AgentRecordLike,
	maxWidth: number,
	depthById: ReadonlyMap<string, number>,
	parentById: ReadonlyMap<string, string>,
	lastSiblingById: ReadonlyMap<string, boolean>,
	continuation: boolean,
): string {
	if ((depthById.get(ref.id) ?? 0) === 0) return "";
	const lastSibling = lastSiblingById.get(ref.id);
	const segments: string[] = [continuation ? (lastSibling ? "    " : "│   ") : lastSibling ? "└── " : "├── "];
	const ancestry = new Set<string>();
	let parent = parentById.get(ref.id);
	while (parent && parent !== MAIN_AGENT_ID && !ancestry.has(parent)) {
		const grandparent = parentById.get(parent);
		// A bare top-level parent (drawn without a connector, just its dot) has no
		// rail column — its children's connectors sit directly under that dot.
		if (!grandparent || grandparent === MAIN_AGENT_ID) break;
		ancestry.add(parent);
		segments.push(lastSiblingById.get(parent) ? "    " : "│   ");
		parent = grandparent;
	}
	const maxSegments = Math.max(1, Math.floor(Math.max(TREE_SEGMENT_WIDTH, maxWidth - 2) / TREE_SEGMENT_WIDTH));
	const omitted = Math.max(0, segments.length - maxSegments);
	const prefix = segments.slice(0, maxSegments).reverse().join("");
	const omittedPrefix = omitted > 0 ? (continuation ? "  " : "… ") : "";
	return theme.fg("dim", `${omittedPrefix}${prefix}`);
}

/** Bash `tree`-style branch for an agent's identity row. */
export function treeBranch(
	ref: AgentRecordLike,
	maxWidth: number,
	depthById: ReadonlyMap<string, number>,
	parentById: ReadonlyMap<string, string>,
	lastSiblingById: ReadonlyMap<string, boolean>,
): string {
	return treePrefix(ref, maxWidth, depthById, parentById, lastSiblingById, false);
}

/** Ancestry rails for the task and metrics rows beneath an agent identity. */
export function treeContinuation(
	ref: AgentRecordLike,
	maxWidth: number,
	depthById: ReadonlyMap<string, number>,
	parentById: ReadonlyMap<string, string>,
	lastSiblingById: ReadonlyMap<string, boolean>,
): string {
	return treePrefix(ref, maxWidth, depthById, parentById, lastSiblingById, true);
}
/** One roster-wide origin for metric columns, independent of tree depth. */
export function treeMetadataIndent(maxWidth: number, maxDepth: number): number {
	return Math.min(Math.max(0, maxWidth - 1), TREE_DETAIL_BASE_INDENT + Math.max(0, maxDepth) * TREE_SEGMENT_WIDTH);
}

/** Right-align `text` inside a fixed-width cell, truncating overflow. */
export function alignRightCell(text: string, width: number): string {
	return renderTableRow([{ text }], [{ width, align: "right", overflow: "truncate" }], undefined, {
		fit: false,
	});
}
