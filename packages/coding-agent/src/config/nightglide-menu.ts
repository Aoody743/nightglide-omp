/**
 * Nightglide: the common commands the `/` menu lists before anything is typed.
 *
 * Every other command stays available: typing part of a name finds it, and
 * `/more` browses the full list. Nothing here removes or renames a command.
 */
import type { SlashCommand } from "@oh-my-pi/pi-tui/autocomplete";
import { register } from "./registry";

/** Default common commands, in menu order, with the Chinese description the menu shows. */
export const NIGHTGLIDE_COMMON_COMMANDS: ReadonlyArray<{ name: string; description: string }> = [
	{ name: "new", description: "会话 · 开始新会话" },
	{ name: "resume", description: "会话 · 打开以前的会话" },
	{ name: "clear", description: "会话 · 清空当前对话" },
	{ name: "compact", description: "会话 · 压缩上下文" },
	{ name: "export", description: "会话 · 导出对话" },
	{ name: "copy", description: "会话 · 复制回复内容" },
	{ name: "model", description: "模型 · 切换模型" },
	{ name: "effort", description: "模型 · 调整思考强度" },
	{ name: "setup", description: "模型 · 设置向导（提供商与模型）" },
	{ name: "login", description: "模型 · 登录提供商" },
	{ name: "theme", description: "外观 · 切换主题" },
	{ name: "settings", description: "外观 · 打开设置" },
	{ name: "plan", description: "工作 · 计划模式" },
	{ name: "tools", description: "工作 · 查看可用工具" },
	{ name: "mcp", description: "工作 · 管理 MCP 服务器" },
	{ name: "context", description: "工作 · 查看上下文用量" },
	{ name: "hotkeys", description: "其他 · 快捷键" },
	{ name: "more", description: "其他 · 浏览全部命令" },
	{ name: "exit", description: "其他 · 退出" },
];

const COMMON_DESCRIPTIONS = new Map(NIGHTGLIDE_COMMON_COMMANDS.map(entry => [entry.name, entry.description]));

export const cfgNightglideCommonCommands = register({
	id: "nightglide.commonCommands",
	type: "array",
	default: NIGHTGLIDE_COMMON_COMMANDS.map(entry => entry.name),
	ui: {
		tab: "interaction",
		group: "Input",
		label: "Common Commands",
		editor: "json",
		description:
			'Commands the "/" menu lists before anything is typed, in order. Every other command is still found by typing its name, or browsed with /more. A JSON list of command names, e.g. ["new", "model"].',
	},
	validate: raw => {
		if (raw === undefined) return;
		if (!Array.isArray(raw) || raw.some(entry => typeof entry !== "string" || entry.trim().length === 0)) {
			throw new Error("nightglide.commonCommands must be a list of command names");
		}
	},
});

/**
 * A live description without its English lead word: `Model: omlx/endless` → `omlx/endless`.
 */
function liveDetail(live: string | undefined): string | undefined {
	const detail = live?.replace(/^[A-Za-z][A-Za-z ]*:\s*/, "").trim();
	return detail ? detail : undefined;
}

/**
 * Mark the common commands in an autocomplete list: each listed name gets its menu rank and, for
 * the default commands, a Chinese description — followed by the command's live state, when it
 * has one, in parentheses. Names may be given with or without the leading slash; unknown names
 * are skipped, and user-added commands keep their own descriptions.
 */
export function markCommonCommands(commands: readonly SlashCommand[], names: readonly string[]): SlashCommand[] {
	const rank = new Map<string, number>();
	for (const raw of names) {
		const name = raw.trim().replace(/^\//, "");
		if (name && !rank.has(name)) rank.set(name, rank.size);
	}
	return commands.map(command => {
		const featuredRank = rank.get(command.name);
		if (featuredRank === undefined) return command;
		const description = COMMON_DESCRIPTIONS.get(command.name);
		if (!description) return { ...command, featuredRank };
		return {
			...command,
			featuredRank,
			getAutocompleteDescription: () => {
				// Called on the original command: a live description may read its own `this`.
				const detail = liveDetail(command.getAutocompleteDescription?.());
				return detail ? `${description}（${detail}）` : description;
			},
		};
	});
}
