import { afterAll, afterEach, beforeAll, describe, expect, it } from "bun:test";
import {
	CATEGORIES,
	type NightglideSettingsAction,
	type NightglideSettingsCallbacks,
	type NightglideSettingsContext,
	NightglideSettingsComponent,
} from "@oh-my-pi/pi-tui/overlays/nightglide-settings";
import type { PluginSettingsHost } from "@oh-my-pi/pi-tui/overlays/plugin-settings";
import {
	getAllSettingDefs,
	getSettingsForTab,
	SETTING_TABS,
	type SettingsDisplayEntry,
	type SettingsHost,
} from "@oh-my-pi/pi-tui/overlays/settings-defs";
import { getLanguage, setLanguage } from "@oh-my-pi/pi-tui/i18n";
import { Effort } from "@oh-my-pi/pi-ai";
import { getThemeByName, setSymbolPreset, setThemeInstance } from "@oh-my-pi/pi-tui/theme";
import { visibleWidth } from "@oh-my-pi/pi-tui/utils";

/**
 * The graphical settings page: every control reads and writes its setting
 * through the host on the spot, the layout collapses under 100 columns, and
 * the page survives 80×24 with the focused row always on screen.
 */

const THEMES = [
	"nightglide-abyss",
	"nightglide-aurora",
	"nightglide-cloudlight",
	"nightglide-daybreak",
	"nightglide-flight",
] as const;

const DEFAULTS: Record<string, unknown> = {
	"theme.dark": "nightglide-flight",
	"theme.light": "nightglide-cloudlight",
	"tui.motion": "full",
	symbolPreset: "unicode",
	"composer.shape": "nightglide",
	defaultThinkingLevel: "high",
	"nightglide.routingMode": "manual",
	hideThinkingBlock: false,
	"tools.approvalMode": "write",
	"completion.notify": "on",
	"ask.notify": "on",
	"error.notify": "off",
	autoResume: false,
	"compaction.enabled": true,
	"retry.enabled": true,
	"display.showTokenUsage": false,
	"display.showTurnTime": false,
	"nightglide.language": "zh",
};

const ENTRIES: SettingsDisplayEntry[] = [
	{
		path: "theme.dark",
		type: "string",
		defaultValue: "nightglide-flight",
		ui: { tab: "appearance", group: "Theme", label: "Dark Theme", description: "d", options: "runtime" },
	},
	{
		path: "theme.light",
		type: "string",
		defaultValue: "nightglide-cloudlight",
		ui: { tab: "appearance", group: "Theme", label: "Light Theme", description: "d", options: "runtime" },
	},
	{
		path: "tui.motion",
		type: "enum",
		defaultValue: "full",
		enumValues: ["full", "reduced", "none"],
		ui: { tab: "appearance", group: "Display", label: "Motion", description: "d", options: [] },
	},
	{
		path: "symbolPreset",
		type: "enum",
		defaultValue: "unicode",
		enumValues: ["unicode", "nerd", "ascii"],
		ui: { tab: "appearance", group: "Theme", label: "Symbol Preset", description: "d", options: [] },
	},
	{
		path: "composer.shape",
		type: "string",
		defaultValue: "nightglide",
		ui: { tab: "appearance", group: "Composer", label: "Composer Shape", description: "d", options: "runtime" },
	},
	{
		path: "defaultThinkingLevel",
		type: "enum",
		defaultValue: "high",
		enumValues: ["auto", "minimal", "low", "medium", "high", "xhigh", "max"],
		ui: { tab: "model", group: "Thinking", label: "Thinking Level", description: "d", options: [] },
	},
	{
		path: "nightglide.routingMode",
		type: "enum",
		defaultValue: "manual",
		enumValues: ["manual", "local", "balanced", "performance"],
		ui: { tab: "model", group: "Nightglide Routing", label: "Routing Mode", description: "d", options: [] },
	},
	{
		path: "nightglide.localModel",
		type: "string",
		defaultValue: undefined,
		ui: { tab: "model", group: "Nightglide Routing", label: "Local Model", description: "d" },
	},
	{
		path: "hideThinkingBlock",
		type: "boolean",
		defaultValue: false,
		ui: { tab: "model", group: "Thinking", label: "Hide Thinking Blocks", description: "d" },
	},
	{
		path: "tools.approvalMode",
		type: "enum",
		defaultValue: "write",
		enumValues: ["always-ask", "always-ask-cached", "write", "yolo"],
		ui: { tab: "interaction", group: "Approvals", label: "Tool Approval", description: "d", options: [] },
	},
	{
		path: "completion.notify",
		type: "enum",
		defaultValue: "on",
		enumValues: ["on", "off"],
		ui: {
			tab: "interaction",
			group: "Notifications",
			label: "Completion Notification",
			description: "d",
			options: [],
		},
	},
	{
		path: "ask.notify",
		type: "enum",
		defaultValue: "on",
		enumValues: ["on", "off"],
		ui: { tab: "interaction", group: "Notifications", label: "Ask Notification", description: "d", options: [] },
	},
	{
		path: "error.notify",
		type: "enum",
		defaultValue: "off",
		enumValues: ["on", "off"],
		ui: { tab: "interaction", group: "Notifications", label: "Error Notification", description: "d", options: [] },
	},
	{
		path: "autoResume",
		type: "boolean",
		defaultValue: false,
		ui: { tab: "interaction", group: "Startup & Updates", label: "Auto Resume", description: "d" },
	},
	{
		path: "compaction.enabled",
		type: "boolean",
		defaultValue: true,
		ui: { tab: "context", group: "Compaction", label: "Auto-Compact", description: "d" },
	},
	{
		path: "display.showTokenUsage",
		type: "boolean",
		defaultValue: false,
		ui: { tab: "appearance", group: "Display", label: "Show Token Usage", description: "d" },
	},
	{
		path: "display.showTurnTime",
		type: "boolean",
		defaultValue: false,
		ui: { tab: "appearance", group: "Display", label: "Show Turn Time", description: "d" },
	},
	{
		path: "nightglide.language",
		type: "enum",
		defaultValue: "zh",
		enumValues: ["zh", "en", "auto"],
		ui: { tab: "appearance", group: "Theme", label: "Language", description: "d", options: [] },
	},
	{
		path: "startup.checkUpdate",
		type: "boolean",
		defaultValue: true,
		ui: { tab: "interaction", group: "Startup & Updates", label: "Check for Updates", description: "d" },
	},
	{
		path: "update.channel",
		type: "enum",
		defaultValue: "stable",
		enumValues: ["stable", "canary"],
		ui: { tab: "interaction", group: "Startup & Updates", label: "Update Channel", description: "d", options: [] },
	},
	{
		path: "update.auto",
		type: "boolean",
		defaultValue: false,
		ui: { tab: "interaction", group: "Startup & Updates", label: "Auto Update", description: "d" },
	},
	{
		path: "startup.changelogMode",
		type: "enum",
		defaultValue: "summary",
		enumValues: ["summary", "expanded", "hidden"],
		ui: { tab: "interaction", group: "Startup & Updates", label: "Startup Changelog", description: "d", options: [] },
	},
];

const PLUGINS: PluginSettingsHost = {
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

interface PageState {
	category: string;
	focus: string;
	pane: string;
	cursor: number;
	card: number;
	scrollRow: number;
	advanced: boolean;
	editor: boolean;
}

interface Harness {
	page: NightglideSettingsComponent;
	values: Map<string, unknown>;
	sets: [string, unknown][];
	changes: [string, unknown][];
	previews: string[];
	actions: NightglideSettingsAction[];
	cancels: () => number;
	frame: (width: number) => string[];
	state: () => PageState;
}

function makePage(initial: Record<string, unknown> = {}, rows = 36, plain?: boolean): Harness {
	const values = new Map<string, unknown>(Object.entries(DEFAULTS));
	for (const [key, value] of Object.entries(initial)) values.set(key, value);
	const sets: [string, unknown][] = [];
	const changes: [string, unknown][] = [];
	const settings: SettingsHost = {
		entries: ENTRIES,
		get: path => values.get(path),
		set: (path, value) => {
			values.set(path, value);
			sets.push([path, value]);
		},
		unset: path => {
			values.delete(path);
		},
		normalizeProviderLimits: () => ({}),
		validateProviderLimits: () => ({}),
	};
	const context: NightglideSettingsContext = {
		settings,
		plugins: PLUGINS,
		availableThinkingLevels: [Effort.Minimal, Effort.Low, Effort.Medium, Effort.High],
		thinkingLevel: undefined,
		availableThemes: [...THEMES],
		providers: [],
		modelLabel: "test-model",
		modelProvider: "omlx",
		effortWord: "high",
	};
	const previews: string[] = [];
	const actions: NightglideSettingsAction[] = [];
	let cancels = 0;
	const callbacks: NightglideSettingsCallbacks = {
		onChange: (path, value) => changes.push([path, value]),
		onThemePreview: name => void previews.push(name),
		onCancel: () => {
			cancels++;
		},
		onAction: action => void actions.push(action),
	};
	const page = new NightglideSettingsComponent(context, callbacks, { rows: () => rows, plain });
	return {
		page,
		values,
		sets,
		changes,
		previews,
		actions,
		cancels: () => cancels,
		frame: width => page.render(width).map(line => Bun.stripANSI(line)),
		state: () => page.debugState() as unknown as PageState,
	};
}

/** Keyboard path to one category: Tab to the rail, walk, Tab back to the rows. */
function openCategory(h: Harness, category: string): void {
	h.page.render(120);
	h.page.handleInput("\t");
	let guard = 0;
	while (h.state().category !== category && guard++ < CATEGORIES.length) h.page.handleInput("\x1b[B");
	h.page.handleInput("\t");
	h.page.render(120);
}

/** Screen column of a visible substring (SGR reports are 1-based). */
function columnOf(line: string, text: string): number {
	return visibleWidth(line.slice(0, line.indexOf(text))) + 1;
}

beforeAll(async () => {
	const instance = await getThemeByName("nightglide-flight");
	if (!instance) throw new Error("nightglide-flight theme unavailable");
	setThemeInstance(instance);
});

afterEach(() => setLanguage("zh"));

afterAll(async () => {
	await setSymbolPreset("unicode");
});

describe("Nightglide settings page: value plumbing", () => {
	it("writes boolean toggles through set + onChange the moment ←/→ flips them", () => {
		const h = makePage();
		openCategory(h, "session");
		h.page.handleInput("\x1b[C");
		expect(h.sets).toEqual([["autoResume", true]]);
		expect(h.changes).toEqual([["autoResume", true]]);
		expect(h.values.get("autoResume")).toBe(true);
		h.page.handleInput("\x1b[D");
		expect(h.sets.at(-1)).toEqual(["autoResume", false]);
		expect(h.values.get("autoResume")).toBe(false);
	});

	it('writes the notification toggles as the "on"/"off" strings the settings store', () => {
		const h = makePage();
		openCategory(h, "notify");
		h.page.handleInput("\x1b[C");
		expect(h.sets).toEqual([["completion.notify", "off"]]);
		h.page.handleInput("\x1b[B");
		h.page.handleInput("\x1b[C");
		expect(h.sets.at(-1)).toEqual(["ask.notify", "off"]);
		h.page.handleInput("\x1b[B");
		h.page.handleInput("\x1b[C");
		expect(h.sets.at(-1)).toEqual(["error.notify", "on"]);
		for (const [, value] of h.sets) expect(typeof value).toBe("string");
	});

	it("steps enum segments through their exact stored values", () => {
		const h = makePage();
		openCategory(h, "appearance");
		h.page.handleInput("\x1b[B");
		h.page.handleInput("\x1b[B"); // motion
		h.page.handleInput("\x1b[C");
		expect(h.sets).toEqual([["tui.motion", "reduced"]]);
		h.page.handleInput("\x1b[C");
		expect(h.sets.at(-1)).toEqual(["tui.motion", "none"]);
		h.page.handleInput("\x1b[D");
		expect(h.sets.at(-1)).toEqual(["tui.motion", "reduced"]);
	});

	it("steps the routing mode on the model page", () => {
		const h = makePage();
		openCategory(h, "model");
		h.page.handleInput("\x1b[B"); // routing
		h.page.handleInput("\x1b[C");
		expect(h.sets).toEqual([["nightglide.routingMode", "local"]]);
	});

	it("steps the thinking level only through the model's supported levels", () => {
		const h = makePage({ defaultThinkingLevel: "low" });
		openCategory(h, "model");
		h.page.handleInput("\x1b[C");
		expect(h.sets).toEqual([["defaultThinkingLevel", "medium"]]);
		h.page.handleInput("\x1b[D");
		expect(h.sets.at(-1)).toEqual(["defaultThinkingLevel", "low"]);
	});

	it("shows an unsupported configured level as-is, and only a user step rewrites it", () => {
		const h = makePage({ defaultThinkingLevel: "xhigh" });
		openCategory(h, "model");
		const text = h.frame(120).join("\n");
		expect(text).toContain("很高（当前模型不支持）");
		expect(h.values.get("defaultThinkingLevel")).toBe("xhigh");
		h.page.handleInput("\x1b[C");
		expect(h.sets.at(-1)).toEqual(["defaultThinkingLevel", "minimal"]);
	});

	it("edits the local model through a text field; an empty submit unsets it", () => {
		const h = makePage();
		openCategory(h, "model");
		h.page.handleInput("\x1b[B");
		h.page.handleInput("\x1b[B"); // local model row
		h.page.handleInput("\r");
		expect(h.state().editor).toBe(true);
		for (const character of "omlx/endless") h.page.handleInput(character);
		h.page.handleInput("\r");
		expect(h.sets).toEqual([["nightglide.localModel", "omlx/endless"]]);
		expect(h.state().editor).toBe(false);
		h.page.handleInput("\r");
		h.page.handleInput("\x15");
		h.page.handleInput("\r");
		expect(h.values.has("nightglide.localModel")).toBe(false);
		expect(h.changes.at(-1)).toEqual(["nightglide.localModel", undefined]);
	});

	it("commits theme picks to the slot without pinning a preview", () => {
		const h = makePage();
		h.page.render(120);
		h.page.handleInput("\x1b[D"); // flight → aurora on the dark row
		expect(h.sets).toEqual([["theme.dark", "nightglide-aurora"]]);
		expect(h.changes).toEqual([["theme.dark", "nightglide-aurora"]]);
		// The active look comes from the theme effects (the host applies the slot
		// that matches the terminal background); the page never pins a preview.
		expect(h.previews).toEqual([]);
		expect(h.values.get("theme.light")).toBe("nightglide-cloudlight");
	});

	it("restores the saved theme when a hover preview is followed by a commit", () => {
		const h = makePage();
		h.page.render(120);
		h.page.handleInput("\x1b[<35;20;7M"); // hover the first dark card (abyss)
		expect(h.previews).toEqual(["nightglide-abyss"]);
		h.page.handleInput("\x1b[D"); // commit aurora
		expect(h.sets).toEqual([["theme.dark", "nightglide-aurora"]]);
		expect(h.previews.at(-1)).toBe("nightglide-flight");
	});

	it("offers the three approval tiers and writes their exact values", () => {
		const h = makePage();
		openCategory(h, "approval");
		h.page.handleInput("\x1b[D"); // write → always-ask
		expect(h.sets).toEqual([["tools.approvalMode", "always-ask"]]);
		h.page.handleInput("\x1b[C");
		h.page.handleInput("\x1b[C");
		expect(h.sets.at(-1)).toEqual(["tools.approvalMode", "yolo"]);
	});

	it("shows a fourth approval mode as-is instead of forcing it into a tier", () => {
		const h = makePage({ "tools.approvalMode": "always-ask-cached" });
		openCategory(h, "approval");
		const text = h.frame(120).join("\n");
		expect(text).toContain("always-ask-cached");
		expect(text).toContain("其他模式");
		expect(h.sets).toEqual([]);
		expect(h.values.get("tools.approvalMode")).toBe("always-ask-cached");
		h.page.handleInput("\x1b[C");
		expect(h.sets).toEqual([["tools.approvalMode", "write"]]);
	});

	it("fires the model-page entry buttons, one per selection", () => {
		const h = makePage();
		openCategory(h, "model");
		for (let i = 0; i < 4; i++) h.page.handleInput("\x1b[B"); // actions row
		h.page.handleInput("\r");
		expect(h.actions).toEqual(["login"]);
		h.page.handleInput("\x1b[C");
		h.page.handleInput("\r");
		expect(h.actions).toEqual(["login", "provider"]);
		h.page.handleInput("\x1b[C");
		h.page.handleInput("\r");
		expect(h.actions).toEqual(["login", "provider", "model"]);
		expect(h.cancels()).toBe(0);
	});

	it("shows the live model and effective effort on a read-only card", () => {
		const h = makePage();
		openCategory(h, "model");
		const text = h.frame(120).join("\n");
		expect(text).toContain("test-model");
		expect(text).toContain("omlx");
		expect(text).toContain("实际生效的思考强度");
		expect(text).toContain("高");
	});

	it("Esc closes the page; Tab moves between the rail and the rows", () => {
		const h = makePage();
		h.page.render(120);
		h.page.handleInput("\t");
		expect(h.state().focus).toBe("sidebar");
		h.page.handleInput("\t");
		expect(h.state().focus).toBe("content");
		h.page.handleInput("\x1b");
		expect(h.cancels()).toBe(1);
	});
});

describe("Nightglide settings page: language", () => {
	it("relabels the whole page the moment the language setting changes", () => {
		const h = makePage();
		openCategory(h, "language");
		expect(h.frame(120).join("\n")).toContain("通知");
		h.page.handleInput("\x1b[C");
		expect(h.sets).toEqual([["nightglide.language", "en"]]);
		expect(getLanguage()).toBe("en");
		const text = h.frame(120).join("\n");
		expect(text).toContain("Notifications");
		expect(text).toContain("Session");
		expect(text).not.toContain("通知");
	});

	it("keeps every interface text in both languages (text table contract)", () => {
		const h = makePage();
		openCategory(h, "language");
		const zh = h.frame(120).join("\n");
		h.page.handleInput("\x1b[C");
		const en = h.frame(120).join("\n");
		for (const word of ["外观", "模型", "审批", "通知", "会话", "语言", "高级设置"]) expect(zh).toContain(word);
		for (const word of ["Appearance", "Model", "Approval", "Notifications", "Session", "Language", "Advanced"]) {
			expect(en).toContain(word);
		}
	});
});

describe("Nightglide settings page: layout", () => {
	it("shows the category rail beside the controls at 120 columns, one column at 80", () => {
		const h = makePage();
		const wide = h.frame(120);
		const wideText = wide.join("\n");
		for (const label of ["外观", "模型", "审批", "通知", "会话", "语言", "高级设置"]) {
			expect(wideText).toContain(label);
		}
		expect(wideText).toContain("动效");
		expect(wide[0]).toContain("┬");

		const narrow = h.frame(80);
		const narrowText = narrow.join("\n");
		expect(narrowText).toContain("外观");
		expect(narrowText).not.toContain("动效");
		expect(narrow[0]).not.toContain("┬");

		h.page.handleInput("\r");
		const opened = h.frame(80);
		expect(opened.join("\n")).toContain("动效");
		expect(opened[0]).toContain("设置");
		h.page.handleInput("\x1b");
		expect(h.frame(80).join("\n")).not.toContain("动效");
	});

	it("keeps the focused row visible and every line within 80 columns at 80×24", () => {
		const labels: Record<string, string[]> = {
			appearance: ["暗色主题", "亮色主题", "动效", "图标字符", "输入框样式"],
			model: ["当前模型", "思考强度", "路由模式", "本地模型", "隐藏思考内容", "登录"],
			approval: ["审批策略"],
			notify: ["完成时通知", "提问时通知", "出错时通知"],
			session: ["自动恢复会话", "自动压缩上下文", "出错自动重试", "显示 token 用量", "显示每轮耗时"],
			language: ["语言"],
			advanced: ["高级设置"],
		};
		const h = makePage({}, 24);
		for (const category of CATEGORIES) {
			h.page.render(80);
			let guard = 0;
			while (h.state().category !== category && guard++ < CATEGORIES.length) h.page.handleInput("\x1b[B");
			h.page.handleInput("\r");
			const rows = labels[category]!;
			for (let step = 0; step < rows.length; step++) {
				const frame = h.frame(80);
				for (const line of frame) expect(visibleWidth(line)).toBeLessThanOrEqual(80);
				const cursor = h.state().cursor;
				const label = rows[cursor] ?? rows.at(-1)!;
				expect(frame.join("\n")).toContain(label);
				h.page.handleInput("\x1b[B");
			}
			h.page.handleInput("\x1b");
		}
	});

	it("scrolls by whole rows with the wheel, and stays put when everything fits", () => {
		const h = makePage({}, 14);
		h.page.render(80);
		let guard = 0;
		while (h.state().category !== "session" && guard++ < CATEGORIES.length) h.page.handleInput("\x1b[B");
		h.page.handleInput("\r");
		h.page.render(80);
		// Session's five toggles fit in fourteen rows: the wheel must not scroll.
		for (let i = 0; i < 3; i++) h.page.handleInput("\x1b[B");
		h.page.handleInput("\x1b[<65;40;10M");
		expect(h.state().scrollRow).toBe(0);
		// Appearance's theme cards overflow at this height: the wheel scrolls.
		h.page.handleInput("\x1b"); // back to the category list
		for (let i = 0; i < 4; i++) h.page.handleInput("\x1b[A"); // session → appearance
		h.page.handleInput("\r");
		h.page.render(80);
		h.page.handleInput("\x1b[<65;40;10M");
		expect(h.state().scrollRow).toBeGreaterThan(0);
		h.page.handleInput("\x1b[<64;40;10M");
		expect(h.state().scrollRow).toBe(0);
	});
});

describe("Nightglide settings page: mouse", () => {
	it("clicks a category in the rail and a toggle in the content column", () => {
		const h = makePage();
		const frame = h.page.render(120);
		const notifyRow = frame.findIndex(line => Bun.stripANSI(line).includes("通知"));
		const notifyLine = Bun.stripANSI(frame[notifyRow]!);
		h.page.handleInput(`\x1b[<0;${columnOf(notifyLine, "通知")};${notifyRow + 1}M`);
		expect(h.state().category).toBe("notify");

		const toggleFrame = h.page.render(120);
		const toggleRow = toggleFrame.findIndex(line => Bun.stripANSI(line).includes("完成时通知"));
		const toggleLine = Bun.stripANSI(toggleFrame[toggleRow]!);
		h.page.handleInput(`\x1b[<0;${columnOf(toggleLine, "开")};${toggleRow + 1}M`);
		expect(h.sets).toEqual([["completion.notify", "off"]]);
	});

	it("clicks a segment option to apply it directly", () => {
		const h = makePage();
		const frame = h.page.render(120);
		const motionRow = frame.findIndex(line => Bun.stripANSI(line).includes("关闭"));
		const motionLine = Bun.stripANSI(frame[motionRow]!);
		h.page.handleInput(`\x1b[<0;${columnOf(motionLine, "关闭")};${motionRow + 1}M`);
		expect(h.sets).toEqual([["tui.motion", "none"]]);
	});

	it("previews a theme card on hover and restores the saved theme when the pointer leaves", () => {
		const h = makePage();
		const frame = h.page.render(120);
		const cardRow = frame.findIndex(line => Bun.stripANSI(line).includes("Abyss"));
		const cardLine = Bun.stripANSI(frame[cardRow]!);
		h.page.handleInput(`\x1b[<35;${columnOf(cardLine, "Abyss")};${cardRow + 1}M`);
		expect(h.previews).toEqual(["nightglide-abyss"]);
		h.page.handleInput(`\x1b[<35;60;1M`);
		expect(h.previews.at(-1)).toBe("nightglide-flight");
		expect(h.sets).toEqual([]);
	});

	it("clicks a theme card to apply it", () => {
		const h = makePage();
		const frame = h.page.render(120);
		const cardRow = frame.findIndex(line => Bun.stripANSI(line).includes("Abyss"));
		const cardLine = Bun.stripANSI(frame[cardRow]!);
		h.page.handleInput(`\x1b[<0;${columnOf(cardLine, "Abyss")};${cardRow + 1}M`);
		expect(h.sets).toEqual([["theme.dark", "nightglide-abyss"]]);
	});
});

describe("Nightglide settings page: advanced settings", () => {
	it("opens the upstream tabs behind the entry and returns to the page on Esc", () => {
		const h = makePage();
		openCategory(h, "advanced");
		h.page.handleInput("\r");
		expect(h.state().advanced).toBe(true);
		const advanced = h.frame(120);
		const text = advanced.join("\n");
		expect(text).toContain("Settings");
		expect(text).toContain("交互");
		expect(text).not.toContain("常用");
		h.page.handleInput("\x1b");
		expect(h.state().advanced).toBe(false);
		expect(h.frame(120).join("\n")).toContain("高级设置");
		expect(h.cancels()).toBe(0);
	});

	it("drops the common tab and the dead update settings from every settings surface", () => {
		expect(SETTING_TABS[0]).toBe("appearance");
		expect(SETTING_TABS).not.toContain("common");
		const all = getAllSettingDefs(ENTRIES).map(def => def.path);
		expect(all).toContain("tools.approvalMode");
		expect(all).toContain("autoResume");
		for (const path of ["startup.checkUpdate", "update.channel", "update.auto", "startup.changelogMode"]) {
			expect(all).not.toContain(path);
			for (const tab of SETTING_TABS) {
				expect(getSettingsForTab(ENTRIES, tab).map(def => def.path)).not.toContain(path);
			}
		}
	});
});

describe("Nightglide settings page: degraded terminals", () => {
	it("renders only ASCII control glyphs under the ASCII symbol preset", async () => {
		setLanguage("en");
		await setSymbolPreset("ascii");
		const h = makePage();
		const frame = h.frame(120);
		expect(frame.length).toBeGreaterThan(10);
		for (const line of frame) {
			expect(line).toMatch(/^[\x20-\x7e]*$/);
		}
		const text = frame.join("\n");
		expect(text).toContain("(o) Flight");
		expect(text).toContain("[ Full | Reduced | Off ]");
		expect(text).not.toContain("▰");
		await setSymbolPreset("unicode");
	});

	it("renders without color escapes under NO_COLOR, with text markers for state", () => {
		setLanguage("en");
		const h = makePage({}, 36, true);
		for (const line of h.page.render(120)) {
			expect(line).not.toMatch(/\x1b\[[0-9;]*(?:38|48);/);
		}
		const text = h.frame(120).join("\n");
		expect(text).toContain("Motion");
		expect(text).toContain("*Full*");
	});
});
