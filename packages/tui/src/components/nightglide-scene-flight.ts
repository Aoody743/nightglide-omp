/**
 * P1.2 scene-flight v4 — pixel-art night flight above a heavy cumulus deck.
 * Iterated against docs/reference/flight-concept.png: the mock's deck is a
 * THICK, dithered cloud field with bright lit tops, deep shadowed bases,
 * sparse starry sky and occasional cumulus TOWERS punching through the deck.
 *
 * v4 changes over v3:
 * - occasional cumulus towers (~one per 25 columns, noise-triggered) rise
 *   1-2 rows above the deck surface; parabolic taper, lit/shadow faces
 * - deck height curve contrast boosted: valleys dig deep (more sky), peaks
 *   ride high (deck nearly fills the band at peaks)
 * - bright cap reads as a two-tone lit rim (text vs borderAccent in dark)
 * - deep cloud base darkened (dim speckle + borderAccent sparkle in dark)
 * - two star layers: bright (muted) and faint (border) on independent noise
 *
 * Pure functions; `phase` externally driven; theme tokens only; CJK-safe
 * (half-width block glyphs only).
 */
import { theme } from "../theme/theme";
import { truncateToWidth } from "../utils";

/** Deterministic per-column noise in [0,1). */
function noise(x: number, salt: number): number {
	const v = Math.sin(x * 12.9898 + salt * 78.233) * 43758.5453;
	return v - Math.floor(v);
}

/** Deck vertical composition: dark keeps a heavy deck, light stays sparse. */
function deckCenter(rows: number, dark: boolean): number {
	return rows * (dark ? 0.44 : 0.52);
}
function deckSpan(rows: number, dark: boolean): number {
	return rows * (dark ? 0.3 : 0.24);
}

/**
 * Smooth (grit-free) bank profile at column x — row index (fractional, from
 * the band TOP) of the cloud surface. Extremes are pushed outward
 * (super-unity exponent) so valleys expose deep sky while peaks ride high:
 * the contrast boost over v3's flat ±1.2-row undulation.
 */
function deckSmooth(x: number, phase: number, rows: number, dark: boolean): number {
	const drift = phase * 0.55;
	const banks = Math.sin((x + drift) / 13) * 0.55 + Math.sin((x + drift * 1.7) / 4.7) * 0.35;
	const p = Math.sign(banks) * Math.pow(Math.abs(banks), 1.25);
	return deckCenter(rows, dark) + p * deckSpan(rows, dark);
}

/**
 * Full cloud-surface height at column x: smooth banks + per-column grit.
 * Peaks may pierce the top edge; valleys keep a thin cap floor so the deck
 * never fully disconnects.
 */
function deckTop(x: number, phase: number, salt: number, rows: number, dark: boolean): number {
	const drift = phase * 0.55;
	// grit ≈ v3's edge texture (~±0.5 row) — enough for irregular blob edges
	// without swamping the tower silhouettes
	const grit = (noise(Math.floor(x + drift), salt) - 0.5) * 0.75;
	const p = Math.sign(grit) * Math.pow(Math.abs(grit), 1.25);
	const surface = deckSmooth(x, phase, rows, dark) + p * deckSpan(rows, dark);
	return Math.max(-0.1, Math.min(rows - 0.35, surface));
}

const TOWER_SPACING = 25;

interface TowerShape {
	/** surface row at this column including the tower (above deckTop). */
	top: number;
	/** true on the shadow (right) face of the tower. */
	shadow: boolean;
}

/**
 * Cumulus tower punching through the deck: noise-triggered roughly once per
 * TOWER_SPACING columns, drifting with the deck. Parabolic taper so the
 * flanks merge back into the deck; apex breaks 1-2 rows above the surface.
 */
function towerAt(x: number, phase: number, salt: number, rows: number, dark: boolean): TowerShape | null {
	const drift = phase * 0.55;
	const cell = Math.floor((x + drift) / TOWER_SPACING);
	// noise gate: ~75% of dark cells spawn a tower (one per ~33 cols, matching
	// the mock's ~4 formations per band); light stays sparser (~45%)
	if (noise(cell, salt + 41) <= (dark ? 0.25 : 0.55)) return null;
	const cx = cell * TOWER_SPACING + 4 + noise(cell, salt + 42) * 17 - drift;
	const halfWidth = 1.3 + noise(cell, salt + 43) * 1.9;
	const t = (x - cx) / halfWidth;
	if (Math.abs(t) >= 1) return null;
	// dark towers punch 1-2 rows through the deck; light keeps gentler mounds
	const lift = dark ? 1.25 + noise(cell, salt + 44) * 1.0 : 1.0 + noise(cell, salt + 44) * 0.7;
	// anchor to the SMOOTH bank profile so the apex reliably breaks `lift`
	// rows above the deck regardless of local grit
	const base = deckSmooth(cx, phase, rows, dark);
	// parabola: apex at base-lift, flanks drop `drop` rows back below the deck
	const drop = lift + 0.55;
	const top = Math.max(0.1, base - lift + t * t * drop);
	return { top, shadow: t > 0.3 };
}

function dither(x: number, y: number, phase: number, period = 2): boolean {
	return (x + y + Math.floor(phase / period)) % 2 === 0;
}

/** Bright lit rim over a deep under-beard: lit teeth vs shadow teeth. */
function capCell(x: number, y: number, phase: number, shadow: boolean, dark: boolean): string {
	const dith = dither(x, y, phase, 2);
	if (dark) {
		// lit face: text over borderAccent beard; shadow face deepens to muted
		if (shadow) return theme.fg(dith ? "borderAccent" : "muted", dith ? "▀" : "▄");
		return theme.fg(dith ? "text" : "borderAccent", dith ? "▀" : "▄");
	}
	if (shadow) return theme.fg(dith ? "accent" : "muted", dith ? "▀" : "▄");
	return theme.fg(dith ? "text" : "accent", dith ? "▀" : "▄");
}

/** Tower shaft below the rim: bright body on the lit face, deep on shadow. */
function towerBodyCell(x: number, y: number, phase: number, shadow: boolean, dark: boolean): string {
	const dith = dither(x, y, phase, 2);
	if (dark) {
		if (shadow) return theme.fg(dith ? "muted" : "dim", dith ? "█" : "▓");
		return theme.fg(dith ? "accent" : "borderAccent", dith ? "█" : "▓");
	}
	if (shadow) return theme.fg(dith ? "muted" : "border", dith ? "█" : "▓");
	return theme.fg(dith ? "accent" : "muted", dith ? "█" : "▓");
}

/** One cell of the band: tone layer depends on depth below the cloud surface. */
function deckCell(
	x: number,
	y: number,
	top: number,
	phase: number,
	dark: boolean,
	inTower: boolean,
	shadow: boolean,
): string {
	const depth = y - top;
	const dith = dither(x, y, phase, 2);
	if (depth < 0) {
		// sky above the deck — two star layers on independent noise fields
		if (noise(Math.floor(x + phase * 0.2), 5) > (dark ? 0.968 : 0.988)) {
			return theme.fg("muted", "·"); // bright star
		}
		if (noise(Math.floor(x * 1.73 + phase * 0.15), 9) > (dark ? 0.905 : 0.955)) {
			return theme.fg("border", "·"); // faint star
		}
		if (dith && noise(Math.floor(x + phase * 0.25), 11) > 0.86) {
			return theme.fg("border", "░"); // far-cloud dither
		}
		return " ";
	}
	if (inTower) {
		if (depth < 0.85) return capCell(x, y, phase, shadow, dark);
		if (depth < 2.1) return towerBodyCell(x, y, phase, shadow, dark);
	}
	if (depth < 0.8) {
		// bright top rim — lit cap over deep beard (half-block alternation)
		return capCell(x, y, phase, false, dark);
	}
	if (depth < 1.7) {
		if (dark) return theme.fg(dith ? "accent" : "borderAccent", dith ? "█" : "▓");
		return theme.fg("accent", dith ? "█" : "▓");
	}
	if (depth < 2.6) {
		return theme.fg("muted", dith ? "▓" : "▒");
	}
	if (dark) {
		// deep base darkened: dim shadow speckled with borderAccent sparkle
		return theme.fg(dith ? "borderAccent" : "dim", dith ? "▒" : "░");
	}
	return theme.fg(dith ? "borderMuted" : "border", dith ? "▒" : "░");
}

/** Cold cyan light streaks over the sky + rare gold sparkle (dark only). */
function skyStreak(width: number, y: number, phase: number, dark: boolean): Map<number, string> {
	const out = new Map<number, string>();
	const anchor = ((y * 2.3 + phase * 0.18) % (width + 24)) - 12;
	for (let x = Math.max(0, Math.floor(anchor)); x < Math.min(width, Math.floor(anchor) + 14); x++) {
		const t = 1 - Math.abs(x - anchor - 6) / 7;
		if (t > 0.2 && dither(x, y, phase, 3)) {
			out.set(x, theme.fg(dark ? "syntaxKeyword" : "syntaxFunction", t > 0.85 ? "─" : "·"));
		}
	}
	if (dark && noise(Math.floor(phase * 0.13), 23) > 0.72) {
		const gx = Math.floor(noise(Math.floor(phase * 0.21), 31) * width);
		out.set(gx, theme.fg("warning", "·"));
	}
	return out;
}

export function renderFlightFrame(width: number, phase: number, rows: number, dark: boolean): string[] {
	const salt = dark ? 3 : 17;
	const lines: string[] = [];
	for (let y = 0; y < rows; y++) {
		const streaks = skyStreak(width, y, phase, dark);
		const cells: string[] = [];
		for (let x = 0; x < width; x++) {
			const surface = deckTop(x, phase, salt, rows, dark);
			const tower = towerAt(x, phase, salt, rows, dark);
			const top = tower && tower.top < surface ? tower.top : surface;
			// tower-vs-deck gate on the SMOOTH profile: the lit/shadow ladder
			// stays stable across a tower's footprint despite local grit
			const smooth = deckSmooth(x, phase, rows, dark);
			const inTower = tower != null && tower.top < smooth - 0.2;
			const shadow = inTower && tower!.shadow;
			const cell = deckCell(x, y, top, phase, dark, inTower, shadow);
			const streak = streaks.get(x);
			const overSky = cell === " " || cell.endsWith("░") || cell.endsWith("·");
			cells.push(streak && overSky ? streak : cell);
		}
		lines.push(truncateToWidth(cells.join(""), width));
	}
	return lines;
}

export function renderFlightStatic(width: number, rows: number, dark: boolean): string[] {
	return renderFlightFrame(width, 0, rows, dark);
}
