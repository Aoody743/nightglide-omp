import { afterEach, beforeAll, describe, expect, it } from "bun:test";
import { stripVTControlCharacters } from "node:util";
import { type AnimationFrame, TranscriptContainer } from "@oh-my-pi/pi-tui/chrome/transcript-container";
import { NightglideShell, type NightglideShellDeps } from "@oh-my-pi/pi-tui/components/nightglide-shell";
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
});

function makeShell(transcript: TranscriptContainer, rows = 30): NightglideShell {
	const deps: NightglideShellDeps = {
		transcript,
		dock: () => [],
		status: () => undefined,
		state: () => ({ model: "m", thinkingLevel: undefined, subagents: [], streaming: false }),
		focusTargets: () => [],
		rows: () => rows,
		requestRender: () => {},
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
