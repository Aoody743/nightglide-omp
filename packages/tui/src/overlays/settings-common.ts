/**
 * Nightglide: the "常用" (common) settings page — the first tab `/settings` opens.
 *
 * Each row is a view of a setting that lives on another tab: same path, same
 * store and same saving, with a Chinese label, description and section. The
 * source tabs are unchanged and still list every setting ("全部设置").
 */
import type { SettingDef, SubmenuOption } from "./settings-defs";

interface CommonSetting {
	path: string;
	group: string;
	label: string;
	description: string;
	/** Chinese labels for the setting's values; for an enum this also limits the choices shown here. */
	options?: ReadonlyArray<SubmenuOption>;
}

const ON_OFF: ReadonlyArray<SubmenuOption> = [
	{ value: "on", label: "开" },
	{ value: "off", label: "关" },
];

/** Section order of the common page. */
export const COMMON_SETTING_GROUPS: readonly string[] = ["外观", "模型", "审批", "通知", "输入"];

const COMMON_SETTINGS: readonly CommonSetting[] = [
	{ path: "theme.dark", group: "外观", label: "暗色主题", description: "终端为暗色背景时使用的主题。" },
	{ path: "theme.light", group: "外观", label: "亮色主题", description: "终端为亮色背景时使用的主题。" },
	{
		path: "tui.motion",
		group: "外观",
		label: "动效",
		description: "场景动画和转圈等动效的强度。",
		options: [
			{ value: "full", label: "完整", description: "全部动效（默认）" },
			{ value: "reduced", label: "减弱", description: "转圈放慢，不闪烁、不渐变" },
			{ value: "none", label: "关闭", description: "静态画面，功能不变" },
		],
	},
	{
		path: "symbolPreset",
		group: "外观",
		label: "图标字符",
		description: "界面图标使用的字符集。",
		options: [
			{ value: "unicode", label: "Unicode", description: "标准符号（默认）" },
			{ value: "nerd", label: "Nerd Font", description: "需要终端使用 Nerd Font 字体" },
			{ value: "ascii", label: "ASCII", description: "兼容性最好" },
		],
	},
	{ path: "composer.shape", group: "外观", label: "输入框样式", description: "输入框的外形。" },
	{
		path: "defaultThinkingLevel",
		group: "模型",
		label: "思考强度",
		description: "支持思考的模型默认使用的推理深度；当前模型不支持的档位不会列出。",
		options: [
			{ value: "auto", label: "自动" },
			{ value: "minimal", label: "最低" },
			{ value: "low", label: "低" },
			{ value: "medium", label: "中" },
			{ value: "high", label: "高" },
			{ value: "xhigh", label: "很高" },
			{ value: "max", label: "最高" },
		],
	},
	{
		path: "nightglide.routingMode",
		group: "模型",
		label: "路由模式",
		description: "会话和子智能体使用哪些模型。",
		options: [
			{ value: "manual", label: "手动", description: "按你选择的模型，不做改动（默认）" },
			{ value: "local", label: "本地", description: "只使用本地模型" },
			{ value: "balanced", label: "均衡", description: "按配置在本地与云端之间分配" },
			{ value: "performance", label: "性能", description: "关键角色使用更强的模型" },
		],
	},
	{ path: "nightglide.localModel", group: "模型", label: "本地模型", description: "本地路由使用的模型。" },
	{ path: "hideThinkingBlock", group: "模型", label: "隐藏思考内容", description: "不在对话中显示模型的思考块。" },
	{
		path: "tools.approvalMode",
		group: "审批",
		label: "审批策略",
		description: "工具调用前是否询问。其他模式在“Interaction”标签页。",
		options: [
			{ value: "always-ask", label: "全部询问", description: "只读操作自动执行，写入和命令都询问" },
			{ value: "write", label: "高风险询问", description: "读写自动执行，命令、子智能体和危险命令询问（默认）" },
			{ value: "yolo", label: "自动执行", description: "全部自动执行" },
		],
	},
	{
		path: "completion.notify",
		group: "通知",
		label: "完成时通知",
		description: "回复完成时发送系统通知。",
		options: ON_OFF,
	},
	{
		path: "ask.notify",
		group: "通知",
		label: "提问时通知",
		description: "需要你回答或审批时发送系统通知。",
		options: ON_OFF,
	},
	{ path: "error.notify", group: "通知", label: "出错时通知", description: "出错时发送系统通知。", options: ON_OFF },
	{
		path: "nightglide.commonCommands",
		group: "输入",
		label: "常用命令",
		description: "输入 / 时列出的命令，按顺序排列（JSON 列表）。其余命令输入名字可搜到，或用 /more 浏览。",
	},
];

const ON_OFF_BOOLEAN: ReadonlyArray<SubmenuOption> = [
	{ value: "true", label: "开" },
	{ value: "false", label: "关" },
];

/** Rows built for the common page; only these show option labels in place of raw values. */
const commonRows = new WeakSet<SettingDef>();

/** The Chinese label for a common-page row's current value; undefined for other rows or unknown values. */
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
		const base = { ...def, label: common.label, description: common.description, group: common.group };
		let row: SettingDef;
		if (common.options && (def.type === "enum" || def.type === "submenu")) {
			row = { ...base, type: "submenu", options: common.options };
		} else if (def.type === "boolean") {
			// Saved as a boolean: the selector converts "true"/"false" back for boolean settings.
			row = { ...base, type: "submenu", options: ON_OFF_BOOLEAN };
		} else {
			row = base as SettingDef;
		}
		commonRows.add(row);
		rows.push(row);
	}
	return rows;
}
