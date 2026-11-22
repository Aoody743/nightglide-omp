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
 * Flight: a slow, faint far cloud layer under a faster, denser near layer
 * (parallax), one thin light band with soft edges, and twinkling sparks in
 * the gaps. Dive: slanted light shafts from the surface, tapering plants
 * swaying on the seabed, bubbles that wobble as they rise at their own speed,
 * and faint drifting particles.
 *
 * Pure function of its inputs: `time` is a scene clock the caller advances
 * (constant when motion is off), and `intensity` (0–1) comes from the
 * session's effective thinking effort — 0 when it is unknown, so an unknown
 * level never adds detail.
 */

export interface PixelPalette {
	/** Page background: pixels equal to this render as plain background. */
	page: string;
	/** Density ramp, faint → solid. */
	ramp: readonly string[];
	/** Sparse accent (light band / coral). */
	accent: string;
	/** Sparkle (stars / bubbles). */
	spark: string;
	/** Dive only: plant silhouettes, dark → light. */
	plants?: readonly string[];
	/**
	 * Hand-picked replacements for the colors normally blended from the page
	 * (light band, light shafts, far clouds, particles). On 256-color terminals
	 * those blends quantize to grays, so 256 palettes name real grid colors.
	 */
	blends?: Partial<Derived>;
}

export interface PixelEncoder {
	fg(hex: string): string;
	bg(hex: string): string;
}

export type SceneEdge = "top" | "bottom";

export interface SceneOptions {
	/** Scene clock; the caller advances it, faster at higher effort. */
	time: number;
	/** 0–1 from the effective thinking effort; 0 when unknown or off. */
	intensity: number;
}

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
	return (
		valueNoise(x, y, salt) * 0.62 +
		valueNoise(x * 2.1, y * 2.1, salt + 7) * 0.28 +
		valueNoise(x * 4.3, y * 4.3, salt + 13) * 0.1
	);
}

/** 4x4 Bayer matrix for soft ramp edges. */
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

function rampColor(ramp: readonly string[], value: number, x: number, y: number): string | undefined {
	if (value <= 0 || ramp.length === 0) return undefined;
	const scaled = value * ramp.length + (BAYER[(y & 3) * 4 + (x & 3)]! / 16 - 0.5) * 0.45;
	const index = Math.floor(scaled);
	if (index < 0) return undefined;
	return ramp[Math.min(ramp.length - 1, index)];
}

/** Linear mix of two `#rrggbb` colors. */
function mix(a: string, b: string, t: number): string {
	const pa = Number.parseInt(a.slice(1), 16);
	const pb = Number.parseInt(b.slice(1), 16);
	const ch = (shift: number) => {
		const ca = (pa >> shift) & 0xff;
		const cb = (pb >> shift) & 0xff;
		return Math.round(ca + (cb - ca) * t);
	};
	return `#${((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, "0")}`;
}

/** Distance (0 = edge of the window, 1 = edge facing the content). */
function depth(py: number, pixelRows: number, edge: SceneEdge): number {
	const t = pixelRows <= 1 ? 0 : py / (pixelRows - 1);
	return edge === "top" ? t : 1 - t;
}

/** Colors derived once per render from the palette. */
export interface Derived {
	/** Far cloud layer: only the faint end of the ramp, so it reads as distance. */
	far: readonly string[];
	/** Light band edge → core. */
	glow: readonly [string, string, string];
	/** Dive light shafts, faint → bright, blended into the page. */
	shaft: readonly string[];
	/** Drifting particles: barely above the page. */
	mote: string;
}

function derive(pal: PixelPalette): Derived {
	const lightest = pal.ramp[pal.ramp.length - 1] ?? pal.spark;
	const blended: Derived = {
		far: pal.ramp.slice(0, Math.max(1, Math.min(2, pal.ramp.length - 1))),
		glow: [mix(pal.page, pal.accent, 0.22), mix(pal.page, pal.accent, 0.45), mix(pal.page, pal.accent, 0.8)],
		shaft: [mix(pal.page, lightest, 0.12), mix(pal.page, lightest, 0.24), mix(pal.page, lightest, 0.38)],
		mote: mix(pal.page, pal.spark, 0.45),
	};
	return { ...blended, ...pal.blends };
}

type PixelFn = (
	x: number,
	py: number,
	pixelRows: number,
	edge: SceneEdge,
	pal: PixelPalette,
	der: Derived,
	opts: SceneOptions,
) => string;

const flightPixel: PixelFn = (x, py, pixelRows, edge, pal, der, { time, intensity }) => {
	const d = depth(py, pixelRows, edge);
	const salt = edge === "top" ? 11 : 29;

	// Near layer: faster, larger shapes, full ramp. Thins out toward the content
	// so the band dissolves instead of ending.
	const near = fbm((x + time * 0.22) / 10, py / 4, salt + 5);
	const nearDensity = (near - 0.4 - d * 0.5 + intensity * 0.1) * 2.6;
	const nearColor = rampColor(pal.ramp, nearDensity, x, py);
	if (nearColor) return nearColor;

	// Light band: a one-pixel wavy thread behind the near clouds, mostly a
	// soft blend into the page with only short bright glints. Higher effort
	// makes it more continuous and lets the glints run longer.
	const center = pixelRows * 0.55 + Math.sin((x + time * 0.15) / 23 + salt) * 1.2;
	if (Math.abs(py - center) < 0.5) {
		const n = valueNoise((x + time * 0.3) / 9, 0, salt + 3);
		const threshold = 0.5 - intensity * 0.2;
		if (n > threshold) {
			const glint = n > 0.86 - intensity * 0.1;
			return der.glow[glint ? 2 : n > threshold + 0.15 ? 1 : 0]!;
		}
	}

	// Far layer: slow and faint, showing through the gaps.
	const far = fbm((x + time * 0.07) / 19, py / 6, salt);
	const farColor = rampColor(der.far, (far - 0.45 - d * 0.32) * 2.2, x, py);
	if (farColor) return farColor;

	// Twinkling sparks in open sky; more of them at higher effort.
	const twinkle = Math.floor(time / 9);
	if (d > 0.4 && hash(x, py, salt + 99 + (hash(x, py, salt) > 0.5 ? twinkle : 0)) > 0.995 - intensity * 0.014) {
		return pal.spark;
	}
	return pal.page;
};

const divePixel: PixelFn = (x, py, pixelRows, edge, pal, der, { time, intensity }) => {
	const d = depth(py, pixelRows, edge);
	const salt = edge === "top" ? 41 : 53;

	if (edge === "bottom") {
		// Seabed plants rooted at the window edge: tapering stalks whose tips
		// sway more than their bases.
		const plants = pal.plants ?? pal.ramp;
		const fromBed = pixelRows - 1 - py;
		const cell = Math.floor(x / 7);
		for (let k = -1; k <= 1; k++) {
			// One possible stalk per 7-column cell, at a seeded offset, so spacing is irregular.
			const slot = cell + k;
			const seed = hash(slot, 0, salt);
			if (seed < 0.25) continue;
			const root = slot * 7 + 1 + Math.floor(hash(slot, 1, salt) * 5);
			const height = 3 + Math.floor(hash(slot, 2, salt) * (pixelRows * 0.85 - 3));
			if (fromBed > height) continue;
			const bend = fromBed / height;
			const sway = Math.sin(time * 0.09 + slot * 1.7 + fromBed * 0.42) * bend * bend * 1.8;
			const center = root + sway;
			const half = 0.75 - bend * 0.4;
			if (Math.abs(x - center) < half) {
				if (seed > 0.9 && fromBed >= height - 1) return pal.accent;
				return plants[Math.min(plants.length - 1, Math.floor(bend * plants.length))]!;
			}
		}
	}

	// Rising bubbles: each column has its own speed and a gentle side-to-side
	// wobble. More columns carry bubbles at higher effort.
	const column = Math.floor(x / 4);
	const bubbleSeed = hash(column, 7, salt);
	if (bubbleSeed > 0.8 - intensity * 0.4) {
		const speed = 0.16 + hash(column, 9, salt) * 0.22;
		const span = pixelRows + 8;
		const travel = (time * speed + bubbleSeed * 97) % span;
		const by = pixelRows - 1 - Math.floor(travel);
		const wobble = Math.round(Math.sin(travel * 0.55 + bubbleSeed * 6) * 0.9);
		if (py === by && x === column * 4 + 1 + wobble) return pal.spark;
	}

	// Water body, thinning toward the content.
	const drift = time * 0.07;
	const n = fbm((x + drift) / 18, py / 2.6, salt);
	const water = rampColor(pal.ramp, (n * 0.85 - 0.32 - d * 0.55) * 2.2, x, py);
	if (water) return water;

	// Light shafts slanting down from the surface: strongest at the top edge,
	// fading with depth; brighter at higher effort.
	const shaftStrength = edge === "top" ? 1 - d * 0.75 : 0.35 * (1 - d);
	const wave = Math.sin((x * 0.85 + py * 0.7 + Math.sin(time * 0.03) * 6) / 6.5 + salt);
	const shaft = (wave - 0.55) * 2.6 * shaftStrength * (0.75 + intensity * 0.5);
	if (shaft > 0) return der.shaft[Math.min(der.shaft.length - 1, Math.floor(shaft * der.shaft.length))]!;

	// Faint particles drifting slowly down.
	const moteRow = Math.floor(py + time * 0.05) % pixelRows;
	if (hash(x, moteRow < 0 ? moteRow + pixelRows : moteRow, salt + 17) > 0.992 - intensity * 0.004) return der.mote;
	return pal.page;
};

/** Render `rows` terminal rows of the scene band. */
export function renderPixelScene(
	width: number,
	rows: number,
	dive: boolean,
	edge: SceneEdge,
	pal: PixelPalette,
	enc: PixelEncoder,
	opts: SceneOptions,
): string[] {
	const pixelRows = rows * 2;
	const pixel = dive ? divePixel : flightPixel;
	const der = derive(pal);
	const options: SceneOptions = { time: opts.time, intensity: Math.min(1, Math.max(0, opts.intensity)) };
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
			const top = pixel(x, row * 2, pixelRows, edge, pal, der, options);
			const bottom = pixel(x, row * 2 + 1, pixelRows, edge, pal, der, options);
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
