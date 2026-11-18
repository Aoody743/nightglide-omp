import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "bun:test";
import { getThemeByName, setThemeInstance } from "../src/theme";
import { setFeedModelBadgeEnabled } from "../src/render/render-utils";
import { setShimmerMode } from "../src/theme/shimmer";
import { type AgentProgress, type SingleResult, taskToolRenderer } from "../src/tools/task";
import { effortLadderGlyph } from "../src/chat/effort-ladder";

function runningProgress(overrides: Partial<AgentProgress> = {}): AgentProgress {
	return {
		index: 0,
		id: "KeySettingsHotPaths",
		agent: "task",
		agentSource: "bundled",
		status: "running",
		task: "investigate hot paths",
		recentTools: [],
		recentOutput: [],
		toolCount: 0,
		requests: 0,
		tokens: 0,
		cost: 0,
		durationMs: 0,
		...overrides,
	};
}

function finishedResult(overrides: Partial<SingleResult> = {}): SingleResult {
	return {
		index: 0,
		id: "Agent",
		agent: "task",
		agentSource: "bundled",
		task: "investigate hot paths",
		exitCode: 0,
		output: "done",
		stderr: "",
		truncated: false,
		durationMs: 0,
		tokens: 0,
		requests: 0,
		...overrides,
	};
}

/** The card row carrying the agent id, stripped of ANSI for glyph lookup. */
function agentRow(content: unknown, id: string): string | undefined {
	const rows =
		typeof content === "string"
			? content.split("\n")
			: (content as { render(width: number): readonly string[] }).render(120).join("\n").split("\n");
	return rows.map(row => Bun.stripANSI(row)).find(row => row.includes(id));
}

let theme: NonNullable<Awaited<ReturnType<typeof getThemeByName>>>;

beforeAll(async () => {
	theme = (await getThemeByName("dark"))!;
	if (theme) setThemeInstance(theme);
});

beforeEach(() => {
	setFeedModelBadgeEnabled(false);
	setShimmerMode("classic");
});

afterEach(() => {
	vi.restoreAllMocks();
	setFeedModelBadgeEnabled(false);
	setShimmerMode("classic");
});

describe("task card effort glyph badge", () => {
	it("marks a running subagent card with its rung glyph", () => {
		for (const [level, glyph] of [
			["minimal", "·"],
			["low", "◦"],
			["medium", "○"],
			["high", "◎"],
			["xhigh", "✦"],
			["max", "✦"],
		] as const) {
			const component = taskToolRenderer.renderResult(
				{ content: [], details: { projectAgentsDir: null, totalDurationMs: 0, results: [], progress: [runningProgress({ resolvedThinkingLevel: level as unknown as AgentProgress["resolvedThinkingLevel"] })] } },
				{ expanded: false, isPartial: true },
				theme,
			);
			const row = agentRow(component, "KeySettingsHotPaths");
			expect(row, `level ${level}`).toBeDefined();
			expect(row!, `level ${level}`).toContain(glyph);
		}
	});

	it("marks a settled subagent card with its rung glyph", () => {
		const component = taskToolRenderer.renderResult(
			{
				content: [],
				details: {
					projectAgentsDir: null,
					totalDurationMs: 0,
					results: [finishedResult({ resolvedThinkingLevel: "high" as unknown as AgentProgress["resolvedThinkingLevel"] })],
				},
			},
			{ expanded: false, isPartial: false },
			theme,
		);
		const row = agentRow(component, "Agent");
		expect(row).toBeDefined();
		expect(row).toContain("◎");
	});

	it("shows no badge without a rung: off renders byte-identical to unset", () => {
		const renderRow = (level: SingleResult["resolvedThinkingLevel"]): string | undefined => {
			const component = taskToolRenderer.renderResult(
				{
					content: [],
					details: {
						projectAgentsDir: null,
						totalDurationMs: 0,
						results: [finishedResult({ resolvedThinkingLevel: level })],
					},
				},
				{ expanded: false, isPartial: false },
				theme,
			);
			return component
				.render(120)
				.join("\n")
				.split("\n")
				.map(row => Bun.stripANSI(row))
				.find(row => row.includes("Agent"));
		};
		expect(renderRow("off")).toBe(renderRow(undefined));
	});

	it("colors the top rung with the xhigh slot on a settled card", () => {
		const component = taskToolRenderer.renderResult(
			{
				content: [],
				details: {
					projectAgentsDir: null,
					totalDurationMs: 0,
					results: [finishedResult({ resolvedThinkingLevel: "xhigh" as unknown as AgentProgress["resolvedThinkingLevel"] })],
				},
			},
			{ expanded: false, isPartial: false },
			theme,
		);
		const rawRows = component.render(120).join("\n");
		expect(rawRows).toContain(theme.fg("thinkingXhigh", "✦"));
	});

	it("shares the glyph ladder with the shared effort-ladder module", () => {
		expect(effortLadderGlyph("high")).toBe("◎");
	});
});
