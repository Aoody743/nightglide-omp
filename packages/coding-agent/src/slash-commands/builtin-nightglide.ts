/**
 * Nightglide: `/more` — browse every slash command.
 *
 * A bare `/` lists only the common commands (`nightglide.commonCommands`); this
 * opens the full list, including extension, skill, file and prompt commands.
 * Picking one puts `/name ` in the input box so arguments can be added first.
 */
import {
	type CustomProviderApi,
	isValidBaseUrl,
	isValidProviderId,
	listCustomProviders,
	removeCustomProvider,
	saveCustomProvider,
} from "../config/nightglide-custom-providers";
import type { InteractiveModeContext } from "../modes/types";
import { clearSubmittedText } from "./helpers/draft";
import type { SlashCommandSpec } from "./types";

const ADD_PROVIDER = "＋ 添加自定义提供商";
const API_CHOICES: ReadonlyArray<{ label: string; api: CustomProviderApi }> = [
	{ label: "OpenAI 兼容（/v1/chat/completions）", api: "openai-completions" },
	{ label: "Anthropic 兼容（/v1/messages）", api: "anthropic-messages" },
];

/** Ask until the answer passes `valid`; undefined when the user cancels. */
async function ask(
	ctx: InteractiveModeContext,
	title: string,
	placeholder: string,
	valid: (value: string) => string | undefined,
	secret = false,
): Promise<string | undefined> {
	let prompt = title;
	for (;;) {
		const value = await ctx.showHookInput(prompt, placeholder, secret ? { secret: true } : undefined);
		if (value === undefined) return undefined;
		const problem = valid(value.trim());
		if (!problem) return value.trim();
		prompt = `${title}（${problem}）`;
	}
}

/** Add or edit a custom provider, then rediscover its models and report what was found. */
async function editCustomProvider(
	ctx: InteractiveModeContext,
	existing?: { id: string; baseUrl: string; api: string },
): Promise<void> {
	const taken = new Set((await listCustomProviders()).map(provider => provider.id));
	const id =
		existing?.id ??
		(await ask(ctx, "名称（小写字母、数字和 -，例如 my-relay）", "my-relay", value =>
			!isValidProviderId(value) ? "格式不对" : taken.has(value) ? "已存在，请到列表里编辑" : undefined,
		));
	if (!id) return;
	const baseUrl = await ask(ctx, `${id} · Base URL`, existing?.baseUrl ?? "http://127.0.0.1:8000/v1", value =>
		isValidBaseUrl(value) ? undefined : "需要 http:// 或 https:// 开头的地址",
	);
	if (!baseUrl) return;
	const apiLabel = await ctx.showHookSelector(
		`${id} · 接口类型`,
		API_CHOICES.map(choice => choice.label),
	);
	const api = API_CHOICES.find(choice => choice.label === apiLabel)?.api;
	if (!api) return;
	const key = await ctx.showHookInput(
		existing ? `${id} · API Key（留空保持不变）` : `${id} · API Key（本地服务不需要可留空）`,
		"",
		{ secret: true },
	);
	if (key === undefined) return;

	const saved = await saveCustomProvider({ id, baseUrl, api, apiKey: key });
	const registry = ctx.session.modelRegistry;
	if (saved.storeKey) await registry.authStorage.credentials.set(id, { type: "api_key", key: saved.storeKey });
	ctx.showStatus(`${id}：正在获取模型列表…`);
	await registry.refresh("online");
	const found = registry.getAll("all").filter(model => model.provider === id).length;
	if (found > 0) {
		ctx.showStatus(`${id}：已保存，发现 ${found} 个模型。用 /model 选择。`);
	} else {
		ctx.showWarning(`${id}：已保存，但没有拿到模型列表。请检查 Base URL、接口类型和 Key（可用 /provider 修改）。`);
	}
}

/** Remove a custom provider and its stored key. */
async function deleteCustomProvider(ctx: InteractiveModeContext, id: string): Promise<void> {
	const ok = await ctx.showHookConfirm(`删除 ${id}？`, "会从 models.yml 删除这项配置，并删除保存的 Key。");
	if (!ok) return;
	await removeCustomProvider(id);
	const registry = ctx.session.modelRegistry;
	await registry.authStorage.credentials.remove(id);
	await registry.refresh("online-if-uncached");
	ctx.showStatus(`已删除 ${id}。`);
}

/** The add form, straight away (the `/login` list's "add a custom provider" row). */
export async function addCustomProvider(ctx: InteractiveModeContext): Promise<void> {
	await editCustomProvider(ctx);
}

/** `/provider`: list custom providers; add, edit or delete one. With none yet, go straight to adding. */
export async function manageCustomProviders(ctx: InteractiveModeContext): Promise<void> {
	const providers = await listCustomProviders();
	if (providers.length === 0) return editCustomProvider(ctx);
	const rows = providers.map(provider => ({ label: provider.id, description: provider.baseUrl }));
	const choice = await ctx.showHookSelector("自定义提供商（Base URL + Key）", [{ label: ADD_PROVIDER }, ...rows]);
	if (!choice) return;
	if (choice === ADD_PROVIDER) return editCustomProvider(ctx);
	const provider = providers.find(entry => entry.id === choice);
	if (!provider) return;
	const action = await ctx.showHookSelector(`${provider.id} · ${provider.baseUrl}`, ["编辑", "删除"]);
	if (action === "编辑") return editCustomProvider(ctx, provider);
	if (action === "删除") return deleteCustomProvider(ctx, provider.id);
}

export const BUILTIN_NIGHTGLIDE_SLASH_COMMANDS: ReadonlyArray<SlashCommandSpec> = [
	{
		name: "provider",
		icon: "settings",
		description: "Add, edit or remove a custom provider (Base URL + API key)",
		handleTui: async (_command, runtime) => {
			clearSubmittedText(runtime);
			try {
				await manageCustomProviders(runtime.ctx);
			} catch (err) {
				runtime.ctx.showError(`自定义提供商：${err instanceof Error ? err.message : String(err)}`);
			}
		},
	},
	{
		name: "more",
		icon: "action",
		description: "Browse every slash command",
		handleTui: async (_command, runtime) => {
			clearSubmittedText(runtime);
			const { ctx } = runtime;
			const commands = [...ctx.slashCommandList].sort((a, b) => a.name.localeCompare(b.name));
			// One row per command, description inline: the selector hides per-option descriptions
			// once a list this long overflows the screen.
			const items = commands.map(command => {
				const description = (command.getAutocompleteDescription?.() ?? command.description ?? "")
					.replace(/\s+/g, " ")
					.trim();
				return description ? `/${command.name}  ${description}` : `/${command.name}`;
			});
			const choice = await ctx.showHookSelector(`全部命令（${items.length}）`, items);
			const name = choice?.split(" ")[0];
			if (name) ctx.editor.setText(`${name} `);
		},
	},
];
