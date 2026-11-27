/**
 * Nightglide `/summary` command and on-demand task summary builder.
 *
 * Collects 100% factual session state (turn status, prompt/reply counts, active
 * and completed tool calls, touched files, and live subagents) without mutating
 * session history or making implicit model calls.
 *
 * When the user explicitly triggers AI summarization in the overlay, runs a
 * one-shot non-mutating `streamSimple` request using bounded, redacted excerpts
 * and `ctx.session.modelRegistry.getApiKey(...)` / `resolver(...)`.
 */
import type { AgentMessage } from "@oh-my-pi/pi-agent-core";
import { type AssistantMessage, streamSimple, type ToolCall } from "@oh-my-pi/pi-ai";
import type { OverlayHandle } from "@oh-my-pi/pi-tui";
import { t } from "@oh-my-pi/pi-tui/i18n";
import type { ObservableSession } from "@oh-my-pi/pi-tui/overlays/session-observer-registry";
import {
	type TaskSummaryData,
	TaskSummaryOverlayComponent,
	type TaskSummarySubagent,
	type TaskSummaryToolEntry,
	type TaskTurnStatus,
} from "@oh-my-pi/pi-tui/overlays/task-summary";
import { replaceTabs, shortenPath, TRUNCATE_LENGTHS, truncateToWidth } from "@oh-my-pi/pi-tui/render/render-utils";
import { sanitizeText } from "@oh-my-pi/pi-utils";
import type { InteractiveModeContext } from "../modes/types";
import { CREDENTIAL_PATTERNS, CREDENTIAL_PREFIX_RULES } from "../secrets/patterns";
import { isSilentAbort, resolveAbortLabel } from "../session/messages";
import { StreamRedactor } from "../stream/redactor";
import { cfgStreamRedactPatterns } from "../stream/settings";
import { clearSubmittedText } from "./helpers/draft";
import type { SlashCommandSpec } from "./types";

const MAX_EXCERPT_CHARS = 320;
const MAX_PROMPT_EXCERPT_CHARS = 240;
const MAX_AI_MESSAGES = 14;
const MAX_AI_MESSAGE_CHARS = 500;
const MAX_AI_PAYLOAD_CHARS = 6000;
const MAX_TOUCHED_FILES = 30;
const AI_SUMMARY_TIMEOUT_MS = 60_000;

const FILE_TOUCH_TOOLS = new Set(["read", "write", "edit", "apply_patch", "delete", "move"]);

function createSyncBaselineRedactor(): StreamRedactor {
	const patterns: RegExp[] = CREDENTIAL_PATTERNS.map(entry => {
		const flags = entry.flags?.includes("g") ? entry.flags : `${entry.flags ?? ""}g`;
		return new RegExp(entry.source, flags);
	});
	const tokenPrefixSources = CREDENTIAL_PREFIX_RULES.filter(rule => rule.mode === "token").map(rule => rule.source);
	const linePrefixSources = CREDENTIAL_PREFIX_RULES.filter(rule => rule.mode === "line").map(rule => rule.source);
	const bearerPrefixSources = CREDENTIAL_PREFIX_RULES.filter(rule => rule.mode === "bearer-token").map(
		rule => rule.source,
	);
	patterns.push(new RegExp(`(?<![A-Za-z0-9_-])(?:${tokenPrefixSources.join("|")})\\S*`, "g"));
	patterns.push(new RegExp(`(?:${linePrefixSources.join("|")})[^\\r\\n]*`, "g"));
	patterns.push(new RegExp(`(?<=\\b(?:${bearerPrefixSources.join("|")}))\\S+`, "gi"));
	return new StreamRedactor(patterns, []);
}

function redactLines(text: string, redactor: StreamRedactor): string {
	return text
		.split(/\r?\n/)
		.map(line => redactor.redactRow(replaceTabs(sanitizeText(line))))
		.join("\n");
}

function singleLineExcerpt(text: string, maxChars: number, redactor: StreamRedactor): string {
	const flat = redactLines(text, redactor).replace(/\s+/g, " ").trim();
	if (!flat) return "";
	return flat.length > maxChars ? `${flat.slice(0, maxChars - 1).trimEnd()}…` : flat;
}

function textFromContent(content: unknown): string {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	const parts: string[] = [];
	for (const block of content) {
		if (block && typeof block === "object" && "type" in block && block.type === "text" && "text" in block) {
			if (typeof block.text === "string" && block.text.trim()) parts.push(block.text);
		}
	}
	return parts.join("\n").trim();
}

function extractPathsFromPatch(patchText: string): string[] {
	const found: string[] = [];
	for (const line of patchText.split(/\r?\n/)) {
		const match = /^\*\*\*\s+(?:Add|Update|Delete|Move to)\s+File:\s*(.+)$/.exec(line.trim());
		if (match?.[1]) found.push(match[1].trim());
	}
	return found;
}

function extractFilePathsFromToolArgs(toolName: string, args: unknown): string[] {
	if (!FILE_TOUCH_TOOLS.has(toolName) || !args || typeof args !== "object") return [];
	const rec = args as Record<string, unknown>;
	const paths: string[] = [];
	for (const key of ["path", "file_path", "target", "dest", "source"] as const) {
		const val = rec[key];
		if (typeof val === "string" && val.trim()) paths.push(val.trim());
	}
	if (Array.isArray(rec.paths)) {
		for (const item of rec.paths) {
			if (typeof item === "string" && item.trim()) paths.push(item.trim());
		}
	}
	if (toolName === "apply_patch") {
		for (const key of ["patch", "input"] as const) {
			if (typeof rec[key] === "string") {
				paths.push(...extractPathsFromPatch(rec[key]));
			}
		}
	}
	return paths;
}

function extractFilePathsFromDetails(details: unknown): string[] {
	if (!details || typeof details !== "object") return [];
	const rec = details as Record<string, unknown>;
	const paths: string[] = [];
	for (const key of ["path", "filePath", "patchPath"] as const) {
		const val = rec[key];
		if (typeof val === "string" && val.trim()) paths.push(val.trim());
	}
	if (Array.isArray(rec.files)) {
		for (const item of rec.files) {
			if (typeof item === "string" && item.trim()) paths.push(item.trim());
		}
	}
	return paths;
}

function extractSummaryMetrics(
	messages: readonly AgentMessage[],
	pendingToolsSize: number,
	subagents: readonly TaskSummarySubagent[],
	redactor: StreamRedactor,
): {
	userPromptCount: number;
	assistantReplyCount: number;
	latestUserPrompt: string | undefined;
	latestAssistantReply: string | undefined;
	lastAssistant: AssistantMessage | undefined;
	activeTools: string[];
	tools: TaskSummaryToolEntry[];
	touchedFiles: string[];
	excerpts: string[];
} {
	let userPromptCount = 0;
	let assistantReplyCount = 0;
	let latestUserPrompt: string | undefined;
	let latestAssistantReply: string | undefined;
	let lastAssistant: AssistantMessage | undefined;

	const callsById = new Map<string, { name: string; done: boolean; isError: boolean }>();
	const toolOrder: string[] = [];
	const toolStats = new Map<string, { count: number; errors: number; running: number }>();
	const touchedSet = new Set<string>();
	const excerpts: string[] = [];

	const ensureToolStat = (name: string) => {
		let entry = toolStats.get(name);
		if (!entry) {
			entry = { count: 0, errors: 0, running: 0 };
			toolStats.set(name, entry);
			toolOrder.push(name);
		}
		return entry;
	};

	const recordFile = (rawPath: string) => {
		if (touchedSet.size >= MAX_TOUCHED_FILES) return;
		const clean = truncateToWidth(redactor.redactRow(replaceTabs(shortenPath(rawPath))), TRUNCATE_LENGTHS.CONTENT);
		if (clean) touchedSet.add(clean);
	};

	for (const msg of messages) {
		if (msg.role === "user") {
			if (msg.attribution === "agent") continue;
			userPromptCount++;
			const txt = textFromContent(msg.content);
			if (txt) {
				latestUserPrompt = singleLineExcerpt(txt, MAX_PROMPT_EXCERPT_CHARS, redactor);
				excerpts.push(`User: ${singleLineExcerpt(txt, MAX_AI_MESSAGE_CHARS, redactor)}`);
			}
			continue;
		}
		if (msg.role === "assistant") {
			assistantReplyCount++;
			lastAssistant = msg;
			const txt = textFromContent(msg.content);
			if (txt) {
				latestAssistantReply = singleLineExcerpt(txt, MAX_EXCERPT_CHARS, redactor);
				excerpts.push(`Assistant: ${singleLineExcerpt(txt, MAX_AI_MESSAGE_CHARS, redactor)}`);
			}
			for (const block of msg.content) {
				if (block.type === "toolCall") {
					const call = block as ToolCall;
					const stat = ensureToolStat(call.name);
					stat.count++;
					callsById.set(call.id, { name: call.name, done: false, isError: false });
					for (const fp of extractFilePathsFromToolArgs(call.name, call.arguments)) {
						recordFile(fp);
					}
				}
			}
			continue;
		}
		if (msg.role === "toolResult") {
			const existing = callsById.get(msg.toolCallId);
			const stat = ensureToolStat(msg.toolName);
			if (existing) {
				existing.done = true;
				existing.isError = msg.isError;
			} else {
				stat.count++;
			}
			if (msg.isError) stat.errors++;
			for (const fp of extractFilePathsFromDetails(msg.details)) {
				recordFile(fp);
			}
		}
	}

	const activeTools: string[] = [];
	for (const call of callsById.values()) {
		if (!call.done) {
			activeTools.push(call.name);
			const stat = toolStats.get(call.name);
			if (stat) stat.running++;
		}
	}
	if (pendingToolsSize > activeTools.length && subagents.length === 0) {
		const extra = pendingToolsSize - activeTools.length;
		activeTools.push(t("summary.extraActiveTools", { count: extra }));
	}

	const tools: TaskSummaryToolEntry[] = toolOrder.map(name => {
		const s = toolStats.get(name)!;
		return { name, count: s.count, errors: s.errors, running: s.running };
	});

	return {
		userPromptCount,
		assistantReplyCount,
		latestUserPrompt,
		latestAssistantReply,
		lastAssistant,
		activeTools,
		tools,
		touchedFiles: [...touchedSet],
		excerpts,
	};
}

/** Collect real, redacted session facts and bounded AI summary input without mutating session history. */
export function buildTaskSummaryData(
	ctx: InteractiveModeContext,
	subagentSessions: readonly ObservableSession[] = [],
	redactor: StreamRedactor = createSyncBaselineRedactor(),
): { data: TaskSummaryData; aiPayload: string } {
	const session = ctx.session;
	const messages = session.state.messages;
	const model = session.model ?? session.state.model;
	const modelLabel = model ? `${model.provider}/${model.name || model.id}` : undefined;
	const routingMode = session.getNightglideRoutingMode?.();

	const subagents: TaskSummarySubagent[] = subagentSessions
		.filter(s => s.kind === "subagent")
		.map(s => ({
			label: redactor.redactRow(replaceTabs(sanitizeText(s.label || s.agent || "agent"))),
			agent: s.agent,
			status: s.status,
			currentTool: s.progress?.currentTool ? redactor.redactRow(sanitizeText(s.progress.currentTool)) : undefined,
			elapsedMs: s.progress?.durationMs,
			toolCount: s.progress?.toolCount,
			tokens: s.progress?.tokens,
		}));

	const metrics = extractSummaryMetrics(messages, ctx.pendingTools.size, subagents, redactor);
	const hasSubagentRunning = subagents.some(
		s => s.status !== "completed" && s.status !== "failed" && s.status !== "aborted",
	);
	const hasSubagentFailed = subagents.some(s => s.status === "failed");
	const hasSubagentAborted = subagents.some(s => s.status === "aborted");
	const missingInfo =
		metrics.userPromptCount === 0 &&
		metrics.assistantReplyCount === 0 &&
		metrics.tools.length === 0 &&
		metrics.touchedFiles.length === 0 &&
		subagents.length === 0;

	let status: TaskTurnStatus;
	let statusDetail: string | undefined;

	if (session.isStreaming || ctx.pendingTools.size > 0 || hasSubagentRunning) {
		status = "in_progress";
	} else if (missingInfo && !session.state.error) {
		status = "empty";
	} else if (metrics.lastAssistant?.stopReason === "error") {
		status = "failed";
		const rawErr = metrics.lastAssistant.errorMessage ?? session.state.error;
		statusDetail = rawErr ? singleLineExcerpt(rawErr, MAX_EXCERPT_CHARS, redactor) : undefined;
	} else if (session.state.error) {
		status = "failed";
		statusDetail = singleLineExcerpt(session.state.error, MAX_EXCERPT_CHARS, redactor);
	} else if (metrics.lastAssistant?.stopReason === "aborted") {
		status = "cancelled";
		if (!isSilentAbort(metrics.lastAssistant)) {
			statusDetail = singleLineExcerpt(resolveAbortLabel(metrics.lastAssistant), MAX_EXCERPT_CHARS, redactor);
		}
	} else if (hasSubagentFailed) {
		status = "failed";
	} else if (hasSubagentAborted) {
		status = "cancelled";
	} else if (metrics.assistantReplyCount > 0) {
		status = "completed";
	} else if (metrics.userPromptCount > 0) {
		status = "cancelled";
	} else {
		status = "empty";
	}

	// Build bounded, redacted AI payload
	const recentExcerpts = metrics.excerpts.slice(-MAX_AI_MESSAGES);
	const payloadParts: string[] = [
		`Status: ${status}${statusDetail ? ` (${statusDetail})` : ""}`,
		`Turns: ${metrics.userPromptCount} user, ${metrics.assistantReplyCount} assistant`,
	];
	if (metrics.tools.length > 0) {
		payloadParts.push(
			`Tools: ${metrics.tools.map(t => `${t.name}x${t.count}${t.errors ? `(${t.errors}err)` : ""}`).join(", ")}`,
		);
	}
	if (metrics.touchedFiles.length > 0) {
		payloadParts.push(`Files: ${metrics.touchedFiles.join(", ")}`);
	}
	if (subagents.length > 0) {
		payloadParts.push(`Subagents: ${subagents.map(s => `${s.label}:${s.status}`).join(", ")}`);
	}
	let usedMessages = 0;
	let totalText = `${payloadParts.join("\n")}\n\nConversation:\n`;
	for (const excerpt of recentExcerpts) {
		if (totalText.length + excerpt.length + 1 > MAX_AI_PAYLOAD_CHARS) break;
		totalText += `${excerpt}\n`;
		usedMessages++;
	}
	const aiPayload = totalText.trimEnd();

	const rawTitle = ctx.sessionManager.getSessionName() ?? ctx.sessionName;
	const sessionTitle = rawTitle ? singleLineExcerpt(rawTitle, 80, redactor) : undefined;

	const data: TaskSummaryData = {
		status,
		statusDetail,
		sessionTitle,
		modelLabel,
		routingMode,
		userPromptCount: metrics.userPromptCount,
		assistantReplyCount: metrics.assistantReplyCount,
		latestUserPrompt: metrics.latestUserPrompt,
		latestAssistantReply: metrics.latestAssistantReply,
		activeTools: metrics.activeTools,
		tools: metrics.tools,
		touchedFiles: metrics.touchedFiles,
		subagents,
		scope: {
			messageCount: usedMessages,
			charCount: aiPayload.length,
			modelLabel,
			routingMode,
		},
		missingInfo,
	};

	return { data, aiPayload };
}

function summarySystemInstruction(): string {
	return t("summary.systemPrompt");
}

export interface TaskSummaryHandleSlot {
	get(): OverlayHandle | undefined;
	set(handle: OverlayHandle | undefined): void;
	onClosed?: () => void;
}

/** Open the Nightglide Task Summary overlay over the current interactive view. */
export function openTaskSummaryOverlay(
	ctx: InteractiveModeContext,
	subagentSessions: readonly ObservableSession[] = [],
	handleSlot?: TaskSummaryHandleSlot,
): void {
	if (handleSlot?.get()) return;

	const { data, aiPayload } = buildTaskSummaryData(ctx, subagentSessions);
	const cwd = ctx.sessionManager.getCwd();

	const closeOverlay = () => {
		const handle = handleSlot?.get();
		handleSlot?.set(undefined);
		handle?.hide();
		if (handleSlot?.onClosed) handleSlot.onClosed();
		else ctx.ui.setFocus(ctx.editor);
		ctx.ui.requestRender();
	};

	const overlay = new TaskSummaryOverlayComponent(
		data,
		{
			generate: async ({ signal, onDelta }) => {
				const model = ctx.session.model ?? ctx.session.state.model;
				if (!model) {
					throw new Error(t("summary.errNoModelSelected"));
				}
				const extraPatterns = cfgStreamRedactPatterns.get(ctx.settings);
				const redactor = await StreamRedactor.load(cwd, extraPatterns);
				const sessionId = ctx.session.sessionId;
				const apiKey = await ctx.session.modelRegistry.getApiKey(model, sessionId, { signal });
				if (!apiKey) {
					throw new Error(
						redactor.redactRow(t("summary.errNoCredentials", { model: `${model.provider}/${model.id}` })),
					);
				}

				const redactedPayload = redactLines(aiPayload, redactor);
				const requestSignal = AbortSignal.any([signal, AbortSignal.timeout(AI_SUMMARY_TIMEOUT_MS)]);
				const stream = streamSimple(
					model,
					{
						systemPrompt: [summarySystemInstruction()],
						messages: [{ role: "user", content: redactedPayload, timestamp: Date.now() }],
					},
					{
						apiKey: ctx.session.modelRegistry.resolver(model, sessionId),
						sessionId: `${sessionId}:summary:${Date.now()}`,
						disableReasoning: true,
						maxTokens: 768,
						signal: requestSignal,
					},
				);

				let fullText = "";
				for await (const event of stream) {
					if (signal.aborted) break;
					if (event.type === "text_delta") {
						fullText += event.delta;
						onDelta(redactLines(event.delta, redactor));
					} else if (event.type === "error") {
						const errMsg = event.error.errorMessage || "Model request failed";
						throw new Error(redactLines(errMsg, redactor));
					} else if (event.type === "done") {
						const doneText = textFromContent(event.message.content);
						if (doneText) fullText = doneText;
					}
				}
				return redactLines(fullText, redactor);
			},
		},
		{
			rows: () => Math.max(14, Math.floor(ctx.ui.terminal.rows * 0.9)),
			requestRender: () => ctx.ui.requestRender(),
			onClose: closeOverlay,
		},
	);

	const handle = ctx.ui.showOverlay(overlay, {
		anchor: "center",
		width: "90%",
		maxHeight: "90%",
	});
	if (handleSlot) {
		handleSlot.set(handle);
	} else {
		// Standalone fallback (when invoked without a handle slot) keeps handle local.
		const localSlot: OverlayHandle = handle;
		overlay.dispose = () => {
			TaskSummaryOverlayComponent.prototype.dispose.call(overlay);
			localSlot.hide();
		};
	}
	ctx.ui.setFocus(overlay);
	ctx.ui.requestRender();
}

export const BUILTIN_SUMMARY_SLASH_COMMANDS: ReadonlyArray<SlashCommandSpec> = [
	{
		name: "summary",
		icon: "stats",
		description: "Show task summary (local facts + on-demand AI summary)",
		handleTui: (_command, runtime) => {
			clearSubmittedText(runtime);
			const host = runtime.ctx as InteractiveModeContext & { showTaskSummary?: () => void };
			if (host.showTaskSummary) {
				host.showTaskSummary();
				return;
			}
			openTaskSummaryOverlay(runtime.ctx);
		},
	},
];
