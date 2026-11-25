import { describe, expect, it } from "bun:test";
import { CombinedAutocompleteProvider, type SlashCommand } from "@oh-my-pi/pi-tui/autocomplete";

const commands: SlashCommand[] = [
	{ name: "alpha", description: "Alpha" },
	{ name: "model", description: "Switch model", featuredRank: 1 },
	{ name: "new", description: "New session", featuredRank: 0 },
	{ name: "marketplace", description: "Plugins" },
];

function names(provider: CombinedAutocompleteProvider, text: string): string[] {
	return provider.trySyncSlashCompletion(text)?.items.map(item => item.value) ?? [];
}

describe("Nightglide common commands in the / menu", () => {
	it("lists only common commands, in list order, for a bare slash", () => {
		const provider = new CombinedAutocompleteProvider(commands, "/tmp");
		expect(names(provider, "/")).toEqual(["new", "model"]);
	});

	it("still searches every command once a name is typed", () => {
		const provider = new CombinedAutocompleteProvider(commands, "/tmp");
		expect(names(provider, "/mar")).toEqual(["marketplace"]);
		expect(names(provider, "/m")).toContain("marketplace");
		expect(names(provider, "/m")).toContain("model");
	});

	it("keeps the upstream full list when nothing is marked", () => {
		const plain = commands.map(({ featuredRank: _rank, ...command }) => command);
		const provider = new CombinedAutocompleteProvider(plain, "/tmp");
		expect(names(provider, "/")).toEqual(["alpha", "model", "new", "marketplace"]);
	});
});
