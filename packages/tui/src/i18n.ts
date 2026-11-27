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

	// Settings: the graphical page (S4). Labels for its rows live in the
	// "common.*" block above; this block holds the page chrome and the texts
	// that only this page shows.
	"set.title": { zh: "设置", en: "Settings" },
	"set.cat.appearance": { zh: "外观", en: "Appearance" },
	"set.cat.model": { zh: "模型", en: "Model" },
	"set.cat.approval": { zh: "审批", en: "Approval" },
	"set.cat.notify": { zh: "通知", en: "Notifications" },
	"set.cat.session": { zh: "会话", en: "Session" },
	"set.cat.language": { zh: "语言", en: "Language" },
	"set.cat.advanced": { zh: "高级设置", en: "Advanced" },
	"set.key.select": { zh: "选择", en: "select" },
	"set.key.change": { zh: "调整", en: "change" },
	"set.key.confirm": { zh: "确认", en: "confirm" },
	"set.key.categories": { zh: "分类栏", en: "sidebar" },
	"set.key.close": { zh: "关闭", en: "close" },
	"set.key.open": { zh: "打开", en: "open" },
	"set.key.back": { zh: "返回", en: "back" },
	"set.key.switchCat": { zh: "切换分类", en: "switch category" },
	"set.scroll.above": { zh: "上方还有 {count} 项", en: "{count} more above" },
	"set.scroll.below": { zh: "下方还有 {count} 项", en: "{count} more below" },
	"set.other": { zh: "其他值：{value}", en: "Other value: {value}" },
	"set.default": { zh: "默认", en: "Default" },
	"set.effort.unsupported": {
		zh: "{level}（当前模型不支持）",
		en: "{level} (not supported by this model)",
	},
	"set.effort.noLevels": {
		zh: "此模型没有可选的思考强度",
		en: "This model has no thinking levels to pick",
	},
	"set.text.placeholder": { zh: "（未设置，自动检测）", en: "(unset — auto-detect)" },
	"set.text.hint": {
		zh: "{save} 保存 · {cancel} 取消 · 清空恢复默认",
		en: "{save} save · {cancel} cancel · clear to reset",
	},
	"set.approval.lead": {
		zh: "工具调用前的询问策略。其他模式在高级设置里。",
		en: "What asks before a tool runs. Other modes live in Advanced settings.",
	},
	"set.approval.runs": { zh: "自动", en: "Runs" },
	"set.approval.asks": { zh: "询问", en: "Asks" },
	"set.approval.alwaysAsk.runs": { zh: "只读操作", en: "Read-only tools" },
	"set.approval.alwaysAsk.asks": { zh: "写入和命令", en: "Writes and commands" },
	"set.approval.write.runs": { zh: "读取、写入", en: "Reads and writes" },
	"set.approval.write.asks": {
		zh: "命令、子智能体、危险命令",
		en: "Commands, subagents, dangerous ones",
	},
	"set.approval.yolo.runs": { zh: "全部操作", en: "Everything" },
	"set.approval.yolo.asks": { zh: "无", en: "Nothing" },
	"set.approval.other": {
		zh: "当前是其他模式（{value}），在高级设置中调整",
		en: "Currently another mode ({value}); change it in Advanced settings",
	},
	"set.model.current": { zh: "当前模型", en: "Current model" },
	"set.model.effort": { zh: "实际生效的思考强度", en: "Effective thinking effort" },
	"set.action.login": { zh: "登录", en: "Sign in" },
	"set.action.provider": { zh: "自定义提供商", en: "Custom provider" },
	"set.action.model": { zh: "切换模型", en: "Switch model" },
	"set.session.autoResume": { zh: "自动恢复会话", en: "Auto-resume session" },
	"set.session.autoResume.desc": {
		zh: "启动时恢复这个目录最近的会话",
		en: "Resume this directory's latest session on startup",
	},
	"set.session.compaction": { zh: "自动压缩上下文", en: "Auto-compact context" },
	"set.session.compaction.desc": {
		zh: "上下文过大时自动压缩",
		en: "Compact the context automatically when it grows too large",
	},
	"set.session.retry": { zh: "出错自动重试", en: "Retry on errors" },
	"set.session.retry.desc": { zh: "请求失败时自动重试", en: "Retry automatically when a request fails" },
	"set.session.tokenUsage": { zh: "显示 token 用量", en: "Show token usage" },
	"set.session.tokenUsage.desc": {
		zh: "在回复下方显示每轮的 token 用量",
		en: "Show each turn's token usage under replies",
	},
	"set.session.turnTime": { zh: "显示每轮耗时", en: "Show turn time" },
	"set.session.turnTime.desc": {
		zh: "在回复下方显示每轮耗时",
		en: "Show the time each turn took under replies",
	},
	"set.advanced.desc": { zh: "全部 OMP 设置（英文）", en: "Every upstream setting (English)" },

	// Settings: the common rows shared by the graphical settings page
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
	"common.robotStyle": { zh: "伙伴形象", en: "Companion look" },
	"common.robotStyle.desc": {
		zh: "侧边栏里的像素伙伴造型，可在任何主题下自由挑选。",
		en: "Pixel companion shown in the sidebar under any theme.",
	},
	"common.robotStyle.auto": { zh: "跟随主题", en: "Match theme" },
	"common.robotStyle.autoDesc": {
		zh: "自动搭配主题风格（飞行 / 深潜 / 极光）",
		en: "Automatically match the active theme family (default)",
	},
	"common.robotStyle.glider": { zh: "夜航机甲", en: "Sky Glider" },
	"common.robotStyle.gliderDesc": {
		zh: "圆润流线头盔配流光侧翼",
		en: "Sleek aero-visor pilot with swept wings",
	},
	"common.robotStyle.cat": { zh: "星云猫耳", en: "Nebula Cat" },
	"common.robotStyle.catDesc": {
		zh: "尖尖猫耳、腮红高光与摇摆小尾巴",
		en: "Pointed cyber-cat ears, rosy cheeks, and wagging tail",
	},
	"common.robotStyle.owl": { zh: "夜鸮领航", en: "Night Owl" },
	"common.robotStyle.owlDesc": {
		zh: "羽毛耳簇、圆亮夜视大眼与折翼",
		en: "Feathered ear tufts, wide night eyes, and tiny beak",
	},
	"common.robotStyle.diver": { zh: "深海潜航", en: "Deep Diver" },
	"common.robotStyle.diverDesc": {
		zh: "圆形舷窗头盔与灵动双鳍",
		en: "Round bathysphere dome with aqua porthole and fins",
	},
	"common.robotStyle.prism": { zh: "极光星灵", en: "Aurora Sprite" },
	"common.robotStyle.prismDesc": {
		zh: "悬浮光环与棱晶星灵核心",
		en: "Levitating halo ring above a faceted crystal sprite",
	},
	"common.effort": { zh: "思考强度", en: "Thinking effort" },
	"common.effort.desc": {
		zh: "支持思考的模型默认使用的推理深度；当前模型不支持的档位不会列出。",
		en: "Default reasoning depth for models that think; levels the current model lacks are not listed.",
	},
	"common.effort.auto": { zh: "自动", en: "Auto" },
	"common.effort.off": { zh: "关", en: "off" },
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
	"common.approval.alwaysAsk": { zh: "全部询问", en: "Ask for all" },
	"common.approval.write": { zh: "高风险询问", en: "Ask when risky" },
	"common.approval.yolo": { zh: "自动执行", en: "Run everything" },
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

	// The `/` menu: command groups and descriptions (see nightglide-commands.ts for tiers)
	"cmdgroup.session": { zh: "会话", en: "Session" },
	"cmdgroup.model": { zh: "模型", en: "Model" },
	"cmdgroup.appearance": { zh: "外观", en: "Appearance" },
	"cmdgroup.work": { zh: "工作", en: "Work" },
	"cmdgroup.other": { zh: "其他", en: "Other" },
	"cmd.new": { zh: "开始新会话", en: "Start a new session" },
	"cmd.resume": { zh: "打开以前的会话", en: "Open an earlier session" },
	"cmd.clear": { zh: "清空当前对话", en: "Clear this conversation" },
	"cmd.compact": { zh: "压缩上下文", en: "Compact the context" },
	"cmd.export": { zh: "导出对话", en: "Export the conversation" },
	"cmd.copy": { zh: "复制回复内容", en: "Copy a reply" },
	"cmd.summary": { zh: "查看当前任务总结", en: "Show current task summary" },
	"cmd.model": { zh: "切换模型", en: "Switch model" },
	"cmd.effort": { zh: "调整思考强度", en: "Change thinking effort" },
	"cmd.setup": { zh: "设置向导（提供商与模型）", en: "Setup wizard (providers and models)" },
	"cmd.login": { zh: "登录提供商", en: "Sign in to a provider" },
	"cmd.provider": { zh: "自定义提供商（Base URL + Key）", en: "Custom provider (Base URL + key)" },
	"cmd.theme": { zh: "切换主题", en: "Change theme" },
	"cmd.settings": { zh: "打开设置", en: "Open settings" },
	"cmd.plan": { zh: "计划模式", en: "Plan mode" },
	"cmd.tools": { zh: "查看可用工具", en: "Show available tools" },
	"cmd.mcp": { zh: "管理 MCP 服务器", en: "Manage MCP servers" },
	"cmd.context": { zh: "查看上下文用量", en: "Show context usage" },
	"cmd.hotkeys": { zh: "快捷键", en: "Keyboard shortcuts" },
	"cmd.more": { zh: "浏览全部命令", en: "Browse every command" },
	"cmd.exit": { zh: "退出", en: "Quit" },
	"cmd.rename": { zh: "重命名会话", en: "Rename this session" },
	"cmd.retry": { zh: "重试失败的一轮", en: "Retry the last failed turn" },
	"cmd.branch": {
		zh: "回到之前的消息（旧路径保留为分支）",
		en: "Rewind to an earlier message (keeps the old path as a branch)",
	},
	"cmd.btw": { zh: "顺便问一个问题", en: "Ask a side question" },
	"cmd.logout": { zh: "退出登录", en: "Sign out of a provider" },
	"cmd.usage": { zh: "查看用量与限额", en: "Show provider usage and limits" },
	"cmd.goal": { zh: "目标模式（持续自主完成目标）", en: "Goal mode (work toward an objective on its own)" },
	"cmd.todo": { zh: "查看或修改待办", en: "View or change the todo list" },
	"cmd.jobs": { zh: "查看后台任务", en: "Show background jobs" },
	"cmd.agents": { zh: "子智能体设置", en: "Agent settings" },
	"cmd.git": { zh: "Git 界面（差异、暂存、提交）", en: "Git view (diff, staging, commit)" },
	"cmd.commit": { zh: "只提交智能体做的改动", en: "Commit only the agents' changes" },
	"cmd.memory": { zh: "查看和维护记忆", en: "Inspect and maintain memory" },
	"cmd.pause": { zh: "暂停所有智能体", en: "Pause every agent" },
	"cmd.open": { zh: "在浏览器打开最近的链接", en: "Open the latest link in the browser" },
	"cmd.wt": { zh: "把会话移到新的 worktree", en: "Move this session into a new worktree" },
	"cmd.add-dir": { zh: "添加工作目录", en: "Add a workspace directory" },
	"cmd.remove-dir": { zh: "移除工作目录", en: "Remove a workspace directory" },
	"cmd.dirs": { zh: "列出工作目录", en: "List workspace directories" },
	"cmd.plugins": { zh: "管理插件", en: "Manage plugins" },
	"cmd.restart": { zh: "重启并恢复本会话", en: "Restart and resume this session" },
	"cmd.quit": { zh: "退出（同 /exit）", en: "Quit (same as /exit)" },
	"cmd.switch": {
		zh: "只为本会话切换模型，可直接带模型名",
		en: "Switch model for this session only, by name",
	},
	"cmd.fast": { zh: "切换快速服务档", en: "Toggle the fast service tier" },
	"cmd.slow": { zh: "切换慢速档", en: "Toggle the slow tier" },
	"cmd.modelpreset": { zh: "保存和切换模型预设", en: "Save and switch model presets" },
	"cmd.advisor": { zh: "顾问模型（每轮复查并给建议）", en: "Advisor model (reviews each turn)" },
	"cmd.prewalk": { zh: "一次性模型交接", en: "One-shot model handoff" },
	"cmd.extended-context": { zh: "切换超长上下文", en: "Toggle extended context windows" },
	"cmd.skillful": { zh: "在系统提示里列出技能", en: "List skills in the system prompt" },
	"cmd.session": { zh: "会话管理", en: "Session management" },
	"cmd.fork": { zh: "分叉会话", en: "Fork this session" },
	"cmd.tree": { zh: "浏览会话树", en: "Browse the session tree" },
	"cmd.pin": { zh: "置顶会话", en: "Pin a session" },
	"cmd.unpin": { zh: "取消置顶", en: "Unpin a session" },
	"cmd.move": { zh: "把会话移到其他目录", en: "Move this session to another directory" },
	"cmd.delete": { zh: "删除当前会话", en: "Delete this session" },
	"cmd.fresh": { zh: "重置提供商流状态", en: "Reset provider stream state" },
	"cmd.shake": { zh: "从上下文丢掉大块内容", en: "Drop heavy content from the context" },
	"cmd.handoff": { zh: "生成交接文档并压缩", en: "Write a handoff document and compact" },
	"cmd.seance": { zh: "查阅旧会话但不恢复", en: "Consult a saved session without resuming it" },
	"cmd.dump": { zh: "复制完整记录到剪贴板", en: "Copy the full transcript to the clipboard" },
	"cmd.share": { zh: "加密链接分享会话", en: "Share the session via an encrypted link" },
	"cmd.trace": { zh: "在统计面板查看本会话", en: "Open this session's trace" },
	"cmd.collab": { zh: "实时共享会话", en: "Share this session live" },
	"cmd.join": { zh: "加入共享会话", en: "Join a shared session" },
	"cmd.leave": { zh: "离开共享会话", en: "Leave the shared session" },
	"cmd.plan-review": { zh: "重新打开计划审阅", en: "Reopen the plan review" },
	"cmd.vibe": { zh: "vibe 模式", en: "Vibe mode" },
	"cmd.guided-goal": { zh: "先访谈再设定目标", en: "Interview first, then set a goal" },
	"cmd.loop": { zh: "循环模式", en: "Loop mode" },
	"cmd.queue": { zh: "排队一条消息", en: "Queue a message" },
	"cmd.tan": { zh: "后台处理旁支任务", en: "Run a background agent on side work" },
	"cmd.omfg": { zh: "根据抱怨生成规则", en: "Forge a rule from a complaint" },
	"cmd.cleanse": { zh: "并行修复项目诊断问题", en: "Fix project diagnostics in parallel" },
	"cmd.ratchet": { zh: "为 LLM 流程建评测并迭代", en: "Build an eval for an LLM flow and hill-climb it" },
	"cmd.force": { zh: "强制下一轮使用某个工具", en: "Force the next turn to use a tool" },
	"cmd.forget-approvals": { zh: "清除记住的审批", en: "Forget remembered approvals" },
	"cmd.security": { zh: "安全扫描", en: "Security scans" },
	"cmd.hub": { zh: "子智能体面板", en: "Agent hub" },
	"cmd.computer": { zh: "切换电脑操作能力", en: "Toggle computer use" },
	"cmd.browser": { zh: "切换浏览器可见模式", en: "Toggle the browser's visible mode" },
	"cmd.ssh": { zh: "管理 SSH 主机", en: "Manage SSH hosts" },
	"cmd.local": { zh: "在编辑器打开 local:// 文件", en: "Open a local:// file in the editor" },
	"cmd.live": { zh: "实时语音模式", en: "Realtime voice mode" },
	"cmd.record": { zh: "录制屏幕", en: "Record the screen" },
	"cmd.stats": { zh: "统计面板", en: "Stats dashboard" },
	"cmd.changelog": { zh: "更新日志", en: "Changelog" },
	"cmd.debug": { zh: "调试工具", en: "Debug tools" },
	"cmd.extensions": { zh: "扩展控制中心", en: "Extension control center" },
	"cmd.marketplace": { zh: "插件市场", en: "Plugin marketplace" },
	"cmd.reload-plugins": { zh: "重新加载插件", en: "Reload plugins" },
	"cmd.skills": { zh: "搜索和安装技能", en: "Search and install skills" },
	"more.title": { zh: "命令（{count}）", en: "Commands ({count})" },
	"more.titleAll": { zh: "全部命令（{count}，含高级）", en: "All commands ({count}, with advanced)" },
	"more.heading": { zh: "── {group} ──", en: "── {group} ──" },
	"more.groupExtensions": { zh: "扩展、技能与模板", en: "Extensions, skills and templates" },
	"more.groupAdvanced": { zh: "高级命令", en: "Advanced commands" },
	"more.showAdvanced": { zh: "＋ 显示高级命令（{count}）", en: "＋ Show advanced commands ({count})" },
	"more.help": {
		zh: "输入文字筛选 · Enter 填入输入框 · Esc 关闭",
		en: "Type to filter · Enter puts it in the input · Esc closes",
	},

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

	// Generic lists (`SelectList`)
	"list.searchPrefix": { zh: "  搜索：", en: "  Search: " },
	"list.searchQuery": { zh: "  搜索：{query}", en: "  Search: {query}" },
	"list.typeToSearch": { zh: "  输入文字搜索", en: "  Type to search" },
	"list.noMatch": { zh: "没有匹配项", en: "No matching items" },
	"list.empty": { zh: "暂无项目", en: "No items" },

	// G3 Content cards & Approval dialog
	"card.userLabel": { zh: "你", en: "you" },
	"approval.allowTool": { zh: "允许工具：{name}", en: "Allow tool: {name}" },
	"approval.rememberAlways": { zh: "记住授权（跨会话）", en: "Remember across sessions" },
	"approval.approve": { zh: "允许", en: "Approve" },
	"approval.approveOnce": { zh: "允许一次", en: "Approve Once" },
	"approval.deny": { zh: "拒绝", en: "Deny" },
	"approval.denyAndSend": { zh: "拒绝并发送消息", en: "Deny and send message" },
	"approval.less": { zh: "收起", en: "Less" },
	"approval.details": { zh: "详情", en: "Details" },
	"approval.lessLower": { zh: "收起", en: "less" },
	"approval.detailsLower": { zh: "详情", en: "details" },
	"approval.approveBtnTitle": { zh: "允许本次调用", en: "Approve this call" },
	"approval.denyBtnTitle": { zh: "拒绝本次调用", en: "Deny this call" },
	"approval.summarizeCall": { zh: "收起本次调用的详细信息", en: "Summarize this call" },
	"approval.showDetails": { zh: "显示本次调用的全部详细信息", en: "Show every detail of this call" },
	"approval.hintApprove": { zh: "允许", en: "approve" },
	"approval.hintDeny": { zh: "拒绝", en: "deny" },
	"approval.hintDenyAndSend": { zh: "拒绝并发送", en: "deny and send" },
	"approval.hintChoose": { zh: "选择", en: "choose" },
	"approval.hintSelect": { zh: "确认", en: "select" },
	"approval.hintScroll": { zh: "滚动", en: "scroll" },
	"approval.hintTypeToDeny": { zh: "直接输入可拒绝并引导", en: "type to deny and steer" },
	"approval.secondsRemaining": { zh: "{seconds}秒", en: "{seconds}s" },

	// G4 Glide shell sidebar, robot & routing
	"shell.route": { zh: "路由：{mode}", en: "Route: {mode}" },
	"shell.routeExplicit": { zh: " (主模型指定)", en: " (default: explicit)" },
	"shell.routeMode.local": { zh: "本地", en: "local" },
	"shell.routeMode.balanced": { zh: "均衡", en: "balanced" },
	"shell.routeMode.performance": { zh: "性能", en: "performance" },
	"shell.routeMode.manual": { zh: "手动", en: "manual" },
	"setup.skipHint": { zh: "按 {key} 跳过", en: "Press {key} to skip" },
	"shell.robot.tools": { zh: "工具中", en: "Tools" },
	"shell.robot.thinking": { zh: "思考中", en: "Thinking" },
	"shell.robot.done": { zh: "已完成", en: "Done" },
	"shell.robot.idle": { zh: "待命", en: "Standby" },
	"shell.sidebarHideAscii": { zh: "[- 收起]", en: "[- Hide]" },
	"shell.sidebarHide": { zh: "[ ▾ 收起 ]", en: "[ ▾ Hide ]" },
	"shell.sidebarShowAscii": { zh: "[+ 详情 {key}]", en: "[+ Info {key}]" },
	"shell.sidebarShow": { zh: "[ ▸ 详情 {key} ]", en: "[ ▸ Info {key} ]" },
	"shell.workspace": { zh: "工作目录", en: "Workspace" },
	"shell.context": { zh: "上下文", en: "Context" },
	"shell.summaryPillAscii": { zh: "[* 总结 /summary]", en: "[* Summary /summary]" },
	"shell.summaryPill": { zh: "✦ 任务总结 /summary", en: "✦ Summary /summary" },
	"shell.agentTools": { zh: "{count} 工具", en: "{count} tools" },
	"shell.agentsMore": { zh: "另有 {count} 个", en: "{count} more" },

	// G4 Task summary overlay (`/summary`)
	"summary.title": { zh: "任务总结", en: "Task Summary" },
	"summary.status.inProgress": { zh: "进行中", en: "In progress" },
	"summary.status.completed": { zh: "已完成", en: "Completed" },
	"summary.status.failed": { zh: "失败", en: "Failed" },
	"summary.status.cancelled": { zh: "已取消", en: "Cancelled" },
	"summary.status.empty": { zh: "无任务信息", en: "No task activity" },
	"summary.routeInline": { zh: " · 路由：{mode}", en: " · Route: {mode}" },
	"summary.modelLine": { zh: "模型：{model}{route}", en: "Model: {model}{route}" },
	"summary.turns": {
		zh: "对话轮次：提问 {prompts} · 回复 {replies}",
		en: "Turns: {prompts} prompts · {replies} replies",
	},
	"summary.localSection": { zh: "本地事实总结（离线可用）", en: "Local Factual Summary (offline)" },
	"summary.localEmpty": {
		zh: "当前会话尚未记录任何提问、工具调用、修改文件或子智能体活动。",
		en: "No prompts, tool executions, touched files, or subagent activity recorded yet.",
	},
	"summary.latestPrompt": { zh: "最近请求：{text}", en: "Latest prompt: {text}" },
	"summary.latestReply": { zh: "最近回复：{text}", en: "Latest reply: {text}" },
	"summary.runningTools": { zh: "正在执行工具：{tools}", en: "Running tools: {tools}" },
	"summary.toolErrors": { zh: " ({count}错)", en: " ({count} err)" },
	"summary.toolRunning": { zh: " [运行中]", en: " [running]" },
	"summary.toolsLine": { zh: "工具记录：{items}", en: "Tools: {items}" },
	"summary.noneWord": { zh: "无", en: "None" },
	"summary.touchedFilesCount": { zh: "涉及文件 ({count}):", en: "Touched files ({count}):" },
	"summary.touchedFilesNone": { zh: "涉及文件：无", en: "Touched files: None" },
	"summary.subagentsCount": { zh: "子智能体 ({count}):", en: "Subagents ({count}):" },
	"summary.subagentsNone": { zh: "子智能体：暂无", en: "Subagents: None" },
	"summary.scopeSection": { zh: "上下文范围与费用说明", en: "Context Scope & Cost Notice" },
	"summary.scopeNoModel": {
		zh: "当前未选择模型，仅显示本地事实总结；可用 /model 选择模型后按需生成 AI 总结。",
		en: "No model selected — showing local factual summary only. Select a model with /model to enable AI summary.",
	},
	"summary.scopeWithModel": {
		zh: "触发 AI 总结时，将向当前模型（{model}）发送 {messages} 条脱敏消息摘要（约 {chars} 字符）。",
		en: "Generating an AI summary sends {messages} redacted message excerpts (~{chars} chars) to {model}.",
	},
	"summary.scopeCostNote": {
		zh: "提示：仅在您主动触发时调用模型，可能产生 token 用量与费用；不会修改会话历史，且已过滤凭据。",
		en: "Note: Model is called only on explicit request, may incur token cost, leaves session history untouched, and strips credentials.",
	},
	"summary.aiSection": { zh: "AI 任务总结", en: "AI Task Summary" },
	"summary.aiIdleHint": {
		zh: "按 Enter / g 或点击下方 [ ✦ 生成 AI 总结 ] 发起一次性总结。",
		en: "Press Enter / g or click [ ✦ Generate AI Summary ] below for an on-demand summary.",
	},
	"summary.aiUnavailable": { zh: "当前不可发起 AI 总结。", en: "AI summary is currently unavailable." },
	"summary.aiGenerating": { zh: "正在生成 AI 总结…（按 Esc 取消）", en: "Generating AI summary… (Esc to cancel)" },
	"summary.aiCancelled": {
		zh: "已取消 AI 总结生成，会话历史未受影响。",
		en: "AI summary generation cancelled; session history untouched.",
	},
	"summary.aiFailed": { zh: "生成失败：{reason}", en: "Generation failed: {reason}" },
	"summary.aiUnknownError": { zh: "未知错误", en: "Unknown error" },
	"summary.aiEmptyResponse": { zh: "模型返回了空内容。", en: "Model returned an empty summary." },
	"summary.errNoModel": {
		zh: "当前未选择模型，请先通过 /model 选择模型。",
		en: "No model selected. Pick a model with /model first.",
	},
	"summary.errMissingInfo": { zh: "当前会话尚无任务记录，无需调用模型。", en: "No session activity recorded yet." },
	"summary.errUnavailable": { zh: "AI 总结功能当前不可用。", en: "AI summary generator is unavailable." },
	"summary.errRequestFailed": { zh: "请求失败", en: "Request failed" },
	"summary.btnCancelAscii": { zh: "[x 取消生成 Esc]", en: "[x Cancel Esc]" },
	"summary.btnCancel": { zh: "[ ■ 取消生成 Esc ]", en: "[ ■ Cancel Esc ]" },
	"summary.btnRegenerate": { zh: "重新生成", en: "Regenerate" },
	"summary.btnGenerate": { zh: "生成 AI 总结", en: "Generate AI Summary" },
	"summary.btnCloseAscii": { zh: "[关闭 Esc]", en: "[Close Esc]" },
	"summary.btnClose": { zh: "[ ✕ 关闭 Esc ]", en: "[ ✕ Close Esc ]" },
	"summary.scrollHintAscii": { zh: "Up/Down 滚动", en: "Up/Down scroll" },
	"summary.scrollHint": { zh: "↑↓/滚轮 滚动", en: "↑↓/Wheel scroll" },
	"summary.extraActiveTools": { zh: "{count} 个运行中工具", en: "{count} active" },
	"summary.systemPrompt": {
		zh: "你是 Nightglide 的任务总结助手。请仅根据提供的脱敏会话事实、工具调用、文件和子智能体信息，用简洁清晰的中文要点总结：1) 当前任务目标与进展状态（进行中/完成/失败/取消）；2) 已完成的关键修改或发现；3) 若有错误、阻塞或下一步建议请如实指出。禁止编造未出现的结果、文件或进度。",
		en: "You are Nightglide's task summary assistant. Using ONLY the supplied redacted session facts, conversation excerpts, tools, touched files, and subagents, write a concise bulleted summary covering: 1) current goal and factual status (in progress/completed/failed/cancelled); 2) key work or findings so far; 3) blockers, errors, or clear next step if any. Never invent unstated results, files, or progress.",
	},
	"summary.errNoModelSelected": { zh: "未选择模型，请先通过 /model 选择。", en: "No model selected." },
	"summary.errNoCredentials": {
		zh: "未找到 {model} 的可用凭据（或提供商已禁用），请检查 /login 或 /provider。",
		en: "No API key or credentials available for {model} (or provider disabled).",
	},
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
