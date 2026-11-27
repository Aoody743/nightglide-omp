import { detectTerminalBackground, getAvailableThemes, getCurrentThemeName } from "@oh-my-pi/pi-tui/theme";
import { cfgThemeDark, cfgThemeLight } from "../modes/settings";
import { commandConsumed, errorMessage, usage } from "./helpers/parse";
import type { SlashCommandSpec, SubcommandDef } from "./types";

/** Short names for the bundled themes; `/theme abyss` means `nightglide-abyss`. */
const BUILTIN_THEMES: ReadonlyArray<SubcommandDef> = [
	{ name: "flight", description: "Flight · dark" },
	{ name: "cloudlight", description: "Flight · light" },
	{ name: "abyss", description: "Dive · dark" },
	{ name: "abyss-trench", description: "Dive · deep trench" },
	{ name: "daybreak", description: "Dive · light" },
	{ name: "aurora", description: "Aurora · dark" },
	{ name: "iris", description: "Iris · light (rainbow clouds)" },
];

/** Resolve a typed name to an available theme: exact name first, then the `nightglide-` short form. */
export function resolveThemeName(input: string, available: readonly string[]): string | undefined {
	const name = input.trim();
	if (!name) return undefined;
	if (available.includes(name)) return name;
	const lower = name.toLowerCase();
	if (lower === "trench" && available.includes("nightglide-abyss-trench")) {
		return "nightglide-abyss-trench";
	}
	const prefixed = `nightglide-${lower}`;
	return available.includes(prefixed) ? prefixed : undefined;
}

export const BUILTIN_THEME_SLASH_COMMANDS: ReadonlyArray<SlashCommandSpec> = [
	{
		name: "theme",
		icon: "eye",
		description: "Switch the color theme: /theme <name>",
		allowArgs: true,
		subcommands: [...BUILTIN_THEMES],
		subcommandOptional: true,
		handle: async (command, runtime) => {
			const available = await getAvailableThemes();
			const current = getCurrentThemeName();
			if (!command.args.trim()) {
				const list = available.map(name => (name === current ? `* ${name}` : `  ${name}`)).join("\n");
				await runtime.output(
					`Current theme: ${current ?? "unknown"}\n${list}\n\nUsage: /theme <name>  (e.g. /theme abyss)`,
				);
				return commandConsumed();
			}
			const target = resolveThemeName(command.args, available);
			if (!target) {
				return usage(`Unknown theme "${command.args.trim()}". Available: ${available.join(", ")}`, runtime);
			}
			// Themes follow the terminal background through the dark/light slots, so
			// the switch lands in the slot that is active now and shows immediately;
			// it is saved like the same change made in /settings.
			const slot = detectTerminalBackground();
			try {
				(slot === "light" ? cfgThemeLight : cfgThemeDark).set(runtime.settings, target);
			} catch (error) {
				return usage(`Could not switch theme: ${errorMessage(error)}`, runtime);
			}
			await runtime.output(`Theme switched to ${target} (saved as theme.${slot}, the ${slot}-background slot).`);
			return commandConsumed();
		},
	},
];
