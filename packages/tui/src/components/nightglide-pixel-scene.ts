/**
 * Nightglide pixel scenes for the Glide shell.
 *
 * Each terminal cell is two vertical pixels drawn with `▀` (foreground = top
 * pixel, background = bottom pixel), doubling vertical resolution. Pixels
 * come from smooth value noise, so clouds and water read as soft shapes
 * instead of per-column speckle. Colors are palette hex values converted for
 * the terminal's actual color mode (truecolor or 256) by the caller-supplied
 * encoder, so terminals without 24-bit color (Terminal.app) stay correct.
 *
 * Pure function of (width, rows, phase, family): `phase` is driven
 * externally; motion off passes a constant phase.
 */

export interface PixelPalette {
	/** Page background: pixels equal to this render as plain background. */
	page: string;
	/** Density ramp, faint → solid. */
	ramp: readonly string[];
	/** Sparse accent (light streaks / coral). */
	accent: string;
	/** Sparkle (stars / bubbles). */
	spark: string;
	/** Dive only: plant silhouettes, dark → light. */
	plants?: readonly string[];
}

export interface PixelEncoder {
	fg(hex: string): string;
	bg(hex: string): string;
}

export type SceneEdge = "top" | "bottom";

function hash(x: number, y: number, salt: number): number {
	let h = (x * 374761393 + y * 668265263 + salt * 2147483647) | 0;
	h = Math.imul(h ^ (h >>> 13), 1274126177);
	return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function smooth(t: number): number {
	return t * t * (3 - 2 * t);
}

/** Smooth 2D value noise in [0,1). */
function valueNoise(x: number, y: number, salt: number): number {
	const xi = Math.floor(x);
	const yi = Math.floor(y);
	const tx = smooth(x - xi);
	const ty = smooth(y - yi);
	const a = hash(xi, yi, salt);
	const b = hash(xi + 1, yi, salt);
	const c = hash(xi, yi + 1, salt);
	const d = hash(xi + 1, yi + 1, salt);
	return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
}

function fbm(x: number, y: number, salt: number): number {
	return valueNoise(x, y, salt) * 0.62 + valueNoise(x * 2.1, y * 2.1, salt + 7) * 0.28 + valueNoise(x * 4.3, y * 4.3, salt + 13) * 0.1;
}

/** 4x4 Bayer matrix for soft ramp edges. */
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

function rampColor(ramp: readonly string[], value: number, x: number, y: number): string | undefined {
	if (value <= 0) return undefined;
	const scaled = value * ramp.length + (BAYER[(y & 3) * 4 + (x & 3)]! / 16 - 0.5) * 0.45;
	const index = Math.floor(scaled);
	if (index < 0) return undefined;
	return ramp[Math.min(ramp.length - 1, index)];
}

/** Distance (0 = edge of the window, 1 = edge facing the content). */
function depth(py: number, pixelRows: number, edge: SceneEdge): number {
	const t = pixelRows <= 1 ? 0 : py / (pixelRows - 1);
	return edge === "top" ? t : 1 - t;
}

function flightPixel(x: number, py: number, pixelRows: number, phase: number, edge: SceneEdge, pal: PixelPalette): string {
	const d = depth(py, pixelRows, edge);
	const drift = phase * 0.35;
	const salt = edge === "top" ? 11 : 29;
	// Clouds thin out toward the content so the band dissolves instead of ending.
	const n = fbm((x + drift) / 11, py / 4.5, salt);
	const density = (n - 0.32 - d * 0.42) * 2.4;
	const cloud = rampColor(pal.ramp, density, x, py);
	if (cloud) return cloud;
	// Thin warm light streaks drifting through the gaps.
	const streak = Math.sin((x + drift * 1.6) / 9 + py * 0.9 + salt) + valueNoise((x + drift) / 6, py, salt + 3) * 1.2;
	if (streak > 2.02 && py % 3 === 1 && d > 0.3 && d < 0.75) return pal.accent;
	if (hash(x, py, salt + 99) > 0.993 && d > 0.45) return pal.spark;
	return pal.page;
}

function divePixel(x: number, py: number, pixelRows: number, phase: number, edge: SceneEdge, pal: PixelPalette): string {
	const d = depth(py, pixelRows, edge);
	const salt = edge === "top" ? 41 : 53;
	if (edge === "bottom") {
		// Seabed plants: swaying stalks rooted at the window edge.
		const plants = pal.plants ?? pal.ramp;
		const fromBed = pixelRows - 1 - py;
		for (let k = -1; k <= 1; k++) {
			const root = Math.floor(x / 7) * 7 + k * 7;
			const seed = hash(root, 0, salt);
			if (seed < 0.45) continue;
			const height = 3 + Math.floor(seed * (pixelRows - 2));
			if (fromBed > height) continue;
			const sway = Math.sin(phase * 0.12 + root * 0.7 + fromBed * 0.5) * (fromBed / 3);
			const center = root + 3 + sway;
			if (Math.abs(x - center) < 0.9 - fromBed / (height * 3)) {
				return seed > 0.85 ? pal.accent : plants[Math.min(plants.length - 1, Math.floor((fromBed / height) * plants.length))]!;
			}
		}
	}
	// Rising bubbles.
	const column = Math.floor(x / 5);
	const bubbleSeed = hash(column, 7, salt);
	if (bubbleSeed > 0.7) {
		const travel = (phase * 0.25 + bubbleSeed * 40) % (pixelRows + 6);
		const by = pixelRows - 1 - Math.floor(travel);
		if (py === by && x === column * 5 + 2) return pal.spark;
	}
	// Water body with slow light rays, thinning toward the content.
	const drift = phase * 0.18;
	const ray = Math.sin((x - py * 1.4 + drift * 3) / 6) * 0.5 + 0.5;
	const n = fbm((x + drift) / 18, py / 2.6, salt);
	const density = (n * 0.8 + ray * 0.35 - 0.28 - d * 0.55) * 2.2;
	return rampColor(pal.ramp, density, x, py) ?? pal.page;
}

/** Render `rows` terminal rows of the scene band. */
export function renderPixelScene(
	width: number,
	rows: number,
	phase: number,
	dive: boolean,
	edge: SceneEdge,
	pal: PixelPalette,
	enc: PixelEncoder,
): string[] {
	const pixelRows = rows * 2;
	const pixel = dive ? divePixel : flightPixel;
	const fgCache = new Map<string, string>();
	const bgCache = new Map<string, string>();
	const fg = (hex: string) => {
		let v = fgCache.get(hex);
		if (v === undefined) fgCache.set(hex, (v = enc.fg(hex)));
		return v;
	};
	const bg = (hex: string) => {
		let v = bgCache.get(hex);
		if (v === undefined) bgCache.set(hex, (v = enc.bg(hex)));
		return v;
	};
	const lines: string[] = [];
	for (let row = 0; row < rows; row++) {
		let line = "";
		let lastFg = "";
		let lastBg = "";
		for (let x = 0; x < width; x++) {
			const top = pixel(x, row * 2, pixelRows, phase, edge, pal);
			const bottom = pixel(x, row * 2 + 1, pixelRows, phase, edge, pal);
			const b = bg(bottom);
			if (b !== lastBg) {
				line += b;
				lastBg = b;
			}
			if (top === bottom) {
				line += " ";
				continue;
			}
			const f = fg(top);
			if (f !== lastFg) {
				line += f;
				lastFg = f;
			}
			line += "▀";
		}
		lines.push(`${line}\x1b[0m`);
	}
	return lines;
}
