import { afterEach, beforeAll, describe, expect, it } from "bun:test";
import {
	type PixelPalette,
	renderPixelScene,
	type SceneEdge,
	type SceneKind,
} from "@oh-my-pi/pi-tui/components/nightglide-pixel-scene";
import { NightglideShell, sceneIntensity } from "@oh-my-pi/pi-tui/components/nightglide-shell";
import { TranscriptContainer } from "@oh-my-pi/pi-tui/chrome/transcript-container";
import { setMotionEffects } from "@oh-my-pi/pi-tui/motion-effects";
import { getThemeByName, setThemeInstance } from "@oh-my-pi/pi-tui/theme";

beforeAll(async () => {
	const theme = await getThemeByName("nightglide-abyss");
	if (!theme) throw new Error("abyss theme unavailable");
	setThemeInstance(theme);
});

const PALETTE: PixelPalette = {
	page: "#0b1020",
	ramp: ["#1b2440", "#2c3a60", "#4a5a88", "#7a88b0"],
	accent: "#e0b060",
	spark: "#f0f0ff",
	plants: ["#0f3a30", "#1f5a40", "#3a7a50"],
};

/** Encoder that tags colors so the rendered cells can be decoded back to pixels. */
const TAGS = { fg: (hex: string) => `<f${hex}>`, bg: (hex: string) => `<b${hex}>` };

/** Decode rendered rows back to a top/bottom pixel grid. */
function pixels(rows: readonly string[]): string[] {
	const out: string[] = [];
	for (const row of rows) {
		let fg = "";
		let bg = "";
		for (const m of row.matchAll(/<([fb])(#[0-9a-f]{6})>|\x1b\[0m|(.)/gu)) {
			if (m[1] === "f") fg = m[2]!;
			else if (m[1] === "b") bg = m[2]!;
			else if (m[3] === " ") out.push(bg, bg);
			else if (m[3] === "▀") out.push(fg, bg);
		}
	}
	return out;
}

/** Summed channel brightness of every pixel. */
const brightness = (rows: readonly string[]) =>
	pixels(rows).reduce((sum, hex) => {
		const n = Number.parseInt(hex.slice(1), 16);
		return sum + (n >> 16) + ((n >> 8) & 0xff) + (n & 0xff);
	}, 0);

const render = (kind: SceneKind, edge: SceneEdge, time: number, intensity: number, intro?: number) =>
	renderPixelScene(120, 4, kind, edge, PALETTE, TAGS, { time, intensity, intro });

const CASES: [string, SceneKind, SceneEdge][] = [
	["flight top", "flight", "top"],
	["flight bottom", "flight", "bottom"],
	["dive top", "dive", "top"],
	["dive bottom", "dive", "bottom"],
	["aurora top", "aurora", "top"],
	["aurora bottom", "aurora", "bottom"],
];

describe("renderPixelScene", () => {
	it.each(CASES)("%s: a fixed clock is a still frame and an advancing clock moves it", (_n, dive, edge) => {
		expect(render(dive, edge, 30, 0.5)).toEqual(render(dive, edge, 30, 0.5));
		expect(render(dive, edge, 60, 0.5)).not.toEqual(render(dive, edge, 30, 0.5));
	});

	it.each(CASES)("%s: higher effort lights more of the scene", (_n, dive, edge) => {
		let low = 0;
		let high = 0;
		// Sum over several frames so one lucky frame cannot decide the comparison. Brightness,
		// not lit-pixel count: Aurora keeps a faint glow everywhere and brightens with effort.
		for (let t = 0; t < 200; t += 20) {
			low += brightness(render(dive, edge, t, 0));
			high += brightness(render(dive, edge, t, 1));
		}
		expect(high).toBeGreaterThan(low);
	});

	it.each(CASES)("%s: emits exactly width cells per row", (_n, kind, edge) => {
		for (const row of render(kind, edge, 10, 1)) expect(pixels([row]).length).toBe(240);
	});

	it("aurora: the launch sweep reveals the curtains from the left", () => {
		const leftLit = (rows: readonly string[]) =>
			pixels(rows.map(row => row)).filter((p, i) => i % 240 < 60 && p !== PALETTE.page).length;
		const rightLit = (rows: readonly string[]) =>
			pixels(rows).filter((p, i) => i % 240 >= 180 && p !== PALETTE.page).length;
		let earlyRight = 0;
		let doneRight = 0;
		let midLeft = 0;
		for (let t = 0; t < 400; t += 23) {
			earlyRight += rightLit(render("aurora", "top", t, 0.5, 0.2));
			doneRight += rightLit(render("aurora", "top", t, 0.5, 1));
			midLeft += leftLit(render("aurora", "top", t, 0.5, 0.6));
		}
		// Early in the sweep the right side shows at most stars; once done, curtains fill it.
		expect(doneRight).toBeGreaterThan(earlyRight * 3);
		expect(midLeft).toBeGreaterThan(0);
	});

	it.each(CASES)("%s: whole-cell mode paints backgrounds only, one pixel per cell", (_n, kind, edge) => {
		const rows = renderPixelScene(120, 4, kind, edge, PALETTE, TAGS, { time: 30, intensity: 0.5, cellPixels: 1 });
		for (const row of rows) {
			expect(row).not.toContain("▀");
			expect(row).not.toContain("<f");
			// A space decodes to two equal pixels: 120 cells.
			expect(pixels([row]).length).toBe(240);
		}
	});

	it("aurora: an omitted intro (motion off) is the finished scene", () => {
		expect(render("aurora", "top", 0, 0.5)).toEqual(render("aurora", "top", 0, 0.5, 1));
	});
});

describe("sceneIntensity", () => {
	it("adds nothing for levels with no effective rung", () => {
		for (const level of [undefined, "off", "inherit", "auto", "bogus"]) expect(sceneIntensity(level)).toBe(0);
	});

	it("rises with effort and treats max like xhigh", () => {
		const ladder = ["minimal", "low", "medium", "high", "xhigh"].map(sceneIntensity);
		for (let i = 1; i < ladder.length; i++) expect(ladder[i]!).toBeGreaterThan(ladder[i - 1]!);
		expect(sceneIntensity("max")).toBe(sceneIntensity("xhigh"));
	});
});

describe("NightglideShell scene with motion off", () => {
	afterEach(() => setMotionEffects(true));

	it("draws the same frame regardless of the scene clock", () => {
		setMotionEffects(false);
		const shell = new NightglideShell({
			transcript: new TranscriptContainer(),
			dock: () => [],
			status: () => undefined,
			state: () => ({ model: "m", thinkingLevel: "high", subagents: [], streaming: true }),
			focusTargets: () => [],
			rows: () => 40,
			requestRender: () => {},
		});
		try {
			shell.setSceneTime(0);
			const a = shell.render(140);
			shell.setSceneTime(500);
			expect(shell.render(140)).toEqual(a);
		} finally {
			shell.dispose();
		}
	});
});
