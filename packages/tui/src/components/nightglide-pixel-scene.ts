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
	/** Aurora: mountains — near range, far range, lit far crest. Dive: rock, lit rock edge, sand. */
	ground?: readonly string[];
	/** Flight: cloud layers, far → near. */
	clouds?: readonly string[];
	/** Flight: cloud undersides. */
	shade?: string;
	/** Flight: the lit top edge of a cloud. */
	rim?: string;
	/** Flight: high wisps in the sky. */
	wisp?: string;
	/** Dive: light from the surface, strongest at the top of the window. */
	surface?: string;
	/** Dive: rippling caustic lines near the surface. */
	caustic?: string;
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
	/** Band width in columns; set by {@link renderPixelScene}. */
	width?: number;
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

/** Sparse stars at two brightnesses, a few twinkling; undefined where there is none. */
function starAt(x: number, py: number, salt: number, time: number, pal: PixelPalette, more = 0): string | undefined {
	if (pal.spark === pal.page) return undefined;
	const twinkle = Math.floor(time / 13);
	const seed = hash(x, py, salt + 99 + (hash(x, py, salt) > 0.7 ? twinkle : 0));
	if (seed > 0.996 - more) return pal.spark;
	if (seed > 0.991 - more) return mix(pal.page, pal.spark, 0.45);
	return undefined;
}

/**
 * Top of a cloud layer at column `x`, as a 0–1 share of the band: a continuous base with rounded
 * billows of seeded sizes every ~`spacing` columns.
 */
function billowTop(x: number, spacing: number, base: number, amp: number, salt: number): number {
	const cell = Math.floor(x / spacing);
	let top = base;
	for (let k = -2; k <= 2; k++) {
		const slot = cell + k;
		const cx = slot * spacing + hash(slot, 1, salt) * spacing;
		const r = spacing * (0.55 + 0.6 * hash(slot, 2, salt));
		const dx = (x - cx) / r;
		if (Math.abs(dx) >= 1) continue;
		top = Math.max(top, base + amp * (0.45 + 0.55 * hash(slot, 3, salt)) * Math.sqrt(1 - dx * dx));
	}
	return top;
}

/** Cloud layers of the flight floor, near first: drift speed, billow spacing, base and height. */
const CLOUD_LAYERS = [
	{ speed: 0.24, spacing: 14, base: 0.18, amp: 0.72 },
	{ speed: 0.12, spacing: 19, base: 0.5, amp: 0.45 },
	{ speed: 0.05, spacing: 27, base: 0.72, amp: 0.3 },
] as const;

const flightPixel: PixelFn = (x, py, pixelRows, edge, pal, _der, opts) => {
	const { time, intensity, cellPixels = 2, width = 120 } = opts;
	const q = pal.quantized === true;
	const salt = edge === "top" ? 11 : 29;
	const tall = cellPixels === 1 ? 2 : 1; // a whole-cell pixel is twice as tall as it is wide

	if (edge === "bottom") {
		// A sea of clouds below: three layers drifting at their own speeds, the nearest fastest
		// (forward flight), each with a lit rim and darker undersides.
		const clouds = pal.clouds ?? pal.ramp;
		const fromBase = pixelRows - 1 - py;
		const pace = 1 + intensity * 0.6;
		for (let i = 0; i < CLOUD_LAYERS.length; i++) {
			const layer = CLOUD_LAYERS[i]!;
			const body = clouds[Math.max(0, clouds.length - 1 - i)]!;
			// Higher effort: billows rise a little taller and their rims glow brighter.
			const amp = layer.amp * (1 + intensity * 0.2);
			const top =
				pixelRows * billowTop(x + time * layer.speed * pace, layer.spacing, layer.base, amp, salt + i * 13);
			if (fromBase >= top) continue;
			const inside = top - fromBase;
			const rim = pal.rim ?? body;
			// The lit rim shows on billow tops, not along the flat base between them.
			const crest = top > pixelRows * (layer.base + layer.amp * 0.35);
			const glow = (i === 0 ? 0.7 : 0.3) + intensity * 0.25;
			if (inside <= 1 && crest && i < 2) return q ? (i === 0 ? rim : body) : mix(body, rim, glow);
			if (q) return body;
			// Lit near the top, darker underneath.
			return mix(body, pal.shade ?? body, smoothstep(1, pixelRows * 0.6, inside) * (i === 0 ? 0.7 : 0.4));
		}
		return starAt(x, py, salt, time, pal) ?? pal.page;
	}

	// The sky above: a moon (a sun in light themes) with a soft halo, high wisps, stars.
	const cx = width * 0.8;
	const cy = pixelRows * 0.42;
	const dist = Math.hypot(x - cx, (py - cy) * tall);
	if (dist < 2.4) return dist < 1.5 || q ? pal.accent : mix(pal.accent, pal.page, 0.35);
	let sky = pal.page;
	if (!q && dist < 10) sky = mix(pal.page, pal.accent, 0.2 * (1 - dist / 10) ** 2);
	const wisp = smoothstep(0.58, 0.74, fbm((x + time * 0.06) / 34, (py * tall) / 3.4, salt)) * (0.4 + 0.25 * intensity);
	if (wisp > 0) {
		if (q) {
			if (wisp > 0.3) return pal.wisp ?? pal.ramp[0]!;
		} else {
			sky = mix(sky, pal.wisp ?? pal.ramp[1] ?? pal.ramp[0]!, wisp);
		}
	}
	if (sky === pal.page) return starAt(x, py, salt, time, pal, intensity * 0.004) ?? sky;
	return sky;
};

const divePixel: PixelFn = (x, py, pixelRows, edge, pal, der, opts) => {
	const { time, intensity, cellPixels = 2 } = opts;
	const q = pal.quantized === true;
	const d = depth(py, pixelRows, edge);
	const salt = edge === "top" ? 41 : 53;
	const tall = cellPixels === 1 ? 2 : 1;
	const light = pal.surface ?? pal.ramp[pal.ramp.length - 1]!;

	// Rising bubbles: each column has its own speed and a gentle wobble; more at higher effort.
	const column = Math.floor(x / 4);
	const bubbleSeed = hash(column, 7, salt);
	if (bubbleSeed > 0.82 - intensity * 0.35) {
		const speed = (0.16 + hash(column, 9, salt) * 0.22) / tall;
		const span = pixelRows + 8;
		const travel = (time * speed + bubbleSeed * 97) % span;
		const by = pixelRows - 1 - Math.floor(travel);
		const wobble = Math.round(Math.sin(travel * 0.55 + bubbleSeed * 6) * 0.9);
		if (py === by && x === column * 4 + 1 + wobble) return pal.spark;
	}

	if (edge === "bottom") {
		const ground = pal.ground ?? [pal.page];
		const rock = ground[0]!;
		const rockLit = ground[Math.min(1, ground.length - 1)]!;
		const sand = ground[Math.min(2, ground.length - 1)]!;
		const fromBed = pixelRows - 1 - py;
		// Sand floor with soft ripples.
		const sandTop = (pixelRows * 0.14 + (Math.sin(x / 3.1) > 0.6 ? 0.6 : 0)) / tall;
		if (fromBed < sandTop) return sand;
		// Seaweed in front of the rocks: tapering stalks whose tips sway more than their bases.
		const plants = pal.plants ?? pal.ramp;
		const cell = Math.floor(x / 7);
		for (let k = -1; k <= 1; k++) {
			const slot = cell + k;
			const seed = hash(slot, 0, salt);
			if (seed < 0.3) continue;
			const root = slot * 7 + 1 + Math.floor(hash(slot, 1, salt) * 5);
			const height = 3 / tall + Math.floor(hash(slot, 2, salt) * (pixelRows * 0.85 - 3 / tall));
			if (fromBed > height) continue;
			const bend = fromBed / height;
			const sway = Math.sin(time * 0.09 + slot * 1.7 + fromBed * tall * 0.42) * bend * bend * 1.8;
			if (Math.abs(x - (root + sway)) < 0.75 - bend * 0.4) {
				return plants[Math.min(plants.length - 1, Math.floor(bend * plants.length))]!;
			}
		}
		// Rock outcrops with a lit top edge; a few carry coral.
		const slope = cellPixels === 1 ? 0.5 : 1;
		const rockTop = ridgeHeight(x, 17, pixelRows * 0.25, pixelRows * 0.75, 0.55 * slope, salt);
		if (fromBed < rockTop - 1) return rock;
		if (fromBed < rockTop) return hash(Math.floor(x / 3), 4, salt) > 0.86 ? pal.accent : rockLit;
		// Dim water above the bed.
		const haze = (1 - d) * 0.18;
		if (!q && haze > 0.01) return mix(pal.page, pal.ramp[0]!, haze);
		return hash(x, Math.floor(py + time * 0.05), salt + 17) > 0.993 ? der.mote : pal.page;
	}

	// The surface seen from below: brighter water near the top, rippling caustic lines, and soft
	// shafts slanting down; all fade with depth.
	const near = 1 - d;
	const y = py * tall;
	// The surface itself: a shimmering line along the window edge.
	if (py === 0) {
		const glint = 0.5 + 0.5 * Math.sin(x * 0.7 + time * 0.08 + Math.sin(x * 0.13) * 3);
		return q ? (glint > 0.6 ? (pal.caustic ?? light) : pal.ramp[0]!) : mix(pal.page, light, 0.45 + 0.35 * glint);
	}
	let water = q ? pal.page : mix(pal.page, light, 0.3 * near ** 1.6);
	// Caustics: two interfering ripple fields; their product makes bright patches that wander.
	const a = 0.5 + 0.5 * Math.sin(x * 0.42 + 2.2 * Math.sin(y * 0.55 + time * 0.035));
	const b = 0.5 + 0.5 * Math.sin(y * 0.9 + 1.6 * Math.sin(x * 0.27 - time * 0.03));
	const caustic = smoothstep(0.45, 0.85, a * b) * smoothstep(0.35, 0.85, near);
	const wave = Math.sin((x * 0.85 + y * 0.7 + Math.sin(time * 0.03) * 6) / 6.5 + salt);
	const shaft = smoothstep(0.45, 1, wave) * near * (0.32 + intensity * 0.14);
	if (q) {
		if (caustic > 0.55) return pal.caustic ?? light;
		if (shaft > 0.12) return pal.ramp[0]!;
		return hash(x, Math.floor(py + time * 0.05), salt + 17) > 0.993 ? der.mote : pal.page;
	}
	if (shaft > 0) water = mix(water, light, shaft);
	if (caustic > 0) water = mix(water, pal.caustic ?? light, caustic * 0.5);
	return water;
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
		width,
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
