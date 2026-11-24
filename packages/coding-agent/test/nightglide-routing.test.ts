import { afterEach, describe, expect, it, spyOn } from "bun:test";
import * as os from "node:os";
import * as path from "node:path";
import type { Model } from "@oh-my-pi/pi-catalog/types";
import { buildModel } from "@oh-my-pi/pi-catalog/build";
import {
	applyNightglideRouting,
	getAppliedNightglideRouting,
	NIGHTGLIDE_LOCAL_CHAT_ROLES,
	NIGHTGLIDE_PERFORMANCE_STRONG_ROLES,
	resolveLocalModel,
	type NightglideModelSource,
} from "@oh-my-pi/pi-coding-agent/config/nightglide-routing";
import {
	resolveAgentModelSelection,
	resolveConfiguredModelPatterns,
} from "@oh-my-pi/pi-coding-agent/config/model-resolver";
import { invalidModelSelectorReason } from "@oh-my-pi/pi-coding-agent/task/structured-subagent";
import {
	findRetryFallbackCandidates,
	getRetryFallbackChains,
	resolveRetryFallbackChainKey,
} from "@oh-my-pi/pi-coding-agent/session/retry-fallback-chains";
import { cfgRetryFallbackChains } from "@oh-my-pi/pi-coding-agent/session/settings";
import { Settings } from "@oh-my-pi/pi-coding-agent/config/settings";
import {
	approvalRestrictions,
	resolveApproval,
	resolveApprovalFromContext,
} from "@oh-my-pi/pi-coding-agent/tools/approval";
import {
	cfgToolsApproval,
	cfgToolsApprovalMode,
	cfgToolsRestrictedFolders,
} from "@oh-my-pi/pi-coding-agent/tools/settings";

// ─────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────

function buildTestModel(provider: string, id: string, baseUrl: string): Model {
	return buildModel({
		id,
		name: id,
		api: "openai-completions",
		provider,
		baseUrl,
		reasoning: false,
		input: ["text"],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow: 32_000,
		maxTokens: 8_000,
	});
}

const OMLX = buildTestModel("omlx", "qwen3-local", "http://127.0.0.1:8000/v1");
const OLLAMA = buildTestModel("ollama", "llama3-local", "http://127.0.0.1:11434/v1");
const LOOPBACK_CUSTOM = buildTestModel("mybox", "custom-x", "http://localhost:9999/v1");
const CLOUD_A = buildTestModel("anthropic", "claude-sonnet-5-5", "https://api.anthropic.com");
const CLOUD_B = buildTestModel("openai", "gpt-4o-mini", "https://api.openai.com/v1");

const LOCAL_MODELS = [OMLX, OLLAMA, LOOPBACK_CUSTOM];
const CLOUD_MODELS = [CLOUD_A, CLOUD_B];

function source(
	models: Model[],
	options: {
		discoverable?: string[];
		refresh?: (providerIds: string[], strategy: "offline" | "online-if-uncached") => Promise<void> | void;
		hasAuth?: (model: Model) => boolean;
	} = {},
): NightglideModelSource {
	return {
		getAvailable: (kind: "chat" | "all" = "chat") =>
			kind === "all" ? models : models.filter(model => (model.kind ?? "chat") === "chat"),
		getDiscoverableProviders: () => options.discoverable ?? [],
		refreshDiscoverableProviders: options.refresh,
		hasModelAuth: options.hasAuth ?? (() => true),
	};
}

function roleSnapshot(settings: Settings): Record<string, string | undefined> {
	return { ...settings.getModelRoles() };
}

const selectorOf = (model: Model): string => `${model.provider}/${model.id}`;

// ─────────────────────────────────────────────────────────────────────────
// resolveLocalModel
// ─────────────────────────────────────────────────────────────────────────

describe("resolveLocalModel", () => {
	it("finds local models by known provider id and loopback baseUrl", () => {
		const resolved = resolveLocalModel(Settings.isolated(), source([...CLOUD_MODELS, ...LOCAL_MODELS]));
		expect(resolved.models.map(selectorOf)).toEqual(["omlx/qwen3-local", "ollama/llama3-local", "mybox/custom-x"]);
		expect(resolved.reason).toBeUndefined();
	});

	it("prefers known local provider ids over loopback-only providers", () => {
		const resolved = resolveLocalModel(Settings.isolated(), source([LOOPBACK_CUSTOM, OLLAMA]));
		expect(resolved.models[0]?.provider).toBe("ollama");
	});

	it("honors an explicit nightglide.localModel selector", () => {
		const settings = Settings.isolated({ "nightglide.localModel": "ollama/llama3-local" });
		const resolved = resolveLocalModel(settings, source([...LOCAL_MODELS, ...CLOUD_MODELS]));
		expect(resolved.explicit).toBe(true);
		expect(resolved.models.map(model => model.provider)).toEqual(["ollama"]);
	});

	it("reports a reason when no local model exists or the explicit selector misses", () => {
		const none = resolveLocalModel(Settings.isolated(), source(CLOUD_MODELS));
		expect(none.models).toHaveLength(0);
		expect(none.reason).toContain("no available model runs on a loopback or known local provider");

		const miss = resolveLocalModel(
			Settings.isolated({ "nightglide.localModel": "ollama/nope" }),
			source([...LOCAL_MODELS, ...CLOUD_MODELS]),
		);
		expect(miss.models).toHaveLength(0);
		expect(miss.reason).toContain("nightglide.localModel");
	});
});

// ─────────────────────────────────────────────────────────────────────────
// manual mode
// ─────────────────────────────────────────────────────────────────────────

describe("applyNightglideRouting manual", () => {
	it("does nothing and reports nothing", async () => {
		const settings = Settings.isolated({ "nightglide.routingMode": "manual" });
		const before = roleSnapshot(settings);
		const applied = await applyNightglideRouting(settings, source([...LOCAL_MODELS, ...CLOUD_MODELS]));
		expect(applied).toBeUndefined();
		expect(getAppliedNightglideRouting(settings)).toBeUndefined();
		expect(roleSnapshot(settings)).toEqual(before);
		expect(cfgRetryFallbackChains.get(settings)).toEqual({});
	});
});

// ─────────────────────────────────────────────────────────────────────────
// local mode
// ─────────────────────────────────────────────────────────────────────────

describe("applyNightglideRouting local", () => {
	it("binds every chat role to the local model with local-only fallback chains", async () => {
		const settings = Settings.isolated({
			"nightglide.routingMode": "local",
			modelRoles: { default: "anthropic/claude-sonnet-5-5" },
		});
		const applied = await applyNightglideRouting(settings, source([...LOCAL_MODELS, ...CLOUD_MODELS]));
		expect(applied?.mode).toBe("local");
		expect(applied?.localSelector).toBe("omlx/qwen3-local");

		const roles = settings.getModelRoles();
		for (const role of NIGHTGLIDE_LOCAL_CHAT_ROLES) {
			expect(roles[role]).toBe("omlx/qwen3-local");
		}
		// No cloud selector anywhere in the assigned chat roles.
		for (const role of NIGHTGLIDE_LOCAL_CHAT_ROLES) {
			expect(roles[role]).not.toContain("anthropic");
			expect(roles[role]).not.toContain("openai");
		}
		// Every chain for these roles contains only local selectors.
		const chains = cfgRetryFallbackChains.get(settings);
		for (const role of NIGHTGLIDE_LOCAL_CHAT_ROLES) {
			const chain = chains[role] ?? [];
			expect(chain.length).toBeGreaterThan(0);
			for (const entry of chain) {
				expect(entry.startsWith("omlx/") || entry.startsWith("ollama/") || entry.startsWith("mybox/")).toBe(true);
			}
		}
		// Every decision names the binding.
		expect(applied?.reasons.some(reason => reason.includes("default → omlx/qwen3-local"))).toBe(true);
	});

	it("leaves kind roles (image/web/judge) untouched", async () => {
		const settings = Settings.isolated({
			"nightglide.routingMode": "local",
			modelRoles: {
				image: "openai/gpt-image-1",
				web: "web/parallel",
				judge: "openai/gpt-4o-mini",
			},
		});
		await applyNightglideRouting(settings, source([...LOCAL_MODELS, ...CLOUD_MODELS]));
		const roles = settings.getModelRoles();
		expect(roles.image).toBe("openai/gpt-image-1");
		expect(roles.web).toBe("web/parallel");
		expect(roles.judge).toBe("openai/gpt-4o-mini");
	});

	it("keeps vision (chat-section but out of routing scope) untouched", async () => {
		const settings = Settings.isolated({
			"nightglide.routingMode": "local",
			modelRoles: { vision: "anthropic/claude-sonnet-5-5" },
		});
		await applyNightglideRouting(settings, source([...LOCAL_MODELS, ...CLOUD_MODELS]));
		expect(settings.getModelRole("vision")).toBe("anthropic/claude-sonnet-5-5");
	});

	it("propagates @task/@smol subagent aliases to the local model", async () => {
		const settings = Settings.isolated({ "nightglide.routingMode": "local" });
		await applyNightglideRouting(settings, source([...LOCAL_MODELS, ...CLOUD_MODELS]));

		const taskSelection = resolveAgentModelSelection({ agentModel: "@task", settings });
		expect(taskSelection.patterns).toEqual(["omlx/qwen3-local"]);
		expect(taskSelection.role).toBe("task");

		const smolPatterns = resolveConfiguredModelPatterns("@smol", settings);
		expect(smolPatterns).toEqual(["omlx/qwen3-local"]);

		// A subagent resolving the task role against the real catalog picks the
		// local model (the role resolves within the local provider's slice).
		const resolved = resolveAgentModelSelection({ agentModel: "@smol", settings });
		expect(resolved.patterns).toEqual(["omlx/qwen3-local"]);
	});

	it("throws a visible startup error naming the mode when no local model exists", async () => {
		const settings = Settings.isolated({ "nightglide.routingMode": "local" });
		const before = roleSnapshot(settings);
		await expect(applyNightglideRouting(settings, source(CLOUD_MODELS))).rejects.toThrow(
			/nightglide\.routingMode=local/,
		);
		// Roles untouched by the failed application.
		expect(roleSnapshot(settings)).toEqual(before);
	});

	it("refreshes only local discoverable providers once on a cold cache, then binds", async () => {
		const refreshed: { providerIds: string[]; strategy: string }[] = [];
		const settings = Settings.isolated({ "nightglide.routingMode": "local" });
		await expect(
			applyNightglideRouting(settings, source(CLOUD_MODELS, { discoverable: ["omlx", "lm-studio", "openai"] }), {
				refreshLocalProviders: (providerIds, strategy) => {
					refreshed.push({ providerIds: [...providerIds], strategy });
				},
			}),
		).rejects.toThrow(/nightglide\.routingMode=local/);
		expect(refreshed).toEqual([{ providerIds: ["omlx", "lm-studio"], strategy: "online-if-uncached" }]);

		// A source whose refresh materializes the local model succeeds.
		const models: Model[] = [...CLOUD_MODELS];
		const warming: NightglideModelSource = {
			getAvailable: (kind: "chat" | "all" = "chat") =>
				kind === "all" ? models : models.filter(model => (model.kind ?? "chat") === "chat"),
			getDiscoverableProviders: () => ["omlx"],
		};
		const settings2 = Settings.isolated({ "nightglide.routingMode": "local" });
		const applied = await applyNightglideRouting(settings2, warming, {
			refreshLocalProviders: () => {
				models.push(OMLX);
			},
		});
		expect(applied?.localSelector).toBe("omlx/qwen3-local");
		expect(settings2.getModelRole("default")).toBe("omlx/qwen3-local");
	});

	it("keeps a CLI --model pin on default but binds all other roles locally", async () => {
		const settings = Settings.isolated({ "nightglide.routingMode": "local" });
		// Simulate main.ts's CLI override of the default role.
		settings.overrideModelRoles({ default: "anthropic/claude-sonnet-5-5" });
		const applied = await applyNightglideRouting(settings, source([...LOCAL_MODELS, ...CLOUD_MODELS]), {
			cliModelExplicit: true,
		});
		expect(applied?.mode).toBe("local");
		expect(settings.getModelRole("default")).toBe("anthropic/claude-sonnet-5-5");
		for (const role of NIGHTGLIDE_LOCAL_CHAT_ROLES) {
			if (role === "default") continue;
			expect(settings.getModelRole(role)).toBe("omlx/qwen3-local");
		}
		expect(applied?.reasons.some(reason => reason.includes("default stays on the CLI --model pin"))).toBe(true);
		// The default chain holds only local selectors so a cloud failure lands locally.
		expect(cfgRetryFallbackChains.get(settings).default).toEqual([
			"omlx/qwen3-local",
			"ollama/llama3-local",
			"mybox/custom-x",
		]);
		// The applied record must say the default role stayed non-local so the
		// status line never shows a plain `routing:local` for that session.
		expect(applied?.defaultNonLocal).toBe(true);
		expect(applied?.defaultNonLocalSelector).toBe("anthropic/claude-sonnet-5-5");
	});

	it("leaves defaultNonLocal unset when LOCAL binds the default role", async () => {
		const settings = Settings.isolated({ "nightglide.routingMode": "local" });
		const applied = await applyNightglideRouting(settings, source([...LOCAL_MODELS, ...CLOUD_MODELS]));
		expect(applied?.defaultNonLocal).toBeUndefined();
		expect(applied?.defaultNonLocalSelector).toBeUndefined();
	});
});

// ─────────────────────────────────────────────────────────────────────────
// local mode: user fallback-chain configs must not leak cloud selectors
// ─────────────────────────────────────────────────────────────────────────

describe("applyNightglideRouting local vs user fallback chains", () => {
	it("replaces user cloud chains on every LOCAL-bound role", async () => {
		const settings = Settings.isolated({
			"nightglide.routingMode": "local",
			modelRoles: { default: "anthropic/claude-sonnet-5-5" },
			"retry.fallbackChains": {
				default: ["anthropic/claude-sonnet-5-5", "openai/gpt-4o-mini"],
				smol: ["openai/gpt-4o-mini"],
			},
		});
		await applyNightglideRouting(settings, source([...LOCAL_MODELS, ...CLOUD_MODELS]));
		const chains = getRetryFallbackChains(settings);
		for (const role of NIGHTGLIDE_LOCAL_CHAT_ROLES) {
			const chain = chains[role] ?? [];
			expect(chain.length).toBeGreaterThan(0);
			for (const entry of chain) {
				expect(entry.startsWith("omlx/") || entry.startsWith("ollama/") || entry.startsWith("mybox/")).toBe(true);
			}
		}
	});

	it("gives unlisted custom roles the (local) default chain, keeps their own cloud chains to the user", async () => {
		const settings = Settings.isolated({
			"nightglide.routingMode": "local",
			modelRoles: { writer: "anthropic/claude-sonnet-5-5" },
			"retry.fallbackChains": { writer: ["openai/gpt-4o-mini"] },
		});
		await applyNightglideRouting(settings, source([...LOCAL_MODELS, ...CLOUD_MODELS]));
		// Custom roles are explicit user configuration: LOCAL does not reassign
		// them (recorded out of scope, like the CLI --model pin).
		expect(settings.getModelRole("writer")).toBe("anthropic/claude-sonnet-5-5");
		expect(cfgRetryFallbackChains.get(settings).writer).toEqual(["openai/gpt-4o-mini"]);
		// A custom role with no chain of its own inherits the default chain —
		// which LOCAL replaced with the local-only chain, so no cloud leak.
		const settingsNoChain = Settings.isolated({
			"nightglide.routingMode": "local",
			modelRoles: { writer: "anthropic/claude-sonnet-5-5" },
		});
		await applyNightglideRouting(settingsNoChain, source([...LOCAL_MODELS, ...CLOUD_MODELS]));
		expect(getRetryFallbackChains(settingsNoChain).writer).toEqual([
			"omlx/qwen3-local",
			"ollama/llama3-local",
			"mybox/custom-x",
		]);
	});

	it("drops model-keyed and wildcard chains that could capture the LOCAL session", async () => {
		const settings = Settings.isolated({
			"nightglide.routingMode": "local",
			"retry.fallbackChains": {
				// Exact selector of the LOCAL primary: highest-precedence hijack.
				"omlx/qwen3-local": ["anthropic/claude-sonnet-5-5"],
				// Provider wildcard, mixed entries.
				"omlx/*": ["openai/gpt-4o-mini", "omlx/qwen3-local"],
				// A non-local provider wildcard.
				"openai/*": ["openai/gpt-4o-mini"],
				default: ["anthropic/claude-sonnet-5-5"],
			},
		});
		await applyNightglideRouting(settings, source([...LOCAL_MODELS, ...CLOUD_MODELS]));
		const chains = cfgRetryFallbackChains.get(settings);
		// Selector-keyed chains are dropped session-scoped, so the local role
		// chain owns fallback resolution and no cloud entry can hijack it.
		expect(chains["omlx/qwen3-local"]).toBeUndefined();
		expect(chains["omlx/*"]).toBeUndefined();
		expect(chains["openai/*"]).toBeUndefined();
		expect(chains.default).toEqual(["omlx/qwen3-local", "ollama/llama3-local", "mybox/custom-x"]);

		// End to end through the resolver the session uses: resolving the LOCAL
		// primary's chain yields local candidates from the role chain.
		const context = {
			chains: getRetryFallbackChains(settings),
			getModelRole: (role: string) => settings.getModelRole(role),
			modelLookup: {
				find: (provider: string, id: string) =>
					[...LOCAL_MODELS, ...CLOUD_MODELS].find(model => model.provider === provider && model.id === id),
				hasProvider: (provider: string) =>
					[...LOCAL_MODELS, ...CLOUD_MODELS].some(model => model.provider === provider),
			},
		};
		const chainKey = resolveRetryFallbackChainKey(context, "omlx/qwen3-local", OMLX, "default");
		expect(chainKey).toBe("default");
		const candidates = findRetryFallbackCandidates(context, chainKey!, "omlx/qwen3-local", OMLX, {
			allowMissingPrimary: true,
		});
		expect(candidates.map(candidate => candidate.raw)).toEqual(["ollama/llama3-local", "mybox/custom-x"]);
	});
});

// ─────────────────────────────────────────────────────────────────────────
// resume honesty: configured-but-unapplied routing does nothing
// ─────────────────────────────────────────────────────────────────────────

describe("routing on a resumed session (never applied)", () => {
	it("reports no applied routing and leaves the per-call gate inactive", async () => {
		// sdk.ts applies routing only to brand-new sessions (`!hasExistingSession`);
		// a resumed session's settings never see `applyNightglideRouting`, so the
		// configured mode must stay inert: no applied record, no per-call gate.
		const settings = Settings.isolated({
			"nightglide.routingMode": "local",
			"task.perCallModel": "on",
		});
		expect(getAppliedNightglideRouting(settings)).toBeUndefined();
		expect(
			invalidModelSelectorReason("openai/gpt-4o-mini", "The call", { settings, invocationKind: "task" }),
		).toBeUndefined();
	});
});

// ─────────────────────────────────────────────────────────────────────────
// custom agent frontmatter under LOCAL (recorded boundary)
// ─────────────────────────────────────────────────────────────────────────

describe("custom agent frontmatter model under LOCAL routing", () => {
	it("resolves a literal cloud frontmatter selector as configured (recorded out of scope)", async () => {
		// Agent frontmatter is user-authored configuration, the same class as the
		// CLI --model pin and custom roles: LOCAL binds the stock roles and the
		// per-call gate, but a literal `model: provider/cloud` in an agent file
		// stays on its selector. This test pins that boundary so a change to it
		// is a deliberate decision, not an accident.
		const settings = Settings.isolated({ "nightglide.routingMode": "local" });
		await applyNightglideRouting(settings, source([...LOCAL_MODELS, ...CLOUD_MODELS]));
		const selection = resolveAgentModelSelection({ agentModel: "openai/gpt-4o-mini", settings });
		expect(selection.patterns).toEqual(["openai/gpt-4o-mini"]);
	});
});

// ─────────────────────────────────────────────────────────────────────────
// balanced mode
// ─────────────────────────────────────────────────────────────────────────

describe("applyNightglideRouting balanced", () => {
	it("keeps strong roles, prepends a local default-chain entry, and routes small roles locally first", async () => {
		const settings = Settings.isolated({
			"nightglide.routingMode": "balanced",
			modelRoles: {
				default: "anthropic/claude-sonnet-5-5",
				smol: "openai/gpt-4o-mini",
			},
			"retry.fallbackChains": { default: ["openai/gpt-4o-mini"] },
		});
		const applied = await applyNightglideRouting(settings, source([...LOCAL_MODELS, ...CLOUD_MODELS]));
		expect(applied?.mode).toBe("balanced");
		expect(applied?.localSelector).toBe("omlx/qwen3-local");

		// Strong roles untouched.
		expect(settings.getModelRole("default")).toBe("anthropic/claude-sonnet-5-5");
		expect(settings.getModelRole("slow")).toBeUndefined();
		expect(settings.getModelRole("plan")).toBeUndefined();
		expect(settings.getModelRole("advisor")).toBeUndefined();

		// Small roles route locally first, with the user's prior value as the tail.
		expect(settings.getModelRole("smol")).toBe("omlx/qwen3-local");
		const chains = cfgRetryFallbackChains.get(settings);
		expect(chains.smol).toEqual(["omlx/qwen3-local", "openai/gpt-4o-mini"]);
		expect(chains.task).toEqual(["omlx/qwen3-local"]);
		// The default chain gains a leading local entry and keeps the user's entries.
		expect(chains.default).toEqual(["omlx/qwen3-local", "openai/gpt-4o-mini"]);
		// default model untouched, no default role override.
		expect(settings.getModelRole("default")).toBe("anthropic/claude-sonnet-5-5");
	});

	it("keeps small roles on their configured models when no local model exists", async () => {
		const settings = Settings.isolated({
			"nightglide.routingMode": "balanced",
			modelRoles: { smol: "openai/gpt-4o-mini" },
		});
		const before = roleSnapshot(settings);
		const applied = await applyNightglideRouting(settings, source(CLOUD_MODELS));
		expect(applied?.localSelector).toBeUndefined();
		expect(applied?.reasons.join("\n")).toContain("no local model available");
		expect(roleSnapshot(settings)).toEqual(before);
		expect(cfgRetryFallbackChains.get(settings)).toEqual({});
	});
});

// ─────────────────────────────────────────────────────────────────────────
// performance mode
// ─────────────────────────────────────────────────────────────────────────

describe("applyNightglideRouting performance", () => {
	it("points small roles and advisor at the default model and falls back local", async () => {
		const settings = Settings.isolated({
			"nightglide.routingMode": "performance",
			modelRoles: { default: "anthropic/claude-sonnet-5-5", smol: "openai/gpt-4o-mini" },
		});
		const applied = await applyNightglideRouting(settings, source([...LOCAL_MODELS, ...CLOUD_MODELS]));
		expect(applied?.mode).toBe("performance");

		// Default untouched; small roles lifted to the strongest tier.
		expect(settings.getModelRole("default")).toBe("anthropic/claude-sonnet-5-5");
		for (const role of NIGHTGLIDE_PERFORMANCE_STRONG_ROLES) {
			expect(settings.getModelRole(role)).toBe("anthropic/claude-sonnet-5-5");
		}
		const chains = cfgRetryFallbackChains.get(settings);
		expect(chains.smol).toEqual(["anthropic/claude-sonnet-5-5", "omlx/qwen3-local"]);
		expect(chains.default).toEqual(["anthropic/claude-sonnet-5-5", "omlx/qwen3-local"]);
	});

	it("falls back to the first authed available model when the default role is unconfigured", async () => {
		const settings = Settings.isolated({ "nightglide.routingMode": "performance" });
		// Only OpenAI reports auth, so the strongest pick resolves to it.
		const applied = await applyNightglideRouting(
			settings,
			source(CLOUD_MODELS, { hasAuth: model => model.provider === "openai" }),
		);
		expect(applied?.mode).toBe("performance");
		expect(settings.getModelRole("smol")).toBe(selectorOf(CLOUD_B));
		expect(settings.getModelRole("default")).toBeUndefined();
	});

	it("keeps roles untouched when nothing resolves as the strongest model", async () => {
		const settings = Settings.isolated({ "nightglide.routingMode": "performance" });
		const before = roleSnapshot(settings);
		const applied = await applyNightglideRouting(settings, source([], { hasAuth: () => false }));
		expect(applied?.mode).toBe("performance");
		expect(applied?.reasons.join("\n")).toContain("no default model available");
		expect(roleSnapshot(settings)).toEqual(before);
	});
});

// ─────────────────────────────────────────────────────────────────────────
// subagent per-call model constraint (LOCAL)
// ─────────────────────────────────────────────────────────────────────────

describe("per-call model constraint under LOCAL routing", () => {
	const perCallOn = { "task.perCallModel": "on" } as const;

	it("rejects a cloud per-call model with a LOCAL-mode explanation", async () => {
		const settings = Settings.isolated({ "nightglide.routingMode": "local", ...perCallOn });
		await applyNightglideRouting(settings, source([...LOCAL_MODELS, ...CLOUD_MODELS]));

		const reason = invalidModelSelectorReason("openai/gpt-4o-mini", "The call", {
			settings,
			invocationKind: "task",
		});
		expect(reason).toBeDefined();
		expect(reason).toContain("not local");
		expect(reason).toContain("LOCAL routing binds session and subagent models to local models");
		expect(reason).toContain("omlx/qwen3-local");
	});

	it("allows per-call models on local providers and stays out of the way otherwise", async () => {
		const localSettings = Settings.isolated({ "nightglide.routingMode": "local", ...perCallOn });
		await applyNightglideRouting(localSettings, source([...LOCAL_MODELS, ...CLOUD_MODELS]));
		expect(
			invalidModelSelectorReason("omlx/other-model", "The call", {
				settings: localSettings,
				invocationKind: "task",
			}),
		).toBeUndefined();
		expect(
			invalidModelSelectorReason("ollama/llama3-local:low", "The call", {
				settings: localSettings,
				invocationKind: "task",
			}),
		).toBeUndefined();

		// No routing applied: cloud selectors are not the gate's business.
		const plainSettings = Settings.isolated({ ...perCallOn });
		expect(
			invalidModelSelectorReason("openai/gpt-4o-mini", "The call", {
				settings: plainSettings,
				invocationKind: "task",
			}),
		).toBeUndefined();

		// Manual mode: routing never applied, no gate.
		const manualSettings = Settings.isolated({ "nightglide.routingMode": "manual", ...perCallOn });
		expect(
			invalidModelSelectorReason("openai/gpt-4o-mini", "The call", {
				settings: manualSettings,
				invocationKind: "task",
			}),
		).toBeUndefined();
	});
});

// ─────────────────────────────────────────────────────────────────────────
// Nightglide approval default ("high-risk ask" = OMP `write` mode)
// ─────────────────────────────────────────────────────────────────────────

describe("Nightglide approval default", () => {
	it("defaults tools.approvalMode to write", () => {
		expect(cfgToolsApprovalMode.get(Settings.isolated())).toBe("write");
		expect(resolveApprovalFromContext({ settings: Settings.isolated() }).approvalMode).toBe("write");
	});

	it("keeps an explicitly configured mode", () => {
		for (const mode of ["always-ask", "always-ask-cached", "write", "yolo"] as const) {
			const settings = Settings.isolated({ "tools.approvalMode": mode });
			expect(resolveApprovalFromContext({ settings }).approvalMode).toBe(mode);
		}
		expect(resolveApprovalFromContext({ settings: Settings.isolated(), autoApprove: true }).approvalMode).toBe(
			"yolo",
		);
	});

	it("auto-runs reads and writes but asks for exec and critical commands by default", () => {
		const mode = resolveApprovalFromContext({ settings: Settings.isolated() }).approvalMode;
		expect(resolveApproval({ name: "read", approval: "read" }, {}, mode).policy).toBe("allow");
		expect(resolveApproval({ name: "write", approval: "write" }, {}, mode).policy).toBe("allow");
		expect(resolveApproval({ name: "bash", approval: "exec" }, {}, mode).policy).toBe("prompt");
		expect(resolveApproval({ name: "task", approval: "exec" }, {}, mode).policy).toBe("prompt");
		const critical = resolveApproval(
			{ name: "bash", approval: { tier: "exec", override: true, reason: "Critical pattern detected" } },
			{},
			mode,
		);
		expect(critical.policy).toBe("prompt");
		expect(critical.override).toBe(true);
	});
});

describe("Nightglide approval: agent-writable config cannot loosen approvals", () => {
	afterEach(() => {
		// spyOn stubs installed below are per-test.
		for (const setting of [cfgToolsApprovalMode, cfgToolsApproval, cfgToolsRestrictedFolders]) {
			const provenance = setting.provenance as unknown as { mockRestore?: () => void };
			provenance.mockRestore?.();
		}
	});

	/** A session whose `values` come from the project layer, over `operator` global settings. */
	function projectSession(values: Record<string, unknown>, operator: Record<string, unknown> = {}): Settings {
		const session = Settings.isolated({ ...operator, ...values });
		spyOn(session, "grantAuthority").mockReturnValue(Settings.isolated(operator));
		return session;
	}

	it("ignores a project yolo but keeps a stricter project mode", () => {
		spyOn(cfgToolsApprovalMode, "provenance").mockReturnValue("project");
		expect(
			resolveApprovalFromContext({ settings: projectSession({ "tools.approvalMode": "yolo" }) }).approvalMode,
		).toBe("write");
		expect(
			resolveApprovalFromContext({ settings: projectSession({ "tools.approvalMode": "always-ask" }) }).approvalMode,
		).toBe("always-ask");
		// The operator's own yolo stays yolo when the project repeats it.
		expect(
			resolveApprovalFromContext({
				settings: projectSession({ "tools.approvalMode": "yolo" }, { "tools.approvalMode": "yolo" }),
			}).approvalMode,
		).toBe("yolo");
	});

	it("keeps a non-project yolo, such as a subagent overlay", () => {
		const settings = Settings.isolated({ "tools.approvalMode": "yolo" });
		expect(resolveApprovalFromContext({ settings }).approvalMode).toBe("yolo");
	});

	it("applies project tool policies only where they are stricter", () => {
		spyOn(cfgToolsApproval, "provenance").mockReturnValue("project");
		const settings = projectSession(
			{ "tools.approval": { bash: "allow", edit: "deny", eval: "prompt", read: "allow" } },
			{ "tools.approval": { eval: "allow", read: "allow" } },
		);
		expect(resolveApprovalFromContext({ settings }).userPolicies).toEqual({
			edit: "deny",
			eval: "prompt",
			read: "allow",
		});
	});

	it("restricts ~/.omp by default, and a project cannot drop it", () => {
		const configFile = path.join(os.homedir(), ".omp", "agent", "config.yml");
		const writeConfig = { name: "write", approval: "write" as const, approvalCacheTargets: () => [configFile] };
		const cwd = os.tmpdir();
		const defaults = approvalRestrictions(Settings.isolated(), cwd);
		expect(defaults?.restrictedFolders).toEqual(["~/.omp"]);
		const resolved = resolveApproval(writeConfig, {}, "write", {}, undefined, defaults);
		expect(resolved.policy).toBe("prompt");
		expect(resolved.source).toBe("restriction");
		// Even yolo asks for it.
		expect(resolveApproval(writeConfig, {}, "yolo", {}, undefined, defaults).policy).toBe("prompt");

		spyOn(cfgToolsRestrictedFolders, "provenance").mockReturnValue("project");
		const fromProject = approvalRestrictions(projectSession({ "tools.restrictedFolders": ["./secrets"] }), cwd);
		expect(fromProject?.restrictedFolders).toEqual(["~/.omp", "./secrets"]);
	});
});
