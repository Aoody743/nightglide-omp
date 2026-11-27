import { getOAuthCredentialProvider } from "@oh-my-pi/pi-ai/oauth";
import { runProviderSetupWizard as runProviderWizard } from "@oh-my-pi/pi-tui/setup/lazy";
import type { SetupHost, SetupScene } from "@oh-my-pi/pi-tui/setup/scenes/types";
import {
	ALL_SCENES,
	CURRENT_SETUP_VERSION,
	runSetupWizard as runWizard,
	type RunSetupWizardOptions,
	selectSetupScenes as selectScenes,
	type SetupSceneSelectionOptions,
	setupWizardAllowed,
} from "@oh-my-pi/pi-tui/setup/wizard";
import type { Settings } from "../config/settings";
import { canSelfUpdate } from "../cli/update-cli";
import { captureBrowserSession } from "../utils/browser-session";
import { createModelBrowserSource } from "./model-browser-source";
import type { InteractiveModeContext } from "./types";

import {
	cfgColorBlindMode,
	cfgComposerShape,
	cfgSetupVersion,
	cfgSymbolPreset,
	cfgThemeDark,
	cfgThemeLight,
	cfgUpdateAuto,
} from "./settings";
import { cfgDisabledProviders, cfgModelRoleStorage } from "../config/model-settings";
import { listCustomProviders, removeCustomProvider, saveCustomProvider } from "../config/nightglide-custom-providers";
import { cfgNightglideLocalModel, cfgNightglideRoutingMode, isLocalModel } from "../config/nightglide-routing";

export { ALL_SCENES, CURRENT_SETUP_VERSION, setupWizardAllowed };
export type { SetupScene, SetupSceneHost } from "@oh-my-pi/pi-tui/setup/scenes/types";
export { runStartupSplash } from "@oh-my-pi/pi-tui/setup/startup-splash";

/** Bind application preferences and runtime effects to the setup presentation. */
export function createSetupHost(ctx: InteractiveModeContext): SetupHost {
	const modelSource = createModelBrowserSource(ctx.settings, model => ctx.session.effectiveServiceTier(model));
	return {
		ui: ctx.ui,
		get statusLine() {
			return ctx.statusLine;
		},
		get composerShape() {
			return cfgComposerShape.get(ctx.settings);
		},
		get symbolPreset() {
			return cfgSymbolPreset.get(ctx.settings);
		},
		get colorBlindMode() {
			return cfgColorBlindMode.get(ctx.settings);
		},
		get disabledProviders() {
			return cfgDisabledProviders.get(ctx.settings);
		},
		get autoUpdate() {
			return cfgUpdateAuto.get(ctx.settings);
		},
		get routingMode() {
			return cfgNightglideRoutingMode.get(ctx.settings);
		},
		get localModel() {
			return cfgNightglideLocalModel.get(ctx.settings);
		},
		get routingOverrideLayer() {
			const provenance = cfgNightglideRoutingMode.provenance(ctx.settings);
			return provenance !== "global" && provenance !== "default" ? provenance : undefined;
		},
		get authStorage() {
			return ctx.session.modelRegistry.authStorage;
		},
		modelSource,
		getModels: () => ({
			available: ctx.session.modelRegistry.getAvailable("all"),
			all: ctx.session.modelRegistry.getAll("all"),
			current: ctx.session.model,
		}),
		refreshModels: () => ctx.session.modelRegistry.refresh("online-if-uncached"),
		selectModel: async (model, selector) => {
			const projectScope = cfgModelRoleStorage.get(ctx.settings) === "project";
			await ctx.session.setModel(model, "default", { selector, persist: !projectScope });
			if (projectScope) ctx.settings.setProjectModelRole("default", selector);
			await ctx.settings.flush();
		},
		refreshProvider: async provider => {
			// An OAuth alias (`openai-codex-device`) stores its credential under the base provider.
			await ctx.session.modelRegistry.refreshProvider(getOAuthCredentialProvider(provider), "online");
			await ctx.session.refreshScopedModels();
		},
		isLocalModel: model => isLocalModel(model),
		saveRoutingMode: async (mode, localModel) => {
			cfgNightglideRoutingMode.set(ctx.settings, mode);
			if (localModel === null) {
				cfgNightglideLocalModel.set(ctx.settings, undefined);
			} else if (localModel !== undefined) {
				cfgNightglideLocalModel.set(ctx.settings, localModel.trim() || undefined);
			}
			await ctx.settings.flush();
		},
		listCustomProviders: () => listCustomProviders(),
		saveCustomProvider: async input => {
			const saved = await saveCustomProvider(input);
			const registry = ctx.session.modelRegistry;
			if (saved.storeKey) {
				await registry.authStorage.credentials.set(input.id, { type: "api_key", key: saved.storeKey });
			}
			await registry.refresh("online");
			await ctx.session.refreshScopedModels();
			const state = registry.getProviderDiscoveryState(input.id);
			const modelCount = registry.getAll("all").filter(model => model.provider === input.id).length;
			return { modelCount, error: state?.error };
		},
		removeCustomProvider: async id => {
			const removed = await removeCustomProvider(id);
			if (!removed) return false;
			const registry = ctx.session.modelRegistry;
			await registry.authStorage.credentials.remove(id);
			await registry.refresh("online-if-uncached");
			await ctx.session.refreshScopedModels();
			return true;
		},
		saveComposerShape: async shape => {
			cfgComposerShape.set(ctx.settings, shape);
			await ctx.settings.flush();
		},
		saveSymbolPreset: preset => {
			cfgSymbolPreset.set(ctx.settings, preset);
		},
		saveColorBlindMode: enabled => {
			cfgColorBlindMode.set(ctx.settings, enabled);
		},
		saveTheme: (mode, name) => {
			(mode === "dark" ? cfgThemeDark : cfgThemeLight).set(ctx.settings, name);
		},
		canAutoUpdate: () => canSelfUpdate(),
		saveAutoUpdate: async enabled => {
			cfgUpdateAuto.set(ctx.settings, enabled);
			await ctx.settings.flush();
		},
		captureBrowserSession,
		openInBrowser: url => ctx.openInBrowser(url),
		markComplete: version => markSetupWizardComplete(ctx.settings, version),
		playWelcomeIntro: () => ctx.playWelcomeIntro(),
		showError: message => ctx.showError(message),
	};
}

/** Persist completion only after the setup overlay finishes. */
export async function markSetupWizardComplete(settings: Settings, version = CURRENT_SETUP_VERSION): Promise<void> {
	cfgSetupVersion.set(settings, version);
	await settings.flush();
}

/** Select eligible setup scenes using the application's live capabilities. */
export function selectSetupScenes(
	storedVersion: number,
	scenes: readonly SetupScene[],
	ctx?: InteractiveModeContext,
	options: SetupSceneSelectionOptions = {},
): Promise<SetupScene[]> {
	return selectScenes(storedVersion, scenes, ctx ? createSetupHost(ctx) : undefined, options);
}

/** Run setup with application-owned persistence and provider effects. */
export function runSetupWizard(
	ctx: InteractiveModeContext,
	scenes: readonly SetupScene[] = ALL_SCENES,
	options: RunSetupWizardOptions = {},
): Promise<void> {
	return runWizard(createSetupHost(ctx), scenes, options);
}

/** Open provider setup without advancing onboarding or replaying the welcome intro. */
export function runProviderSetupWizard(ctx: InteractiveModeContext): Promise<void> {
	return runProviderWizard(createSetupHost(ctx));
}
