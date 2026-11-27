import { afterEach, beforeAll, describe, expect, it } from "bun:test";
import { stripVTControlCharacters } from "node:util";
import { setLanguage } from "@oh-my-pi/pi-tui/i18n";
import { setMotionEffects } from "@oh-my-pi/pi-tui/motion-effects";
import { TaskSummaryOverlayComponent, type TaskSummaryData } from "@oh-my-pi/pi-tui/overlays/task-summary";
import { getThemeByName, setThemeInstance } from "@oh-my-pi/pi-tui/theme";

beforeAll(async () => {
	const theme = await getThemeByName("dark");
	if (!theme) throw new Error("dark theme unavailable");
	setThemeInstance(theme);
});

afterEach(() => {
	setLanguage("zh");
	setMotionEffects(true);
});

function sampleData(overrides: Partial<TaskSummaryData> = {}): TaskSummaryData {
	return {
		status: "completed",
		sessionTitle: "Fix parser",
		modelLabel: "anthropic/claude-sonnet",
		routingMode: "balanced",
		userPromptCount: 2,
		assistantReplyCount: 2,
		latestUserPrompt: "Update parser and run tests",
		latestAssistantReply: "Updated parser.ts and verified tests pass.",
		activeTools: [],
		tools: [
			{ name: "read", count: 3, errors: 0, running: 0 },
			{ name: "edit", count: 1, errors: 0, running: 0 },
		],
		touchedFiles: ["src/parser.ts", "test/parser.test.ts"],
		subagents: [{ label: "tester", status: "completed", toolCount: 2, elapsedMs: 1200 }],
		scope: {
			messageCount: 4,
			charCount: 420,
			modelLabel: "anthropic/claude-sonnet",
			routingMode: "balanced",
		},
		missingInfo: false,
		...overrides,
	};
}

const renderPlain = (comp: TaskSummaryOverlayComponent, width = 90) =>
	comp.render(width).map(line => stripVTControlCharacters(line));

describe("TaskSummaryOverlayComponent", () => {
	it("shows local factual summary, context scope, and cost notice without calling generate", () => {
		let generateCalls = 0;
		const overlay = new TaskSummaryOverlayComponent(
			sampleData(),
			{
				generate: async () => {
					generateCalls++;
					return "should not run automatically";
				},
			},
			{ rows: () => 30, onClose: () => {} },
		);

		const text = renderPlain(overlay).join("\n");
		expect(generateCalls).toBe(0);
		expect(text).toContain("已完成");
		expect(text).toContain("anthropic/claude-sonnet");
		expect(text).toContain("src/parser.ts");
		expect(text).toContain("read×3");
		expect(text).toContain("tester");
		expect(text).toContain("4 条脱敏消息摘要");
		expect(text).toContain("420 字符");
		expect(text).toContain("不会修改会话历史");
		overlay.dispose();
	});

	it("honestly reports in_progress, failed, cancelled, and empty/missing states", () => {
		const inProgress = new TaskSummaryOverlayComponent(
			sampleData({ status: "in_progress", activeTools: ["edit"] }),
			{},
			{ rows: () => 28, onClose: () => {} },
		);
		expect(renderPlain(inProgress).join("\n")).toContain("进行中");
		expect(renderPlain(inProgress).join("\n")).toContain("edit");
		inProgress.dispose();

		const failed = new TaskSummaryOverlayComponent(
			sampleData({ status: "failed", statusDetail: "API 429 rate limit" }),
			{},
			{ rows: () => 28, onClose: () => {} },
		);
		expect(renderPlain(failed).join("\n")).toContain("失败");
		expect(renderPlain(failed).join("\n")).toContain("API 429 rate limit");
		failed.dispose();

		const cancelled = new TaskSummaryOverlayComponent(
			sampleData({ status: "cancelled", statusDetail: "Interrupted by user" }),
			{},
			{ rows: () => 28, onClose: () => {} },
		);
		expect(renderPlain(cancelled).join("\n")).toContain("已取消");
		cancelled.dispose();

		const empty = new TaskSummaryOverlayComponent(
			sampleData({
				status: "empty",
				missingInfo: true,
				userPromptCount: 0,
				assistantReplyCount: 0,
				tools: [],
				touchedFiles: [],
				subagents: [],
				latestUserPrompt: undefined,
				latestAssistantReply: undefined,
				modelLabel: undefined,
				scope: { messageCount: 0, charCount: 0 },
			}),
			{},
			{ rows: () => 28, onClose: () => {} },
		);
		const emptyText = renderPlain(empty).join("\n");
		expect(emptyText).toContain("无任务信息");
		expect(emptyText).toContain("未选择模型");
		empty.dispose();
	});

	it("streams AI summary on explicit Enter/g action and settles cleanly", async () => {
		const { promise, resolve } = Promise.withResolvers<string>();
		let capturedSignal: AbortSignal | undefined;
		const overlay = new TaskSummaryOverlayComponent(
			sampleData(),
			{
				generate: async ({ signal, onDelta }) => {
					capturedSignal = signal;
					onDelta("First line ");
					await Bun.sleep(5);
					onDelta("second part");
					return promise;
				},
			},
			{ rows: () => 30, onClose: () => {} },
		);

		overlay.handleInput("\r");
		expect(overlay.getAiStatus()).toBe("generating");
		expect(renderPlain(overlay).join("\n")).toContain("正在生成 AI 总结");

		await Bun.sleep(15);
		expect(overlay.getAiText()).toContain("First line second part");
		expect(capturedSignal?.aborted).toBe(false);

		resolve("- Goal achieved\n- Tests green");
		await Bun.sleep(5);
		expect(overlay.getAiStatus()).toBe("done");
		const finalText = renderPlain(overlay).join("\n");
		expect(finalText).toContain("Goal achieved");
		expect(finalText).toContain("Tests green");
		overlay.dispose();
	});

	it("cancels in-flight AI generation on first Esc without closing, then closes on second Esc", async () => {
		let closed = 0;
		let abortedDuringRun = false;
		const never = Promise.withResolvers<string>();
		const overlay = new TaskSummaryOverlayComponent(
			sampleData(),
			{
				generate: ({ signal }) => {
					signal.addEventListener("abort", () => {
						abortedDuringRun = true;
					});
					return never.promise;
				},
			},
			{ rows: () => 30, onClose: () => closed++ },
		);

		overlay.handleInput("g");
		expect(overlay.getAiStatus()).toBe("generating");

		// First Esc aborts the request and keeps the overlay open.
		overlay.handleInput("\x1b");
		expect(abortedDuringRun).toBe(true);
		expect(overlay.getAiStatus()).toBe("cancelled");
		expect(closed).toBe(0);
		expect(renderPlain(overlay).join("\n")).toContain("已取消 AI 总结生成");

		// Second Esc closes the overlay.
		overlay.handleInput("\x1b");
		expect(closed).toBe(1);
	});

	it("surfaces generation errors cleanly and supports mouse button clicks", async () => {
		let closed = 0;
		let attempts = 0;
		const overlay = new TaskSummaryOverlayComponent(
			sampleData(),
			{
				generate: async () => {
					attempts++;
					throw new Error("Upstream timeout 504");
				},
			},
			{ rows: () => 28, onClose: () => closed++ },
		);

		const lines = renderPlain(overlay, 86);
		const footerIdx = lines.findLastIndex(line => line.includes("生成 AI 总结"));
		expect(footerIdx).toBeGreaterThan(0);
		const actionCol = lines[footerIdx]!.indexOf("生成 AI 总结");
		// SGR mouse coordinates are 1-based (`col + 1`, `row + 1`).
		overlay.handleInput(`\x1b[<0;${actionCol + 1};${footerIdx + 1}M`);
		await Bun.sleep(10);
		expect(attempts).toBe(1);
		expect(overlay.getAiStatus()).toBe("error");
		expect(renderPlain(overlay, 86).join("\n")).toContain("Upstream timeout 504");

		const updatedLines = renderPlain(overlay, 86);
		const closeCol = updatedLines[footerIdx]!.indexOf("关闭");
		overlay.handleInput(`\x1b[<0;${closeCol + 1};${footerIdx + 1}M`);
		expect(closed).toBe(1);
	});

	it("strips color escapes under NO_COLOR (plain) and translates to English", () => {
		setLanguage("en");
		const overlay = new TaskSummaryOverlayComponent(
			sampleData(),
			{ generate: async () => "ok" },
			{ rows: () => 28, plain: true, onClose: () => {} },
		);

		const lines = overlay.render(84);
		for (const line of lines) {
			// Ensure no color SGR sequences (`38;`, `48;`, `30-37`, `90-97`) remain.
			expect(/\x1b\[(?:3[0-8]|4[0-8]|9[0-7]|10[0-7])/.test(line)).toBe(false);
		}
		const text = lines.map(l => stripVTControlCharacters(l)).join("\n");
		expect(text).toContain("Task Summary");
		expect(text).toContain("Completed");
		expect(text).toContain("Context Scope & Cost Notice");
		overlay.dispose();
	});
});
