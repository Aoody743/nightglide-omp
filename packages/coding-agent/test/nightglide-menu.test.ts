import { describe, expect, it } from "bun:test";
import { Settings } from "@oh-my-pi/pi-coding-agent/config/settings";
import {
	cfgNightglideCommonCommands,
	markCommonCommands,
	NIGHTGLIDE_COMMON_COMMANDS,
} from "@oh-my-pi/pi-coding-agent/config/nightglide-menu";
import { BUILTIN_SLASH_COMMAND_DEFS } from "@oh-my-pi/pi-coding-agent/slash-commands/builtin-registry";

describe("Nightglide common commands", () => {
	it("defaults to the documented list, every entry a real builtin command", () => {
		const builtin = new Set(BUILTIN_SLASH_COMMAND_DEFS.map(def => def.name));
		const defaults = cfgNightglideCommonCommands.get(Settings.isolated());
		expect(defaults).toEqual(NIGHTGLIDE_COMMON_COMMANDS.map(entry => entry.name));
		for (const name of defaults) expect(builtin.has(name)).toBe(true);
	});

	it("registers /more", () => {
		expect(BUILTIN_SLASH_COMMAND_DEFS.some(def => def.name === "more")).toBe(true);
	});

	it("ranks listed commands, adds Chinese descriptions, and leaves the rest alone", () => {
		const marked = markCommonCommands(
			[
				{ name: "model", description: "Switch model" },
				{ name: "new", description: "New session" },
				{ name: "vibe", description: "Vibe" },
				{ name: "custom", description: "Mine" },
			],
			["/new", "model", "custom", "missing", "new"],
		);
		expect(marked.map(command => command.featuredRank)).toEqual([1, 0, undefined, 2]);
		expect(marked[1]?.getAutocompleteDescription?.()).toBe("会话 · 开始新会话");
		// A user-added command keeps its own description; unknown names are skipped.
		expect(marked[3]?.getAutocompleteDescription).toBeUndefined();
		expect(marked[2]).toEqual({ name: "vibe", description: "Vibe" });
	});

	it("adds a command's live state after its Chinese description", () => {
		const [model] = markCommonCommands(
			[{ name: "model", getAutocompleteDescription: () => "Model: omlx/endless" }],
			["model"],
		);
		expect(model?.getAutocompleteDescription?.()).toBe("模型 · 切换模型（omlx/endless）");
		const [quiet] = markCommonCommands([{ name: "model", getAutocompleteDescription: () => undefined }], ["model"]);
		expect(quiet?.getAutocompleteDescription?.()).toBe("模型 · 切换模型");
	});
});
