import { describe, expect, it } from "bun:test";
import { visibleWidth } from "../src/utils";
import {
	activeThinkingEffort,
	effortLadderBadgeToken,
	effortLadderGlyph,
	effortLadderToken,
	effortPulseFrameToken,
	effortPulseFrames,
	resetActiveThinkingEffortForTests,
	setActiveThinkingEffort,
} from "../src/chat/effort-ladder";

describe("effort ladder glyphs", () => {
	it("maps each rung to its single glyph", () => {
		expect(effortLadderGlyph("minimal")).toBe("·");
		expect(effortLadderGlyph("low")).toBe("◦");
		expect(effortLadderGlyph("medium")).toBe("○");
		expect(effortLadderGlyph("high")).toBe("◎");
		expect(effortLadderGlyph("xhigh")).toBe("✦");
	});

	it("folds max onto the xhigh rung", () => {
		expect(effortLadderGlyph("max")).toBe("✦");
		expect(effortLadderToken("max")).toBe("thinkingXhigh");
		expect(effortLadderBadgeToken("max")).toBe("thinkingXhigh");
	});

	it("shows nothing for off, inherit, auto, and unknown levels", () => {
		for (const level of ["off", "inherit", "auto", "none", undefined, ""]) {
			expect(effortLadderGlyph(level)).toBe("");
			expect(effortLadderToken(level)).toBeUndefined();
			expect(effortLadderBadgeToken(level)).toBeUndefined();
		}
	});

	it("keeps every rung glyph single-column (Zero Jitter)", () => {
		for (const level of ["minimal", "low", "medium", "high", "xhigh", "max"]) {
			expect(visibleWidth(effortLadderGlyph(level))).toBe(1);
		}
	});
});

describe("effort ladder badge tokens", () => {
	it("dims the quiet rungs and colors the glowing ones", () => {
		expect(effortLadderBadgeToken("minimal")).toBe("dim");
		expect(effortLadderBadgeToken("low")).toBe("dim");
		expect(effortLadderBadgeToken("medium")).toBe("thinkingMedium");
		expect(effortLadderBadgeToken("high")).toBe("thinkingHigh");
		expect(effortLadderBadgeToken("xhigh")).toBe("thinkingXhigh");
	});

	it("keeps the raw rung slot for every rung", () => {
		expect(effortLadderToken("minimal")).toBe("thinkingMinimal");
		expect(effortLadderToken("low")).toBe("thinkingLow");
		expect(effortLadderToken("medium")).toBe("thinkingMedium");
		expect(effortLadderToken("high")).toBe("thinkingHigh");
		expect(effortLadderToken("xhigh")).toBe("thinkingXhigh");
	});
});

describe("effort pulse frame sets", () => {
	it("climbs from quiet dots to the full starburst", () => {
		expect(effortPulseFrames("minimal")).toEqual(["·", "•"]);
		expect(effortPulseFrames("low")).toEqual(["·", "◦", "•"]);
		expect(effortPulseFrames("medium")).toEqual(["✻", "❊", "✸"]);
		expect(effortPulseFrames("high")).toEqual(["✻", "✼", "❉", "❊", "✺", "✹", "✸", "✶"]);
		expect(effortPulseFrames("xhigh")).toEqual(["✻", "✼", "❉", "❊", "✺", "✹", "✸", "✶"]);
	});

	it("keeps the historical full set as the unknown/off baseline", () => {
		for (const level of ["off", "auto", "inherit", undefined, "nonsense"]) {
			expect(effortPulseFrames(level)).toEqual(["✻", "✼", "❉", "❊", "✺", "✹", "✸", "✶"]);
		}
	});

	it("stays inside the full revolution for medium (a subset, reordered frames all from the base set)", () => {
		const full = new Set(["✻", "✼", "❉", "❊", "✺", "✹", "✸", "✶"]);
		for (const frame of effortPulseFrames("medium")) expect(full.has(frame)).toBe(true);
	});

	it("keeps every frame of every set single-column (Zero Jitter)", () => {
		for (const level of ["minimal", "low", "medium", "high", "xhigh", "max", "off", undefined]) {
			const widths = effortPulseFrames(level).map(visibleWidth);
			expect(widths.length).toBeGreaterThan(0);
			for (const width of widths) expect(width).toBe(1);
			expect(new Set(widths).size).toBe(1);
		}
	});
});

describe("effort pulse frame colors", () => {
	it("paints rung frames with the rung slot", () => {
		expect(effortPulseFrameToken("minimal", 0)).toBe("thinkingMinimal");
		expect(effortPulseFrameToken("low", 1)).toBe("thinkingLow");
		expect(effortPulseFrameToken("medium", 2)).toBe("thinkingMedium");
		expect(effortPulseFrameToken("high", 3)).toBe("thinkingHigh");
	});

	it("alternates xhigh between thinkingXhigh and accent per frame", () => {
		expect(effortPulseFrameToken("xhigh", 0)).toBe("thinkingXhigh");
		expect(effortPulseFrameToken("xhigh", 1)).toBe("accent");
		expect(effortPulseFrameToken("xhigh", 2)).toBe("thinkingXhigh");
		expect(effortPulseFrameToken("xhigh", 7)).toBe("accent");
		expect(effortPulseFrameToken("max", 1)).toBe("accent");
	});

	it("falls back to the historical thinkingText when no rung is published", () => {
		expect(effortPulseFrameToken(undefined, 0)).toBe("thinkingText");
		expect(effortPulseFrameToken("off", 4)).toBe("thinkingText");
		expect(effortPulseFrameToken("auto", 4)).toBe("thinkingText");
	});
});

describe("ambient effort slot", () => {
	it("starts unpublished and round-trips a level", () => {
		resetActiveThinkingEffortForTests();
		expect(activeThinkingEffort()).toBeUndefined();
		setActiveThinkingEffort("high");
		expect(activeThinkingEffort()).toBe("high");
		setActiveThinkingEffort("off");
		expect(activeThinkingEffort()).toBe("off");
		setActiveThinkingEffort(undefined);
		expect(activeThinkingEffort()).toBeUndefined();
		resetActiveThinkingEffortForTests();
		expect(activeThinkingEffort()).toBeUndefined();
	});
});
