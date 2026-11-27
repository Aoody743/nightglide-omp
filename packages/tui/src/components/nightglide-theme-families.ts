/**
 * Nightglide theme families: frame colors (read dynamically from theme JSON / active
 * `Theme` slots) paired with carefully tuned truecolor and 256-color pixel-scene palettes
 * for the 7 built-in themes, plus dynamic palette synthesis for custom user themes.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { mixHex } from "@oh-my-pi/pi-utils/color";
import { getCustomThemesDir } from "@oh-my-pi/pi-utils/dirs";
import { ansi256ToHex, isLightSurface, resolveThemeColors, resolveToHex } from "../theme/color";
import { loadThemeJsonSync, resolveThemeSurfaceColors } from "../theme/loader";
import type { ColorValue } from "../theme/schema";
import { getCurrentThemeName, getThemeEpoch, theme } from "../theme/theme";
import type { PixelPalette, SceneKind } from "./nightglide-pixel-scene";

export interface Family {
	label: string;
	/** Scene the bands draw. */
	kind: SceneKind;
	/** Page background hex (`export.pageBg` -> `terminal.background` -> `statusLineBg`). */
	page: string;
	/** Frame lines around panels. */
	border: string;
	/** Panel titles. */
	title: string;
	/** Primary readable text on the page. */
	text: string;
	/** Secondary text: still readable, never faint. */
	soft: string;
	accent: string;
	warm: string;
	/** Truecolor scene palette. */
	scene: PixelPalette;
	/** Override for 256-color terminals, picked from colors that exist on the 256 grid. */
	scene256?: PixelPalette;
}

export interface FramePalette {
	page: string;
	border: string;
	title: string;
	text: string;
	soft: string;
	accent: string;
	warm: string;
	isLight: boolean;
}

interface ScenePreset {
	label: string;
	kind: SceneKind;
	scene: PixelPalette;
	scene256: PixelPalette;
}

const CANONICAL_ALIASES: Readonly<Record<string, string>> = {
	dark: "nightglide-flight",
	nightglide: "nightglide-flight",
	flight: "nightglide-flight",
	light: "nightglide-cloudlight",
	cloudlight: "nightglide-cloudlight",
	abyss: "nightglide-abyss",
	"abyss-trench": "nightglide-abyss-trench",
	trench: "nightglide-abyss-trench",
	daybreak: "nightglide-daybreak",
	aurora: "nightglide-aurora",
	iris: "nightglide-iris",
};

/** Resolve aliases (`dark`, `trench`, `iris`, etc.) to their canonical built-in theme name. */
export function canonicalThemeName(name: string | undefined): string {
	if (!name) return "nightglide-flight";
	return CANONICAL_ALIASES[name] ?? name;
}

const BUILTIN_SCENE_PRESETS: Readonly<Record<string, ScenePreset>> = {
	"nightglide-flight": {
		label: "FLIGHT DARK",
		kind: "flight",
		scene: {
			page: "#101329",
			ramp: ["#18244e", "#22417e", "#2f6daf", "#5fb0dc", "#b8ecf7"],
			clouds: ["#1b2955", "#2a4a88", "#4677bd"],
			shade: "#152048",
			rim: "#cdeeff",
			wisp: "#2a3b74",
			accent: "#f5d58c",
			spark: "#b4bfe8",
		},
		scene256: {
			page: "#121212",
			ramp: ["#303030", "#005f87", "#5f87af", "#87afd7", "#d7ffff"],
			clouds: ["#00005f", "#00005f", "#005f87"],
			shade: "#00005f",
			rim: "#5f87af",
			wisp: "#262626",
			accent: "#ffd787",
			spark: "#8787af",
			blends: {
				far: ["#262626", "#005f87"],
				glow: ["#5f5f87", "#af875f", "#ffd787"],
			},
			quantized: true,
		},
	},
	"nightglide-cloudlight": {
		label: "FLIGHT LIGHT",
		kind: "flight",
		scene: {
			page: "#f8faff",
			ramp: ["#d7d7ff", "#afd7ff", "#87afff", "#5f87d7", "#005fd7"],
			clouds: ["#e3ebfa", "#d2def6", "#fbfdff"],
			shade: "#c3d3f2",
			rim: "#ffffff",
			wisp: "#dde7fb",
			accent: "#ffcf7d",
			spark: "#f8faff",
		},
		scene256: {
			page: "#ffffff",
			ramp: ["#d7d7ff", "#afd7ff", "#87afff", "#5f87d7", "#005fd7"],
			clouds: ["#e4e4e4", "#d7d7ff", "#d7ffff"],
			shade: "#afafd7",
			rim: "#ffffff",
			wisp: "#eeeeee",
			accent: "#ffd787",
			spark: "#ffffff",
			blends: {
				glow: ["#e4e4ff", "#d7d7ff", "#ffd7af"],
			},
			quantized: true,
		},
	},
	"nightglide-iris": {
		label: "IRIS LIGHT",
		kind: "flight",
		scene: {
			page: "#fafbfd",
			ramp: ["#dbe9f6", "#b9d4ec", "#8fb8dd", "#6aa3d7", "#3c7dbb"],
			clouds: ["#e4ddff", "#ffdce9", "#daf4ea"],
			shade: "#d5e1ee",
			rim: "#ffffff",
			wisp: "#eae7fa",
			spectral: ["#dcd4ff", "#ffd6e6", "#ffe8c2", "#d4f5e9", "#cfe8ff"],
			accent: "#ffd87d",
			spark: "#fafbfd",
		},
		scene256: {
			page: "#ffffff",
			ramp: ["#d7d7ff", "#afd7ff", "#87afd7"],
			clouds: ["#d7d7ff", "#ffd7ff", "#d7ffd7"],
			shade: "#d7d7ff",
			rim: "#ffffff",
			wisp: "#eeeeee",
			spectral: ["#d7d7ff", "#ffd7ff", "#ffd7d7", "#ffffd7", "#d7ffd7", "#d7ffff"],
			accent: "#ffd787",
			spark: "#ffffff",
			quantized: true,
		},
	},
	"nightglide-abyss": {
		label: "DIVE DARK",
		kind: "dive",
		scene: {
			page: "#07171d",
			ramp: ["#005f5f", "#008787", "#00afaf", "#5fd7d7"],
			accent: "#ff875f",
			spark: "#afffff",
			plants: ["#00875f", "#00af87", "#5fd787"],
			ground: ["#0c3c42", "#22777a", "#3a6458"],
			surface: "#5fd7d7",
			caustic: "#9ff5ec",
		},
		scene256: {
			page: "#121212",
			ramp: ["#005f5f", "#008787", "#00afaf", "#5fd7d7"],
			accent: "#ff875f",
			spark: "#afffff",
			plants: ["#00875f", "#00af87", "#5fd787"],
			ground: ["#1c1c1c", "#005f5f", "#3a3a3a"],
			surface: "#5fd7d7",
			caustic: "#87d7d7",
			blends: { mote: "#5f8787" },
			quantized: true,
		},
	},
	"nightglide-abyss-trench": {
		label: "ABYSS TRENCH",
		kind: "dive",
		scene: {
			page: "#02060d",
			ramp: ["#07182c", "#0d2b49", "#006f8c", "#00b8d4"],
			accent: "#00f0ff",
			spark: "#99f9ff",
			plants: ["#073b3a", "#008f7a", "#00e5a3"],
			ground: ["#0b1524", "#1c324e", "#173454"],
			surface: "#00f0ff",
			caustic: "#00e5a3",
		},
		scene256: {
			page: "#080808",
			ramp: ["#00005f", "#005f87", "#0087af", "#00d7ff"],
			accent: "#00ffff",
			spark: "#afffff",
			plants: ["#005f5f", "#00875f", "#00d787"],
			ground: ["#121212", "#005f87", "#1c1c1c"],
			surface: "#00d7ff",
			caustic: "#00ffaf",
			blends: {
				shaft: ["#005f87", "#0087af", "#00d7ff"],
				mote: "#005f87",
			},
			quantized: true,
		},
	},
	"nightglide-daybreak": {
		label: "DIVE LIGHT",
		kind: "dive",
		scene: {
			page: "#fffaf2",
			ramp: ["#e5f4f1", "#b6e6df", "#72cfc5", "#2a9d98"],
			accent: "#d95f43",
			spark: "#2a6885",
			plants: ["#3d9e77", "#147a57", "#0b543c"],
			ground: ["#78aba3", "#9cc8c0", "#efe0bb"],
			surface: "#5ec8be",
			caustic: "#72cfc5",
		},
		scene256: {
			page: "#ffffff",
			ramp: ["#d7ffff", "#87d7d7", "#5fafaf", "#008787"],
			accent: "#ff5f5f",
			spark: "#008787",
			plants: ["#5faf87", "#00875f", "#005f5f"],
			ground: ["#87afaf", "#afd7d7", "#ffffd7"],
			surface: "#87d7d7",
			caustic: "#5fd7d7",
			blends: {
				shaft: ["#d7ffff", "#87d7d7", "#5fafaf"],
				mote: "#5fafaf",
			},
			quantized: true,
		},
	},
	"nightglide-aurora": {
		label: "AURORA",
		kind: "aurora",
		scene: {
			page: "#100c25",
			ramp: ["#123f3a", "#1c8a6c", "#34d399", "#c4ffe6"],
			upper: ["#24194f", "#4b3596", "#8c6ee0"],
			ground: ["#050409", "#17122f", "#3a2f6e"],
			accent: "#f2c98a",
			spark: "#d9d0ff",
		},
		scene256: {
			page: "#080808",
			ramp: ["#005f5f", "#00875f", "#5fd7af"],
			upper: ["#00005f", "#5f5faf"],
			ground: ["#000000", "#1c1c1c", "#5f5f87"],
			accent: "#ffd787",
			spark: "#d7d7ff",
			quantized: true,
		},
	},
};

function normalizeHex(hex: string): string {
	if (hex.length === 4 && hex.startsWith("#")) {
		return `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`.toLowerCase();
	}
	return hex.toLowerCase();
}

function nonEmptyHex(value: ColorValue | undefined, isLight: boolean): string | undefined {
	if (value === undefined || value === "") return undefined;
	const hex = resolveToHex(value, isLight);
	return hex.startsWith("#") ? normalizeHex(hex) : undefined;
}

/** Snap a `#rrggbb` color onto the xterm 256-color grid so quantized scenes avoid off-grid rounding. */
function quantizeHex256(hex: string): string {
	const sgr = Bun.color(hex, "ansi-256");
	if (!sgr) return hex;
	const match = /38;5;(\d+)/.exec(sgr);
	if (!match) return hex;
	return ansi256ToHex(Number.parseInt(match[1]!, 10));
}

const DEFAULT_DARK_FRAME: FramePalette = {
	page: "#101329",
	border: "#2b3360",
	title: "#ffd394",
	text: "#e5e8f8",
	soft: "#a8b4d9",
	accent: "#b5b6ff",
	warm: "#ffd394",
	isLight: false,
};

function frameFromActiveTheme(): FramePalette {
	const isLight = theme.isLight;
	return {
		page: normalizeHex(theme.getPageBgHex()),
		border: normalizeHex(theme.hasColor("border") ? theme.getColorHex("border") : isLight ? "#8ea6c4" : "#2b3360"),
		title: normalizeHex(theme.hasColor("mdHeading") ? theme.getColorHex("mdHeading") : theme.getColorHex("accent")),
		text: normalizeHex(
			theme.hasColor("text")
				? theme.getColorHex("text")
				: (theme.getTerminalFgHex() ?? (isLight ? "#1a1f29" : "#e5e5e7")),
		),
		soft: normalizeHex(theme.hasColor("muted") ? theme.getColorHex("muted") : theme.getColorHex("dim")),
		accent: normalizeHex(theme.getColorHex("accent")),
		warm: normalizeHex(theme.getColorHex("warning")),
		isLight,
	};
}

function frameFromThemeName(name: string): FramePalette | undefined {
	try {
		const themeJson = loadThemeJsonSync(name);
		const vars = themeJson.vars ?? {};
		const resolved = resolveThemeColors(themeJson.colors, vars);
		const surface = resolveThemeSurfaceColors(themeJson);
		const isLight = isLightSurface(resolved.statusLineBg);
		const page =
			(surface.pageBg ? normalizeHex(surface.pageBg) : undefined) ??
			(surface.terminalBg ? normalizeHex(surface.terminalBg) : undefined) ??
			nonEmptyHex(resolved.statusLineBg, isLight) ??
			(isLight ? "#f8faff" : "#0b1022");
		return {
			page,
			border:
				nonEmptyHex(resolved.border, isLight) ??
				nonEmptyHex(resolved.borderMuted, isLight) ??
				(isLight ? "#8ea6c4" : "#2b3360"),
			title:
				nonEmptyHex(resolved.mdHeading, isLight) ??
				nonEmptyHex(resolved.customMessageLabel, isLight) ??
				nonEmptyHex(resolved.accent, isLight) ??
				(isLight ? "#1d4fbf" : "#6fd6ea"),
			text:
				nonEmptyHex(resolved.text, isLight) ??
				(surface.terminalFg ? normalizeHex(surface.terminalFg) : undefined) ??
				(isLight ? "#1a1f29" : "#e5e5e7"),
			soft:
				nonEmptyHex(resolved.muted, isLight) ??
				nonEmptyHex(resolved.dim, isLight) ??
				(isLight ? "#4a5568" : "#a7b3d6"),
			accent: nonEmptyHex(resolved.accent, isLight) ?? (isLight ? "#2c5ca8" : "#6fd6ea"),
			warm: nonEmptyHex(resolved.warning, isLight) ?? (isLight ? "#c2410c" : "#f5b94c"),
			isLight,
		};
	} catch {
		return undefined;
	}
}

/** Resolve frame colors (`page`, `border`, `title`, `text`, `soft`, `accent`, `warm`) for `name`. */
export function resolveFramePalette(name?: string): FramePalette {
	const activeName = getCurrentThemeName();
	const canonical = canonicalThemeName(name);
	const useActiveTheme =
		typeof theme !== "undefined" &&
		(name === "<in-memory>" ||
			(name !== undefined && (name === activeName || canonicalThemeName(activeName) === canonical)) ||
			(name === undefined && activeName === undefined));
	if (useActiveTheme) return frameFromActiveTheme();

	return (
		frameFromThemeName(canonical) ??
		(name && name !== canonical ? frameFromThemeName(name) : undefined) ??
		frameFromThemeName("nightglide-flight") ??
		DEFAULT_DARK_FRAME
	);
}

function customSceneKind(name: string): SceneKind {
	const lower = name.toLowerCase();
	if (lower.includes("aurora")) return "aurora";
	if (lower.includes("dive") || lower.includes("abyss") || lower.includes("trench") || lower.includes("ocean")) {
		return "dive";
	}
	return "flight";
}

function customDisplayLabel(name: string): string {
	const clean = name
		.replace(/^nightglide-/, "")
		.replace(/[-_]+/g, " ")
		.trim();
	return clean ? clean.toUpperCase() : "CUSTOM";
}

function buildCustomFamily(name: string, frame: FramePalette): Family {
	const kind = customSceneKind(name);
	const page = frame.page;
	const ramp = [
		mixHex(page, frame.accent, 0.2),
		mixHex(page, frame.accent, 0.42),
		mixHex(page, frame.accent, 0.68),
		mixHex(page, frame.accent, 0.9),
	] as const;
	const clouds = frame.isLight
		? ([mixHex(page, frame.accent, 0.14), mixHex(page, frame.accent, 0.24), "#ffffff"] as const)
		: ([
				mixHex(page, frame.border, 0.55),
				mixHex(page, frame.accent, 0.28),
				mixHex(page, frame.accent, 0.48),
			] as const);
	const shade = frame.isLight ? mixHex(page, frame.border, 0.45) : mixHex(page, "#000000", 0.32);
	const rim = frame.isLight ? "#ffffff" : mixHex(frame.accent, "#ffffff", 0.45);
	const wisp = mixHex(page, frame.accent, 0.2);
	const spark = frame.isLight ? page : mixHex(frame.text, frame.accent, 0.35);

	const scene: PixelPalette = {
		page,
		ramp,
		clouds,
		shade,
		rim,
		wisp,
		accent: frame.warm,
		spark,
		...(kind === "dive"
			? {
					plants: [mixHex(page, frame.accent, 0.35), mixHex(page, frame.accent, 0.6), frame.accent],
					ground: [mixHex(page, frame.border, 0.5), frame.border, mixHex(page, frame.soft, 0.4)],
					surface: mixHex(page, frame.accent, frame.isLight ? 0.45 : 0.85),
					caustic: mixHex(frame.accent, "#ffffff", 0.3),
				}
			: {}),
		...(kind === "aurora"
			? {
					upper: [mixHex(page, frame.title, 0.35), mixHex(page, frame.title, 0.65), frame.title],
					ground: [mixHex(page, "#000000", 0.5), mixHex(page, frame.border, 0.35), frame.border],
				}
			: {}),
	};

	const scene256: PixelPalette = {
		page: quantizeHex256(page),
		ramp: ramp.map(quantizeHex256),
		clouds: clouds.map(quantizeHex256),
		shade: quantizeHex256(shade),
		rim: quantizeHex256(rim),
		wisp: quantizeHex256(wisp),
		accent: quantizeHex256(frame.warm),
		spark: quantizeHex256(spark),
		...(scene.plants ? { plants: scene.plants.map(quantizeHex256) } : {}),
		...(scene.upper ? { upper: scene.upper.map(quantizeHex256) } : {}),
		...(scene.ground ? { ground: scene.ground.map(quantizeHex256) } : {}),
		...(scene.surface ? { surface: quantizeHex256(scene.surface) } : {}),
		...(scene.caustic ? { caustic: quantizeHex256(scene.caustic) } : {}),
		blends: {
			glow: [
				quantizeHex256(mixHex(page, frame.warm, 0.25)),
				quantizeHex256(mixHex(page, frame.warm, 0.5)),
				quantizeHex256(frame.warm),
			],
			mote: quantizeHex256(mixHex(page, frame.accent, 0.45)),
		},
		quantized: true,
	};

	return {
		label: customDisplayLabel(name),
		kind,
		page: frame.page,
		border: frame.border,
		title: frame.title,
		text: frame.text,
		soft: frame.soft,
		accent: frame.accent,
		warm: frame.warm,
		scene,
		scene256,
	};
}

interface CacheEntry {
	epoch: number;
	mtimeMs: number;
	activeTheme: object | undefined;
	family: Family;
}

const familyCache = new Map<string, CacheEntry>();

function customThemeMtime(name: string): number {
	try {
		return fs.statSync(path.join(getCustomThemesDir(), `${name}.json`)).mtimeMs;
	} catch {
		return -1;
	}
}

/**
 * Surfaces and frame palette for `name` (built-in Nightglide theme, alias, or custom
 * `~/.omp/agent/themes/<name>.json`). Reads frame colors dynamically from active theme JSON
 * / `Theme` slots while preserving tuned scene palettes for the 7 built-in themes.
 * Shared between the Glide shell (`nightglide-shell.ts`) and settings cards (`nightglide-settings.ts`).
 */
export function familyFor(name: string | undefined): Family {
	const canonical = canonicalThemeName(name);
	const preset = BUILTIN_SCENE_PRESETS[canonical];
	const activeName = getCurrentThemeName();
	const epoch = getThemeEpoch();
	const cacheKey = name === "<in-memory>" ? `<in-memory>:${activeName ?? ""}` : canonical;
	const isActive =
		typeof theme !== "undefined" &&
		(name === "<in-memory>" ||
			(name !== undefined && (name === activeName || canonicalThemeName(activeName) === canonical)) ||
			(name === undefined && activeName === undefined));
	const activeTheme = isActive && typeof theme !== "undefined" ? theme : undefined;
	const mtimeMs = preset || isActive ? -1 : customThemeMtime(canonical);

	const cached = familyCache.get(cacheKey);
	if (cached && cached.epoch === epoch && cached.mtimeMs === mtimeMs && cached.activeTheme === activeTheme) {
		return cached.family;
	}

	const frame = resolveFramePalette(name);
	let family: Family;
	if (preset) {
		family = {
			label: preset.label,
			kind: preset.kind,
			page: frame.page,
			border: frame.border,
			title: frame.title,
			text: frame.text,
			soft: frame.soft,
			accent: frame.accent,
			warm: frame.warm,
			scene: { ...preset.scene, page: frame.page },
			scene256: preset.scene256,
		};
	} else {
		family = buildCustomFamily(name ?? canonical, frame);
	}

	if (familyCache.size > 64) familyCache.clear();
	familyCache.set(cacheKey, { epoch, mtimeMs, activeTheme, family });
	return family;
}
