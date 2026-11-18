import { beforeAll, describe, expect, it } from "bun:test";
import type { SegmentContext } from "../src/status-line/segments";
import { renderSegment, describeSegment } from "../src/status-line/segments";
import { initTheme, theme } from "../src/theme";

beforeAll(async () => {
	await initTheme();
});

interface SessionOverrides {
	getNightglideRoutingMode?: () => "manual" | "local" | "balanced" | "performance" | undefined;
	getNightglideRoutingNonLocalDefault?: () => string | undefined;
	servingModel?: { selector: string; modelIdentity?: string; isFallback: boolean } | undefined;
	activeRetryFallbackState?: { role: string; originalSelector: string; served?: boolean } | undefined;
}

function createRoutingContext(overrides: SessionOverrides = {}): SegmentContext {
	return {
		session: {
			state: { model: { id: "test-model", name: "Test Model" } },
			isFastModeActive: () => false,
			isAutoThinking: false,
			autoResolvedThinkingLevel: () => undefined,
			...overrides,
		} as unknown as SegmentContext["session"],
		width: 120,
		compactThinkingLevel: false,
		options: {},
		planMode: null,
		prewalk: null,
		loopMode: null,
		goalMode: null,
		vibeMode: null,
		vim: null,
		collab: null,
		stream: null,
		recording: false,
		usageStats: {
			input: 0,
			output: 0,
			cacheRead: 0,
			cacheWrite: 0,
			totalTokens: 0,
			orchestrationInput: 0,
			orchestrationOutput: 0,
			orchestrationCacheRead: 0,
			premiumRequests: 0,
			cost: 0,
			tokensPerSecond: null,
		},
		contextPercent: 0,
		contextTokens: 0,
		contextWindow: 0,
		autoCompactEnabled: false,
		compactionSpeculation: "idle",
		speculationBlinkOn: true,
		subagentCount: 0,
		activeMs: 0,
		turnElapsedMs: null,
		activeRepo: null,
		worktree: null,
		git: { branch: null, status: null, pr: null },
		usage: null,
	};
}

describe("status line routing segment", () => {
	it("renders nothing when routing never ran", () => {
		expect(renderSegment("routing", createRoutingContext())).toEqual({ content: "", visible: false });
		expect(describeSegment("routing", createRoutingContext())).toBeNull();
	});

	it("renders nothing in manual mode — the segment only reports applied routing", () => {
		const ctx = createRoutingContext({ getNightglideRoutingMode: () => "manual" });
		expect(renderSegment("routing", ctx)).toEqual({ content: "", visible: false });
		expect(describeSegment("routing", ctx)).toBeNull();
	});

	it("renders the applied mode for local, balanced and performance", () => {
		for (const mode of ["local", "balanced", "performance"] as const) {
			const ctx = createRoutingContext({ getNightglideRoutingMode: () => mode });
			const rendered = renderSegment("routing", ctx);
			expect(rendered.visible).toBe(true);
			expect(Bun.stripANSI(rendered.content)).toContain(`routing:${mode}`);
			const described = describeSegment("routing", ctx);
			const describedText = described?.spans.map(span => span.t).join("");
			expect(describedText).toContain(`routing:${mode}`);
		}
	});

	it("renders plain routing:local when the default role is locally bound", () => {
		const ctx = createRoutingContext({ getNightglideRoutingMode: () => "local" });
		// The `routing:` qualifier is dim; the applied mode keeps the accent that
		// ties the segment visually to the model name beside it.
		expect(renderSegment("routing", ctx).content).toBe(`${theme.fg("dim", "routing:")}${theme.fg("accent", "local")}`);
	});

	it("marks an explicit non-local default under local routing", () => {
		// A CLI --model pin keeps `default` off the local model; a bare
		// `routing:local` there would overstate the session's egress posture.
		const ctx = createRoutingContext({
			getNightglideRoutingMode: () => "local",
			getNightglideRoutingNonLocalDefault: () => "anthropic/claude-sonnet-5-5",
		});
		const rendered = renderSegment("routing", ctx);
		expect(rendered.visible).toBe(true);
		expect(Bun.stripANSI(rendered.content)).toContain("routing:local (default: explicit)");
		const described = describeSegment("routing", ctx);
		const describedText = described?.spans.map(span => span.t).join("");
		expect(describedText).toContain("routing:local (default: explicit)");
	});
});

describe("status line model segment fallback indicator", () => {
	it("appends nothing while the configured primary serves", () => {
		const rendered = renderSegment("model", createRoutingContext());
		expect(rendered.content).toContain("Test Model");
		expect(rendered.content).not.toContain("↩");
	});

	it("appends the serving fallback model with a warning tone while a fallback owns the run", () => {
		const ctx = createRoutingContext({
			servingModel: { selector: "omlx/qwen3-local", modelIdentity: "omlx/qwen3-local", isFallback: true },
			activeRetryFallbackState: { role: "default", originalSelector: "anthropic/claude-sonnet-5-5" },
		});
		const rendered = renderSegment("model", ctx);
		expect(rendered.content).toContain("Test Model");
		expect(rendered.content).toContain(` ↩ omlx/qwen3-local`);
		expect(rendered.content).toContain(theme.fg("warning", " ↩ omlx/qwen3-local"));

		const described = describeSegment("model", ctx);
		const describedText = described?.spans.map(span => span.t).join("");
		expect(describedText).toContain(" ↩ omlx/qwen3-local");
		expect(describedText).toContain("fallback from anthropic/claude-sonnet-5-5 (default chain)");
	});

	it("does not invent a fallback reason when no chain state is exposed", () => {
		const ctx = createRoutingContext({
			servingModel: { selector: "omlx/qwen3-local", modelIdentity: "omlx/qwen3-local", isFallback: true },
		});
		const described = describeSegment("model", ctx);
		const describedText = described?.spans.map(span => span.t).join("");
		expect(describedText).toContain(" ↩ omlx/qwen3-local");
		expect(describedText).not.toContain("fallback from");
	});
});
