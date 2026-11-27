import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "bun:test";
import { stripVTControlCharacters } from "node:util";
import type { AssistantMessage } from "@oh-my-pi/pi-ai";
import { setKeybindings } from "@oh-my-pi/pi-tui";
import { KeybindingsManager } from "@oh-my-pi/pi-tui/app-keybindings";
import { AssistantMessageComponent } from "@oh-my-pi/pi-tui/chat/assistant-message";
import { resetActiveThinkingEffortForTests, setActiveThinkingEffort } from "@oh-my-pi/pi-tui/chat/effort-ladder";
import { UserMessageComponent } from "@oh-my-pi/pi-tui/chat/user-message";
import { renderDiff, SIDE_BY_SIDE_MIN_WIDTH } from "@oh-my-pi/pi-tui/chrome/diff";
import { isRowPrefix, trimBlankEdges } from "@oh-my-pi/pi-tui/chrome/transcript-container";
import { getLanguage, type Language, setLanguage } from "@oh-my-pi/pi-tui/i18n";
import type { NativeNode } from "@oh-my-pi/pi-tui/native/node";
import { APPROVE_ARM_MS, ApprovalDialogComponent } from "@oh-my-pi/pi-tui/overlays/approval-dialog";
import { formatToolChip, framedToolCard, semanticToolChip } from "@oh-my-pi/pi-tui/render/tool-card";
import { initTheme, theme } from "@oh-my-pi/pi-tui/theme";
import { editToolRenderer } from "@oh-my-pi/pi-tui/tools/edit";
import { visibleWidth } from "@oh-my-pi/pi-tui/utils";

const USAGE: AssistantMessage["usage"] = {
	input: 10,
	output: 20,
	cacheRead: 0,
	cacheWrite: 0,
	totalTokens: 30,
	cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

function makeAssistantMessage(content: AssistantMessage["content"]): AssistantMessage {
	return {
		role: "assistant",
		content,
		api: "anthropic-messages",
		provider: "anthropic",
		model: "claude-sonnet-4-5",
		stopReason: "stop",
		usage: USAGE,
		timestamp: 1,
	};
}

function collectNodes(root: NativeNode): NativeNode[] {
	const out: NativeNode[] = [root];
	for (const child of root.c ?? []) {
		if ("k" in child && typeof child.k === "string") {
			out.push(...collectNodes(child));
		}
	}
	return out;
}

describe("Nightglide G3 content cards and approval localization", () => {
	let savedLanguage: Language = "zh";

	beforeAll(async () => {
		await initTheme(false);
	});

	beforeEach(() => {
		savedLanguage = getLanguage();
		resetActiveThinkingEffortForTests();
		setKeybindings(KeybindingsManager.inMemory({ "tui.select.cancel": "escape" }));
	});

	afterEach(() => {
		setLanguage(savedLanguage);
		resetActiveThinkingEffortForTests();
		setKeybindings(KeybindingsManager.inMemory());
	});

	describe("user message card", () => {
		it("renders bilingual speaker badge rows, live steering, reactions, and emergency content row", () => {
			setLanguage("zh");
			const bubble = new UserMessageComponent("Check cache invalidation", { liveSteered: true });
			bubble.setReaction("🚀");
			const zhRows = bubble.render(60);
			const zhTop = stripVTControlCharacters(zhRows[0]!);
			expect(zhTop).toStartWith(" * > 你");
			expect(zhTop).toEndWith("🚀 ");
			expect(visibleWidth(zhRows[0]!)).toBe(60);
			expect(zhRows.join("\n")).toContain("\x1b]133;A\x07");
			expect(zhRows.join("\n")).toContain("\x1b]133;B\x07\x1b]133;C\x07\x1b]133;D;0\x07");

			setLanguage("en");
			const enRows = bubble.render(60);
			const enTop = stripVTControlCharacters(enRows[0]!);
			expect(enTop).toStartWith(" * > you");
			expect(enTop).toEndWith("🚀 ");
			expect(visibleWidth(enRows[0]!)).toBe(60);

			const emergency = bubble.renderTranscriptBlockEmergencyRow(60);
			expect(emergency).toBeDefined();
			expect(stripVTControlCharacters(emergency!)).toContain("Check cache invalidation");
			expect(stripVTControlCharacters(emergency!)).not.toContain("> you");
		});
	});

	describe("assistant message header and append-only scrollback contract", () => {
		it("renders Nightglide header with real effort bars only when effort resolves to a rung", () => {
			setActiveThinkingEffort("high");
			const highComp = new AssistantMessageComponent(makeAssistantMessage([{ type: "text", text: "Done." }]));
			const highRows = highComp.render(140);
			const highHeader = stripVTControlCharacters(highRows[0]!);
			expect(highHeader).toContain("✦ Nightglide");
			expect(highHeader).toContain("▰▰▰▰▱");
			for (const row of highRows) {
				expect(visibleWidth(row)).toBeLessThanOrEqual(90);
			}

			setActiveThinkingEffort("auto");
			const autoComp = new AssistantMessageComponent(makeAssistantMessage([{ type: "text", text: "Done." }]));
			const autoHeader = stripVTControlCharacters(autoComp.render(80)[0]!);
			expect(autoHeader).toContain("✦ Nightglide");
			expect(autoHeader).not.toContain("▰");
			expect(autoHeader).not.toContain("▱");

			setActiveThinkingEffort(undefined);
			const offComp = new AssistantMessageComponent(makeAssistantMessage([{ type: "text", text: "Done." }]));
			const offHeader = stripVTControlCharacters(offComp.render(80)[0]!);
			expect(offHeader).toContain("✦ Nightglide");
			expect(offHeader).not.toContain("▰");
		});

		it("omits assistant header when rendered body is completely empty", () => {
			const hiddenThinking = new AssistantMessageComponent(
				makeAssistantMessage([{ type: "thinking", thinking: "Internal trace" }]),
				true,
			);
			expect(hiddenThinking.render(80)).toEqual([]);
		});

		it("preserves append-only stable scrollback prefixes even if effort changes mid-stream", () => {
			setActiveThinkingEffort("xhigh");
			const comp = new AssistantMessageComponent();
			const para1 = "First streaming paragraph wraps across rows cleanly on narrow viewports. ".repeat(2);
			const msg1 = makeAssistantMessage([{ type: "text", text: `${para1}\n\nSecond` }]);
			comp.updateContent(msg1, { transient: true });
			const firstRender = comp.render(64);
			const stableCount1 = comp.getTranscriptStableRows().length;
			expect(stableCount1).toBeGreaterThan(0);
			const stable1 = comp.renderTranscriptStableRows(stableCount1, 64);
			expect(stripVTControlCharacters(stable1[0]!)).toContain("✦ Nightglide");
			expect(isRowPrefix(stable1, trimBlankEdges(firstRender))).toBe(true);

			// Change global effort after row 0 has already published: committed prefix must stay byte-identical.
			setActiveThinkingEffort("low");
			const para2 = "Second streaming paragraph finishes cleanly while a third starts. ".repeat(2);
			comp.updateContent(makeAssistantMessage([{ type: "text", text: `${para1}\n\n${para2}\n\nThird` }]), {
				transient: true,
			});
			const secondRender = comp.render(64);
			const stableCount2 = comp.getTranscriptStableRows().length;
			const stable2 = comp.renderTranscriptStableRows(stableCount2, 64);
			expect(isRowPrefix(stable1, stable2)).toBe(true);
			expect(isRowPrefix(stable2, trimBlankEdges(secondRender))).toBe(true);
		});
	});

	describe("tool chips and diff cards", () => {
		it("formats semantic tool chips on tool cards", () => {
			const chip = semanticToolChip("bash", theme);
			expect(chip).toBeDefined();
			expect(stripVTControlCharacters(formatToolChip(chip!, theme))).toContain("bash");

			const card = framedToolCard(theme, () => ({
				status: { icon: "success", title: "Bash", description: "bun test" },
				chip: semanticToolChip("bash", theme),
				phase: "success",
				body: ["1 passed"],
			}));
			const head = stripVTControlCharacters(card.render(80)[0]!);
			expect(head).toContain("Bash: bun test");
			expect(head).toContain(`${theme.format.bracketLeft}${chip!.glyph} bash${theme.format.bracketRight}`);
		});

		it("renders diff badge in edit headerMeta alongside diff stats and supports unified/side-by-side diffs", () => {
			const diff = [" 10 const a = 1;", "-11 const b = 2;", "+11 const b = 42;", " 12 return a + b;"].join("\n");
			const resultCard = editToolRenderer.renderResult(
				{
					content: [{ type: "text", text: "Updated" }],
					details: { path: "src/cache.ts", diff, firstChangedLine: 11 },
				},
				{ expanded: false, isPartial: false },
				theme,
				{ path: "src/cache.ts" },
			);
			const rendered80 = resultCard.render(80);
			const topRow = stripVTControlCharacters(rendered80[0]!);
			expect(topRow).toContain("src/cache.ts");
			expect(topRow).toContain("+1/-1");
			expect(topRow).toContain("diff");
			expect(visibleWidth(rendered80[0]!)).toBe(80);

			const unified = renderDiff(diff, { filePath: "src/cache.ts", width: SIDE_BY_SIDE_MIN_WIDTH - 1, theme });
			expect(unified).toContain(theme.getFgAnsi("toolDiffWordRemoved"));
			expect(unified).toContain(theme.getFgAnsi("toolDiffWordAdded"));

			const wide = renderDiff(diff, { filePath: "src/cache.ts", width: SIDE_BY_SIDE_MIN_WIDTH, theme });
			for (const row of wide.split("\n")) {
				expect(visibleWidth(row)).toBeLessThanOrEqual(SIDE_BY_SIDE_MIN_WIDTH);
			}
		});
	});

	describe("approval dialog localization and draft shortcut safety", () => {
		it("localizes prompt title, choices, buttons, and footer in zh and en while keeping bash warning chrome", () => {
			setLanguage("zh");
			const zhDialog = new ApprovalDialogComponent(
				"Allow tool: bash\nCommand: rm -rf ./tmp",
				{ onApprove: vi.fn(), onDeny: vi.fn() },
				{ grants: [{ label: "当前目录", alwaysLabel: "始终目录" }] },
			);
			const zhRendered = zhDialog.render(90);
			const zhPlain = stripVTControlCharacters(zhRendered.join("\n"));
			expect(zhRendered[0]).toContain(theme.getFgAnsi("warning"));
			expect(zhPlain).toContain("允许工具：bash");
			expect(zhPlain).toContain("记住授权（跨会话）");
			expect(zhPlain).toContain("允许一次");
			expect(zhPlain).toContain("拒绝");

			const zhLabels = collectNodes(zhDialog.describe())
				.map(node => {
					const props = node.p;
					if (!props) return "";
					if ("label" in props && typeof props.label === "string") return props.label;
					if ("text" in props && typeof props.text === "string") return props.text;
					return "";
				})
				.join("\n");
			expect(zhLabels).toContain("允许工具：bash");
			expect(zhLabels).toContain("允许一次");
			expect(zhLabels).toContain("拒绝");

			// Switching language dynamically updates displayed labels and title.
			setLanguage("en");
			const enPlain = stripVTControlCharacters(zhDialog.render(90).join("\n"));
			expect(enPlain).toContain("Allow tool: bash");
			expect(enPlain).toContain("Remember across sessions");
			expect(enPlain).toContain("Approve Once");
			expect(enPlain).toContain("Deny");

			const readOnly = new ApprovalDialogComponent("Allow tool: read\nPath: README.md", {
				onApprove: vi.fn(),
				onDeny: vi.fn(),
			});
			expect(readOnly.render(60)[0]).not.toContain(theme.getFgAnsi("warning"));
		});

		it("hides [y]/[s]/[n] badges when draft is provided and routes y/s/n into draft rather than answering", () => {
			setLanguage("zh");
			let draftText = "";
			const callbacks = { onApprove: vi.fn(), onDeny: vi.fn() };
			const onSession = vi.fn();
			const now = vi.spyOn(performance, "now").mockReturnValue(1_000);
			try {
				const dialog = new ApprovalDialogComponent("Allow tool: bash\nCommand: ls", callbacks, {
					session: { label: "本会话允许 bash", onApprove: onSession },
					draft: {
						hasDraft: () => draftText.length > 0,
						handleInput: key => {
							draftText += key;
						},
					},
				});
				const plainBefore = stripVTControlCharacters(dialog.render(80).join("\n"));
				expect(plainBefore).not.toContain("[y]");
				expect(plainBefore).not.toContain("[s]");
				expect(plainBefore).not.toContain("[n]");

				now.mockReturnValue(1_000 + APPROVE_ARM_MS);
				dialog.handleInput("y");
				expect(draftText).toBe("y");
				expect(callbacks.onApprove).not.toHaveBeenCalled();
				expect(onSession).not.toHaveBeenCalled();
				expect(callbacks.onDeny).not.toHaveBeenCalled();

				const plainAfter = stripVTControlCharacters(dialog.render(80).join("\n"));
				expect(plainAfter).toContain("拒绝并发送消息");

				// Ctrl+Q approves even when draft text is present.
				dialog.handleInput("\x11");
				expect(callbacks.onApprove).toHaveBeenCalledTimes(1);
			} finally {
				now.mockRestore();
			}
		});
	});
});
