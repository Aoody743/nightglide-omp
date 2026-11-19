import { beforeAll, describe, expect, it } from "bun:test";
import { TabBar } from "@oh-my-pi/pi-tui/components/tab-bar";
import { SettingsList } from "@oh-my-pi/pi-tui/components/settings-list";
import type { PluginSettingsHost } from "@oh-my-pi/pi-tui/overlays/plugin-settings";
import { getSettingsTabBarTheme, SettingsSelectorComponent } from "@oh-my-pi/pi-tui/overlays/settings-selector";
import { SETTING_TABS, type SettingsDisplayEntry, type SettingsHost } from "@oh-my-pi/pi-tui/overlays/settings-defs";
import { getSettingsListTheme, initTheme, setTheme, theme } from "@oh-my-pi/pi-tui/theme";
import { visibleWidth } from "@oh-my-pi/pi-tui/utils";

const ENTRIES: SettingsDisplayEntry[] = [
	{
		path: "theme.dark",
		type: "string",
		defaultValue: "dark",
		ui: { tab: "appearance", group: "Theme", label: "Dark theme", description: "Theme used on dark terminals" },
	},
	{
		path: "display.colorBlind",
		type: "boolean",
		defaultValue: false,
		ui: { tab: "appearance", group: "Theme", label: "Color-blind mode", description: "Blue additions" },
	},
	{
		path: "compaction.thresholdPercent",
		type: "number",
		defaultValue: -1,
		ui: {
			tab: "context",
			group: "Compaction",
			label: "Threshold",
			description: "When to compact",
			options: [
				{ value: "default", label: "Default" },
				{ value: "50", label: "50%" },
				{ value: "80", label: "80%" },
			],
		},
	},
	{
		path: "startup.updateChecks",
		type: "boolean",
		defaultValue: true,
		ui: {
			tab: "interaction",
			group: "Startup & Updates",
			label: "Check For Updates At Every Startup Automatically",
			description:
				"A deliberately long label and description pair that stresses the row and note layout on narrow terminals.",
		},
	},
	{
		path: "providers.order",
		type: "string",
		defaultValue: "very-long-provider-name-one,very-long-provider-name-two",
		ui: {
			tab: "providers",
			group: "Services",
			label: "Provider Order",
			description: "Order the providers are tried in",
		},
	},
];

function harness(initial: Record<string, unknown> = {}): SettingsSelectorComponent {
	const values = new Map<string, unknown>();
	for (const entry of ENTRIES) values.set(entry.path, entry.defaultValue);
	for (const key in initial) values.set(key, initial[key]);
	const settings: SettingsHost = {
		entries: ENTRIES,
		get: path => values.get(path),
		set: (path, value) => void values.set(path, value),
		unset: path => void values.set(path, ENTRIES.find(entry => entry.path === path)?.defaultValue),
		normalizeProviderLimits: () => ({}),
		validateProviderLimits: () => ({}),
	};
	const plugins: PluginSettingsHost = {
		manager: {
			list: async () => [],
			getPlugin: async () => undefined,
			getPluginSettings: async () => ({}),
			setEnabled: async () => {},
			getEnabledFeatures: async () => null,
			setEnabledFeatures: async () => {},
			setPluginSetting: async () => {},
		},
		createMarketplaceManager: async () => ({
			listInstalledPlugins: async () => [],
			setPluginEnabled: async () => {},
		}),
		parsePluginId: () => null,
	};
	return new SettingsSelectorComponent(
		{
			settings,
			plugins,
			availableThinkingLevels: [],
			thinkingLevel: undefined,
			availableThemes: ["dark", "light"],
			providers: [],
		},
		{ onChange: () => {}, onCancel: () => {} },
	);
}

function sectionedItems() {
	return [
		{ id: "__heading:a", label: "Group A", currentValue: "", heading: true },
		{ id: "alpha", label: "Alpha", currentValue: "off", values: ["off", "on"] },
		{ id: "alpha2", label: "Alpha Two", currentValue: "off", values: ["off", "on"] },
		{ id: "__heading:b", label: "Group B", currentValue: "", heading: true },
		{ id: "beta", label: "Beta", currentValue: "off", values: ["off", "on"] },
		{ id: "__heading:c", label: "Group C", currentValue: "", heading: true },
		{ id: "gamma", label: "Gamma", currentValue: "off", values: ["off", "on"] },
	];
}

/** The SGR sequence a band opens with (bgFill/bg wrap content then reset the background). */
function bandOpen(): string {
	return theme.bgFill("selectedBg", "").replace("\x1b[49m", "");
}

describe("settings visual hierarchy (nightglide)", () => {
	beforeAll(async () => {
		await initTheme();
		await setTheme("dark");
	});

	it("marks the active tab with the selectedBg band and an accent label", () => {
		const tabBarTheme = getSettingsTabBarTheme();
		expect(tabBarTheme.activeTab("Model")).toBe(theme.bg("selectedBg", theme.fg("accent", "Model")));
		expect(tabBarTheme.hoverTab!("Model")).toBe(theme.bg("selectedBg", theme.fg("text", "Model")));
	});

	it("renders non-active tabs dim, not muted", () => {
		const tabBarTheme = getSettingsTabBarTheme();
		expect(tabBarTheme.inactiveTab("Model")).toBe(theme.fg("dim", "Model"));
		expect(tabBarTheme.mutedTab!("Model")).toBe(theme.fg("dim", "Model"));
		expect(tabBarTheme.hint!("hint")).toBe(theme.fg("dim", "hint"));
	});

	it("renders the tab strip with exactly one band and dim neighbors", () => {
		const tabs = [
			{ id: "appearance", label: `${theme.symbol("tab.appearance")} Appearance` },
			{ id: "model", label: `${theme.symbol("tab.model")} Model` },
			{ id: "plugins", label: "Plugins", muted: true },
		];
		const bar = new TabBar("", tabs, getSettingsTabBarTheme(), 0);
		const row = bar.render(120)[0]!;
		const activeChunk = theme.bg("selectedBg", theme.fg("accent", ` ${theme.symbol("tab.appearance")} Appearance `));
		expect(row).toContain(activeChunk);
		expect(row).toContain(theme.fg("dim", ` ${theme.symbol("tab.model")} Model `));
		expect(row).not.toContain(theme.fg("muted", ` ${theme.symbol("tab.model")} Model `));
		expect(row.split(bandOpen()).length - 1).toBe(1);
	});

	it("draws the frame tab row with the active band over the settings page", () => {
		const selector = harness();
		const lines = selector.render(100);
		const activeChunk = theme.bg("selectedBg", theme.fg("accent", ` ${theme.symbol("tab.appearance")} Appearance `));
		expect(lines.slice(1, 4).join("\n")).toContain(activeChunk);
	});

	it("styles group headings as markdown H2: bold + mdHeading, never underlined", () => {
		const listTheme = getSettingsListTheme();
		expect(listTheme.heading!("Compaction", false)).toBe(theme.fg("mdHeading", theme.bold("Compaction")));
		expect(listTheme.heading!("Compaction", true)).toBe(theme.fg("dim", "Compaction"));
		expect(listTheme.heading!("Compaction", false)).not.toContain("\x1b[4m");
		expect(listTheme.heading!("Compaction", true)).not.toContain("\x1b[4m");
	});

	it("gives group headings a blank line above in the flat layout", () => {
		const list = new SettingsList(
			sectionedItems(),
			10,
			getSettingsListTheme(),
			() => {},
			() => {},
		);
		const lines = list.render(60).map(line => Bun.stripANSI(line));
		const aIndex = lines.findIndex(line => line.includes("Group A"));
		const bIndex = lines.findIndex(line => line.includes("Group B"));
		const cIndex = lines.findIndex(line => line.includes("Group C"));
		// The list-leading heading opens without a stray blank above it; every
		// later group heading breathes against the section before it.
		expect(aIndex).toBe(0);
		expect(bIndex).toBeGreaterThan(0);
		expect(lines[bIndex - 1]!.trim()).toBe("");
		expect(cIndex).toBeGreaterThan(0);
		expect(lines[cIndex - 1]!.trim()).toBe("");
	});

	it("keeps hit maps aligned across heading spacer lines", () => {
		const list = new SettingsList(
			sectionedItems(),
			10,
			getSettingsListTheme(),
			() => {},
			() => {},
		);
		const lines = list.render(60).map(line => Bun.stripANSI(line));
		const bIndex = lines.findIndex(line => line.includes("Group B"));
		expect(list.hitTest(bIndex, 0)).toBeUndefined(); // the heading row
		expect(list.hitTest(bIndex - 1, 0)).toBeUndefined(); // the spacer line
		expect(list.hitTest(bIndex + 1, 0)).toBe("beta"); // the section's first row
	});

	it("paints the keyboard selection as a padded full-row selectedBg band", () => {
		const list = new SettingsList(
			[
				{ id: "a", label: "First", currentValue: "on", values: ["on", "off"] },
				{ id: "b", label: "Second", currentValue: "off", values: ["on", "off"] },
			],
			5,
			getSettingsListTheme(),
			() => {},
			() => {},
		);
		const lines = list.render(80);
		const selected = lines[0]!;
		expect(selected.startsWith(bandOpen())).toBe(true);
		// The band spans the full row width, not just the row's text.
		expect(Bun.stripANSI(selected).length).toBe(80);
		// The accent cursor leads the banded row.
		expect(Bun.stripANSI(selected).startsWith(`${theme.nav.cursor} `)).toBe(true);
		// Unselected rows stay quiet: no band.
		expect(lines[1]!.includes(bandOpen())).toBe(false);
	});

	it("keeps labels in text, values dim and descriptions muted", () => {
		const listTheme = getSettingsListTheme();
		expect(listTheme.value("off", false, false)).toBe(theme.fg("dim", "off"));
		expect(listTheme.value("off", true, false)).toBe(theme.fg("accent", "off"));
		expect(listTheme.description("When to compact")).toBe(theme.fg("muted", "When to compact"));
	});

	it("draws the split pane separator in the borderMuted slot", () => {
		const list = new SettingsList(
			sectionedItems(),
			10,
			getSettingsListTheme(),
			() => {},
			() => {},
		);
		const output = list.render(120).join("\n");
		expect(output).toContain(theme.fg("borderMuted", "│ "));
	});

	it("keeps every settings tab inside 80 columns with zero overflow", () => {
		const selector = harness();
		// Right arrow cycles appearance → … → providers → plugins (wraps after).
		for (let i = 0; i <= SETTING_TABS.length; i++) {
			const lines = selector.render(80);
			for (const line of lines) {
				expect(visibleWidth(line)).toBeLessThanOrEqual(80);
			}
			selector.handleInput("\x1b[C");
		}
	});
});
