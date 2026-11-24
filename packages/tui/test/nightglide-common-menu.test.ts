import { describe, expect, it } from "bun:test";
import { CombinedAutocompleteProvider, type SlashCommand } from "@oh-my-pi/pi-tui/autocomplete";
import { commonValueLabel } from "@oh-my-pi/pi-tui/overlays/settings-common";
import {
	getAllSettingDefs,
	getSettingsForTab,
	SETTING_TABS,
	type SettingsDisplayEntry,
} from "@oh-my-pi/pi-tui/overlays/settings-defs";

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

describe("Nightglide common settings page", () => {
	const entries: SettingsDisplayEntry[] = [
		{
			path: "tools.approvalMode",
			type: "enum",
			defaultValue: "write",
			enumValues: ["always-ask", "always-ask-cached", "write", "yolo"],
			ui: { tab: "interaction", group: "Approvals", label: "Tool Approval", description: "d", options: [] },
		},
		{
			path: "tui.motion",
			type: "enum",
			defaultValue: "full",
			enumValues: ["full", "reduced", "none"],
			ui: { tab: "appearance", group: "Display", label: "Motion", description: "d" },
		},
		{
			path: "display.other",
			type: "boolean",
			defaultValue: false,
			ui: { tab: "appearance", label: "Other", description: "d" },
		},
		{
			path: "hideThinkingBlock",
			type: "boolean",
			defaultValue: false,
			ui: { tab: "model", label: "Hide", description: "d" },
		},
	];

	it("is the first tab", () => {
		expect(SETTING_TABS[0]).toBe("common");
	});

	it("re-lists selected settings with Chinese labels, keeping their paths and source tabs", () => {
		const rows = getSettingsForTab(entries, "common");
		expect(rows.map(row => row.path)).toEqual(["tui.motion", "hideThinkingBlock", "tools.approvalMode"]);
		const approval = rows.find(row => row.path === "tools.approvalMode")!;
		expect(approval.label).toBe("审批策略");
		expect(approval.group).toBe("审批");
		expect(approval.tab).toBe("interaction");
		expect(approval.type).toBe("submenu");
		if (approval.type === "submenu") {
			expect(approval.options.map(option => option.label)).toEqual(["全部询问", "高风险询问", "自动执行"]);
		}
	});

	it("leaves the source tabs unchanged", () => {
		const original = getAllSettingDefs(entries).find(def => def.path === "tools.approvalMode")!;
		expect(original.label).toBe("Tool Approval");
		expect(getSettingsForTab(entries, "interaction").map(def => def.path)).toEqual(["tools.approvalMode"]);
	});

	it("shows Chinese value labels on the common page only, and offers booleans as 开/关", () => {
		const rows = getSettingsForTab(entries, "common");
		const approval = rows.find(row => row.path === "tools.approvalMode")!;
		expect(commonValueLabel(approval, "write")).toBe("高风险询问");
		expect(commonValueLabel(approval, "always-ask-cached")).toBeUndefined();
		const hide = rows.find(row => row.path === "hideThinkingBlock")!;
		expect(hide.type).toBe("submenu");
		expect(commonValueLabel(hide, false)).toBe("关");
		const source = getAllSettingDefs(entries).find(def => def.path === "tools.approvalMode")!;
		expect(commonValueLabel(source, "write")).toBeUndefined();
	});
});
