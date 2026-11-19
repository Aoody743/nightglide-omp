/**
 * Visual hierarchy of the model browser's legacy frame path and its native
 * describe spans: quiet header with a right dim count, row slots (text names,
 * dim provider/metrics, selectedBg selection band), and the detail head's
 * text/dim/borderMuted/muted layering — plus no-overflow guarantees at the
 * 80/100/120 column stops.
 */
import { beforeAll, describe, expect, test } from "bun:test";
import { stripVTControlCharacters } from "node:util";
import type { Model } from "@oh-my-pi/pi-ai";
import { buildModel } from "@oh-my-pi/pi-catalog/build";
import type { TspSpan } from "@oh-my-pi/pi-wire";
import type { NativeNode } from "../src/native/node";
import { ModelBrowser, buildBrowserItems, type ModelBrowserSource } from "../src/overlays/model-browser";
import { initTheme, theme } from "../src/theme";
import { visibleWidth } from "../src/utils";

beforeAll(async () => {
	await initTheme(false);
});

function model(provider: string, id: string, extra: Partial<Model> = {}): Model {
	return buildModel({
		id,
		name: id,
		api: "openai-completions",
		provider,
		baseUrl: "http://127.0.0.1/v1",
		reasoning: false,
		input: ["text"],
		cost: { input: 3, output: 15, cacheRead: 0, cacheWrite: 0 },
		contextWindow: 200_000,
		maxTokens: 32_000,
		...extra,
	});
}

const sonnet = model("anthropic", "claude-sonnet", { description: "Quick and cheap." });
const gpt = model("openai", "gpt-mini");
const llama = model("meta", "llama-large");

const source: ModelBrowserSource = {
	revision: 0,
	defaultThinkingLevel: "off",
	modelProviderOrder: [],
	knownRoleIds: ["default"],
	mruOrder: [],
	modelPerf: new Map(),
	getRoleInfo: role => ({ tag: role, name: role, section: "chat", accepts: () => true }),
	defaultRoleChain: () => [],
	resolveRoleValue: () => ({ model: undefined, explicitThinkingLevel: false }),
	getModelRole: () => undefined,
};

function createBrowser(models: Model[] = [sonnet, gpt, llama], maxVisible = models.length): ModelBrowser {
	const browser = new ModelBrowser(source, {});
	browser.setMaxVisible(maxVisible);
	browser.setItems(buildBrowserItems(models));
	return browser;
}

function stripped(line: string): string {
	return stripVTControlCharacters(line);
}

function rowFor(lines: readonly string[], id: string): string {
	const row = lines.find(line => stripped(line).includes(id));
	expect(row).toBeDefined();
	return row!;
}

/** The open SGR sequence theme.bg emits for a slot, sampled with a probe payload. */
function bgOpen(): string {
	return theme.bg("selectedBg", "\u0000").split("\u0000")[0]!;
}

function findNode(node: NativeNode, role: string): NativeNode | undefined {
	if (node.p?.role === role) return node;
	for (const child of node.c ?? []) {
		if ("k" in child) {
			const found = findNode(child, role);
			if (found) return found;
		}
	}
	return undefined;
}

function spansOf(node: NativeNode | undefined): readonly TspSpan[] {
	return ((node?.p as { spans?: readonly TspSpan[] } | undefined)?.spans ?? []) as readonly TspSpan[];
}

describe("model browser header", () => {
	test("carries a right-aligned dim count of the selectable rows", () => {
		const browser = createBrowser();
		const lines = browser.render(100);
		const header = lines[0]!;
		expect(visibleWidth(header)).toBe(100);
		expect(stripped(header).trimEnd().endsWith("3 models")).toBe(true);
		expect(header).toContain(theme.fg("dim", "3 models"));
	});

	test("counts singular rows as `1 model`", () => {
		const browser = createBrowser([sonnet]);
		browser.setQuery("cla");
		const header = browser.render(100)[0]!;
		expect(header).toContain(theme.fg("dim", "1 model"));
	});

	test("excludes the recent/role separator from the count", () => {
		const browser = new ModelBrowser(source, {});
		browser.setMaxVisible(4);
		browser.setMruOrder(["anthropic/claude-sonnet"]);
		browser.setItems(buildBrowserItems([sonnet, gpt, llama]));
		const header = browser.render(100)[0]!;
		expect(stripped(header)).toContain("3 models");
		expect(stripped(header)).not.toContain("4 models");
	});

	test("drops the count first on narrow widths and keeps the search field", () => {
		const browser = createBrowser();
		const header = browser.render(14)[0]!;
		expect(visibleWidth(header)).toBeLessThanOrEqual(14);
		expect(stripped(header)).not.toContain("models");
	});
});

describe("model browser rows", () => {
	test("unselected rows read their name in the text slot with dim provider and dim metrics", () => {
		const browser = createBrowser();
		browser.selectSelector("anthropic/claude-sonnet");
		const lines = browser.render(100);
		const row = rowFor(lines, "gpt-mini");
		expect(row).toContain(theme.fg("text", "gpt-mini"));
		expect(row).toContain(theme.fg("dim", "openai/"));
		const ctxGlyph = theme.icon.context.replace(/:$/, "");
		expect(row).toContain(theme.fg("dim", `200k ${ctxGlyph}`));
		expect(row).toContain(theme.fg("dim", "$3/15"));
		expect(row).not.toContain(bgOpen());
	});

	test("the focused selection carries the accent cursor, accent name, and a full-row selectedBg band", () => {
		const browser = createBrowser();
		browser.selectSelector("anthropic/claude-sonnet");
		const row = rowFor(browser.render(100), "claude-sonnet");
		expect(row).toContain(theme.fg("accent", theme.nav.cursor));
		expect(row).toContain(theme.fg("accent", "claude-sonnet"));
		expect(row).toContain(bgOpen());
		expect(visibleWidth(row)).toBeLessThanOrEqual(100);
	});

	test("an unfocused selection dims the cursor, keeps the name in the text slot, and paints no band", () => {
		const browser = createBrowser();
		browser.selectSelector("anthropic/claude-sonnet");
		browser.setFocused(false);
		const row = rowFor(browser.render(100), "claude-sonnet");
		expect(row).toContain(theme.fg("dim", theme.nav.cursor));
		expect(row).toContain(theme.fg("text", "claude-sonnet"));
		expect(row).not.toContain(theme.fg("accent", "claude-sonnet"));
		expect(row).not.toContain(bgOpen());
	});
});

describe("model browser detail", () => {
	test("the detail head layers name, values, unit labels, separators, and prose into slots", () => {
		const browser = createBrowser();
		browser.selectSelector("anthropic/claude-sonnet");
		const lines = browser.render(100);
		const detail1 = lines.at(-2)!;
		expect(detail1).toContain(theme.fg("text", theme.bold("claude-sonnet")));
		expect(detail1).toContain(theme.fg("borderMuted", " · "));
		expect(detail1).toContain(theme.fg("text", "200k"));
		expect(detail1).toContain(theme.fg("dim", " ctx"));
		expect(detail1).toContain(theme.fg("text", "$3/15"));
		expect(detail1).toContain(theme.fg("dim", " per M"));
		expect(detail1).toContain(theme.fg("muted", "Quick and cheap."));
	});

	test("narrow widths eat prose before the facts", () => {
		const browser = createBrowser();
		browser.selectSelector("anthropic/claude-sonnet");
		const detail1 = browser.render(56).at(-2)!;
		expect(stripped(detail1)).toContain("200k");
		expect(stripped(detail1)).not.toContain("Quick and cheap.");
	});

	test("the current model's chip line marks it in the success slot", () => {
		const browser = createBrowser();
		browser.selectSelector("anthropic/claude-sonnet");
		browser.setCurrentSelector("anthropic/claude-sonnet");
		const detail2 = browser.render(100).at(-1)!;
		expect(detail2).toContain(theme.fg("success", `${theme.status.enabled} current`));
	});
});

describe("model browser widths", () => {
	test("no rendered line overflows at the 80/100/120 column stops", () => {
		const browser = createBrowser([sonnet, gpt, llama], 6);
		for (const width of [80, 100, 120]) {
			for (const line of browser.render(width)) {
				expect(visibleWidth(line)).toBeLessThanOrEqual(width);
			}
		}
	});

	test("a live query keeps every line inside the same stops", () => {
		const browser = createBrowser([sonnet, gpt, llama], 6);
		browser.setQuery("la");
		for (const width of [80, 100, 120]) {
			for (const line of browser.render(width)) {
				expect(visibleWidth(line)).toBeLessThanOrEqual(width);
			}
		}
	});
});

describe("model browser native detail spans", () => {
	test("the described detail head uses the same slot language", () => {
		const browser = createBrowser();
		browser.selectSelector("anthropic/claude-sonnet");
		const detail = findNode(browser.describe(), "omp.model-browser.detail");
		expect(detail).toBeDefined();

		const head = detail!.c?.find(child => "k" in child && child.k === "row");
		const headSpans = spansOf((head?.c ?? []).find(child => "k" in child && child.k === "text"));
		expect(headSpans).toContainEqual({ t: "claude-sonnet", s: "strong" });

		const textChildren = (detail!.c ?? []).filter(child => "k" in child && child.k === "text");
		const factSpans = spansOf(textChildren[0]);
		expect(factSpans).toContainEqual({ t: "200k", s: "text" });
		expect(factSpans).toContainEqual({ t: " ctx", s: "dim" });
		expect(factSpans).toContainEqual({ t: "$3/15", s: "text" });
		expect(factSpans).toContainEqual({ t: " per M", s: "dim" });
		expect(factSpans).toContainEqual({ t: " · ", s: "borderMuted" });
		// The description is its own wrapping node on the native path, not a fact.
		expect(factSpans.some(part => part.t.includes("Quick and cheap."))).toBe(false);
	});

	test("the described description prose rides the muted slot", () => {
		const browser = createBrowser();
		browser.selectSelector("anthropic/claude-sonnet");
		const detail = findNode(browser.describe(), "omp.model-browser.detail")!;
		const all = (detail.c ?? []).filter(child => "k" in child && child.k === "text").flatMap(spansOf);
		expect(all).toContainEqual({ t: "Quick and cheap.", s: "muted" });
	});
});
