/**
 * Nightglide: the common commands the `/` menu lists before anything is typed.
 *
 * Every other command stays available: typing part of a name finds it, and
 * `/more` browses the full list. Nothing here removes or renames a command.
 */
import type { SlashCommand } from "@oh-my-pi/pi-tui/autocomplete";
import { getLanguage, t, type TextKey } from "@oh-my-pi/pi-tui/i18n";
import { register } from "./registry";

/** Default common commands, in menu order; each one's menu description is the text-table entry `cmd.<name>`. */
export const NIGHTGLIDE_COMMON_COMMANDS: readonly string[] = [
	"new",
	"resume",
	"clear",
	"compact",
	"export",
	"copy",
	"model",
	"effort",
	"setup",
	"login",
	"provider",
	"theme",
	"settings",
	"plan",
	"tools",
	"mcp",
	"context",
	"hotkeys",
	"more",
	"exit",
];

const DEFAULT_COMMON = new Set(NIGHTGLIDE_COMMON_COMMANDS);

export const cfgNightglideCommonCommands = register({
	id: "nightglide.commonCommands",
	type: "array",
	default: [...NIGHTGLIDE_COMMON_COMMANDS],
	ui: {
		tab: "interaction",
		group: "Input",
		label: "Common Commands",
		editor: "json",
		description:
			'Commands the "/" menu lists before anything is typed, in order. Every other command is still found by typing its name, or browsed with /more. A JSON list of command names, e.g. ["new", "model"].',
	},
	validate: raw => {
		if (raw === undefined) return;
		if (!Array.isArray(raw) || raw.some(entry => typeof entry !== "string" || entry.trim().length === 0)) {
			throw new Error("nightglide.commonCommands must be a list of command names");
		}
	},
});

/**
 * A live description without its English lead word: `Model: omlx/endless` → `omlx/endless`.
 */
function liveDetail(live: string | undefined): string | undefined {
	const detail = live?.replace(/^[A-Za-z][A-Za-z ]*:\s*/, "").trim();
	return detail ? detail : undefined;
}

/**
 * Mark the common commands in an autocomplete list: each listed name gets its menu rank and, for
 * the default commands, a description in the interface language — followed by the command's live state, when it
 * has one, in parentheses. Names may be given with or without the leading slash; unknown names
 * are skipped, and user-added commands keep their own descriptions.
 */
export function markCommonCommands(commands: readonly SlashCommand[], names: readonly string[]): SlashCommand[] {
	const rank = new Map<string, number>();
	for (const raw of names) {
		const name = raw.trim().replace(/^\//, "");
		if (name && !rank.has(name)) rank.set(name, rank.size);
	}
	return commands.map(command => {
		const featuredRank = rank.get(command.name);
		if (featuredRank === undefined) return command;
		if (!DEFAULT_COMMON.has(command.name)) return { ...command, featuredRank };
		return {
			...command,
			featuredRank,
			getAutocompleteDescription: () => {
				// Called on the original command: a live description may read its own `this`.
				const description = t(`cmd.${command.name}` as TextKey);
				const detail = liveDetail(command.getAutocompleteDescription?.());
				if (!detail) return description;
				return getLanguage() === "zh" ? `${description}（${detail}）` : `${description} (${detail})`;
			},
		};
	});
}

/** Language of Nightglide's own interface text; `auto` follows LC_ALL / LC_MESSAGES / LANG. */
export const cfgNightglideLanguage = register({
	id: "nightglide.language",
	type: "enum",
	values: ["zh", "en", "auto"] as const,
	default: "zh",
	ui: {
		tab: "appearance",
		group: "Theme",
		label: "Language / 语言",
		description:
			"Language of Nightglide's interface text: 中文, English, or auto (Chinese when the system locale is zh*). Upstream setting descriptions stay in English.",
		options: [
			{ value: "zh", label: "中文", description: "Chinese (default)" },
			{ value: "en", label: "English", description: "English" },
			{ value: "auto", label: "Auto", description: "Follow the system locale" },
		],
	},
});
