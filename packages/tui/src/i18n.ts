/**
 * Nightglide: the language of Nightglide's own interface text, and the text table.
 *
 * Every string Nightglide adds to the interface lives in {@link TEXT} with a
 * Chinese and an English version; `t(key)` returns the one for the current
 * language. The language comes from the `nightglide.language` setting
 * (`zh`, `en` or `auto`), which the host applies with {@link setLanguage}.
 * Upstream OMP text (the advanced settings' item names and descriptions,
 * tool output, model messages) is not translated.
 */

export type Language = "zh" | "en";
export type LanguageSetting = Language | "auto";

export const LANGUAGE_SETTINGS: readonly LanguageSetting[] = ["zh", "en", "auto"];

/** One entry of the text table; `{name}` marks a value filled in by `t(key, { name })`. */
export interface TextEntry {
	zh: string;
	en: string;
}

export const TEXT = {
	// Glide shell
	"shell.scrollback": { zh: " ↑ 回看中 · End 或点此回到底部 ", en: " ↑ Scrolled back · End or click to return " },
	"shell.panelTitle": { zh: " 会话 ", en: " Session " },
	"shell.welcomeTitle": { zh: "向未知滑行", en: "Glide into the unknown" },
	"shell.welcomeInput": { zh: "在下方输入任务，按 Enter 发送", en: "Type a task below and press Enter to send" },
	"shell.welcomeKeys": {
		zh: "滚轮 / PgUp 回看 · /copy 复制 · /theme 换主题",
		en: "Wheel / PgUp to scroll back · /copy to copy · /theme to change theme",
	},
	"shell.model": { zh: "模型", en: "Model" },
	"shell.fallback": { zh: "↩ 回退 {model}", en: "↩ Fell back to {model}" },
	"shell.noModel": { zh: "未选择模型", en: "No model selected" },
	"shell.effort": { zh: "思考强度", en: "Thinking" },
	"shell.effortAutoPending": { zh: "auto · 本轮确定后显示", en: "auto · shown once this turn decides" },
	"shell.effortUnsupported": { zh: "此模型不支持", en: "Not supported by this model" },
	"shell.unknown": { zh: "未知", en: "Unknown" },
	"shell.subagents": { zh: "子智能体", en: "Subagents" },
	"shell.subagentsCount": { zh: "子智能体 {running}/{total}", en: "Subagents {running}/{total}" },
	"shell.none": { zh: "暂无", en: "None" },
	"shell.status": { zh: "状态", en: "Status" },
	"shell.toolsRunning": { zh: "工具执行中 · {count}", en: "Running tools · {count}" },
	"shell.thinking": { zh: "思考中", en: "Thinking" },
	"shell.idle": { zh: "空闲", en: "Idle" },

	// Welcome, composer, toasts, banners
	"welcome.subtitleFlight": { zh: "向未知滑行 · 夜航工作台", en: "Glide into the unknown · night flight deck" },
	"welcome.subtitleAbyss": { zh: "向未知滑行 · 深潜工作台", en: "Glide into the unknown · deep dive deck" },
	"composer.send": { zh: "↵ 发送", en: "↵ send" },
	"composer.cancel": { zh: "esc 取消", en: "esc cancel" },
	"composer.hintAgent": { zh: "查看 1 个运行中的子智能体", en: "to see 1 running agent" },
	"composer.hintAgents": { zh: "查看 {count} 个运行中的子智能体", en: "to see {count} running agents" },
	"composer.hintEffort": { zh: "调整思考强度", en: "to change thinking effort" },
	"toast.theme": { zh: "主题：{name}", en: "Theme: {name}" },
	"toast.fallback": { zh: "已回退到 {model}", en: "Fell back to {model}" },
	"error.title": { zh: "错误", en: "Error" },
	"error.hint": {
		zh: "发送下一条消息后自动消失 [Esc 关闭 · Ctrl+O 详情]",
		en: "Clears when you send the next message [Esc dismiss · Ctrl+O details]",
	},
	"ask.recommended": { zh: "[推荐]", en: "[Recommended]" },

	// Settings: tabs
	"tab.common": { zh: "常用", en: "Common" },
	"tab.appearance": { zh: "外观", en: "Appearance" },
	"tab.model": { zh: "模型", en: "Model" },
	"tab.interaction": { zh: "交互", en: "Interaction" },
	"tab.context": { zh: "上下文", en: "Context" },
	"tab.memory": { zh: "记忆", en: "Memory" },
	"tab.files": { zh: "文件", en: "Files" },
	"tab.shell": { zh: "Shell", en: "Shell" },
	"tab.tools": { zh: "工具", en: "Tools" },
	"tab.tasks": { zh: "任务", en: "Tasks" },
	"tab.providers": { zh: "提供商", en: "Providers" },
	"lead.common": {
		zh: "最常改的设置。其余设置在后面的标签页里（英文）。",
		en: "The settings changed most often. Every other setting is on the tabs that follow.",
	},

	// Settings: the common page
	"common.group.appearance": { zh: "外观", en: "Appearance" },
	"common.group.model": { zh: "模型", en: "Model" },
	"common.group.approval": { zh: "审批", en: "Approval" },
	"common.group.notify": { zh: "通知", en: "Notifications" },
	"common.group.input": { zh: "输入", en: "Input" },
	"common.on": { zh: "开", en: "On" },
	"common.off": { zh: "关", en: "Off" },
	"common.language": { zh: "语言", en: "Language" },
	"common.language.desc": {
		zh: "Nightglide 界面文字的语言；高级设置的条目说明保持英文。",
		en: "Language of Nightglide's interface text; advanced settings stay in English.",
	},
	"common.language.auto": { zh: "跟随系统", en: "Follow system" },
	"common.language.autoDesc": {
		zh: "系统语言为中文时用中文，否则用英文",
		en: "Chinese when the system language is Chinese, else English",
	},
	"common.themeDark": { zh: "暗色主题", en: "Dark theme" },
	"common.themeDark.desc": {
		zh: "终端为暗色背景时使用的主题。",
		en: "Theme used when the terminal background is dark.",
	},
	"common.themeLight": { zh: "亮色主题", en: "Light theme" },
	"common.themeLight.desc": {
		zh: "终端为亮色背景时使用的主题。",
		en: "Theme used when the terminal background is light.",
	},
	"common.motion": { zh: "动效", en: "Motion" },
	"common.motion.desc": {
		zh: "场景动画和转圈等动效的强度。",
		en: "How much the scenes, spinners and transitions move.",
	},
	"common.motion.full": { zh: "完整", en: "Full" },
	"common.motion.fullDesc": { zh: "全部动效（默认）", en: "All motion (default)" },
	"common.motion.reduced": { zh: "减弱", en: "Reduced" },
	"common.motion.reducedDesc": { zh: "转圈放慢，不闪烁、不渐变", en: "Slower spinners, no flashing or fades" },
	"common.motion.none": { zh: "关闭", en: "Off" },
	"common.motion.noneDesc": { zh: "静态画面，功能不变", en: "Still frames, everything else works" },
	"common.symbols": { zh: "图标字符", en: "Icon glyphs" },
	"common.symbols.desc": { zh: "界面图标使用的字符集。", en: "Character set used for interface icons." },
	"common.symbols.unicodeDesc": { zh: "标准符号（默认）", en: "Standard symbols (default)" },
	"common.symbols.nerdDesc": { zh: "需要终端使用 Nerd Font 字体", en: "Needs a Nerd Font in the terminal" },
	"common.symbols.asciiDesc": { zh: "兼容性最好", en: "Works everywhere" },
	"common.composer": { zh: "输入框样式", en: "Input box style" },
	"common.composer.desc": { zh: "输入框的外形。", en: "Shape of the input box." },
	"common.effort": { zh: "思考强度", en: "Thinking effort" },
	"common.effort.desc": {
		zh: "支持思考的模型默认使用的推理深度；当前模型不支持的档位不会列出。",
		en: "Default reasoning depth for models that think; levels the current model lacks are not listed.",
	},
	"common.effort.auto": { zh: "自动", en: "Auto" },
	"common.effort.minimal": { zh: "最低", en: "Minimal" },
	"common.effort.low": { zh: "低", en: "Low" },
	"common.effort.medium": { zh: "中", en: "Medium" },
	"common.effort.high": { zh: "高", en: "High" },
	"common.effort.xhigh": { zh: "很高", en: "Very high" },
	"common.effort.max": { zh: "最高", en: "Max" },
	"common.routing": { zh: "路由模式", en: "Routing" },
	"common.routing.desc": { zh: "会话和子智能体使用哪些模型。", en: "Which models the session and subagents use." },
	"common.routing.manual": { zh: "手动", en: "Manual" },
	"common.routing.manualDesc": {
		zh: "按你选择的模型，不做改动（默认）",
		en: "The model you pick, unchanged (default)",
	},
	"common.routing.local": { zh: "本地", en: "Local" },
	"common.routing.localDesc": { zh: "只使用本地模型", en: "Local models only" },
	"common.routing.balanced": { zh: "均衡", en: "Balanced" },
	"common.routing.balancedDesc": {
		zh: "按配置在本地与云端之间分配",
		en: "Split between local and cloud as configured",
	},
	"common.routing.performance": { zh: "性能", en: "Performance" },
	"common.routing.performanceDesc": { zh: "关键角色使用更强的模型", en: "Stronger models for key roles" },
	"common.localModel": { zh: "本地模型", en: "Local model" },
	"common.localModel.desc": { zh: "本地路由使用的模型。", en: "Model used by local routing." },
	"common.hideThinking": { zh: "隐藏思考内容", en: "Hide thinking" },
	"common.hideThinking.desc": {
		zh: "不在对话中显示模型的思考块。",
		en: "Do not show the model's thinking blocks in the conversation.",
	},
	"common.approval": { zh: "审批策略", en: "Approval" },
	"common.approval.desc": {
		zh: "工具调用前是否询问。其他模式在“交互”标签页。",
		en: "Whether tool calls ask first. Other modes are on the Interaction tab.",
	},
	"common.approval.alwaysAsk": { zh: "全部询问", en: "Ask for all" },
	"common.approval.alwaysAskDesc": {
		zh: "只读操作自动执行，写入和命令都询问",
		en: "Reads run on their own; writes and commands ask",
	},
	"common.approval.write": { zh: "高风险询问", en: "Ask when risky" },
	"common.approval.writeDesc": {
		zh: "读写自动执行，命令、子智能体和危险命令询问（默认）",
		en: "Reads and writes run; commands, subagents and dangerous commands ask (default)",
	},
	"common.approval.yolo": { zh: "自动执行", en: "Run everything" },
	"common.approval.yoloDesc": { zh: "全部自动执行", en: "Nothing asks" },
	"common.notifyDone": { zh: "完成时通知", en: "Notify when done" },
	"common.notifyDone.desc": {
		zh: "回复完成时发送系统通知。",
		en: "Send a system notification when a reply finishes.",
	},
	"common.notifyAsk": { zh: "提问时通知", en: "Notify when asked" },
	"common.notifyAsk.desc": {
		zh: "需要你回答或审批时发送系统通知。",
		en: "Send a system notification when an answer or approval is needed.",
	},
	"common.notifyError": { zh: "出错时通知", en: "Notify on errors" },
	"common.notifyError.desc": { zh: "出错时发送系统通知。", en: "Send a system notification when something fails." },
	"common.commands": { zh: "常用命令", en: "Common commands" },
	"common.commands.desc": {
		zh: "输入 / 时列出的命令，按顺序排列（JSON 列表）。其余命令输入名字可搜到，或用 /more 浏览。",
		en: "Commands a bare / lists, in order (a JSON list). Others are found by typing their name, or browsed with /more.",
	},

	// The `/` menu
	"cmd.new": { zh: "会话 · 开始新会话", en: "Session · Start a new session" },
	"cmd.resume": { zh: "会话 · 打开以前的会话", en: "Session · Open an earlier session" },
	"cmd.clear": { zh: "会话 · 清空当前对话", en: "Session · Clear this conversation" },
	"cmd.compact": { zh: "会话 · 压缩上下文", en: "Session · Compact the context" },
	"cmd.export": { zh: "会话 · 导出对话", en: "Session · Export the conversation" },
	"cmd.copy": { zh: "会话 · 复制回复内容", en: "Session · Copy a reply" },
	"cmd.model": { zh: "模型 · 切换模型", en: "Model · Switch model" },
	"cmd.effort": { zh: "模型 · 调整思考强度", en: "Model · Change thinking effort" },
	"cmd.setup": { zh: "模型 · 设置向导（提供商与模型）", en: "Model · Setup wizard (providers and models)" },
	"cmd.login": { zh: "模型 · 登录提供商", en: "Model · Sign in to a provider" },
	"cmd.provider": { zh: "模型 · 自定义提供商（Base URL + Key）", en: "Model · Custom provider (Base URL + key)" },
	"cmd.theme": { zh: "外观 · 切换主题", en: "Appearance · Change theme" },
	"cmd.settings": { zh: "外观 · 打开设置", en: "Appearance · Open settings" },
	"cmd.plan": { zh: "工作 · 计划模式", en: "Work · Plan mode" },
	"cmd.tools": { zh: "工作 · 查看可用工具", en: "Work · Show available tools" },
	"cmd.mcp": { zh: "工作 · 管理 MCP 服务器", en: "Work · Manage MCP servers" },
	"cmd.context": { zh: "工作 · 查看上下文用量", en: "Work · Show context usage" },
	"cmd.hotkeys": { zh: "其他 · 快捷键", en: "Other · Keyboard shortcuts" },
	"cmd.more": { zh: "其他 · 浏览全部命令", en: "Other · Browse every command" },
	"cmd.exit": { zh: "其他 · 退出", en: "Other · Quit" },
	"more.title": { zh: "全部命令（{count}）", en: "All commands ({count})" },

	// Custom providers (`/provider`, `/login`)
	"provider.addRow": { zh: "＋ 添加自定义提供商（Base URL + Key）", en: "＋ Add a custom provider (Base URL + key)" },
	"provider.add": { zh: "＋ 添加自定义提供商", en: "＋ Add a custom provider" },
	"provider.listTitle": { zh: "自定义提供商（Base URL + Key）", en: "Custom providers (Base URL + key)" },
	"provider.apiOpenAI": { zh: "OpenAI 兼容（/v1/chat/completions）", en: "OpenAI-compatible (/v1/chat/completions)" },
	"provider.apiAnthropic": { zh: "Anthropic 兼容（/v1/messages）", en: "Anthropic-compatible (/v1/messages)" },
	"provider.retry": { zh: "{title}（{problem}）", en: "{title} ({problem})" },
	"provider.name": {
		zh: "名称（小写字母、数字和 -，例如 my-relay）",
		en: "Name (lowercase letters, digits and -, e.g. my-relay)",
	},
	"provider.nameBad": { zh: "格式不对", en: "not a valid name" },
	"provider.nameTaken": { zh: "已存在，请到列表里编辑", en: "already exists; edit it from the list" },
	"provider.baseUrl": { zh: "{id} · Base URL", en: "{id} · Base URL" },
	"provider.baseUrlBad": {
		zh: "需要 http:// 或 https:// 开头的地址",
		en: "needs an address starting with http:// or https://",
	},
	"provider.api": { zh: "{id} · 接口类型", en: "{id} · API type" },
	"provider.keyEdit": { zh: "{id} · API Key（留空保持不变）", en: "{id} · API key (leave empty to keep it)" },
	"provider.keyNew": {
		zh: "{id} · API Key（本地服务不需要可留空）",
		en: "{id} · API key (leave empty if not needed)",
	},
	"provider.fetching": { zh: "{id}：正在获取模型列表…", en: "{id}: fetching the model list…" },
	"provider.found": {
		zh: "{id}：已保存，发现 {count} 个模型。用 /model 选择。",
		en: "{id}: saved, {count} models found. Pick one with /model.",
	},
	"provider.noneFound": {
		zh: "{id}：已保存，但没有拿到模型列表。请检查 Base URL、接口类型和 Key（可用 /provider 修改）。",
		en: "{id}: saved, but no model list came back. Check the Base URL, API type and key (change them with /provider).",
	},
	"provider.deleteTitle": { zh: "删除 {id}？", en: "Delete {id}?" },
	"provider.deleteBody": {
		zh: "会从 models.yml 删除这项配置，并删除保存的 Key。",
		en: "Removes this entry from models.yml and deletes its saved key.",
	},
	"provider.deleted": { zh: "已删除 {id}。", en: "Deleted {id}." },
	"provider.edit": { zh: "编辑", en: "Edit" },
	"provider.delete": { zh: "删除", en: "Delete" },
	"provider.error": { zh: "自定义提供商：{message}", en: "Custom provider: {message}" },
} as const satisfies Record<string, TextEntry>;

export type TextKey = keyof typeof TEXT;

let current: Language = "zh";
const listeners = new Set<(language: Language) => void>();

/** The language a setting means: `auto` reads LC_ALL, LC_MESSAGES and LANG (Chinese for `zh*`, else English). */
export function resolveLanguage(
	setting: string | undefined,
	env: Record<string, string | undefined> = process.env,
): Language {
	if (setting === "zh" || setting === "en") return setting;
	if (setting !== "auto") return "zh";
	const locale = env.LC_ALL || env.LC_MESSAGES || env.LANG || "";
	return /^zh/i.test(locale) ? "zh" : "en";
}

/** Apply the `nightglide.language` setting; listeners hear only real changes. */
export function setLanguage(setting: string | undefined): void {
	const next = resolveLanguage(setting);
	if (next === current) return;
	current = next;
	for (const listener of listeners) listener(next);
}

export function getLanguage(): Language {
	return current;
}

/** Call `listener` whenever the language changes; returns the unsubscribe function. */
export function onLanguageChange(listener: (language: Language) => void): () => void {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

/** The current language's text for `key`, with `{name}` filled from `values`. */
export function t(key: TextKey, values?: Record<string, string | number>): string {
	const text: string = TEXT[key][current];
	if (!values) return text;
	return text.replace(/\{(\w+)\}/g, (match, name: string) => (name in values ? String(values[name]) : match));
}
