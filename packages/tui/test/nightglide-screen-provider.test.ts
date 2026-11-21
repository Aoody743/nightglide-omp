import { beforeAll, describe, expect, it, vi } from "bun:test";
import { stripVTControlCharacters } from "node:util";
import { type Component, type Focusable, TUI } from "@oh-my-pi/pi-tui";
import { getThemeByName, setThemeInstance } from "@oh-my-pi/pi-tui/theme";
import { withoutTerminalMultiplexer } from "./helpers/terminal-multiplexer";
import { VirtualRenderScheduler } from "./virtual-render-scheduler";
import { VirtualTerminal } from "./virtual-terminal";

withoutTerminalMultiplexer();

beforeAll(async () => {
	const theme = await getThemeByName("dark");
	if (!theme) throw new Error("dark theme unavailable");
	setThemeInstance(theme);
});

class Line implements Component {
	constructor(readonly text: string) {}
	render(): readonly string[] {
		return [this.text];
	}
	invalidate(): void {}
}

/** Stand-in for the editor: records the keys it receives while focused. */
class Input implements Component, Focusable {
	focused = false;
	received: string[] = [];
	render(): readonly string[] {
		return ["INPUT"];
	}
	handleInput(data: string): void {
		this.received.push(data);
	}
	invalidate(): void {}
}

/** Fills every row so the frame it owns is recognisable. */
class Screen implements Component {
	constructor(readonly rows: number) {}
	render(): readonly string[] {
		return Array.from({ length: this.rows }, (_, i) => `SCREEN ${i}`);
	}
	invalidate(): void {}
}

async function setup() {
	const terminal = new VirtualTerminal(60, 12);
	const scheduler = new VirtualRenderScheduler();
	const tui = new TUI(terminal, true, { renderScheduler: scheduler });
	const input = new Input();
	tui.addChild(new Line("INLINE TRANSCRIPT"));
	tui.addChild(input);
	tui.setFocus(input);
	tui.start();
	await scheduler.settle(terminal);
	const writes = vi.spyOn(terminal, "write");
	return { terminal, scheduler, tui, input, writes };
}

const viewport = (terminal: VirtualTerminal) => terminal.getViewport().map(row => stripVTControlCharacters(row));
const written = (writes: { mock: { calls: unknown[][] } }) => writes.mock.calls.map(call => String(call[0])).join("");

describe("TUI screen provider", () => {
	it("paints the provider fullscreen on the alternate buffer without taking focus", async () => {
		const { terminal, scheduler, tui, input, writes } = await setup();

		tui.setScreenProvider(new Screen(12));
		await scheduler.settle(terminal);

		expect(written(writes)).toContain("\x1b[?1049h");
		const screen = viewport(terminal);
		expect(screen[0]).toContain("SCREEN 0");
		expect(screen[11]).toContain("SCREEN 11");
		expect(screen.join("\n")).not.toContain("INLINE TRANSCRIPT");
		expect(tui.hasOverlay()).toBe(false);

		terminal.sendInput("a");
		await scheduler.settle(terminal);
		expect(input.received).toContain("a");
		tui.stop();
	});

	it("returns to the normal buffer with the inline transcript when cleared", async () => {
		const { terminal, scheduler, tui, writes } = await setup();
		tui.setScreenProvider(new Screen(12));
		await scheduler.settle(terminal);
		writes.mockClear();

		tui.setScreenProvider(undefined);
		await scheduler.settle(terminal);

		expect(written(writes)).toContain("\x1b[?1049l");
		expect(viewport(terminal).join("\n")).toContain("INLINE TRANSCRIPT");
		expect(tui.hasScreenProvider()).toBe(false);
		tui.stop();
	});

	it("repaints the provider at the new size after a resize", async () => {
		const { terminal, scheduler, tui } = await setup();
		let rows = 12;
		tui.setScreenProvider({
			render: () => Array.from({ length: rows }, (_, i) => `SCREEN ${i} of ${rows}`),
			invalidate: () => {},
		});
		await scheduler.settle(terminal);

		rows = 8;
		terminal.resize(50, 8);
		await scheduler.settle(terminal);

		const screen = viewport(terminal);
		expect(screen).toHaveLength(8);
		expect(screen[7]).toContain("SCREEN 7 of 8");
		tui.stop();
	});
});
