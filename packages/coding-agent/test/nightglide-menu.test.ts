import { afterEach, describe, expect, it } from "bun:test";
import { setLanguage, TEXT } from "@oh-my-pi/pi-tui/i18n";
import { CombinedAutocompleteProvider } from "@oh-my-pi/pi-tui/autocomplete";
import { Settings } from "@oh-my-pi/pi-coding-agent/config/settings";
import {
	applyCommandTiers,
	cfgNightglideCommonCommands,
	cfgNightglideHiddenCommands,
	cfgNightglideLanguage,
	NIGHTGLIDE_COMMANDS,
} from "@oh-my-pi/pi-coding-agent/config/nightglide-menu";
import { BUILTIN_SLASH_COMMAND_DEFS } from "@oh-my-pi/pi-coding-agent/slash-commands/builtin-registry";

afterEach(() => setLanguage("zh"));

/** Autocomplete names for `text`, built from the real builtin list with the default tiers. */
function menu(text: string, tiers?: { common: string[]; hidden: string[] }): string[] {
	const settings = Settings.isolated();
	const commands = applyCommandTiers(
		BUILTIN_SLASH_COMMAND_DEFS.map(def => ({ name: def.name, aliases: def.aliases, description: def.description })),
		tiers ?? {
			common: cfgNightglideCommonCommands.get(settings),
			hidden: cfgNightglideHiddenCommands.get(settings),
		},
	);
	const provider = new CombinedAutocompleteProvider(commands, "/tmp");
	return provider.trySyncSlashCompletion(text)?.items.map(item => item.value) ?? [];
}

describe("Nightglide command list", () => {
	it("places every builtin command in exactly one tier, with text in both languages", () => {
		const builtin = BUILTIN_SLASH_COMMAND_DEFS.map(def => def.name).sort();
		const listed = NIGHTGLIDE_COMMANDS.map(entry => entry.name).sort();
		// A new upstream command fails here until it is given a tier.
		expect(listed).toEqual(builtin);
		for (const entry of NIGHTGLIDE_COMMANDS) {
			expect(Object.hasOwn(TEXT, `cmd.${entry.name}`), entry.name).toBe(true);
			expect(Object.hasOwn(TEXT, `cmdgroup.${entry.group}`), entry.group).toBe(true);
		}
	});

	it("lists only the common commands, in order, for a bare slash", () => {
		const names = menu("/");
		expect(names.slice(0, 3)).toEqual(["new", "resume", "clear"]);
		expect(names).toContain("more");
		expect(names).not.toContain("rename");
	});

	it("finds standard commands by partial name but keeps advanced ones out", () => {
		expect(menu("/ren")).toContain("rename");
		const sw = menu("/sw");
		expect(sw).not.toContain("switch");
		expect(menu("/qui")).not.toContain("quit");
		expect(menu("/va")).not.toContain("vibe");
	});

	it("shows an advanced command once its full name or alias is typed", () => {
		expect(menu("/switch")).toContain("switch");
		expect(menu("/quit")).toContain("quit");
		// An alias completes as itself.
		expect(menu("/q")).toContain("q");
	});

	it("brings a command back when it leaves the hidden list, and never hides a common one", () => {
		expect(menu("/swi", { common: ["new"], hidden: [] })).toContain("switch");
		expect(menu("/", { common: ["vibe"], hidden: ["vibe"] })).toEqual(["vibe"]);
	});

	it("defaults the interface language to Chinese", () => {
		expect(cfgNightglideLanguage.get(Settings.isolated())).toBe("zh");
	});

	it("describes builtins by group in the interface language, with their live state", () => {
		const [model, custom] = applyCommandTiers(
			[
				{ name: "model", getAutocompleteDescription: () => "Model: omlx/endless" },
				{ name: "mine", description: "Mine" },
			],
			{ common: ["model"], hidden: [] },
		);
		expect(model?.getAutocompleteDescription?.()).toBe("模型 · 切换模型（omlx/endless）");
		// Commands outside the list keep their own text.
		expect(custom).toEqual({ name: "mine", description: "Mine" });
		setLanguage("en");
		expect(model?.getAutocompleteDescription?.()).toBe("Model · Switch model (omlx/endless)");
	});
});
