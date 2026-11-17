/**
 * Nightglide routing: LOCAL/BALANCED/PERFORMANCE/MANUAL model routing on top of
 * the stock model-role machinery.
 *
 * Everything here composes existing primitives — `settings.overrideModelRoles`
 * and `installRetryFallbackRole` (session-scoped, never persisted) — so the
 * model resolver, retry fallback chains, and subagent `@role` expansion keep
 * their stock semantics. `manual` (the default) changes nothing.
 */
import { modelKind, type Model } from "@oh-my-pi/pi-catalog/types";
import { pickDefaultAvailableModel, resolveModelRoleValue, formatModelString } from "./model-resolver";
import { register } from "./registry";
import { installRetryFallbackRole, type RetryFallbackChains } from "../session/retry-fallback-chains";
import { cfgRetryFallbackChains } from "../session/settings";
import type { Settings } from "./settings";
import { cfgToolsApproval, cfgToolsApprovalMode } from "../tools/settings";

/** Routing modes. `manual` is the default and changes nothing. */
export type NightglideRoutingMode = "manual" | "local" | "balanced" | "performance";

export const cfgNightglideRoutingMode = register({
	id: "nightglide.routingMode",
	type: "enum",
	values: ["manual", "local", "balanced", "performance"] as const,
	default: "manual",
	ui: {
		tab: "model",
		group: "Nightglide Routing",
		label: "Routing Mode",
		description:
			"How session and subagent models are routed. Manual keeps your configured model roles untouched. Local binds every chat role to a local model with local-only fallbacks — no cloud selector is assigned. Balanced keeps your default, thinking and architect roles and prepends a local fallback to them, while small jobs run locally first. Performance points the small roles at your default (strongest) model and falls back to local.",
		options: [
			{
				value: "manual",
				label: "Manual",
				description: "Use your configured model roles exactly as they are (default)",
			},
			{
				value: "local",
				label: "Local",
				description:
					"Bind session and subagent models to a local model; startup fails when no local model is available",
			},
			{
				value: "balanced",
				label: "Balanced",
				description: "Keep strong roles as configured with a local fallback; run small roles locally first",
			},
			{
				value: "performance",
				label: "Performance",
				description: "Point small roles at your default (strongest) model, falling back to local",
			},
		],
	},
});

/** Optional explicit local model selector (`provider/model-id`); empty auto-detects. */
export const cfgNightglideLocalModel = register({
	id: "nightglide.localModel",
	type: "string",
	default: undefined,
	ui: {
		tab: "model",
		group: "Nightglide Routing",
		label: "Local Model",
		description:
			'Model selector Nightglide Local routing must use, e.g. "omlx/my-model". Leave empty to auto-detect from loopback or known local providers (omlx, ollama, lm-studio, llama.cpp, vllm)',
	},
});

/** Provider ids treated as local regardless of their baseUrl. */
const KNOWN_LOCAL_PROVIDER_IDS: ReadonlySet<string> = new Set([
	"omlx",
	"ollama",
	"lm-studio",
	"lmstudio",
	"vllm",
	"llamacpp",
	"llama.cpp",
	"jan",
	"gpustack",
	"localai",
]);

/** Chat roles Nightglide LOCAL binds to the local model. Kind roles (image/web/…) are never touched. */
export const NIGHTGLIDE_LOCAL_CHAT_ROLES: readonly string[] = [
	"default",
	"smol",
	"slow",
	"plan",
	"task",
	"advisor",
	"memory",
	"tiny",
	"widget",
	"commit",
];

/** Roles BALANCED routes through the local model first. */
export const NIGHTGLIDE_BALANCED_LOCAL_ROLES: readonly string[] = ["smol", "tiny", "memory", "widget", "task"];

/** Roles PERFORMANCE points at the default (strongest) model. */
export const NIGHTGLIDE_PERFORMANCE_STRONG_ROLES: readonly string[] = [
	"smol",
	"tiny",
	"memory",
	"widget",
	"task",
	"advisor",
];

/** Whether `provider` counts as a local provider by id alone. */
export function isLocalProviderId(provider: string): boolean {
	return KNOWN_LOCAL_PROVIDER_IDS.has(provider.toLowerCase());
}

/** Whether a baseUrl serves a loopback endpoint (127.0.0.1 / localhost / ::1). */
export function isLoopbackBaseUrl(baseUrl: string | undefined): boolean {
	if (!baseUrl) return false;
	let hostname: string;
	try {
		hostname = new URL(baseUrl).hostname.toLowerCase();
	} catch {
		return false;
	}
	return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname === "[::1]";
}

/** Whether a model is served locally: loopback baseUrl or a known local provider id. */
export function isLocalModel(model: Pick<Model, "provider" | "baseUrl">): boolean {
	return isLocalProviderId(model.provider) || isLoopbackBaseUrl(model.baseUrl);
}

/** What the session reads to apply routing. Structural so tests can mock the registry. */
export interface NightglideModelSource {
	getAvailable(kind?: "chat" | "all"): Model[];
	getDiscoverableProviders(): string[];
	refreshDiscoverableProviders?(
		providerIds: readonly string[],
		strategy: "offline" | "online-if-uncached",
	): Promise<void> | void;
	hasModelAuth?(model: Model): boolean;
}

export interface ResolvedLocalModel {
	/** Local chat models, preferred first. */
	models: Model[];
	/** When empty, why no local model was found. */
	reason?: string;
	/** Whether `nightglide.localModel` pinned the selection. */
	explicit: boolean;
}

/**
 * Find the local model Nightglide routing should use.
 *
 * `nightglide.localModel` wins when it resolves against the chat catalog.
 * Otherwise the first local chat model available wins, preferring known local
 * provider ids over loopback baseUrl matches. Returns no model plus a reason
 * when nothing local is available.
 */
export function resolveLocalModel(settings: Settings, models: NightglideModelSource): ResolvedLocalModel {
	const explicitSelector = cfgNightglideLocalModel.get(settings)?.trim();
	const available = models.getAvailable("chat").filter(model => modelKind(model) === "chat");
	if (explicitSelector) {
		const [selectorProvider, ...rest] = explicitSelector.split("/");
		const selectorId = rest.join("/");
		const matched = available.filter(
			model =>
				(selectorProvider && selectorId
					? model.provider === selectorProvider && model.id === selectorId
					: model.id === explicitSelector) && isLocalModel(model),
		);
		if (matched.length === 0) {
			const localExists = available.some(isLocalModel);
			return {
				models: [],
				explicit: true,
				reason: localExists
					? `nightglide.localModel "${explicitSelector}" does not match an available local model`
					: `nightglide.localModel "${explicitSelector}" does not match an available model`,
			};
		}
		return { models: matched, explicit: true };
	}
	const local = available.filter(isLocalModel);
	if (local.length === 0) {
		return { models: [], explicit: false, reason: "no available model runs on a loopback or known local provider" };
	}
	const byProvider = new Map<string, Model[]>();
	for (const model of local) {
		const group = byProvider.get(model.provider);
		if (group) group.push(model);
		else byProvider.set(model.provider, [model]);
	}
	const ordered: Model[] = [];
	// Known local provider ids first (omlx/ollama/…), then loopback-only providers, both in catalog order.
	for (const preferKnown of [true, false]) {
		for (const group of byProvider.values()) {
			if (isLocalProviderId(group[0].provider) === preferKnown) ordered.push(...group);
		}
	}
	return { models: ordered, explicit: false };
}

/** Result of one routing application, kept for status display and diagnostics. */
export interface AppliedNightglideRouting {
	mode: NightglideRoutingMode;
	/** Selector routing bound as the local primary (`provider/id`); undefined when no local model exists. */
	localSelector?: string;
	/** Providers routing treated as local during this application. */
	localProviders: ReadonlySet<string>;
	/** Whether `nightglide.localModel` pinned the local selection. */
	explicitLocal: boolean;
	/** Human-readable decision log, one entry per applied change (or degradation). */
	reasons: string[];
}

/** Options for {@link applyNightglideRouting}. */
export interface NightglideRoutingOptions {
	/** A CLI `--model` pinned the main session model; routing must not reassign `default`. */
	cliModelExplicit?: boolean;
	/**
	 * Called when no local model is cached and LOCAL mode needs one. Receives the
	 * discoverable provider ids worth refreshing (loopback/local providers only).
	 */
	refreshLocalProviders?: (providerIds: string[], strategy: "offline" | "online-if-uncached") => Promise<void> | void;
}

const appliedRouting = new WeakMap<Settings, AppliedNightglideRouting>();

/** The routing last applied to `settings` in this process, or undefined (manual, resume, never applied). */
export function getAppliedNightglideRouting(settings: Settings): AppliedNightglideRouting | undefined {
	return appliedRouting.get(settings);
}

/** Providers among the discoverable set that are worth a refresh for local routing. */
function localDiscoverableProviders(models: NightglideModelSource): string[] {
	return models.getDiscoverableProviders().filter(provider => isLocalProviderId(provider));
}

/**
 * Apply the configured Nightglide routing mode to `settings` (session-scoped
 * role overrides + fallback chains; nothing is persisted). Returns undefined
 * for `manual` or when routing already applied to this settings instance.
 *
 * Throws only in LOCAL mode when no local model is available — the session
 * must not start on an unavailable routing promise.
 */
export async function applyNightglideRouting(
	settings: Settings,
	models: NightglideModelSource,
	options: NightglideRoutingOptions = {},
): Promise<AppliedNightglideRouting | undefined> {
	const mode = cfgNightglideRoutingMode.get(settings);
	if (mode === "manual") return undefined;
	if (appliedRouting.has(settings)) return appliedRouting.get(settings);

	const reasons: string[] = [];
	let resolved = resolveLocalModel(settings, models);
	// LOCAL mode with a cold discovery cache: one bounded refresh over local
	// providers only (loopback endpoints — never a cloud catalog fetch), then
	// re-check. BALANCED/PERFORMANCE treat local as optional and never refresh.
	if (resolved.models.length === 0 && mode === "local" && options.refreshLocalProviders) {
		const providers = localDiscoverableProviders(models);
		if (providers.length > 0) {
			reasons.push(`no cached local model; refreshing local providers: ${providers.join(", ")}`);
			await options.refreshLocalProviders(providers, "online-if-uncached");
			resolved = resolveLocalModel(settings, models);
		}
	}

	const localProviders = new Set(resolved.models.map(model => model.provider));
	const localSelector = resolved.models.length > 0 ? formatModelString(resolved.models[0]) : undefined;
	const applied: AppliedNightglideRouting = {
		mode,
		localSelector,
		localProviders,
		explicitLocal: resolved.explicit,
		reasons,
	};

	if (resolved.models.length === 0) {
		if (mode === "local") {
			throw new Error(
				`nightglide.routingMode=local requires a local model, but none was available: ${resolved.reason ?? "no local model found"}. ` +
					"Start a local server (e.g. `omlx serve`, `ollama serve`, LM Studio) or set nightglide.localModel to an available local model.",
			);
		}
		reasons.push(
			`no local model available (${resolved.reason ?? "unknown"}); ${mode} routing degraded to your configured model roles`,
		);
		// BALANCED: without a local model there is nothing to reroute — the small
		// roles keep their configured models and the default needs no local
		// fallback. PERFORMANCE still lifts the small roles to the strongest tier;
		// it simply has no local chain entry to append.
		if (mode === "balanced") {
			appliedRouting.set(settings, applied);
			return applied;
		}
	}

	if (mode === "local") {
		const chain = resolved.models.map(formatModelString);
		// With an explicit CLI `--model` the user pinned the main session model;
		// routing only expresses subagent/auxiliary intent, so `default` stays.
		for (const role of NIGHTGLIDE_LOCAL_CHAT_ROLES) {
			if (role === "default" && options.cliModelExplicit) {
				reasons.push(`default stays on the CLI --model pin; local-only fallback chain installed`);
				installRoleChainOnly(settings, "default", chain);
				continue;
			}
			installRetryFallbackRole(settings, role, { primary: localSelector!, chain });
			reasons.push(`${role} → ${localSelector} (local routing: session and subagent models bound to local models)`);
		}
		appliedRouting.set(settings, applied);
		return applied;
	}

	if (mode === "balanced") {
		for (const role of NIGHTGLIDE_BALANCED_LOCAL_ROLES) {
			// The user's pre-routing value (if any) becomes the chain tail: local
			// first, then whatever the role was configured with. A role with no
			// configured value stays strictly local — a `@smol` chain entry would
			// resolve back to the local primary after the override and only add a
			// dead entry.
			const original = settings.getModelRole(role)?.trim();
			const chain = original ? [localSelector!, original] : [localSelector!];
			installRetryFallbackRole(settings, role, { primary: localSelector!, chain });
			reasons.push(
				`${role} → ${localSelector}${original ? ` with fallback to ${original}` : " (no prior configuration; strictly local fallback)"} (balanced)`,
			);
		}
		// Strong roles keep their configured models; the default chain gains a
		// leading local entry so a cloud failure lands on the local model.
		installRoleChainOnly(settings, "default", [localSelector!, ...configuredChain(settings, "default")]);
		reasons.push(`default keeps its configured model with local fallback prepended (balanced)`);
		appliedRouting.set(settings, applied);
		return applied;
	}

	// performance
	const strongest = resolveStrongestModel(settings, models);
	if (!strongest) {
		reasons.push(`no default model available; performance routing left your configured model roles untouched`);
		appliedRouting.set(settings, applied);
		return applied;
	}
	// The default chain leads with the strongest tier and the local fallback,
	// keeping any user-configured entries at the tail.
	const performanceChain = [
		strongest,
		...(localSelector ? [localSelector] : []),
		...configuredChain(settings, "default"),
	];
	for (const role of NIGHTGLIDE_PERFORMANCE_STRONG_ROLES) {
		installRetryFallbackRole(settings, role, { primary: strongest, chain: performanceChain });
		reasons.push(`${role} → ${strongest} (performance: default model, strongest tier)`);
	}
	installRoleChainOnly(settings, "default", performanceChain);
	reasons.push(`default keeps its configured model with ${localSelector ?? "no"} local fallback (performance)`);
	appliedRouting.set(settings, applied);
	return applied;
}

/** `role`'s configured fallback chain entries, or empty. */
function configuredChain(settings: Settings, role: string): string[] {
	const chains = cfgRetryFallbackChains.get(settings);
	const chain = chains?.[role];
	return Array.isArray(chain) ? chain.filter(entry => typeof entry === "string") : [];
}

/**
 * Install `chain` for `role` without reassigning the role's model: the role
 * keeps its configured primary and gains an explicit fallback chain.
 */
function installRoleChainOnly(settings: Settings, role: string, chain: string[]): void {
	const chains: RetryFallbackChains = { [role]: chain };
	const existing = cfgRetryFallbackChains.get(settings);
	for (const key in existing) {
		if (key !== role) chains[key] = existing[key];
	}
	cfgRetryFallbackChains.override(settings, chains);
}

/**
 * The default (strongest) model selector for PERFORMANCE routing: the
 * configured default role's resolved model, else the startup fallback pick.
 * Returns a concrete `provider/id` selector, or undefined when nothing resolves.
 */
function resolveStrongestModel(settings: Settings, models: NightglideModelSource): string | undefined {
	const defaultRoleValue = settings.getModelRole("default");
	const available = models.getAvailable("chat");
	const resolved = resolveModelRoleValue(defaultRoleValue, available, { settings });
	if (resolved.model) return formatModelString(resolved.model);
	const pick = pickDefaultAvailableModel(available.filter(model => models.hasModelAuth?.(model) ?? true));
	return pick ? formatModelString(pick) : undefined;
}

// ─────────────────────────────────────────────────────────────────────────
// Headless approval default warning (print/-p and piped stdin paths)
// ─────────────────────────────────────────────────────────────────────────

/**
 * The warning to print on stderr when a headless run would execute with the
 * default `yolo` approval without the user expressing any approval intent:
 * no `--approval-mode`/`--auto-approve` flag, no `tools.approvalMode` in any
 * settings layer or env var, and no per-tool `tools.approval` entries.
 * Undefined when approvals are explicitly configured or the effective mode
 * is not `yolo`.
 */
export function headlessApprovalWarning(
	settings: Settings,
	flags: { approvalMode?: string; autoApprove?: boolean } = {},
): string | undefined {
	if (flags.approvalMode || flags.autoApprove) return undefined;
	if (cfgToolsApprovalMode.isConfigured(settings)) return undefined;
	if (Object.keys(cfgToolsApproval.get(settings)).length > 0) return undefined;
	if (cfgToolsApprovalMode.get(settings) !== "yolo") return undefined;
	return "warning: headless approval defaults to yolo (writes/execs run without approval); pass --approval-mode always-ask to restrict";
}
