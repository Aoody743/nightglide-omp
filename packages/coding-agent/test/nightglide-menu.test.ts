import { afterEach, describe, expect, it } from "bun:test";
import { setLanguage, TEXT } from "@oh-my-pi/pi-tui/i18n";
import { CombinedAutocompleteProvider } from "@oh-my-pi/pi-tui/autocomplete";
import { Settings } from "@oh-my-pi/pi-coding-agent/config/settings";
import {
	applyCommandTiers,
	buildMoreRows,
	type MoreRow,
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

describe("Nightglide /more", () => {
	/** The real builtin list with the default tiers, plus one extension command. */
	function tiered() {
		const settings = Settings.isolated();
		return applyCommandTiers(
			[
				...BUILTIN_SLASH_COMMAND_DEFS.map(def => ({ name: def.name, description: def.description })),
				{ name: "autoresearch", description: "Toggle autoresearch" },
				{ name: "long", description: "First sentence. Then a second one\nover lines." },
			],
			{ common: cfgNightglideCommonCommands.get(settings), hidden: cfgNightglideHiddenCommands.get(settings) },
		);
	}
	const commandNames = (rows: readonly MoreRow[]) => rows.flatMap(row => (row.kind === "command" ? [row.name] : []));

	it("groups common and standard commands, keeps advanced ones behind a leading switch", () => {
		const rows = buildMoreRows(tiered(), false);
		expect(rows[0]).toEqual({ kind: "showAdvanced", label: "＋ 显示高级命令（52）" });
		expect(rows[1]).toEqual({ kind: "heading", label: "── 会话 ──" });
		const names = commandNames(rows);
		// Common commands lead their group in menu order, then standard ones.
		expect(names.slice(0, 8)).toEqual(["new", "resume", "clear", "compact", "export", "copy", "summary", "rename"]);
		expect(names).toContain("autoresearch");
		expect(names).not.toContain("switch");
		// A paragraph-long extension description is cut to its first sentence.
		expect(rows.find(row => row.kind === "command" && row.name === "long")?.label).toBe("/long  First sentence.");
	});

	it("lists advanced commands last under their own heading when asked", () => {
		const rows = buildMoreRows(tiered(), true);
		const heading = rows.findIndex(row => row.kind === "heading" && row.label === "── 高级命令 ──");
		expect(heading).toBeGreaterThan(0);
		expect(rows.slice(heading + 1).every(row => row.kind === "command")).toBe(true);
		expect(rows.slice(heading + 1).map(row => (row.kind === "command" ? row.name : ""))).toContain("switch");
		expect(rows.some(row => row.kind === "showAdvanced")).toBe(false);
	});

	it("labels rows in the interface language", () => {
		setLanguage("en");
		const rows = buildMoreRows(tiered(), false);
		expect(rows[1]?.label).toBe("── Session ──");
		expect(rows.find(row => row.kind === "command" && row.name === "new")?.label).toBe("/new  Start a new session");
	});
});
