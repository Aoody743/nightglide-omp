/**
 * Nightglide: the command list — every builtin slash command in one of three tiers.
 *
 * - common: a bare `/` lists these, in order (`nightglide.commonCommands`).
 * - standard: found by typing part of a name.
 * - advanced: duplicates and experiments; left out of search until the full
 *   name (or an alias) is typed, and still runnable by name
 *   (`nightglide.hiddenCommands`).
 *
 * Every builtin gets a group and a description from the text table
 * (`cmdgroup.<group>`, `cmd.<name>`) in the interface language. Nothing here
 * removes or renames a command; extension, skill and prompt commands are not tiered.
 */
import type { SlashCommand } from "@oh-my-pi/pi-tui/autocomplete";
import { getLanguage, t, type TextKey } from "@oh-my-pi/pi-tui/i18n";
import { register } from "./registry";

export type CommandTier = "common" | "standard" | "advanced";
export type CommandGroup = "session" | "model" | "appearance" | "work" | "other";

export interface NightglideCommandEntry {
	name: string;
	tier: CommandTier;
	group: CommandGroup;
}

/** Every builtin command; common entries are in menu order. */
export const NIGHTGLIDE_COMMANDS: readonly NightglideCommandEntry[] = [
	{ name: "new", tier: "common", group: "session" },
	{ name: "resume", tier: "common", group: "session" },
	{ name: "clear", tier: "common", group: "session" },
	{ name: "compact", tier: "common", group: "session" },
	{ name: "export", tier: "common", group: "session" },
	{ name: "copy", tier: "common", group: "session" },
	{ name: "model", tier: "common", group: "model" },
	{ name: "effort", tier: "common", group: "model" },
	{ name: "setup", tier: "common", group: "model" },
	{ name: "login", tier: "common", group: "model" },
	{ name: "provider", tier: "common", group: "model" },
	{ name: "theme", tier: "common", group: "appearance" },
	{ name: "settings", tier: "common", group: "appearance" },
	{ name: "plan", tier: "common", group: "work" },
	{ name: "tools", tier: "common", group: "work" },
	{ name: "mcp", tier: "common", group: "work" },
	{ name: "context", tier: "common", group: "work" },
	{ name: "hotkeys", tier: "common", group: "other" },
	{ name: "more", tier: "common", group: "other" },
	{ name: "exit", tier: "common", group: "other" },
	{ name: "rename", tier: "standard", group: "session" },
	{ name: "retry", tier: "standard", group: "session" },
	{ name: "branch", tier: "standard", group: "session" },
	{ name: "btw", tier: "standard", group: "session" },
	{ name: "logout", tier: "standard", group: "model" },
	{ name: "usage", tier: "standard", group: "model" },
	{ name: "goal", tier: "standard", group: "work" },
	{ name: "todo", tier: "standard", group: "work" },
	{ name: "jobs", tier: "standard", group: "work" },
	{ name: "agents", tier: "standard", group: "work" },
	{ name: "git", tier: "standard", group: "work" },
	{ name: "commit", tier: "standard", group: "work" },
	{ name: "memory", tier: "standard", group: "work" },
	{ name: "pause", tier: "standard", group: "work" },
	{ name: "open", tier: "standard", group: "work" },
	{ name: "wt", tier: "standard", group: "work" },
	{ name: "add-dir", tier: "standard", group: "work" },
	{ name: "remove-dir", tier: "standard", group: "work" },
	{ name: "dirs", tier: "standard", group: "work" },
	{ name: "plugins", tier: "standard", group: "other" },
	{ name: "restart", tier: "standard", group: "other" },
	{ name: "quit", tier: "advanced", group: "other" },
	{ name: "switch", tier: "advanced", group: "model" },
	{ name: "fast", tier: "advanced", group: "model" },
	{ name: "slow", tier: "advanced", group: "model" },
	{ name: "modelpreset", tier: "advanced", group: "model" },
	{ name: "advisor", tier: "advanced", group: "model" },
	{ name: "prewalk", tier: "advanced", group: "model" },
	{ name: "extended-context", tier: "advanced", group: "model" },
	{ name: "skillful", tier: "advanced", group: "model" },
	{ name: "session", tier: "advanced", group: "session" },
	{ name: "fork", tier: "advanced", group: "session" },
	{ name: "tree", tier: "advanced", group: "session" },
	{ name: "pin", tier: "advanced", group: "session" },
	{ name: "unpin", tier: "advanced", group: "session" },
	{ name: "move", tier: "advanced", group: "session" },
	{ name: "delete", tier: "advanced", group: "session" },
	{ name: "fresh", tier: "advanced", group: "session" },
	{ name: "shake", tier: "advanced", group: "session" },
	{ name: "handoff", tier: "advanced", group: "session" },
	{ name: "seance", tier: "advanced", group: "session" },
	{ name: "dump", tier: "advanced", group: "session" },
	{ name: "share", tier: "advanced", group: "session" },
	{ name: "trace", tier: "advanced", group: "session" },
	{ name: "collab", tier: "advanced", group: "session" },
	{ name: "join", tier: "advanced", group: "session" },
	{ name: "leave", tier: "advanced", group: "session" },
	{ name: "plan-review", tier: "advanced", group: "work" },
	{ name: "vibe", tier: "advanced", group: "work" },
	{ name: "guided-goal", tier: "advanced", group: "work" },
	{ name: "loop", tier: "advanced", group: "work" },
	{ name: "queue", tier: "advanced", group: "work" },
	{ name: "tan", tier: "advanced", group: "work" },
	{ name: "omfg", tier: "advanced", group: "work" },
	{ name: "cleanse", tier: "advanced", group: "work" },
	{ name: "ratchet", tier: "advanced", group: "work" },
	{ name: "force", tier: "advanced", group: "work" },
	{ name: "forget-approvals", tier: "advanced", group: "work" },
	{ name: "security", tier: "advanced", group: "work" },
	{ name: "hub", tier: "advanced", group: "work" },
	{ name: "computer", tier: "advanced", group: "work" },
	{ name: "browser", tier: "advanced", group: "work" },
	{ name: "ssh", tier: "advanced", group: "work" },
	{ name: "local", tier: "advanced", group: "work" },
	{ name: "live", tier: "advanced", group: "work" },
	{ name: "record", tier: "advanced", group: "other" },
	{ name: "stats", tier: "advanced", group: "other" },
	{ name: "changelog", tier: "advanced", group: "other" },
	{ name: "debug", tier: "advanced", group: "other" },
	{ name: "extensions", tier: "advanced", group: "other" },
	{ name: "marketplace", tier: "advanced", group: "other" },
	{ name: "reload-plugins", tier: "advanced", group: "other" },
	{ name: "skills", tier: "advanced", group: "other" },
];

const COMMAND_ENTRIES = new Map(NIGHTGLIDE_COMMANDS.map(entry => [entry.name, entry]));

/** Default common commands, in menu order. */
export const NIGHTGLIDE_COMMON_COMMANDS: readonly string[] = NIGHTGLIDE_COMMANDS.filter(
	entry => entry.tier === "common",
).map(entry => entry.name);

/** Default hidden (advanced) commands. */
export const NIGHTGLIDE_ADVANCED_COMMANDS: readonly string[] = NIGHTGLIDE_COMMANDS.filter(
	entry => entry.tier === "advanced",
).map(entry => entry.name);

const validateNames = (id: string) => (raw: unknown) => {
	if (raw === undefined) return;
	if (!Array.isArray(raw) || raw.some(entry => typeof entry !== "string" || entry.trim().length === 0)) {
		throw new Error(`${id} must be a list of command names`);
	}
};

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
	validate: validateNames("nightglide.commonCommands"),
});

export const cfgNightglideHiddenCommands = register({
	id: "nightglide.hiddenCommands",
	type: "array",
	default: [...NIGHTGLIDE_ADVANCED_COMMANDS],
	ui: {
		tab: "interaction",
		group: "Input",
		label: "Hidden Commands",
		editor: "json",
		description:
			"Advanced commands left out of / search and /more until their full name is typed; they still run by name. Remove a name to bring it back. A common command is never hidden.",
	},
	validate: validateNames("nightglide.hiddenCommands"),
});

/** A live description without its English lead word: `Model: omlx/endless` → `omlx/endless`. */
function liveDetail(live: string | undefined): string | undefined {
	const detail = live?.replace(/^[A-Za-z][A-Za-z ]*:\s*/, "").trim();
	return detail ? detail : undefined;
}

/** `/name` or `name` → `name`; empty for blanks. */
function bareName(raw: string): string {
	return raw.trim().replace(/^\//, "");
}

/** The menu description of a builtin: `group · description`, in the interface language. */
export function commandMenuDescription(name: string): string | undefined {
	const entry = COMMAND_ENTRIES.get(name);
	if (!entry) return undefined;
	return `${t(`cmdgroup.${entry.group}` as TextKey)} · ${t(`cmd.${name}` as TextKey)}`;
}

/**
 * Apply the tiers to an autocomplete list. Common names get their menu rank; hidden names are
 * marked advanced unless they are also common; every builtin gets its group and description in
 * the interface language, followed by its live state, when it has one, in parentheses. Names may
 * carry a leading slash; unknown names are skipped; commands outside the list keep their own text.
 */
export function applyCommandTiers(
	commands: readonly SlashCommand[],
	tiers: { common: readonly string[]; hidden: readonly string[] },
): SlashCommand[] {
	const rank = new Map<string, number>();
	for (const raw of tiers.common) {
		const name = bareName(raw);
		if (name && !rank.has(name)) rank.set(name, rank.size);
	}
	const hidden = new Set(tiers.hidden.map(bareName).filter(name => name && !rank.has(name)));
	return commands.map(command => {
		const featuredRank = rank.get(command.name);
		const advanced = hidden.has(command.name);
		const builtin = COMMAND_ENTRIES.has(command.name);
		if (featuredRank === undefined && !advanced && !builtin) return command;
		const marked: SlashCommand = { ...command };
		if (featuredRank !== undefined) marked.featuredRank = featuredRank;
		if (advanced) marked.advanced = true;
		if (builtin) {
			marked.getAutocompleteDescription = () => {
				const description = commandMenuDescription(command.name) ?? command.description ?? "";
				// Called on the original command: a live description may read its own `this`.
				const detail = liveDetail(command.getAutocompleteDescription?.());
				if (!detail) return description;
				return getLanguage() === "zh" ? `${description}（${detail}）` : `${description} (${detail})`;
			};
		}
		return marked;
	});
}

/** One `/more` row: a group heading, a command, or the "show advanced" switch. */
export type MoreRow =
	| { kind: "heading"; label: string }
	| { kind: "command"; label: string; name: string }
	| { kind: "showAdvanced"; label: string };

const GROUP_ORDER: readonly CommandGroup[] = ["session", "model", "appearance", "work", "other"];

/** First sentence, at most 80 characters: extension and skill descriptions can run to a paragraph. */
function shortDescription(raw: string): string {
	const flat = raw.replace(/\s+/g, " ").trim();
	const sentence = flat.match(/^.+?[.。!?！？](?=\s|$)/)?.[0] ?? flat;
	return sentence.length > 80 ? `${sentence.slice(0, 79).trimEnd()}…` : sentence;
}

/** A row's text: `/name  description`, on one line (the selector drops per-row descriptions on long lists). */
function moreLabel(command: SlashCommand): string {
	const builtin = COMMAND_ENTRIES.has(command.name);
	const raw = builtin ? t(`cmd.${command.name}` as TextKey) : (command.description ?? "");
	const description = shortDescription(raw);
	return description ? `/${command.name}  ${description}` : `/${command.name}`;
}

/**
 * The `/more` list from the tiered command list (see {@link applyCommandTiers}): builtins under
 * their group headings, common ones first in menu order, then standard ones in list order;
 * extension, skill, template and file commands under their own heading. Advanced commands are
 * left out behind a leading "show advanced" row, or, with `showAdvanced`, listed last under
 * their own heading.
 */
export function buildMoreRows(commands: readonly SlashCommand[], showAdvanced: boolean): MoreRow[] {
	const order = new Map(NIGHTGLIDE_COMMANDS.map((entry, index) => [entry.name, index]));
	const rankOf = (command: SlashCommand): number =>
		command.featuredRank ?? NIGHTGLIDE_COMMANDS.length + (order.get(command.name) ?? 0);
	const byGroup = new Map<CommandGroup, SlashCommand[]>(GROUP_ORDER.map(group => [group, []]));
	const others: SlashCommand[] = [];
	const advanced: SlashCommand[] = [];
	for (const command of commands) {
		if (command.advanced) advanced.push(command);
		else {
			const entry = COMMAND_ENTRIES.get(command.name);
			if (entry) byGroup.get(entry.group)!.push(command);
			else others.push(command);
		}
	}
	const rows: MoreRow[] = [];
	// The switch leads the list: one Up from the first command (the selector does not wrap).
	if (advanced.length > 0 && !showAdvanced) {
		rows.push({ kind: "showAdvanced", label: t("more.showAdvanced", { count: advanced.length }) });
	}
	const section = (group: string, list: readonly SlashCommand[]) => {
		if (list.length === 0) return;
		rows.push({ kind: "heading", label: t("more.heading", { group }) });
		for (const command of list) rows.push({ kind: "command", label: moreLabel(command), name: command.name });
	};
	for (const group of GROUP_ORDER) {
		section(
			t(`cmdgroup.${group}` as TextKey),
			byGroup.get(group)!.sort((a, b) => rankOf(a) - rankOf(b)),
		);
	}
	section(
		t("more.groupExtensions"),
		others.sort((a, b) => a.name.localeCompare(b.name)),
	);
	if (showAdvanced) {
		const groupRank = (command: SlashCommand) =>
			GROUP_ORDER.indexOf(COMMAND_ENTRIES.get(command.name)?.group ?? "other");
		section(
			t("more.groupAdvanced"),
			advanced.sort((a, b) => groupRank(a) - groupRank(b) || a.name.localeCompare(b.name)),
		);
	}
	return rows;
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
