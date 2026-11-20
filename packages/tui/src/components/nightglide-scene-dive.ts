/**
 * P1.2 scene-dive v4 — first-person view into the water column.
 * Iterated against docs/reference/dive-concept.png:
 * - seaweed grows in DENSE clumps (2-4 column-adjacent fronds, staggered
 *   heights, shared sway phase) with wide gaps between clumps — the mock's
 *   "one clump at a time" rhythm, not scattered single stalks
 * - 2-3 WIDE diagonal light shafts (4-8 cols, core+edge two-token fade with
 *   layered dither density), drifting slowly; pronounced on dark, barely
 *   there on light
 * - occasional small fish silhouettes (2-3) crossing mid-water by phase
 * - thin single-column bubbles rising with micro-sway
 * - dithered sand seabed with coral accents
 *
 * Pure functions; `phase` externally driven; theme tokens only; CJK-safe
 * (half-width glyphs only).
 */
import { theme } from "../theme/theme";
import { truncateToWidth } from "../utils";
import type { ThemeColor } from "../theme/schema";

function noise(x: number, salt: number): number {
	const v = Math.sin(x * 12.9898 + salt * 78.233) * 43758.5453;
	return v - Math.floor(v);
}

function dither(x: number, y: number, phase: number, period = 2): boolean {
	return (x + y + Math.floor(phase / period)) % 2 === 0;
}

function mod(a: number, b: number): number {
	return ((a % b) + b) % b;
}

interface Frond {
	x: number;
	height: number; // frond height in rows above the seabed
	phaseOff: number; // clump phase + tiny per-frond offset
	amp: number; // sway amplitude in columns at the tip
	tone: number; // index into the weed token set
	leafletSide: 1 | -1;
}

const WEED_DARK: ThemeColor[] = ["success", "syntaxType", "syntaxString"];
const WEED_LIGHT: ThemeColor[] = ["success", "bashMode", "mdLink"];

/**
 * Weed clumps pinned to the seabed: each clump is 2-4 ADJACENT fronds
 * (neighbouring columns, staggered heights, one shared sway phase with a
 * small per-frond offset so the clump moves as one plant). Clump spacing is
 * wide, so the band reads "…clump………clump………" like the mock.
 */
function plants(width: number, rows: number, dark: boolean): Frond[] {
	const out: Frond[] = [];
	const spacing = dark ? 18 : 22;
	const tones = dark ? WEED_DARK : WEED_LIGHT;
	for (let k = 0; k * spacing - 3 < width; k++) {
		let n = 2 + Math.floor(noise(k, 43) * 2.9); // 2-4 adjacent fronds
		const anchor = Math.max(1, Math.min(width - 1 - n, Math.round(k * spacing + (noise(k, 41) - 0.5) * 6)));
		n = Math.max(1, Math.min(n, width - 2));
		const hb = rows * (0.55 + noise(k, 47) * 0.45); // clump reaches 55-100% of band
		const tall = noise(k, 59) > 0.55; // some clumps touch the surface
		const baseTone = Math.floor(noise(k, 83) * tones.length);
		const clumpPhase = noise(k, 73) * Math.PI * 2;
		for (let i = 0; i < n; i++) {
			let h = Math.round(hb * (0.72 + noise(k * 17 + i, 53) * 0.45));
			if (tall && i === Math.floor(n / 2)) h = rows;
			h = Math.max(1, Math.min(rows, h));
			out.push({
				x: anchor + i,
				height: h,
				phaseOff: clumpPhase + (noise(k * 17 + i, 79) - 0.5) * 0.6,
				amp: 1.4 + noise(k * 17 + i, 89) * 0.6,
				tone: (baseTone + (noise(k * 17 + i, 87) > 0.78 ? 1 : 0)) % tones.length,
				leafletSide: noise(k * 17 + i, 91) > 0.5 ? 1 : -1,
			});
		}
	}
	return out;
}

interface Ray {
	frac: number; // seabed anchor as fraction of width
	tilt: number; // columns shifted per row upward (shaft lean)
	half: number; // half width in columns (full shaft 4-8 cols)
	speed: number; // steady drift in columns per phase
	salt: number;
}

/** 2-3 wide diagonal shafts, near-parallel like the mock's surface light. */
function rayBeams(dark: boolean, width: number): Ray[] {
	const count = width < 46 ? 2 : 3;
	const fracs = [0.22, 0.5, 0.78];
	const out: Ray[] = [];
	for (let b = 0; b < count; b++) {
		out.push({
			frac: fracs[b]! + (noise(b, 207) - 0.5) * 0.08,
			tilt: 0.8 + noise(b, 211) * 0.7,
			half: 2 + noise(b, 217) * 2.0,
			speed: (0.14 + noise(b, 223) * 0.12) * (dark ? 1 : 0.8),
			salt: b * 2.4 + 1.1,
		});
	}
	return out;
}

interface Fish {
	lane: number; // preferred row (0 = band top)
	dir: 1 | -1;
	speed: number; // columns per phase
	off: number; // lap offset + bob salt
	shape: string;
}

/** Occasional 2-3 tiny fish crossing mid-water. Each fish alternates between
 *  a lap across the frame and a long rest off-screen, so at any moment 0-3
 *  are visible — they come and go instead of patrolling permanently. */
function shoal(width: number, rows: number): Fish[] {
	const count = width >= 90 ? 3 : 2;
	const span = width + 14; // visible lap incl. off-screen margins
	const lap = span * 2.25; // lap + rest before the next pass
	const out: Fish[] = [];
	for (let f = 0; f < count; f++) {
		out.push({
			lane: Math.max(0, Math.min(rows - 2, 1 + Math.floor(noise(f, 171) * Math.max(1, rows - 2)))),
			dir: noise(f, 181) > 0.5 ? 1 : -1,
			speed: 0.5 + noise(f, 191) * 0.35,
			off: noise(f, 197) * lap,
			shape: noise(f, 201) > 0.5 ? ">o<" : "><",
		});
	}
	return out;
}

interface Vent {
	x: number;
	speed: number;
	off: number;
}

/** Sparse single-column bubble emitters on the seabed. */
function vents(width: number, dark: boolean): Vent[] {
	const out: Vent[] = [];
	const spacing = dark ? 30 : 40;
	for (let k = 0; k * spacing < width; k++) {
		out.push({
			x: Math.max(1, Math.min(width - 2, Math.floor(k * spacing + noise(k, 131) * spacing * 0.6))),
			speed: 0.3 + noise(k, 137) * 0.25,
			off: noise(k, 139) * 40,
		});
	}
	return out;
}

export function renderDiveFrame(width: number, phase: number, rows: number, dark: boolean): string[] {
	const lines: string[] = [];
	const fronds = plants(width, rows, dark);
	const fish = shoal(width, rows);
	const puffs = vents(width, dark);
	const beams = rayBeams(dark, width);
	const weedTones = dark ? WEED_DARK : WEED_LIGHT;
	const rayCore: ThemeColor = dark ? "thinkingLow" : "thinkingOff";
	const rayEdge: ThemeColor = dark ? "dim" : "borderMuted";
	const fishToken: ThemeColor = dark ? "muted" : "dim";
	const puffToken: ThemeColor = dark ? "muted" : "dim";
	const coralToken: ThemeColor = dark ? "warning" : "toolDiffRemoved";
	const coralToken2: ThemeColor = dark ? "toolDiffRemoved" : "error";
	const swayPhase = phase * 0.09;

	for (let y = 0; y < rows; y++) {
		const fromFloor = rows - 1 - y; // 0 = seabed row
		const cells: string[] = [];
		for (let x = 0; x < width; x++) {
			// 1) seabed (bottom row): dithered sand + coral clusters
			if (fromFloor === 0) {
				const c = noise(Math.floor(x), 91);
				if (c > 0.93) {
					cells.push(theme.fg(c > 0.97 ? coralToken2 : coralToken, dither(x, y, phase, 2) ? "▄" : "▀"));
					continue;
				}
				if (c > 0.55) {
					cells.push(theme.fg(dark ? "borderAccent" : "borderMuted", dither(x, y, phase, 2) ? "▄" : "▀"));
					continue;
				}
				cells.push(" ");
				continue;
			}
			// 2) weed clumps — frond bodies first (adjacent fronds stay solid),
			//    then tip/mid leaflets on the clump edges
			let drawn = false;
			for (const p of fronds) {
				if (p.height <= fromFloor) continue;
				const lvl = p.height - fromFloor;
				const effAmp = p.amp * Math.min(1, (p.height - 1) / 3); // short fronds sway less
				const fx = Math.round(
					p.x + Math.sin(swayPhase + p.phaseOff) * effAmp * Math.pow((lvl - 1) / Math.max(1, p.height - 1), 1.2),
				);
				if (fx === x) {
					const tk = weedTones[p.tone]!;
					cells.push(theme.fg(tk, lvl === 1 ? "▄" : dither(x, y, phase, 2) ? "▓" : "▒"));
					drawn = true;
					break;
				}
			}
			if (!drawn) {
				for (const p of fronds) {
					if (p.height <= fromFloor || p.height < 3) continue;
					const lvl = p.height - fromFloor;
					if (lvl < 2) continue;
					const effAmp = p.amp * Math.min(1, (p.height - 1) / 3);
					const fx = Math.round(
						p.x +
							Math.sin(swayPhase + p.phaseOff) * effAmp * Math.pow((lvl - 1) / Math.max(1, p.height - 1), 1.2),
					);
					if (
						fx + p.leafletSide === x &&
						noise(p.x * 31 + lvl * 7 + p.height, 93) > 0.55 &&
						dither(x, y, phase, 2)
					) {
						cells.push(theme.fg(weedTones[p.tone]!, "▌"));
						drawn = true;
						break;
					}
				}
			}
			if (drawn) continue;
			// 3) fish silhouettes cross mid-water (in front of the light shafts);
			//    each fish is on-lap only for pos < span, resting off-screen after
			for (const f of fish) {
				const pos = mod(f.off + f.dir * phase * f.speed, (width + 14) * 2.25);
				if (pos >= width + 14) continue;
				const fx0 = Math.floor(pos - 7);
				const fy = Math.max(0, Math.min(rows - 2, f.lane + Math.round(Math.sin(phase * 0.33 + f.off) * 0.7)));
				if (fy === y && x >= fx0 && x < fx0 + f.shape.length) {
					cells.push(theme.fg(fishToken, f.shape[x - fx0]!));
					drawn = true;
					break;
				}
			}
			if (drawn) continue;
			// 4) diagonal light shafts: wide core + layered edge fade, drifting;
			//    drawn only into open water (weeds/fish/seabed already claimed)
			for (const r of beams) {
				const cx = width * r.frac + phase * r.speed + Math.sin(phase * 0.05 + r.salt) * 3 + r.tilt * fromFloor;
				const a = Math.abs(x - cx);
				if (a >= r.half * 1.08) continue;
				if (a < r.half * 0.55) {
					// dense core — every cell filled, alternating ▒/░
					cells.push(theme.fg(rayCore, dither(x, y, phase, 2) ? "▒" : "░"));
				} else if (a < r.half * 0.78) {
					// edge band — ~1/2 keep
					if (mod(x + y * 2 + Math.floor(phase / 3), 2) !== 0) continue;
					cells.push(theme.fg(rayEdge, "░"));
				} else {
					// soft skirt — ~1/4 keep
					if (mod(x + y * 2 + Math.floor(phase / 3), 4) !== 0) continue;
					cells.push(theme.fg(rayEdge, "░"));
				}
				drawn = true;
				break;
			}
			if (drawn) continue;
			// 5) thin bubbles: single column rising with micro-sway
			for (const v of puffs) {
				const cycle = mod(phase * v.speed + v.off, rows + 5);
				const iy = Math.round(rows + 1 - cycle);
				if (iy !== y || iy < 0 || iy > rows - 2) continue;
				const bx = v.x + Math.round(Math.sin(phase * 0.22 + v.x * 1.7) * Math.min(1, cycle * 0.3));
				if (bx === x && bx >= 0 && bx < width) {
					cells.push(theme.fg(puffToken, "◦"));
					drawn = true;
					break;
				}
			}
			if (drawn) continue;
			// 6) water: sparse drifting motes
			if (dither(x, y, phase, 4) && noise(Math.floor(x), 151) > 0.93) {
				cells.push(theme.fg(dark ? "muted" : "borderMuted", "·"));
				continue;
			}
			cells.push(" ");
		}
		lines.push(truncateToWidth(cells.join(""), width));
	}
	return lines;
}

export function renderDiveStatic(width: number, rows: number, dark: boolean): string[] {
	return renderDiveFrame(width, 0, rows, dark);
}
