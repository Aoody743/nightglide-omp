import { describe, expect, it } from "bun:test";
import { NightglideSidebar } from "../src/components/nightglide-sidebar";
import { setThemeInstance } from "../src/theme/theme";
import { loadThemeSync } from "../src/theme/loader";

setThemeInstance(loadThemeSync("nightglide-flight"));

const strip = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, "");

function render(state: Parameters<typeof makeSidebar>[0], width = 26): string[] {
	const sidebar = makeSidebar(state);
	return sidebar.render(width).map(strip);
}

function makeSidebar(state: {
	model?: string;
	thinkingLevel?: string;
	autoPending?: boolean;
	subagents?: Array<{ label: string; status: string; currentTool?: string }>;
}) {
	return new NightglideSidebar(() => ({
		model: state.model,
		thinkingLevel: state.thinkingLevel,
		autoPending: state.autoPending,
		subagents: state.subagents ?? [],
	}));
}

describe("Nightglide sidebar (P2.1)", () => {
	it("renders honest states: no-model, unknown effort, no activity", () => {
		const lines = render({ model: undefined, thinkingLevel: undefined });
		const joined = lines.join("\n");
		expect(joined).toContain("no-model");
		expect(joined).toContain("未知");
		expect(joined).toContain("无活动");
		// no fabricated rung glyph for unknown level
		expect(joined).not.toContain("◎");
	});

	it("renders effort rung only for a real level (no fabrication)", () => {
		const lines = render({ model: "endless", thinkingLevel: "high" });
		expect(lines.join("\n")).toContain("◎");
		expect(lines.join("\n")).toContain("high");
		const unknown = render({ model: "endless", thinkingLevel: "weird-level" }).join("\n");
		// unknown level → no rung glyph, raw word in dim
		expect(unknown).toContain("weird-level");
		expect(unknown).not.toContain("◎");
	});

	it("renders subagent lifecycle marks; current tool only in detailed mode", () => {
		const subs = [
			{ label: "planner", status: "active", currentTool: "read" },
			{ label: "coder", status: "failed" },
			{ label: "old", status: "aborted" },
		];
		const compact = render({ model: "endless", thinkingLevel: "high", subagents: subs }).join("\n");
		expect(compact).toContain("planner");
		expect(compact).toContain("active");
		expect(compact).toContain("✗");
		expect(compact).not.toContain("↳ read"); // compact hides per-agent tools
		const detailed = makeSidebar({
			model: "endless",
			thinkingLevel: "high",
			subagents: subs,
		});
		// detailed mode is expressed through the state accessor
		const dSid = new NightglideSidebar(() => ({
			model: "endless",
			thinkingLevel: "high",
			subagents: subs,
			detailed: true,
		}));
		const dLines = dSid.render(26).map(strip);
		expect(dLines.join("\n")).toContain("↳ read");
	});

	it("renders real in-flight tool count when provided", () => {
		const sid = new NightglideSidebar(() => ({
			model: "endless",
			thinkingLevel: undefined,
			subagents: [],
			activeTools: 2,
		}));
		const joined = sid.render(26).map(strip).join("\n");
		expect(joined).toContain("进行中 2");
		const zero = new NightglideSidebar(() => ({
			model: "endless",
			thinkingLevel: undefined,
			subagents: [],
			activeTools: 0,
		}));
		expect(zero.render(26).map(strip).join("\n")).not.toContain("进行中");
	});

	it("no double border on subagent rows", () => {
		const sid = new NightglideSidebar(() => ({
			model: "endless",
			thinkingLevel: undefined,
			subagents: [{ label: "planner", status: "active" }],
		}));
		const lines = sid.render(26).map(strip);
		expect(lines.some(l => l.includes("││"))).toBe(false);
	});

	it("paint-only: the component has no handleInput (keys flow to composer)", () => {
		const sidebar = makeSidebar({ model: "endless" });
		expect("handleInput" in sidebar).toBe(false);
	});

	it("rows respect width clamp at narrow sidebar widths", () => {
		for (const w of [14, 18, 26, 40]) {
			const lines = render({ model: "a-very-long-model-name-that-exceeds", thinkingLevel: "high" }, w);
			for (const line of lines) {
				expect([...line.replace(/\x1b\[[0-9;]*m/g, "")].length).toBeLessThanOrEqual(w);
			}
		}
	});
});
