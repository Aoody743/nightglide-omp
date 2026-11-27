import { afterEach, describe, expect, it } from "bun:test";
import {
	getLanguage,
	onLanguageChange,
	resolveLanguage,
	setLanguage,
	t,
	TEXT,
	type TextKey,
} from "@oh-my-pi/pi-tui/i18n";
import { CATEGORIES } from "@oh-my-pi/pi-tui/overlays/nightglide-settings";
import { getSettingsForTab, type SettingsDisplayEntry, TAB_METADATA } from "@oh-my-pi/pi-tui/overlays/settings-defs";

afterEach(() => setLanguage("zh"));

/** The `{name}` placeholders of a text, sorted. */
function placeholders(text: string): string[] {
	return [...text.matchAll(/\{(\w+)\}/g)].map(match => match[1]!).sort();
}

describe("Nightglide text table", () => {
	it("has non-empty Chinese and English text for every entry, with the same placeholders", () => {
		for (const [key, entry] of Object.entries(TEXT)) {
			expect(entry.zh.trim().length, key).toBeGreaterThan(0);
			expect(entry.en.trim().length, key).toBeGreaterThan(0);
			expect(placeholders(entry.en), key).toEqual(placeholders(entry.zh));
		}
	});

	it("keeps Chinese out of the English text", () => {
		for (const [key, entry] of Object.entries(TEXT)) {
			expect(/[一-鿿]/.test(entry.en), key).toBe(false);
		}
	});
});

describe("Nightglide language", () => {
	it("defaults to Chinese and resolves auto from the locale", () => {
		expect(resolveLanguage(undefined)).toBe("zh");
		expect(resolveLanguage("en")).toBe("en");
		expect(resolveLanguage("auto", { LANG: "zh_CN.UTF-8" })).toBe("zh");
		expect(resolveLanguage("auto", { LANG: "en_US.UTF-8" })).toBe("en");
		expect(resolveLanguage("auto", { LC_ALL: "zh_TW.UTF-8", LANG: "en_US.UTF-8" })).toBe("zh");
		expect(resolveLanguage("auto", {})).toBe("en");
	});

	it("switches text at once and fills placeholders", () => {
		expect(t("shell.model")).toBe("模型");
		expect(t("list.typeToSearch")).toBe("  输入文字搜索");
		expect(t("list.searchQuery", { query: "git" })).toBe("  搜索：git");
		setLanguage("en");
		expect(getLanguage()).toBe("en");
		expect(t("shell.model")).toBe("Model");
		expect(t("list.typeToSearch")).toBe("  Type to search");
		expect(t("list.searchQuery", { query: "git" })).toBe("  Search: git");
		expect(t("toast.fallback", { model: "omlx/endless" })).toBe("Fell back to omlx/endless");
	});

	it("tells listeners about real changes only", () => {
		const heard: string[] = [];
		const stop = onLanguageChange(language => heard.push(language));
		setLanguage("zh");
		setLanguage("en");
		setLanguage("en");
		stop();
		setLanguage("zh");
		expect(heard).toEqual(["en"]);
	});

	it("names settings tabs and the settings page's categories in the current language", () => {
		const entries: SettingsDisplayEntry[] = [
			{
				path: "tools.approvalMode",
				type: "enum",
				defaultValue: "write",
				enumValues: ["always-ask", "write", "yolo"],
				ui: { tab: "interaction", group: "Approvals", label: "Tool Approval", description: "d", options: [] },
			},
			{
				path: "nightglide.language",
				type: "enum",
				defaultValue: "zh",
				enumValues: ["zh", "en", "auto"],
				ui: { tab: "appearance", group: "Theme", label: "Language", description: "d", options: [] },
			},
		];
		expect(TAB_METADATA.interaction.label).toBe("交互");
		expect(getSettingsForTab(entries, "interaction").map(row => row.label)).toEqual(["Tool Approval"]);
		const categories = CATEGORIES.map(id => t(`set.cat.${id}` as TextKey));
		expect(categories).toEqual(["外观", "模型", "审批", "通知", "会话", "语言", "高级设置"]);
		setLanguage("en");
		expect(TAB_METADATA.interaction.label).toBe("Interaction");
		expect(CATEGORIES.map(id => t(`set.cat.${id}` as TextKey))).toEqual([
			"Appearance",
			"Model",
			"Approval",
			"Notifications",
			"Session",
			"Language",
			"Advanced",
		]);
	});
});
