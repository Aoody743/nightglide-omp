/**
 * Nightglide: the "常用" (common) settings page — the first tab `/settings` opens.
 *
 * Each row is a view of a setting that lives on another tab: same path, same
 * store and same saving, with a label, description and section in the current
 * language (built each time the page opens). The
 * source tabs are unchanged and still list every setting ("全部设置").
 */
import { t, type TextKey } from "../i18n";
import type { SettingDef, SubmenuOption } from "./settings-defs";

interface CommonSetting {
	path: string;
	group: TextKey;
	label: TextKey;
	description: TextKey;
	/** Labels for the setting's values; for an enum this also limits the choices shown here. */
	options?: () => ReadonlyArray<SubmenuOption>;
}

const onOff = (): ReadonlyArray<SubmenuOption> => [
	{ value: "on", label: t("common.on") },
	{ value: "off", label: t("common.off") },
];

const GROUP_KEYS: readonly TextKey[] = [
	"common.group.appearance",
	"common.group.model",
	"common.group.approval",
	"common.group.notify",
	"common.group.input",
];

/** Section order of the common page, in the current language. */
export function commonSettingGroups(): readonly string[] {
	return GROUP_KEYS.map(key => t(key));
}

const COMMON_SETTINGS: readonly CommonSetting[] = [
	{
		path: "nightglide.language",
		group: "common.group.appearance",
		label: "common.language",
		description: "common.language.desc",
		// Each language is named in itself, so either can be found from the other.
		options: () => [
			{ value: "zh", label: "中文" },
			{ value: "en", label: "English" },
			{ value: "auto", label: t("common.language.auto"), description: t("common.language.autoDesc") },
		],
	},
	{
		path: "theme.dark",
		group: "common.group.appearance",
		label: "common.themeDark",
		description: "common.themeDark.desc",
	},
	{
		path: "theme.light",
		group: "common.group.appearance",
		label: "common.themeLight",
		description: "common.themeLight.desc",
	},
	{
		path: "tui.motion",
		group: "common.group.appearance",
		label: "common.motion",
		description: "common.motion.desc",
		options: () => [
			{ value: "full", label: t("common.motion.full"), description: t("common.motion.fullDesc") },
			{ value: "reduced", label: t("common.motion.reduced"), description: t("common.motion.reducedDesc") },
			{ value: "none", label: t("common.motion.none"), description: t("common.motion.noneDesc") },
		],
	},
	{
		path: "symbolPreset",
		group: "common.group.appearance",
		label: "common.symbols",
		description: "common.symbols.desc",
		options: () => [
			{ value: "unicode", label: "Unicode", description: t("common.symbols.unicodeDesc") },
			{ value: "nerd", label: "Nerd Font", description: t("common.symbols.nerdDesc") },
			{ value: "ascii", label: "ASCII", description: t("common.symbols.asciiDesc") },
		],
	},
	{
		path: "composer.shape",
		group: "common.group.appearance",
		label: "common.composer",
		description: "common.composer.desc",
	},
	{
		path: "defaultThinkingLevel",
		group: "common.group.model",
		label: "common.effort",
		description: "common.effort.desc",
		options: () =>
			(["auto", "minimal", "low", "medium", "high", "xhigh", "max"] as const).map(value => ({
				value,
				label: t(`common.effort.${value}`),
			})),
	},
	{
		path: "nightglide.routingMode",
		group: "common.group.model",
		label: "common.routing",
		description: "common.routing.desc",
		options: () =>
			(["manual", "local", "balanced", "performance"] as const).map(value => ({
				value,
				label: t(`common.routing.${value}`),
				description: t(`common.routing.${value}Desc`),
			})),
	},
	{
		path: "nightglide.localModel",
		group: "common.group.model",
		label: "common.localModel",
		description: "common.localModel.desc",
	},
	{
		path: "hideThinkingBlock",
		group: "common.group.model",
		label: "common.hideThinking",
		description: "common.hideThinking.desc",
	},
	{
		path: "tools.approvalMode",
		group: "common.group.approval",
		label: "common.approval",
		description: "common.approval.desc",
		options: () => [
			{
				value: "always-ask",
				label: t("common.approval.alwaysAsk"),
				description: t("common.approval.alwaysAskDesc"),
			},
			{ value: "write", label: t("common.approval.write"), description: t("common.approval.writeDesc") },
			{ value: "yolo", label: t("common.approval.yolo"), description: t("common.approval.yoloDesc") },
		],
	},
	{
		path: "completion.notify",
		group: "common.group.notify",
		label: "common.notifyDone",
		description: "common.notifyDone.desc",
		options: onOff,
	},
	{
		path: "ask.notify",
		group: "common.group.notify",
		label: "common.notifyAsk",
		description: "common.notifyAsk.desc",
		options: onOff,
	},
	{
		path: "error.notify",
		group: "common.group.notify",
		label: "common.notifyError",
		description: "common.notifyError.desc",
		options: onOff,
	},
	{
		path: "nightglide.commonCommands",
		group: "common.group.input",
		label: "common.commands",
		description: "common.commands.desc",
	},
];

const onOffBoolean = (): ReadonlyArray<SubmenuOption> => [
	{ value: "true", label: t("common.on") },
	{ value: "false", label: t("common.off") },
];

/** Rows built for the common page; only these show option labels in place of raw values. */
const commonRows = new WeakSet<SettingDef>();

/** The current-language label for a common-page row's current value; undefined for other rows or unknown values. */
export function commonValueLabel(def: SettingDef, value: unknown): string | undefined {
	if (!commonRows.has(def) || def.type !== "submenu") return undefined;
	return def.options.find(option => option.value === String(value))?.label;
}

/** Whether a row belongs to the common page. */
export function isCommonSettingRow(def: SettingDef): boolean {
	return commonRows.has(def);
}

/** The common page's rows, in list order; settings the host does not provide are skipped. */
export function commonSettingDefs(all: readonly SettingDef[]): SettingDef[] {
	const byPath = new Map(all.map(def => [def.path, def]));
	const rows: SettingDef[] = [];
	for (const common of COMMON_SETTINGS) {
		const def = byPath.get(common.path);
		if (!def) continue;
		const base = { ...def, label: t(common.label), description: t(common.description), group: t(common.group) };
		let row: SettingDef;
		if (common.options && (def.type === "enum" || def.type === "submenu")) {
			row = { ...base, type: "submenu", options: common.options() };
		} else if (def.type === "boolean") {
			// Saved as a boolean: the selector converts "true"/"false" back for boolean settings.
			row = { ...base, type: "submenu", options: onOffBoolean() };
		} else {
			row = base as SettingDef;
		}
		commonRows.add(row);
		rows.push(row);
	}
	return rows;
}
