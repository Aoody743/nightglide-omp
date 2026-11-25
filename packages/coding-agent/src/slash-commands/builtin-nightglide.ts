/**
 * Nightglide: `/provider` (custom providers) and `/more` (the grouped command list).
 *
 * A bare `/` lists only the common commands; `/more` lists them by group with the
 * standard ones and extension, skill, file and prompt commands, and keeps the
 * advanced tier behind a "show advanced" row. Picking one puts `/name ` in the
 * input box so arguments can be added first.
 */
import {
	type CustomProviderApi,
	isValidBaseUrl,
	isValidProviderId,
	listCustomProviders,
	removeCustomProvider,
	saveCustomProvider,
} from "../config/nightglide-custom-providers";
import { t } from "@oh-my-pi/pi-tui/i18n";
import { buildMoreRows } from "../config/nightglide-menu";
import type { InteractiveModeContext } from "../modes/types";
import { clearSubmittedText } from "./helpers/draft";
import type { SlashCommandSpec } from "./types";

const apiChoices = (): ReadonlyArray<{ label: string; api: CustomProviderApi }> => [
	{ label: t("provider.apiOpenAI"), api: "openai-completions" },
	{ label: t("provider.apiAnthropic"), api: "anthropic-messages" },
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
		prompt = t("provider.retry", { title, problem });
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
		(await ask(ctx, t("provider.name"), "my-relay", value =>
			!isValidProviderId(value) ? t("provider.nameBad") : taken.has(value) ? t("provider.nameTaken") : undefined,
		));
	if (!id) return;
	const baseUrl = await ask(
		ctx,
		t("provider.baseUrl", { id }),
		existing?.baseUrl ?? "http://127.0.0.1:8000/v1",
		value => (isValidBaseUrl(value) ? undefined : t("provider.baseUrlBad")),
	);
	if (!baseUrl) return;
	const choices = apiChoices();
	const apiLabel = await ctx.showHookSelector(
		t("provider.api", { id }),
		choices.map(choice => choice.label),
	);
	const api = choices.find(choice => choice.label === apiLabel)?.api;
	if (!api) return;
	const key = await ctx.showHookInput(existing ? t("provider.keyEdit", { id }) : t("provider.keyNew", { id }), "", {
		secret: true,
	});
	if (key === undefined) return;

	const saved = await saveCustomProvider({ id, baseUrl, api, apiKey: key });
	const registry = ctx.session.modelRegistry;
	if (saved.storeKey) await registry.authStorage.credentials.set(id, { type: "api_key", key: saved.storeKey });
	ctx.showStatus(t("provider.fetching", { id }));
	await registry.refresh("online");
	const found = registry.getAll("all").filter(model => model.provider === id).length;
	if (found > 0) {
		ctx.showStatus(t("provider.found", { id, count: found }));
	} else {
		ctx.showWarning(t("provider.noneFound", { id }));
	}
}

/** Remove a custom provider and its stored key. */
async function deleteCustomProvider(ctx: InteractiveModeContext, id: string): Promise<void> {
	const ok = await ctx.showHookConfirm(t("provider.deleteTitle", { id }), t("provider.deleteBody"));
	if (!ok) return;
	await removeCustomProvider(id);
	const registry = ctx.session.modelRegistry;
	await registry.authStorage.credentials.remove(id);
	await registry.refresh("online-if-uncached");
	ctx.showStatus(t("provider.deleted", { id }));
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
	const add = t("provider.add");
	const choice = await ctx.showHookSelector(t("provider.listTitle"), [{ label: add }, ...rows]);
	if (!choice) return;
	if (choice === add) return editCustomProvider(ctx);
	const provider = providers.find(entry => entry.id === choice);
	if (!provider) return;
	const edit = t("provider.edit");
	const remove = t("provider.delete");
	const action = await ctx.showHookSelector(`${provider.id} · ${provider.baseUrl}`, [edit, remove]);
	if (action === edit) return editCustomProvider(ctx, provider);
	if (action === remove) return deleteCustomProvider(ctx, provider.id);
}

/**
 * `/more`: the grouped command list. Advanced commands sit behind the closing
 * leading "show advanced" row; picking a command puts `/name ` in the input box.
 */
async function browseCommands(ctx: InteractiveModeContext, showAdvanced: boolean): Promise<void> {
	const rows = buildMoreRows(ctx.slashCommandList, showAdvanced);
	const disabledIndices = rows.flatMap((row, index) => (row.kind === "heading" ? [index] : []));
	const count = rows.filter(row => row.kind === "command").length;
	const title = showAdvanced ? t("more.titleAll", { count }) : t("more.title", { count });
	// Open on the first command, or on the first advanced one once they are shown.
	const advancedHeading = showAdvanced ? rows.findLastIndex(row => row.kind === "heading") : -1;
	const firstCommand = rows.findIndex((row, index) => row.kind === "command" && index > advancedHeading);
	const choice = await ctx.showHookSelector(
		title,
		rows.map(row => row.label),
		{ disabledIndices, initialIndex: Math.max(0, firstCommand), helpText: t("more.help") },
	);
	const picked = rows.find(row => row.label === choice);
	if (picked?.kind === "showAdvanced") return browseCommands(ctx, true);
	if (picked?.kind === "command") ctx.editor.setText(`/${picked.name} `);
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
				runtime.ctx.showError(t("provider.error", { message: err instanceof Error ? err.message : String(err) }));
			}
		},
	},
	{
		name: "more",
		icon: "action",
		description: "Browse every slash command",
		handleTui: async (_command, runtime) => {
			clearSubmittedText(runtime);
			await browseCommands(runtime.ctx, false);
		},
	},
];
