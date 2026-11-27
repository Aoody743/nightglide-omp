import { describe, expect, it } from "bun:test";
import { stripVTControlCharacters } from "node:util";
import { visibleWidth } from "@oh-my-pi/pi-tui";
import type { SceneKind } from "@oh-my-pi/pi-tui/components/nightglide-pixel-scene";
import {
	deriveRobotState,
	renderNightglideRobot,
	renderNightglideRobotCompact,
	resolveRobotStyle,
	ROBOT_ROWS,
	ROBOT_STYLES,
	ROBOT_WIDTH,
	type RobotState,
} from "@oh-my-pi/pi-tui/components/nightglide-robot";

const KINDS: readonly SceneKind[] = ["flight", "dive", "aurora"];
const STATES: readonly RobotState[] = ["idle", "thinking", "tools", "done"];

describe("deriveRobotState", () => {
	it("maps real session activity to the expected robot state", () => {
		expect(deriveRobotState({ streaming: false, activeTools: 0 })).toBe("idle");
		expect(deriveRobotState({ streaming: true, activeTools: 0 })).toBe("thinking");
		expect(deriveRobotState({ streaming: true, activeTools: 2 })).toBe("tools");
		expect(deriveRobotState({ streaming: false, activeTools: 1 })).toBe("tools");
		expect(deriveRobotState({ streaming: false, activeTools: 0, turnDone: true })).toBe("done");
	});
});

describe("renderNightglideRobot", () => {
	it("renders a 10x5 half-block sprite for every theme family in dark and light modes", () => {
		const frames = new Set<string>();
		for (const kind of KINDS) {
			for (const light of [false, true]) {
				const rows = renderNightglideRobot({ kind, light, state: "idle", motion: false, cellPixels: 2 });
				expect(rows).toHaveLength(ROBOT_ROWS);
				for (const row of rows) expect(visibleWidth(row)).toBe(ROBOT_WIDTH);
				expect(rows.join("")).toContain("▀");
				frames.add(rows.join("\n"));
			}
		}
		// Each (family, dark/light) pair produces its own distinct palette/silhouette.
		expect(frames.size).toBe(6);
	});

	it("renders whole-cell background blocks without half-block glyphs when cellPixels=1", () => {
		for (const kind of KINDS) {
			const rows = renderNightglideRobot({
				kind,
				light: false,
				state: "tools",
				phase: 1,
				motion: true,
				cellPixels: 1,
			});
			expect(rows).toHaveLength(ROBOT_ROWS);
			for (const row of rows) {
				expect(row).not.toContain("▀");
				expect(visibleWidth(row)).toBe(ROBOT_WIDTH);
			}
		}
	});

	it("animates active states only when motion is enabled and keeps idle/done static", () => {
		for (const state of ["idle", "done"] as const) {
			const a = renderNightglideRobot({ kind: "flight", state, phase: 0, motion: true });
			const b = renderNightglideRobot({ kind: "flight", state, phase: 1, motion: true });
			expect(b).toEqual(a);
		}
		for (const state of ["thinking", "tools"] as const) {
			const staticA = renderNightglideRobot({ kind: "dive", state, phase: 0, motion: false });
			const staticB = renderNightglideRobot({ kind: "dive", state, phase: 1, motion: false });
			expect(staticB).toEqual(staticA);

			const liveA = renderNightglideRobot({ kind: "dive", state, phase: 0, motion: true });
			const liveB = renderNightglideRobot({ kind: "dive", state, phase: 1, motion: true });
			expect(liveB).not.toEqual(liveA);
		}
	});

	it("supports 256-color mode without emitting 24-bit color escapes", () => {
		const rows = renderNightglideRobot({ kind: "aurora", state: "thinking", phase: 0, colorMode: "256color" });
		expect(rows).toHaveLength(ROBOT_ROWS);
		expect(rows.join("")).not.toContain("\x1b[38;2;");
		expect(rows.join("")).not.toContain("\x1b[48;2;");
	});

	it("renders monochrome without ANSI escapes under NO_COLOR (plain) and ASCII-only under ascii", () => {
		for (const kind of KINDS) {
			for (const state of STATES) {
				const plainRows = renderNightglideRobot({ kind, state, plain: true });
				expect(plainRows).toHaveLength(ROBOT_ROWS);
				expect(plainRows.join("")).not.toContain("\x1b[");
				for (const row of plainRows) expect(visibleWidth(row)).toBe(ROBOT_WIDTH);

				const asciiRows = renderNightglideRobot({ kind, state, plain: true, ascii: true });
				expect(asciiRows).toHaveLength(ROBOT_ROWS);
				for (const row of asciiRows) {
					expect(/^[\x20-\x7e]+$/.test(row)).toBe(true);
					expect(visibleWidth(row)).toBe(ROBOT_WIDTH);
				}
			}
		}
	});

	it("renders a 1-line compact badge across families and fallbacks", () => {
		const compact = renderNightglideRobot({ kind: "flight", state: "idle", compact: true, plain: true });
		expect(compact).toHaveLength(1);
		expect(compact[0]).toBe("[✦◠✦]");

		expect(stripVTControlCharacters(renderNightglideRobotCompact({ kind: "dive", state: "done", plain: true }))).toBe(
			"[◈◡◈]",
		);
		expect(renderNightglideRobotCompact({ kind: "flight", state: "idle", plain: true, ascii: true })).toBe("[o.o]");
	});

	it("renders distinct 10x5 silhouettes for every selectable companion style", () => {
		expect(resolveRobotStyle("auto", "flight")).toBe("glider");
		expect(resolveRobotStyle("auto", "dive")).toBe("diver");
		expect(resolveRobotStyle("auto", "aurora")).toBe("prism");
		expect(resolveRobotStyle("cat", "dive")).toBe("cat");

		const seen = new Set<string>();
		for (const style of ROBOT_STYLES) {
			for (const state of STATES) {
				const rows = renderNightglideRobot({ kind: "flight", style, state, cellPixels: 2 });
				expect(rows).toHaveLength(ROBOT_ROWS);
				for (const row of rows) expect(visibleWidth(row)).toBe(ROBOT_WIDTH);
				const plain = renderNightglideRobot({ kind: "flight", style, state, plain: true });
				expect(plain).toHaveLength(ROBOT_ROWS);
				for (const row of plain) expect(visibleWidth(row)).toBe(ROBOT_WIDTH);
			}
			seen.add(renderNightglideRobot({ kind: "flight", style, state: "idle", cellPixels: 2 }).join("\n"));
		}
		expect(seen.size).toBe(ROBOT_STYLES.length);
	});
});
