import { beforeAll, describe, expect, it } from "bun:test";
import { HistorySearchComponent, type HistorySearchEntry, type HistorySource } from "../src/overlays/history-search";
import { initTheme, setTheme, theme } from "../src/theme";

function bandOpen(): string {
	return theme.bgFill("selectedBg", "").replace("\x1b[49m", "");
}

function leftClick(row1Based: number, col1Based = 4): string {
	return `\x1b[<0;${col1Based};${row1Based}M`;
}

function mouseMove(row1Based: number, col1Based = 4): string {
	return `\x1b[<35;${col1Based};${row1Based}M`;
}

function wheel(direction: "up" | "down"): string {
	return `\x1b[<${direction === "down" ? 65 : 64};1;1M`;
}

function makeStorage(prompts: string[]): HistorySource {
	const entries: HistorySearchEntry[] = prompts.map((prompt, i) => ({
		id: i + 1,
		prompt,
		created_at: 1700000000 + i * 100,
	}));
	return {
		getRecent: limit => entries.slice(0, limit),
		search: (query, limit) =>
			entries.filter(e => e.prompt.toLowerCase().includes(query.toLowerCase())).slice(0, limit),
		delete: id => {
			const idx = entries.findIndex(e => e.id === id);
			if (idx >= 0) entries.splice(idx, 1);
		},
	};
}

describe("HistorySearchComponent styling & hover", () => {
	beforeAll(async () => {
		await initTheme();
		await setTheme("dark");
	});

	it("renders selected row with bgFill selectedBg preventing holes around highlighted tokens", () => {
		const storage = makeStorage(["deploy needle rollback", "routine status update"]);
		const component = new HistorySearchComponent(
			storage,
			() => {},
			() => {},
		);

		// Type 'needle'
		for (const ch of "needle") component.handleInput(ch);

		const lines = component.render(80);
		const bg = bandOpen();

		const selectedLine = lines.find(l => l.includes("needle") && l.includes("rollback"));
		expect(selectedLine).toBeDefined();
		expect(selectedLine).toContain(bg);

		// Contains highlighted token
		expect(selectedLine).toContain(theme.fg("accent", "needle"));

		// bgFill ensures that after the token highlight (which resets foreground),
		// the selectedBg background ANSI is resumed:
		expect(selectedLine).toContain(theme.getBgAnsi("selectedBg"));
	});

	it("supports mouse hover on history results", () => {
		const storage = makeStorage(["first prompt", "second prompt", "third prompt"]);
		let requestedRender = false;
		const component = new HistorySearchComponent(
			storage,
			() => {},
			() => {},
		);
		component.setOnRequestRender(() => {
			requestedRender = true;
		});

		let lines = component.render(80);
		const bg = bandOpen();

		const secondRowIdx = lines.findIndex(l => l.includes("second prompt"));
		expect(secondRowIdx).toBeGreaterThan(0);

		// Hover over second item (1-based row)
		component.handleInput(mouseMove(secondRowIdx + 1));
		expect(component.getHoverIndex()).toBe(1);
		expect(requestedRender).toBe(true);

		// Re-render and check second item has selectedBg
		lines = component.render(80);
		const secondLine = lines.find(l => l.includes("second prompt"))!;
		expect(secondLine).toContain(bg);

		// Hover off (e.g. top border) clears hover
		component.handleInput(mouseMove(1));
		expect(component.getHoverIndex()).toBeNull();
	});

	it("supports mouse wheel and left click selection", () => {
		const storage = makeStorage(["first prompt", "second prompt", "third prompt"]);
		let selectedPrompt: string | undefined;
		const component = new HistorySearchComponent(
			storage,
			p => {
				selectedPrompt = p;
			},
			() => {},
		);

		let lines = component.render(80);

		// Wheel down moves to second prompt
		component.handleInput(wheel("down"));
		// Enter confirms
		component.handleInput("\n");
		expect(selectedPrompt).toBe("second prompt");

		// Click on third item directly selects and confirms it
		selectedPrompt = undefined;
		lines = component.render(80);
		const thirdRowIdx = lines.findIndex(l => l.includes("third prompt"));
		expect(thirdRowIdx).toBeGreaterThan(0);

		component.handleInput(leftClick(thirdRowIdx + 1));
		expect<string | undefined>(selectedPrompt).toBe("third prompt");
	});
});
