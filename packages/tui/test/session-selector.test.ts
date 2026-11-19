import { beforeAll, describe, expect, it } from "bun:test";
import { SessionSelectorComponent, type SessionSelectorEntry } from "../src/overlays/session-selector";
import { initTheme, setTheme, theme } from "../src/theme";

function bandOpen(): string {
	return theme.bgFill("selectedBg", "").replace("\x1b[49m", "");
}

function mouseMove(row1Based: number, col1Based = 4): string {
	return `\x1b[<35;${col1Based};${row1Based}M`;
}

function createSession(id: string, title?: string, firstMessage = "First message"): SessionSelectorEntry {
	return {
		id,
		path: `/work/${id}.jsonl`,
		cwd: "/work",
		title,
		created: new Date("2024-01-01T00:00:00Z"),
		modified: new Date("2024-01-02T00:00:00Z"),
		size: 2048,
		firstMessage,
		allMessagesText: firstMessage,
	};
}

describe("SessionSelectorComponent card styling & hover", () => {
	beforeAll(async () => {
		await initTheme();
		await setTheme("dark");
	});

	it("renders a unified selectedBg full-width band across all lines of the selected card", () => {
		const sessions = [
			createSession("s1", "Alpha Project", "Detail message for alpha"),
			createSession("s2", "Beta Project", "Detail message for beta"),
		];
		const selector = new SessionSelectorComponent(
			sessions,
			() => {},
			() => {},
			() => {},
			{ getTerminalRows: () => 40 },
		);

		const width = 80;
		const lines = selector.render(width);
		const bg = bandOpen();

		// Find the lines of the first session (selected)
		const s1Title = lines.find(l => l.includes("Alpha Project"))!;
		const s1Preview = lines.find(l => l.includes("Detail message for alpha"))!;
		const s2Title = lines.find(l => l.includes("Beta Project"))!;
		const s2Preview = lines.find(l => l.includes("Detail message for beta"))!;

		expect(s1Title).toBeDefined();
		expect(s1Preview).toBeDefined();
		expect(s2Title).toBeDefined();
		expect(s2Preview).toBeDefined();

		// Selected session lines carry the selectedBg band
		expect(s1Title).toContain(bg);
		expect(s1Preview).toContain(bg);

		// Unselected session lines do not carry selectedBg
		expect(s2Title).not.toContain(bg);
		expect(s2Preview).not.toContain(bg);

		// Preview line is muted on selected, dim on unselected
		expect(s1Preview).toContain(theme.fg("muted", "Detail message for alpha"));
		expect(s2Preview).toContain(theme.fg("dim", "Detail message for beta"));
	});

	it("supports mouse hover to highlight session cards with full-width selectedBg band", () => {
		const sessions = [
			createSession("s1", "Alpha Project", "Detail alpha"),
			createSession("s2", "Beta Project", "Detail beta"),
		];
		const selector = new SessionSelectorComponent(
			sessions,
			() => {},
			() => {},
			() => {},
			{ getTerminalRows: () => 40 },
		);

		const width = 80;
		let lines = selector.render(width);
		const bg = bandOpen();

		const betaRowIdx = lines.findIndex(l => l.includes("Beta Project"));
		expect(betaRowIdx).toBeGreaterThan(0);

		// Hover over Beta session (row is 1-based in SGR)
		selector.handleInput(mouseMove(betaRowIdx + 1));
		expect(selector.getHoverIndex()).toBe(1);

		// Re-render and check that Beta session now carries selectedBg band
		lines = selector.render(width);
		const s2Title = lines.find(l => l.includes("Beta Project"))!;
		const s2Preview = lines.find(l => l.includes("Detail beta"))!;

		expect(s2Title).toContain(bg);
		expect(s2Preview).toContain(bg);
		expect(s2Preview).toContain(theme.fg("muted", "Detail beta"));

		// Moving mouse to the footer (e.g. bottom lines) clears hover
		const footerRowIdx = lines.findIndex(l => l.includes("cancel"));
		if (footerRowIdx >= 0) {
			selector.handleInput(mouseMove(footerRowIdx + 1));
			expect(selector.getHoverIndex()).toBeNull();
		}
	});

	it("renders a prominent capsule badge for the current session", () => {
		const sessions = [createSession("s1", "Alpha Project"), createSession("s2", "Beta Project")];
		const selector = new SessionSelectorComponent(
			sessions,
			() => {},
			() => {},
			() => {},
			{
				getTerminalRows: () => 40,
				currentSessionPath: "/work/s1.jsonl",
			},
		);

		const lines = selector.render(80);
		const s1Card = lines.join("\n");
		expect(s1Card).toContain(" current ");
		expect(s1Card).toContain(theme.inverse(theme.bold(theme.fg("accent", " current "))));
	});
});
