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
 * and faint drifting particles. Aurora: curtains of light that glow green at
 * their lower edge and fade to violet as their rays climb, drifting over a
 * starfield, above a dark mountain ridge; on launch the curtains sweep in
 * from the left and brighten (`intro`).
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
	/** Aurora only: the upper, violet part of the curtains, faint → bright. */
	upper?: readonly string[];
	/** Aurora only: mountains — near range, far range, lit far crest. */
	ground?: readonly string[];
	/**
	 * The palette holds only colors of a limited grid (256-color terminals): scenes that blend
	 * colors smoothly (Aurora) pick from the listed stops instead, so nothing rounds to a gray.
	 */
	quantized?: boolean;
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

/** Which scene a theme family draws. */
export type SceneKind = "flight" | "dive" | "aurora";

export interface SceneOptions {
	/** Scene clock; the caller advances it, faster at higher effort. */
	time: number;
	/** 0–1 from the effective thinking effort; 0 when unknown or off. */
	intensity: number;
	/**
	 * 0–1 progress of the launch animation (Aurora's curtains sweeping in); 1 = finished.
	 * Omitted means finished, so a still frame (motion off) shows the whole scene.
	 */
	intro?: number;
	/**
	 * Pixels per cell, stacked vertically: 2 draws `▀` half blocks (finer, but needs a font whose
	 * block glyph fills its half exactly); 1 paints each cell's background only, crisp in any font.
	 * Default 2.
	 */
	cellPixels?: 1 | 2;
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

const flightPixel: PixelFn = (x, py, pixelRows, edge, pal, der, { time, intensity, cellPixels = 2 }) => {
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
		// A whole-cell pixel is twice as tall: keep the thread sparser and dimmer, without glints.
		const whole = cellPixels === 1;
		const threshold = 0.5 - intensity * 0.2 + (whole ? 0.18 : 0);
		if (n > threshold) {
			const glint = !whole && n > 0.86 - intensity * 0.1;
			return der.glow[glint ? 2 : !whole && n > threshold + 0.15 ? 1 : 0]!;
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

/** Columns the launch sweep covers; wider windows finish the sweep at their right edge. */
const AURORA_SWEEP_COLUMNS = 180;
/** On a 256-color grid, light below this stays sky. */
const AURORA_GRID_FLOOR = 0.34;

function smoothstep(lo: number, hi: number, v: number): number {
	const t = Math.min(1, Math.max(0, (v - lo) / (hi - lo)));
	return t * t * (3 - 2 * t);
}

/** A color `t` (0–1) along `stops`: blended for truecolor, the nearest listed stop when quantized. */
function along(stops: readonly string[], t: number, quantized: boolean): string {
	const clamped = Math.min(1, Math.max(0, t));
	if (quantized || stops.length === 1) return stops[Math.min(stops.length - 1, Math.floor(clamped * stops.length))]!;
	const at = clamped * (stops.length - 1);
	const i = Math.min(stops.length - 2, Math.floor(at));
	return mix(stops[i]!, stops[i + 1]!, at - i);
}

/**
 * `light` (0–1) of `color` over the page: blended when truecolor; when quantized, the page below
 * a floor and the listed stops of `ramp` above it.
 */
function glowOver(page: string, ramp: readonly string[], color: string, light: number, quantized: boolean): string {
	if (quantized) return light < 0.12 ? page : along(ramp, (light - 0.12) / 0.88, true);
	return light <= 0.01 ? page : mix(page, color, Math.min(1, light));
}

/**
 * Height of a mountain range at column `x`: peaks every ~`spacing` columns with seeded heights
 * between `low` and `high`, sides falling `slope` pixels per column; the range is their maximum.
 */
function ridgeHeight(x: number, spacing: number, low: number, high: number, slope: number, salt: number): number {
	const cell = Math.floor(x / spacing);
	let top = 0;
	for (let k = -2; k <= 2; k++) {
		const slot = cell + k;
		const peakX = slot * spacing + hash(slot, 1, salt) * spacing;
		const peak = low + (high - low) * hash(slot, 2, salt);
		top = Math.max(top, peak - Math.abs(x - peakX) * slope);
	}
	return top;
}

const auroraPixel: PixelFn = (x, py, pixelRows, edge, pal, _der, { time, intensity, intro = 1, cellPixels = 2 }) => {
	const salt = edge === "top" ? 61 : 67;
	const q = pal.quantized === true;
	const upper = pal.upper ?? pal.ramp;

	// Launch: the curtains sweep in from the left behind a bright leading edge, then settle.
	const front = intro * AURORA_SWEEP_COLUMNS;
	const reveal = intro >= 1 ? 1 : smooth(Math.min(1, Math.max(0, (front - x) / 28)));
	const flare = intro >= 1 ? 0 : Math.max(0, 1 - Math.abs(front - x) / 8) * (1 - intro);

	// Stars: sparse, two brightnesses, a few twinkling; hidden behind bright light.
	const twinkle = Math.floor(time / 13);
	const starSeed = hash(x, py, salt + 99 + (hash(x, py, salt) > 0.7 ? twinkle : 0));
	const star = starSeed > 0.996 ? pal.spark : starSeed > 0.991 ? mix(pal.page, pal.spark, 0.45) : undefined;

	if (edge === "bottom") {
		const ground = pal.ground ?? [pal.page];
		const near = ground[0]!;
		const far = ground[Math.min(1, ground.length - 1)]!;
		const crest = ground[Math.min(2, ground.length - 1)]!;
		const fromBase = pixelRows - 1 - py;
		// Far range: tall peaks with a lit crest; near range: lower, darker peaks in front.
		// Slopes are in pixels per column; a whole-cell pixel is twice as tall, so halve them there.
		const slope = cellPixels === 1 ? 0.5 : 1;
		const farTop = ridgeHeight(x, 23, pixelRows * 0.45, pixelRows * 0.95, 0.42 * slope, salt);
		const nearTop = ridgeHeight(x, 13, pixelRows * 0.15, pixelRows * 0.55, 0.6 * slope, salt + 9);
		if (fromBase < nearTop) return near;
		if (fromBase < farTop - 1) return far;
		if (fromBase < farTop) return crest;
		// Horizon glow just above the far range, lit by the curtains.
		const glow =
			Math.exp(-(fromBase - farTop) / 2.6) *
			(0.36 + intensity * 0.2) *
			reveal *
			(0.6 + 0.4 * fbm((x + time * 0.04) / 18, 1, salt));
		// On a 256-color grid the glow would only add stray blocks: keep the plain sky there.
		const sky = q ? pal.page : glowOver(pal.page, pal.ramp, pal.ramp[1] ?? pal.ramp[0]!, glow, false);
		return sky === pal.page && star ? star : sky;
	}

	// Curtains hang from above; their lower edge is a slow, folded curve near the content edge.
	const drift = time * 0.04;
	const edgeRow =
		pixelRows * (0.78 + 0.14 * Math.sin((x + drift * 2) / 23 + salt) + 0.05 * Math.sin((x - drift * 3) / 7.3));
	const above = edgeRow - py;
	// Curtains brighten and dim across the sky; gaps keep a faint glow instead of cutting off.
	const presence = (0.18 + 0.82 * smoothstep(0.2, 0.78, fbm((x + drift) / 30, 0, salt))) * reveal;
	// Rays: vertical striations that shimmer slowly along the curtain.
	const ray = valueNoise(x / 1.35 + time * 0.025, 0, salt + 5);
	// Gentler on a 256-color grid, where small steps would flip neighboring pixels between colors.
	const rays = q ? 0.7 + 0.3 * ray : 0.45 + 0.55 * ray;
	const strength = (0.8 + intensity * 0.35) * presence;
	let light: number;
	let color: string;
	if (above >= 0) {
		const height = pixelRows * 0.95;
		const h = above / height;
		// Brightest along the lower edge (soft across its pixel, so the edge never steps),
		// fading as the rays climb; green low, violet high. Rays reach different heights,
		// and strong curtains climb higher.
		const reach = height * (0.18 + 0.5 * ray * ray + 0.2 * presence);
		const profile = smoothstep(0, 1.2, above + 0.4) * Math.exp(-Math.max(0, above - 1) / reach);
		light = strength * rays * profile;
		color = h < 0.35 ? along(pal.ramp, 1 - h, q) : along(upper, 1 - (h - 0.35) / 0.65, q);
		if (q) {
			const stops = h < 0.35 ? pal.ramp : upper;
			// Only clear light draws: below the floor stays sky, so the grid shows calm shapes.
			const level = (light + flare * 0.6 - AURORA_GRID_FLOOR) / (1 - AURORA_GRID_FLOOR);
			if (level >= 0) return along(stops, level, true);
		} else if (light > 0.01) {
			return mix(pal.page, color, Math.min(1, light + flare * 0.6));
		}
	} else {
		// A soft glow just under the lower edge.
		light = strength * Math.exp(above / 1.6) * 0.35;
		if (!q) {
			const glow = glowOver(pal.page, pal.ramp, pal.ramp[1] ?? pal.ramp[0]!, light, false);
			if (glow !== pal.page) return glow;
		}
	}
	return star ?? pal.page;
};

const SCENE_PIXELS: Record<SceneKind, PixelFn> = { flight: flightPixel, dive: divePixel, aurora: auroraPixel };

/** Render `rows` terminal rows of the scene band. */
export function renderPixelScene(
	width: number,
	rows: number,
	kind: SceneKind,
	edge: SceneEdge,
	pal: PixelPalette,
	enc: PixelEncoder,
	opts: SceneOptions,
): string[] {
	const half = opts.cellPixels !== 1;
	const pixelRows = half ? rows * 2 : rows;
	const pixel = SCENE_PIXELS[kind];
	const der = derive(pal);
	const options: SceneOptions = {
		time: opts.time,
		intensity: Math.min(1, Math.max(0, opts.intensity)),
		intro: Math.min(1, Math.max(0, opts.intro ?? 1)),
		cellPixels: half ? 2 : 1,
	};
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
			if (!half) {
				const b = bg(pixel(x, row, pixelRows, edge, pal, der, options));
				if (b !== lastBg) {
					line += b;
					lastBg = b;
				}
				line += " ";
				continue;
			}
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
