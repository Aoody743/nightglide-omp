import { afterEach, beforeAll, describe, expect, it } from "bun:test";
import { stripVTControlCharacters } from "node:util";
import { type AnimationFrame, TranscriptContainer } from "@oh-my-pi/pi-tui/chrome/transcript-container";
import {
	NightglideShell,
	type NightglideShellDeps,
	type NightglideShellState,
} from "@oh-my-pi/pi-tui/components/nightglide-shell";
import { setLanguage } from "@oh-my-pi/pi-tui/i18n";
import { getThemeByName, setThemeInstance } from "@oh-my-pi/pi-tui/theme";
import type { Component } from "@oh-my-pi/pi-tui";

beforeAll(async () => {
	const theme = await getThemeByName("dark");
	if (!theme) throw new Error("dark theme unavailable");
	setThemeInstance(theme);
});

/** One transcript block of fixed text rows. */
class Rows implements Component {
	constructor(readonly rows: string[]) {}
	render(): readonly string[] {
		return this.rows;
	}
	invalidate(): void {}
}

/** A live block that draws the animation frame it was last allocated, like a tool's elapsed timer. */
class Clock implements Component {
	#frame: AnimationFrame = { tick: 0, now: 0 };
	setTranscriptAllocation(_rows: number, frame: AnimationFrame): void {
		this.#frame = frame;
	}
	render(): readonly string[] {
		return [`clock ${this.#frame.now}`];
	}
	invalidate(): void {}
}

const shells: NightglideShell[] = [];
afterEach(() => {
	for (const shell of shells.splice(0)) shell.dispose();
	setLanguage("zh");
});

function makeShell(
	transcript: TranscriptContainer,
	rows = 30,
	overrides: Partial<NightglideShellDeps> = {},
): NightglideShell {
	const deps: NightglideShellDeps = {
		transcript,
		dock: () => [],
		status: () => undefined,
		state: () => ({ model: "m", thinkingLevel: undefined, subagents: [], streaming: false }),
		focusTargets: () => [],
		rows: () => rows,
		requestRender: () => {},
		...overrides,
	};
	const shell = new NightglideShell(deps);
	shells.push(shell);
	return shell;
}

const plain = (frame: readonly string[]) => frame.map(row => stripVTControlCharacters(row));
/** Conversation rows carrying `msg N` text, in screen order. */
const shownMessages = (frame: readonly string[]) =>
	plain(frame)
		.map(row => /msg (\d+)/.exec(row)?.[1])
		.filter((n): n is string => n !== undefined);

describe("NightglideShell scrollback", () => {
	it("keeps a scrolled-back view in place while new output arrives below it", () => {
		const transcript = new TranscriptContainer();
		transcript.addChild(new Rows(Array.from({ length: 120 }, (_, i) => `msg ${i}`)));
		const shell = makeShell(transcript);

		shell.render(100);
		shell.scrollLines(40);
		const before = shownMessages(shell.render(100));
		expect(before.length).toBeGreaterThan(5);

		transcript.addChild(new Rows(Array.from({ length: 25 }, (_, i) => `msg ${120 + i}`)));
		const after = shownMessages(shell.render(100));

		expect(after).toEqual(before);
		expect(shell.isScrolledBack()).toBe(true);
	});

	it("follows new output when not scrolled back", () => {
		const transcript = new TranscriptContainer();
		transcript.addChild(new Rows(Array.from({ length: 60 }, (_, i) => `msg ${i}`)));
		const shell = makeShell(transcript);
		shell.render(100);

		transcript.addChild(new Rows(["msg 60"]));
		expect(shownMessages(shell.render(100)).at(-1)).toBe("60");
	});

	it("returns to the live tail when the scrolled-back label is clicked, and only there", () => {
		const transcript = new TranscriptContainer();
		transcript.addChild(new Rows(Array.from({ length: 80 }, (_, i) => `msg ${i}`)));
		const shell = makeShell(transcript);
		shell.render(100);
		shell.scrollLines(20);
		const frame = plain(shell.render(100));
		const labelRow = frame.findIndex(row => row.includes("回看中"));
		expect(labelRow).toBeGreaterThan(0);

		expect(shell.click(labelRow + 1, 10)).toBe(false);
		expect(shell.isScrolledBack()).toBe(true);

		expect(shell.click(labelRow, 10)).toBe(true);
		expect(shell.isScrolledBack()).toBe(false);
		expect(shownMessages(shell.render(100)).at(-1)).toBe("79");
	});
});

describe("NightglideShell live blocks", () => {
	it("hands live transcript blocks a fresh animation frame on every paint", async () => {
		const transcript = new TranscriptContainer();
		transcript.addChild(new Clock());
		const shell = makeShell(transcript);

		const clockAt = (frame: readonly string[]) =>
			Number(/clock ([\d.]+)/.exec(plain(frame).find(row => row.includes("clock")) ?? "")?.[1]);
		const first = clockAt(shell.render(100));
		await Bun.sleep(15);
		const second = clockAt(shell.render(100));

		expect(first).toBeGreaterThan(0);
		expect(second).toBeGreaterThan(first);
	});
});

describe("NightglideShell collapsible information column", () => {
	it("starts collapsed by default and notifies sidebarShown when toggled across width thresholds", () => {
		const seen: boolean[] = [];
		const shell = makeShell(new TranscriptContainer(), 30, {
			sidebarShown: shown => seen.push(shown),
		});

		expect(shell.isSidebarOpen()).toBe(false);
		const initial = plain(shell.render(140)).join("\n");
		expect(initial).not.toContain("会话");
		expect(initial).toContain("详情");
		expect(seen).toEqual([false]);

		shell.toggleSidebar();
		expect(shell.isSidebarOpen()).toBe(true);
		shell.render(140);
		shell.render(140);
		shell.render(80);
		shell.render(120);
		expect(seen).toEqual([false, true, false, true]);
	});

	it("toggles open and closed when clicking the top-border toggle pill", () => {
		const shell = makeShell(new TranscriptContainer(), 32);
		const collapsed = plain(shell.render(120));
		const pillRow = collapsed.findIndex(row => row.includes("详情"));
		expect(pillRow).toBeGreaterThanOrEqual(0);
		const pillCol = collapsed[pillRow]!.indexOf("详情");

		// Clicking outside the pill does not toggle.
		expect(shell.click(pillRow, 2)).toBe(false);
		expect(shell.isSidebarOpen()).toBe(false);

		// Clicking the collapsed pill expands the sidebar.
		expect(shell.click(pillRow, pillCol)).toBe(true);
		expect(shell.isSidebarOpen()).toBe(true);

		const expanded = plain(shell.render(120));
		const hideCol = expanded[pillRow]!.indexOf("收起");
		expect(hideCol).toBeGreaterThan(0);
		expect(shell.click(pillRow, hideCol)).toBe(true);
		expect(shell.isSidebarOpen()).toBe(false);
	});

	it("shows enriched model, routing mode, effort, robot, subagent details, and triggers summary on click", () => {
		const transcript = new TranscriptContainer();
		let summaryClicks = 0;
		let state: NightglideShellState = {
			model: "Test Model",
			provider: "omlx",
			routingMode: "local",
			routingNonLocalDefault: "anthropic/claude",
			cwd: "~/Projects/nightglide",
			contextTokens: 8400,
			contextWindow: 200_000,
			contextPercent: 4.2,
			robotStyle: "cat",
			thinkingLevel: "high",
			subagents: [
				{
					label: "worker-1",
					agent: "reviewer",
					status: "running",
					currentTool: "read",
					elapsedMs: 4200,
					toolCount: 3,
					tokens: 1500,
				},
			],
			streaming: false,
			turnDone: false,
		};

		const shell = makeShell(transcript, 40, {
			state: () => state,
			onSummary: () => summaryClicks++,
		});
		shell.setSidebarOpen(true);

		const frame1 = plain(shell.render(140));
		const text1 = frame1.join("\n");
		expect(text1).toContain("Test Model");
		expect(text1).toContain("omlx");
		expect(text1).toContain("路由：本地");
		expect(text1).toContain("主模型指定");
		expect(text1).toContain("工作目录");
		expect(text1).toContain("~/Projects/nightglide");
		expect(text1).toContain("上下文");
		expect(text1).toContain("4% · 8.4K/200K");
		expect(text1).toContain("high");
		expect(text1).toContain("worker-1");
		expect(text1).toContain("read");
		expect(text1).not.toContain("3 工具");

		// Clicking subagents row expands real subagent metrics.
		const agentRow = frame1.findIndex(row => row.includes("worker-1"));
		const agentCol = frame1[agentRow]!.indexOf("worker-1");
		expect(shell.click(agentRow, agentCol)).toBe(true);
		expect(shell.isSubagentDetailsOpen()).toBe(true);
		const expandedText = plain(shell.render(140)).join("\n");
		expect(expandedText).toContain("3 工具");
		expect(expandedText).toContain("1.5K tok");
		// Clicking again collapses subagent metrics.
		expect(shell.click(agentRow, agentCol)).toBe(true);
		expect(shell.isSubagentDetailsOpen()).toBe(false);

		// Clicking the summary action row fires onSummary.
		const frame2 = plain(shell.render(140));
		const summaryRow = frame2.findIndex(row => row.includes("/summary"));
		expect(summaryRow).toBeGreaterThan(0);
		const summaryCol = frame2[summaryRow]!.indexOf("/summary");
		expect(shell.click(summaryRow, summaryCol)).toBe(true);
		expect(summaryClicks).toBe(1);

		// Missing model / unknown context window shows localized no-model notice and dash without `/?`.
		state = {
			...state,
			model: undefined,
			provider: undefined,
			routingMode: undefined,
			contextWindow: 0,
			contextPercent: null,
		};
		const unsetText = plain(shell.render(140)).join("\n");
		expect(unsetText).toContain("未选择模型");
		expect(unsetText).not.toContain("/?");
	});

	it("adapts robot to compact 1-line badge when sidebar height is tight and localizes to English", () => {
		setLanguage("en");
		const shell = makeShell(new TranscriptContainer(), 13);
		shell.setSidebarOpen(true);
		const text = plain(shell.render(140)).join("\n");
		expect(text).toContain("[✦◠✦]");
		expect(text).toContain("Summary /summary");
		expect(text).toContain("Hide");
	});
});
