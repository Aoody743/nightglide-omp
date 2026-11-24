/**
 * Nightglide: `/more` — browse every slash command.
 *
 * A bare `/` lists only the common commands (`nightglide.commonCommands`); this
 * opens the full list, including extension, skill, file and prompt commands.
 * Picking one puts `/name ` in the input box so arguments can be added first.
 */
import { clearSubmittedText } from "./helpers/draft";
import type { SlashCommandSpec } from "./types";

export const BUILTIN_NIGHTGLIDE_SLASH_COMMANDS: ReadonlyArray<SlashCommandSpec> = [
	{
		name: "more",
		icon: "action",
		description: "Browse every slash command",
		handleTui: async (_command, runtime) => {
			clearSubmittedText(runtime);
			const { ctx } = runtime;
			const commands = [...ctx.slashCommandList].sort((a, b) => a.name.localeCompare(b.name));
			// One row per command, description inline: the selector hides per-option descriptions
			// once a list this long overflows the screen.
			const items = commands.map(command => {
				const description = (command.getAutocompleteDescription?.() ?? command.description ?? "")
					.replace(/\s+/g, " ")
					.trim();
				return description ? `/${command.name}  ${description}` : `/${command.name}`;
			});
			const choice = await ctx.showHookSelector(`全部命令（${items.length}）`, items);
			const name = choice?.split(" ")[0];
			if (name) ctx.editor.setText(`${name} `);
		},
	},
];
