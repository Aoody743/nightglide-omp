import { afterEach, beforeAll, describe, expect, it } from "bun:test";
import {
	type PixelPalette,
	renderPixelScene,
	type SceneEdge,
	type SceneKind,
} from "@oh-my-pi/pi-tui/components/nightglide-pixel-scene";
import { NightglideShell, sceneIntensity } from "@oh-my-pi/pi-tui/components/nightglide-shell";
import { familyFor } from "@oh-my-pi/pi-tui/components/nightglide-theme-families";
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

/** Parse `#rrggbb` into RGB tuple. */
function rgb(hex: string): [number, number, number] {
	return [
		Number.parseInt(hex.slice(1, 3), 16),
		Number.parseInt(hex.slice(3, 5), 16),
		Number.parseInt(hex.slice(5, 7), 16),
	];
}

/** Summed channel brightness of every pixel. */
const brightness = (rows: readonly string[]) =>
	pixels(rows).reduce((sum, hex) => {
		const [r, g, b] = rgb(hex);
		return sum + r + g + b;
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

	it("flight: renders layered drifting clouds and glowing light bands on both top and bottom edges", () => {
		const fam = familyFor("nightglide-flight");
		const pal256 = fam.scene256 ?? fam.scene;
		const glowColors = new Set(pal256.blends?.glow ?? []);
		for (const edge of ["top", "bottom"] as const) {
			for (const cellPixels of [2, 1] as const) {
				const a = renderPixelScene(120, 4, "flight", edge, pal256, TAGS, { time: 20, intensity: 0.8, cellPixels });
				const b = renderPixelScene(120, 4, "flight", edge, pal256, TAGS, { time: 50, intensity: 0.8, cellPixels });
				expect(b).not.toEqual(a);
				const drawn = new Set(pixels(a));
				// Both edges draw cloud layers and at least one glowing light-band color.
				expect(pal256.clouds?.some(c => drawn.has(c))).toBe(true);
				expect([...glowColors].some(c => drawn.has(c))).toBe(true);
			}
		}

		// Top cloud banks dissolve toward the content edge instead of cutting off as a solid wall.
		const topGrid = pixels(renderPixelScene(120, 5, "flight", "top", pal256, TAGS, { time: 20, intensity: 0.6 }));
		const topEdgeNonPage = topGrid.slice(0, 240).filter(c => c !== pal256.page).length;
		const contentEdgeNonPage = topGrid.slice(-240).filter(c => c !== pal256.page).length;
		expect(topEdgeNonPage).toBeGreaterThan(contentEdgeNonPage);
	});

	it("iris: renders multi-color rainbow clouds and spectral band on both edges in half-cell and whole-cell modes", () => {
		const fam = familyFor("nightglide-iris");
		for (const [modeName, pal] of [
			["truecolor", fam.scene],
			["256color", fam.scene256 ?? fam.scene],
		] as const) {
			const spectralSet = new Set(pal.spectral ?? []);
			expect(spectralSet.size).toBeGreaterThanOrEqual(4);
			for (const edge of ["top", "bottom"] as const) {
				for (const cellPixels of [2, 1] as const) {
					const rows = renderPixelScene(120, 4, "flight", edge, pal, TAGS, {
						time: 40,
						intensity: 0.75,
						cellPixels,
					});
					const drawn = pixels(rows);
					const unique = new Set(drawn);
					if (modeName === "256color") {
						for (const cloudHex of pal.clouds ?? []) {
							expect(unique.has(cloudHex), `missing ${cloudHex} on ${edge} cp=${cellPixels}`).toBe(true);
						}
						const spectralHits = [...spectralSet].filter(c => unique.has(c));
						expect(spectralHits.length).toBeGreaterThanOrEqual(3);
					} else {
						// Truecolor blends softly across lavender, pink, mint, and spectral hues (distinct RGB hues).
						let pinkTinted = 0;
						let mintTinted = 0;
						let violetTinted = 0;
						for (const hex of unique) {
							const [r, g, b] = rgb(hex);
							if (r > g + 8 && r >= b) pinkTinted++;
							if (g > r + 8 && g >= b - 4) mintTinted++;
							if (b > r + 6 && b > g + 6) violetTinted++;
						}
						expect(pinkTinted, `truecolor ${edge} cp=${cellPixels} pink`).toBeGreaterThan(0);
						expect(mintTinted, `truecolor ${edge} cp=${cellPixels} mint`).toBeGreaterThan(0);
						expect(violetTinted, `truecolor ${edge} cp=${cellPixels} violet`).toBeGreaterThan(0);
					}
				}
			}
		}
	});

	it("daybreak: keeps sunlit dive shafts and caustics aqua/turquoise without muddy grey pixels", () => {
		const fam = familyFor("nightglide-daybreak");
		for (const pal of [fam.scene, fam.scene256 ?? fam.scene]) {
			const rows = renderPixelScene(120, 4, "dive", "top", pal, TAGS, { time: 30, intensity: 0.75 });
			const drawn = new Set(pixels(rows));
			const nonPage = [...drawn].filter(hex => hex !== pal.page);
			expect(nonPage.length).toBeGreaterThan(2);
			const clearlyAqua = nonPage.filter(hex => {
				const [r, g, b] = rgb(hex);
				return Math.min(g, b) - r >= 8;
			});
			expect(clearlyAqua.length).toBeGreaterThanOrEqual(2);
			for (const hex of nonPage) {
				const [r, g, b] = rgb(hex);
				// Every visible non-ivory pixel on the sunlit surface stays aqua/teal (`max(g,b) - r >= 8`), never muddy grey.
				expect(Math.max(g, b) - r >= 8 || r >= 225, `greyish pixel ${hex} in daybreak`).toBe(true);
			}
		}
	});

	it("abyss-trench: renders bioluminescent sonar/emerald dive accents over deep trench darkness", () => {
		const fam = familyFor("nightglide-abyss-trench");
		for (const pal of [fam.scene, fam.scene256 ?? fam.scene]) {
			const topRows = renderPixelScene(120, 4, "dive", "top", pal, TAGS, { time: 40, intensity: 0.8 });
			const bottomRows = renderPixelScene(120, 4, "dive", "bottom", pal, TAGS, { time: 40, intensity: 0.8 });
			const topPixels = new Set(pixels(topRows));
			const bottomPixels = new Set(pixels(bottomRows));
			expect(topPixels.has(pal.page)).toBe(true);
			expect(bottomPixels.has(pal.page)).toBe(true);
			expect(topPixels.size).toBeGreaterThan(2);
			expect(bottomPixels.size).toBeGreaterThan(3);
			expect(renderPixelScene(120, 4, "dive", "bottom", pal, TAGS, { time: 80, intensity: 0.8 })).not.toEqual(
				bottomRows,
			);
		}
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
