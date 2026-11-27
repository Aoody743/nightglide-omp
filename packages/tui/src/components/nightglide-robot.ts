/**
 * Nightglide virtual companion pixel sprites for the Glide sidebar.
 *
 * Renders 5 selectable 10×10 half-block companions (`glider`, `cat`, `owl`,
 * `diver`, `prism`) aligned with the active theme's palette in dark and light
 * modes, plus `"auto"` (which matches the active theme family). Supports
 * `cellPixels = 2` (`▀` half blocks), `cellPixels = 1` (whole-cell background
 * blocks), `NO_COLOR` monochrome, `ascii` fallback, and a 1-line compact badge
 * when vertical space is tight.
 *
 * Reflects real session state only (`idle` | `thinking` | `tools` | `done`).
 * Subtle animation runs only when `motion` is enabled and the state is active
 * (`thinking` or `tools`); `idle`, `done`, and `motion=false` stay still.
 */
import { bgAnsi, fgAnsi } from "../theme/color";
import type { ColorMode } from "../theme/schema";
import type { SceneKind } from "./nightglide-pixel-scene";

export type RobotState = "idle" | "thinking" | "tools" | "done";
export const ROBOT_STYLES = ["glider", "cat", "owl", "diver", "prism"] as const;
export type RobotStyle = (typeof ROBOT_STYLES)[number];
export type RobotStyleSetting = "auto" | RobotStyle;

export interface NightglideRobotOptions {
	kind: SceneKind;
	/** Companion silhouette (`"auto"` matches `kind`); invalid values fall back to `"auto"`. */
	style?: string;
	light?: boolean;
	state: RobotState;
	phase?: number;
	motion?: boolean;
	cellPixels?: 1 | 2;
	colorMode?: ColorMode;
	plain?: boolean;
	ascii?: boolean;
	compact?: boolean;
	pageBg?: string;
}

export const ROBOT_WIDTH = 10;
export const ROBOT_ROWS = 5;

/** Resolve `"auto"` or unknown setting strings to a concrete companion style for `kind`. */
export function resolveRobotStyle(style: string | undefined, kind: SceneKind): RobotStyle {
	if (style && (ROBOT_STYLES as readonly string[]).includes(style)) {
		return style as RobotStyle;
	}
	if (kind === "dive") return "diver";
	if (kind === "aurora") return "prism";
	return "glider";
}

interface RobotPalette {
	page: string;
	shell: string;
	shade: string;
	rim: string;
	visor: string;
	eye: string;
	eyeGlow: string;
	wing: string;
	crest: string;
	thruster: string;
	thrusterDim: string;
}

/** Truecolor palettes per (kind, light). */
function truecolorPalette(kind: SceneKind, light: boolean): RobotPalette {
	if (kind === "dive") {
		return light
			? {
					page: "#fffaf2",
					shell: "#2a6885",
					shade: "#1e4b61",
					rim: "#72cfc5",
					visor: "#1a2530",
					eye: "#87f5ea",
					eyeGlow: "#ffffff",
					wing: "#d95f43",
					crest: "#e8a849",
					thruster: "#4fb8af",
					thrusterDim: "#a8d8d0",
				}
			: {
					page: "#041519",
					shell: "#1b8a82",
					shade: "#0f4e4d",
					rim: "#5fe0c8",
					visor: "#051116",
					eye: "#7ef5e8",
					eyeGlow: "#e3ffff",
					wing: "#ff8a5c",
					crest: "#ffd394",
					thruster: "#5fd7d7",
					thrusterDim: "#1e7a78",
				};
	}
	if (kind === "aurora") {
		return light
			? {
					page: "#f5f4ff",
					shell: "#5b42ad",
					shade: "#3c287a",
					rim: "#b8a6ff",
					visor: "#130d2a",
					eye: "#34d399",
					eyeGlow: "#c4ffe6",
					wing: "#ff9ebb",
					crest: "#ffd166",
					thruster: "#34d399",
					thrusterDim: "#8c6ee0",
				}
			: {
					page: "#0b0819",
					shell: "#4b3596",
					shade: "#2b1d5e",
					rim: "#a98dff",
					visor: "#090616",
					eye: "#34d399",
					eyeGlow: "#c4ffe6",
					wing: "#78e5d8",
					crest: "#f2c98a",
					thruster: "#34d399",
					thrusterDim: "#4b3596",
				};
	}
	return light
		? {
				page: "#f8faff",
				shell: "#3c7dbb",
				shade: "#1f5399",
				rim: "#a4ccf5",
				visor: "#182442",
				eye: "#74e0f0",
				eyeGlow: "#ffffff",
				wing: "#ff9ebb",
				crest: "#ffd166",
				thruster: "#3c7dbb",
				thrusterDim: "#a4ccf5",
			}
		: {
				page: "#101329",
				shell: "#3566ad",
				shade: "#1d3b70",
				rim: "#88c9f2",
				visor: "#0b1124",
				eye: "#6fd6ea",
				eyeGlow: "#e8f8ff",
				wing: "#7ce8ff",
				crest: "#f5d58c",
				thruster: "#6fd6ea",
				thrusterDim: "#2f5f95",
			};
}

/** 256-color grid palettes so Terminal.app/256-color terminals keep clean contrast. */
function palette256(kind: SceneKind, light: boolean): RobotPalette {
	if (kind === "dive") {
		return light
			? {
					page: "#ffffff",
					shell: "#008787",
					shade: "#005f5f",
					rim: "#5fd7d7",
					visor: "#121212",
					eye: "#87ffff",
					eyeGlow: "#ffffff",
					wing: "#ff5f5f",
					crest: "#ffaf00",
					thruster: "#5fd7d7",
					thrusterDim: "#afd7d7",
				}
			: {
					page: "#121212",
					shell: "#008787",
					shade: "#005f5f",
					rim: "#5fd7d7",
					visor: "#080808",
					eye: "#87ffff",
					eyeGlow: "#d7ffff",
					wing: "#ff875f",
					crest: "#ffd787",
					thruster: "#5fd7d7",
					thrusterDim: "#005f5f",
				};
	}
	if (kind === "aurora") {
		return {
			page: light ? "#ffffff" : "#080808",
			shell: "#5f5faf",
			shade: "#00005f",
			rim: "#afafff",
			visor: "#121212",
			eye: "#5fd7af",
			eyeGlow: "#d7ffff",
			wing: "#5fd7d7",
			crest: "#ffd787",
			thruster: "#5fd7af",
			thrusterDim: "#5f5f87",
		};
	}
	return light
		? {
				page: "#ffffff",
				shell: "#5f87d7",
				shade: "#005fd7",
				rim: "#afd7ff",
				visor: "#121212",
				eye: "#5fd7ff",
				eyeGlow: "#ffffff",
				wing: "#ff87af",
				crest: "#ffd787",
				thruster: "#5f87d7",
				thrusterDim: "#afd7ff",
			}
		: {
				page: "#121212",
				shell: "#005f87",
				shade: "#00005f",
				rim: "#87afd7",
				visor: "#080808",
				eye: "#5fd7ff",
				eyeGlow: "#d7ffff",
				wing: "#87d7ff",
				crest: "#ffd787",
				thruster: "#5fd7ff",
				thrusterDim: "#005f87",
			};
}

/** Derive robot state strictly from live session activity. */
export function deriveRobotState(input: { streaming: boolean; activeTools?: number; turnDone?: boolean }): RobotState {
	if ((input.activeTools ?? 0) > 0) return "tools";
	if (input.streaming) return "thinking";
	if (input.turnDone) return "done";
	return "idle";
}

function activeTick(state: RobotState, phase: number | undefined, motion: boolean | undefined): number {
	if (!motion || (state !== "thinking" && state !== "tools")) return 0;
	const raw = Math.trunc(phase ?? 0);
	return ((raw % 4) + 4) % 4;
}

type PixelToken = "." | "S" | "D" | "R" | "V" | "E" | "G" | "W" | "C" | "T" | "t";

function resolvePixelColor(token: PixelToken, pal: RobotPalette): string {
	switch (token) {
		case ".":
			return pal.page;
		case "S":
			return pal.shell;
		case "D":
			return pal.shade;
		case "R":
			return pal.rim;
		case "V":
			return pal.visor;
		case "E":
			return pal.eye;
		case "G":
			return pal.eyeGlow;
		case "W":
			return pal.wing;
		case "C":
			return pal.crest;
		case "T":
			return pal.thruster;
		case "t":
			return pal.thrusterDim;
	}
}

function visorEyesForState(state: RobotState, tick: number): [string, string, string] {
	if (state === "done") return ["SVGVVGVS", "SVEVVEVS", "SVVVVVVS"];
	if (state === "thinking") {
		const frames: readonly [string, string, string][] = [
			["SVEVVEVS", "SVGVVGVS", "SVVVVVVS"],
			["SVGVVEVS", "SVEVVGVS", "SVVVVVVS"],
			["SVEVVGVS", "SVGVVEVS", "SVVVVVVS"],
			["SVEVVEVS", "SVEVVEVS", "SVVVVVVS"],
		];
		return frames[tick]!;
	}
	if (state === "tools") {
		return tick % 2 === 0 ? ["SVVVVVVS", "SVGVVGVS", "SVEVVEVS"] : ["SVEVVEVS", "SVGGGGVS", "SVVVVVVS"];
	}
	return ["SVVVVVVS", "SVEVVEVS", "SVVVVVVS"];
}

/**
 * Build the 10×10 pixel grid (10 columns × 10 pixel rows = 10×5 half-block cells)
 * for a given style, state, and animation tick.
 */
function buildHalfBlockGrid(style: RobotStyle, state: RobotState, tick: number): PixelToken[][] {
	const core =
		state === "tools"
			? tick % 2 === 0
				? "CC"
				: "GG"
			: state === "thinking"
				? tick % 2 === 0
					? "EE"
					: "GG"
				: state === "done"
					? "GG"
					: "EE";
	const flame8 = state === "tools" ? (tick % 2 === 0 ? "..TT..TT.." : "..tT..Tt..") : "..DD..DD..";
	const flame9 =
		state === "tools"
			? tick % 2 === 0
				? "..t....t.."
				: "...T..T..."
			: state === "thinking"
				? tick % 2 === 0
					? "..t....t.."
					: "...t..t..."
				: state === "done"
					? "..t....t.."
					: "..........";

	let rows: string[];
	switch (style) {
		case "cat": {
			const tail7 =
				state === "tools" || state === "thinking" ? (tick % 2 === 0 ? ".DDSSDD..T" : ".DDSSDD.T.") : ".DDSSDD...";
			const tail8 =
				state === "tools" || state === "thinking" ? (tick % 2 === 0 ? "..DD..DDT." : "..DD..DD.t") : "..DD..DDt.";
			const r0 = state === "thinking" && tick % 2 === 1 ? ".G......G." : ".C......C.";
			const face3 = ".SVVVVVVS.";
			const face4 =
				state === "done" ? ".SVGVVGVS." : state === "thinking" && tick % 2 === 1 ? ".SVGVVEVS." : ".SVEVVEVS.";
			const face5 = ".SWVCCVWS.";
			rows = [
				r0,
				".CR....RC.",
				".RSSSSSSR.",
				face3,
				face4,
				face5,
				`..SS${core}SS..`,
				tail7,
				tail8,
				state === "tools" && tick % 2 === 1 ? "...t..t..." : "..........",
			];
			break;
		}
		case "owl": {
			const r0 = state === "thinking" && tick % 2 === 1 ? ".G......G." : ".C......C.";
			const e3 = state === "done" ? ".SVGVVGVS." : ".SVEVVEVS.";
			const e4 = state === "tools" && tick % 2 === 0 ? ".SVGCVGVS." : ".SVEVCEVS.";
			const wing = state === "tools" && tick % 2 === 1 ? "G" : "W";
			rows = [
				r0,
				"..CRRRRC..",
				".RSSSSSSR.",
				e3,
				e4,
				`${wing}SSSSSSSS${wing}`,
				`${wing}DSS${core}SSD${wing}`,
				".DDSSSSDD.",
				"..CC..CC..",
				state === "thinking" && tick % 2 === 0 ? "...t..t..." : "..........",
			];
			break;
		}
		case "diver": {
			const topBubble = state === "tools" && tick % 2 === 1 ? ".t..CC..t." : "....CC....";
			const flipper = state === "tools" && tick % 2 === 1 ? "C" : "W";
			const e4 =
				state === "done"
					? `${flipper}STGVVGTS${flipper}`
					: state === "thinking" && tick % 2 === 1
						? `${flipper}STEVVGTS${flipper}`
						: `${flipper}STEVVETS${flipper}`;
			rows = [
				topBubble,
				"..RRRRRR..",
				".RTTTTTTR.",
				".STVVVVTS.",
				e4,
				".STVVVVTS.",
				`.DSS${core}SSD.`,
				"..DDSSDD..",
				state === "tools" && tick % 2 === 0 ? ".tT....Tt." : ".TT....TT.",
				state === "thinking" && tick % 2 === 0 ? "..t....t.." : "..........",
			];
			break;
		}
		case "prism": {
			const halo =
				state === "thinking" && tick % 2 === 1
					? "...CGGC..."
					: state === "tools" && tick % 2 === 1
						? "..TCCCC..."
						: "...CCCC...";
			const eye =
				state === "done" ? ".RSVGGVSR." : state === "thinking" && tick % 2 === 1 ? ".RSVGEVSR." : ".RSVEEVSR.";
			const sparkRow = state === "tools" && tick % 2 === 0 ? "T........T" : "..........";
			rows = [
				halo,
				sparkRow,
				"...RRRR...",
				"..RSVVSR..",
				eye,
				".RSSVVSSR.",
				`..DS${core}SD..`,
				"...DDDD...",
				state === "tools" && tick % 2 === 1 ? "...G..G..." : "....TT....",
				state === "idle" ? "...t..t..." : "..t....t..",
			];
			break;
		}
		case "glider": {
			const [v3, v4, v5] = visorEyesForState(state, tick);
			const w = state === "tools" && tick % 2 === 1 ? "C" : "W";
			const r0 =
				state === "thinking" && tick % 2 === 1 ? "....GC...." : state === "done" ? "....GG...." : "....CC....";
			rows = [
				r0,
				"..RRRRRR..",
				".RSSSSSSR.",
				`${w}${v3}${w}`,
				`${w}${v4}${w}`,
				`${w}${v5}${w}`,
				`.DSS${core}SSD.`,
				"..DDSSDD..",
				flame8,
				flame9,
			];
			break;
		}
	}

	return rows.map(r => r.split("") as PixelToken[]);
}

/** 10×5 single-pixel-per-cell grid for `cellPixels=1` terminals (no `▀` half blocks). */
function buildWholeCellGrid(style: RobotStyle, state: RobotState, tick: number): PixelToken[][] {
	const wing = state === "tools" && tick % 2 === 1 ? "G" : "W";
	const eyes =
		state === "done"
			? `${wing}SVGVVGVS${wing}`
			: state === "thinking"
				? tick % 2 === 0
					? `${wing}SVEVVGVS${wing}`
					: `${wing}SVGVVEVS${wing}`
				: state === "tools"
					? `${wing}SVGVVGVS${wing}`
					: `${wing}SVEVVEVS${wing}`;

	let row0 = "..RRCCRR..";
	if (style === "cat") row0 = state === "thinking" && tick % 2 === 1 ? ".CG....GC." : ".CR....RC.";
	else if (style === "owl") row0 = "..CRRRRC..";
	else if (style === "diver") row0 = "..RTTTTR..";
	else if (style === "prism") row0 = state === "thinking" && tick % 2 === 1 ? "..CGGGGC.." : "..CCCCCC..";
	else if (state === "thinking" && tick % 2 === 1) row0 = "..RRRRGR..";

	const visorBottom =
		style === "cat"
			? ".SWVCCVWS."
			: style === "owl"
				? `${wing}SVEVCEVS${wing}`
				: state === "tools"
					? `${wing}DSSCCSSD${wing}`
					: `${wing}DSSVVSSD${wing}`;
	const torso =
		style === "prism"
			? "...DDDD..."
			: state === "done"
				? ".DDGGGGDD."
				: state === "thinking"
					? ".DDEEEEDD."
					: ".DDSSSSDD.";
	const base =
		style === "prism"
			? state === "tools" && tick % 2 === 0
				? "...T..T..."
				: "....TT...."
			: state === "tools"
				? tick % 2 === 0
					? "..TT..TT.."
					: "..tT..Tt.."
				: state === "thinking" && tick % 2 === 1
					? "..tD..Dt.."
					: "..DD..DD..";
	return [row0, eyes, visorBottom, torso, base].map(r => r.split("") as PixelToken[]);
}

/** Crisp 10×5 ASCII / monochrome fallback sprite (zero color escapes when plain). */
function renderFallbackRows(style: RobotStyle, state: RobotState, tick: number, ascii: boolean): string[] {
	const eyes =
		state === "done"
			? ascii
				? "^  ^"
				: "◠  ◠"
			: state === "thinking"
				? tick % 2 === 0
					? ascii
						? "o  ."
						: "◉  ◦"
					: ascii
						? ".  o"
						: "◦  ◉"
				: state === "tools"
					? tick % 2 === 0
						? ascii
							? ">  <"
							: "▸  ◂"
						: ascii
							? "=  ="
							: "◆  ◆"
					: ascii
						? "o  o"
						: "●  ●";
	const thruster =
		state === "tools"
			? tick % 2 === 0
				? ascii
					? "  vv  vv  "
					: "  ▾▾  ▾▾  "
				: ascii
					? "  ^^  ^^  "
					: "  ▿▿  ▿▿  "
			: state === "thinking"
				? tick % 2 === 0
					? ascii
						? "  ..  ..  "
						: "  ··  ··  "
					: "          "
				: ascii
					? "  --  --  "
					: "  ──  ──  ";

	switch (style) {
		case "cat":
			return ascii
				? ["  /\\  /\\  ", `  (${eyes})  `, " =( == )= ", "  +----+  ", thruster]
				: ["  ╱╲  ╱╲  ", `  │${eyes}│  `, " ╰╮ ◡  ╭╯ ", "  ╰────╯  ", thruster];
		case "owl":
			return ascii
				? ["  v.--.v  ", ` {(${eyes})} `, "  |\\vv/|  ", "  +----+  ", thruster]
				: ["  ▾╭──╮▾  ", ` ╭(${eyes})╮ `, " │ ╲▾╱  │ ", "  ╰────╯  ", thruster];
		case "diver":
			return ascii
				? ["   .--.   ", ` <(${eyes})> `, "  |\\==/|  ", "  +----+  ", thruster]
				: ["   ╭──╮   ", ` ◂(${eyes})▸ `, "  │╲══╱│  ", "  ╰────╯  ", thruster];
		case "prism":
			return ascii
				? ["   /\\/\\   ", `  [${eyes}]  `, "  \\ == /  ", "   +--+   ", thruster]
				: ["   ✧◇◇✧   ", `  │${eyes}│  `, "  ╲ ══ ╱  ", "   ╰──╯   ", thruster];
		case "glider":
			return ascii
				? ["    **    ", ` /(${eyes})\\ `, "  | == |  ", "  +----+  ", thruster]
				: ["    ✦✦    ", ` ╱(${eyes})╲ `, "  │ ══ │  ", "  ╰────╯  ", thruster];
	}
}

/** Render the 1-line compact companion badge (`[✦◠✦]`, `=^◡^=`, etc.). */
export function renderNightglideRobotCompact(
	opts: Pick<
		NightglideRobotOptions,
		"kind" | "style" | "light" | "state" | "phase" | "motion" | "colorMode" | "plain" | "ascii"
	>,
): string {
	const tick = activeTick(opts.state, opts.phase, opts.motion);
	const ascii = opts.ascii === true;
	const style = resolveRobotStyle(opts.style, opts.kind);
	let frameGlyph: string;
	if (ascii) {
		const left = style === "cat" ? "=" : style === "diver" ? "<" : style === "prism" ? "{" : "[";
		const right = style === "cat" ? "=" : style === "diver" ? ">" : style === "prism" ? "}" : "]";
		const face =
			opts.state === "done"
				? "^.^"
				: opts.state === "tools"
					? tick % 2 === 0
						? ">.<"
						: "=+="
					: opts.state === "thinking"
						? tick % 2 === 0
							? "o.-"
							: "-.o"
						: "o.o";
		frameGlyph = `${left}${face}${right}`;
	} else {
		const crest =
			style === "cat" ? "ˆ" : style === "owl" ? "▾" : style === "diver" ? "◈" : style === "prism" ? "✧" : "✦";
		const mouth =
			opts.state === "done"
				? "◡"
				: opts.state === "tools"
					? tick % 2 === 0
						? "⚙"
						: "◈"
					: opts.state === "thinking"
						? tick % 2 === 0
							? "◠"
							: "◉"
						: "◠";
		frameGlyph = `[${crest}${mouth}${crest}]`;
	}

	if (opts.plain) return frameGlyph;
	const mode = opts.colorMode ?? "truecolor";
	const pal =
		mode === "truecolor"
			? truecolorPalette(opts.kind, Boolean(opts.light))
			: palette256(opts.kind, Boolean(opts.light));
	const color =
		opts.state === "tools"
			? pal.wing
			: opts.state === "thinking"
				? pal.eye
				: opts.state === "done"
					? pal.crest
					: pal.rim;
	return `${fgAnsi(color, mode)}${frameGlyph}\x1b[39m`;
}

/** Render the Nightglide companion sprite (5×10 cells normally, or 1 compact line). */
export function renderNightglideRobot(opts: NightglideRobotOptions): string[] {
	if (opts.compact) {
		return [renderNightglideRobotCompact(opts)];
	}
	const tick = activeTick(opts.state, opts.phase, opts.motion);
	const ascii = opts.ascii === true;
	const style = resolveRobotStyle(opts.style, opts.kind);
	if (opts.plain || ascii) {
		const rows = renderFallbackRows(style, opts.state, tick, ascii);
		if (opts.plain) return rows;
		const mode = opts.colorMode ?? "truecolor";
		const pal =
			mode === "truecolor"
				? truecolorPalette(opts.kind, Boolean(opts.light))
				: palette256(opts.kind, Boolean(opts.light));
		const fg = opts.state === "tools" ? pal.wing : opts.state === "thinking" ? pal.eye : pal.rim;
		return rows.map(row => `${fgAnsi(fg, mode)}${row}\x1b[39m`);
	}

	const mode = opts.colorMode ?? "truecolor";
	const basePal =
		mode === "truecolor"
			? truecolorPalette(opts.kind, Boolean(opts.light))
			: palette256(opts.kind, Boolean(opts.light));
	const pal: RobotPalette = opts.pageBg ? { ...basePal, page: opts.pageBg } : basePal;
	const cellPixels = opts.cellPixels ?? 2;

	const fgCache = new Map<string, string>();
	const bgCache = new Map<string, string>();
	const fg = (hex: string) => {
		let v = fgCache.get(hex);
		if (v === undefined) fgCache.set(hex, (v = fgAnsi(hex, mode)));
		return v;
	};
	const bg = (hex: string) => {
		let v = bgCache.get(hex);
		if (v === undefined) bgCache.set(hex, (v = bgAnsi(hex, mode)));
		return v;
	};

	if (cellPixels === 1) {
		const grid = buildWholeCellGrid(style, opts.state, tick);
		return grid.map(row => {
			let line = "";
			let lastBg = "";
			for (const token of row) {
				const b = bg(resolvePixelColor(token, pal));
				if (b !== lastBg) {
					line += b;
					lastBg = b;
				}
				line += " ";
			}
			return `${line}\x1b[0m`;
		});
	}

	const grid = buildHalfBlockGrid(style, opts.state, tick);
	const out: string[] = [];
	for (let r = 0; r < ROBOT_ROWS; r++) {
		const topRow = grid[r * 2]!;
		const botRow = grid[r * 2 + 1]!;
		let line = "";
		let lastFg = "";
		let lastBg = "";
		for (let c = 0; c < ROBOT_WIDTH; c++) {
			const top = resolvePixelColor(topRow[c]!, pal);
			const bot = resolvePixelColor(botRow[c]!, pal);
			const b = bg(bot);
			if (b !== lastBg) {
				line += b;
				lastBg = b;
			}
			if (top === bot) {
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
		out.push(`${line}\x1b[0m`);
	}
	return out;
}
