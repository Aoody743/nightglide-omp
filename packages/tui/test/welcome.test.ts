import { afterEach, beforeAll, describe, expect, it, vi } from "bun:test";
import { pickWeightedTip, WelcomeComponent, gradientEscape } from "@oh-my-pi/pi-tui/prompt/welcome";
import { getCurrentThemeName, initTheme, setTheme, theme } from "@oh-my-pi/pi-tui/theme";
import { TERMINAL } from "@oh-my-pi/pi-tui/terminal-capabilities";
import { truncateToWidth, visibleWidth } from "@oh-my-pi/pi-tui";

describe("WelcomeComponent", () => {
	beforeAll(async () => {
		await initTheme(false);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("natively sets the version under the wordmark beside the logo", () => {
		const tree = new WelcomeComponent("18.4.12").describe({} as never);
		expect(tree.c?.[2]).toMatchObject({
			key: "lockup",
			p: { role: "omp.welcome.lockup" },
			c: [
				{ k: "image", key: "logo" },
				{
					k: "col",
					p: { role: "omp.welcome.mark" },
					c: [
						{ p: { role: "omp.welcome.wordmark" } },
						{ p: { role: "omp.welcome.version", spans: [{ t: "v18.4.12" }] } },
					],
				},
			],
		});
	});

	it("natively follows the version with the update status", () => {
		const welcome = new WelcomeComponent("1.0.0");
		welcome.setVersionUpdate({ phase: "updating", version: "1.1.0", fraction: 0.426 });
		const version = JSON.stringify(welcome.describe({} as never));
		expect(version).toContain('"t":"v1.0.0"');
		expect(version).toContain('"t":" → v1.1.0"');
		expect(version).toContain('"t":" 42%"');
	});

	it("selects standard tip when preset is not unicode", () => {
		vi.spyOn(theme, "getSymbolPreset").mockReturnValue("nerd");

		const welcome = new WelcomeComponent("1.0.0");
		expect(welcome.tip).not.toBe("Please use nerdfont 😭.");
		expect(welcome.tip).toBeDefined();
	});

	it("selects nerdfont tip with 10% probability under unicode preset", () => {
		vi.spyOn(theme, "getSymbolPreset").mockReturnValue("unicode");

		// 9% chance => selects special tip
		vi.spyOn(Math, "random").mockReturnValue(0.09);
		const welcomeSpecial = new WelcomeComponent("1.0.0");
		expect(welcomeSpecial.tip).toBe("Please use nerdfont 😭.");

		// 10% chance => selects regular tip
		vi.spyOn(Math, "random").mockReturnValue(0.1);
		const welcomeRegular = new WelcomeComponent("1.0.0");
		expect(welcomeRegular.tip).not.toBe("Please use nerdfont 😭.");
		expect(welcomeRegular.tip).toBeDefined();
	});

	it("weights [NEW] tips above ordinary tips in selection", () => {
		// Data-independent: tips.txt may legitimately carry zero "[NEW]" tips, so
		// exercise the weighting contract on a synthetic list.
		const tips = ["plain one", "shiny thing [NEW]", "plain two"] as const;

		const counts = new Map<string, number>();
		const samples = 10_000;
		for (let i = 0; i < samples; i++) {
			const tip = pickWeightedTip(tips, (i + 0.5) / samples); // sweep the selection domain uniformly
			counts.set(tip, (counts.get(tip) ?? 0) + 1);
		}

		let newMax = 0;
		let ordinaryMax = 0;
		for (const [tip, count] of counts) {
			if (/\[NEW\]\s*$/.test(tip)) newMax = Math.max(newMax, count);
			else ordinaryMax = Math.max(ordinaryMax, count);
		}

		// A "[NEW]" tip carries a >1 weight, so it covers strictly more of the
		// uniform selection domain than any single ordinary tip.
		expect(newMax).toBeGreaterThan(0);
		expect(newMax).toBeGreaterThan(ordinaryMax);
		expect(pickWeightedTip([], 0.5)).toBe("");
	});

	it("centers the lockup and every tip line in the terminal width", () => {
		const columns = 140;
		const rows = new WelcomeComponent("1.0.0").render(columns).map(row => Bun.stripANSI(row).trimEnd());
		const indent = (row: string) => visibleWidth(row) - visibleWidth(row.trimStart());
		const expectCentered = (left: number, right: number) => expect(Math.abs(left - right)).toBeLessThanOrEqual(1);

		// The lockup is one block: the logo's bar starts it, the wordmark row ends it.
		const bar = rows.find(row => row.includes("████████████")) ?? "";
		const word = rows.find(row => row.includes("▄▀▀▄")) ?? "";
		expectCentered(indent(bar), columns - visibleWidth(word));

		// Each tip line centers on its own.
		const below = rows.slice(rows.findIndex(row => row.includes("Tip: "))).filter(row => row.length > 0);
		expect(below.length).toBeGreaterThanOrEqual(1);
		for (const row of below) expectCentered(indent(row), columns - visibleWidth(row));
	});

	it("drops the tip below 50 columns", () => {
		const text = (columns: number) => Bun.stripANSI(new WelcomeComponent("1.0.0").render(columns).join("\n"));
		expect(text(50)).toContain("Tip: ");
		expect(text(49)).not.toContain("Tip: ");
		expect(text(49)).toContain("v1.0.0");
	});

	it("sets the version under the wordmark while the lockup fits, else keeps the logo alone", () => {
		const rows = (columns: number) => new WelcomeComponent("1.0.0").render(columns).map(row => Bun.stripANSI(row));

		// The lockup needs 12 logo + 4 gap + 15 wordmark columns inside the 2-column margin.
		const fits = rows(33);
		const word = fits.find(row => row.includes("▄▀▀▄"));
		const version = fits.find(row => row.includes("v1.0.0"));
		expect(fits.some(row => row.includes("████████████"))).toBe(true);
		expect(version?.indexOf("v1.0.0")).toBe(word?.indexOf("▄▀▀▄"));

		const narrow = rows(32).join("\n");
		expect(narrow).toContain("████████████");
		expect(narrow).not.toContain("▄▀▀▄");
		expect(narrow).not.toContain("v1.0.0");
	});

	it("trails the version with update progress, narrowing it before dropping it, without moving the lockup", () => {
		const rows = (columns: number, update: boolean) => {
			const welcome = new WelcomeComponent("1.0.0");
			if (update) welcome.setVersionUpdate({ phase: "updating", version: "1.1.0", fraction: 0.5 });
			return welcome.render(columns).map(row => Bun.stripANSI(row));
		};
		const versionRow = (columns: number) => rows(columns, true).find(row => row.includes("v1.0.0")) ?? "";

		// The lockup centers as if no indicator were there.
		expect(rows(80, true).slice(0, 4)).toEqual(rows(80, false).slice(0, 4));
		expect(versionRow(80)).toMatch(/v1\.0\.0 → v1\.1\.0 \S+ 50%$/);
		// Too narrow for the bar: the percent alone; narrower still: the bare version.
		expect(versionRow(56).trimStart()).toBe("██       v1.0.0 → v1.1.0 50%");
		expect(versionRow(38)).not.toContain("→");
		for (const columns of [80, 56, 38]) expect(visibleWidth(versionRow(columns))).toBeLessThan(columns);
	});

	it("renders the brand navigation line above the lockup with context right-aligned", () => {
		const rows = new WelcomeComponent("18.20.2")
			.render(80, { project: "nightglide-cli", model: "omlx/endless" })
			.map(row => Bun.stripANSI(row));
		const nav = rows[0] ?? "";

		expect(nav).toContain("✦ nightglide");
		expect(nav).toContain("nightglide-cli");
		expect(nav).toContain("omlx/endless");
		// Single compact line: context pinned to the right margin, nothing wraps.
		expect(visibleWidth(nav)).toBeLessThanOrEqual(80);
		expect(nav.trimEnd().endsWith("omlx/endless")).toBe(true);
		// An ultra-thin rule closes the navigation line.
		expect(rows[1]?.trim()).toMatch(/^─+$/);
	});

	it("keeps the navigation line to the brand alone when no context is given", () => {
		const rows = new WelcomeComponent("18.20.2").render(80).map(row => Bun.stripANSI(row));
		const nav = rows.find(row => row.includes("✦ nightglide")) ?? "";
		expect(nav).not.toContain("/");
		expect(rows[1]?.trim()).toMatch(/^─+$/);
	});

	it("feeds setContext through the framework-style single-argument render", () => {
		const welcome = new WelcomeComponent("18.20.2");
		welcome.setContext({ project: "proj", model: undefined });
		const nav = welcome.render(80).map(row => Bun.stripANSI(row))[0] ?? "";
		expect(nav).toContain("✦ nightglide");
		expect(nav).toContain("proj");
		expect(nav).not.toContain("undefined");
	});

	it("keeps the navigation line single-line at narrow widths by truncating context", () => {
		for (const columns of [40, 56, 80]) {
			const rows = new WelcomeComponent("18.20.2")
				.render(columns, { project: "a-very-long-project-name", model: "omlx/endless" })
				.map(row => Bun.stripANSI(row));
			const nav = rows[0] ?? "";
			expect(nav).toContain("✦ nightglide");
			expect(visibleWidth(nav)).toBeLessThanOrEqual(columns);
		}
	});

	it("natively renders quiet brand navigation line and rule above lockup without context", () => {
		const tree = new WelcomeComponent("1.0.0").describe({} as never);
		expect(tree.c?.[0]).toEqual({
			k: "row",
			key: "nav",
			p: { justify: "between", align: "center", role: "omp.welcome.nav" },
			c: [
				{
					k: "text",
					p: {
						role: "omp.welcome.brand",
						spans: [
							{ t: "✦ ", s: "accent" },
							{ t: "nightglide", s: "strong" },
						],
					},
				},
			],
		});
		expect(tree.c?.[1]).toEqual({
			k: "rule",
			key: "nav-rule",
			p: { role: "omp.welcome.rule" },
			c: undefined,
		});
	});

	it("natively includes project and model context in navigation line", () => {
		const welcome = new WelcomeComponent("1.0.0");
		welcome.setContext({ project: "nightglide-cli", model: "omlx/endless" });
		const tree = welcome.describe({} as never);
		expect(tree.c?.[0]).toMatchObject({
			key: "nav",
			p: { justify: "between", align: "center", role: "omp.welcome.nav" },
			c: [
				{
					p: {
						role: "omp.welcome.brand",
						spans: [
							{ t: "✦ ", s: "accent" },
							{ t: "nightglide", s: "strong" },
						],
					},
				},
				{
					k: "text",
					p: {
						role: "omp.welcome.context",
						spans: [
							{ t: "nightglide-cli", s: "muted" },
							{ t: " / ", s: "dim" },
							{ t: "omlx/endless", s: "dim" },
						],
					},
				},
			],
		});
		expect(tree.c?.[1]).toMatchObject({
			key: "nav-rule",
			k: "rule",
			p: { role: "omp.welcome.rule" },
		});
	});

	it("natively supports partial context (project only or model only)", () => {
		const welcomeProj = new WelcomeComponent("1.0.0");
		welcomeProj.setContext({ project: "my-project" });
		const treeProj = welcomeProj.describe({} as never);
		expect(treeProj.c?.[0]).toMatchObject({
			key: "nav",
			c: [
				{ p: { role: "omp.welcome.brand" } },
				{
					p: {
						role: "omp.welcome.context",
						spans: [{ t: "my-project", s: "muted" }],
					},
				},
			],
		});

		const welcomeModel = new WelcomeComponent("1.0.0");
		welcomeModel.setContext({ model: "claude-3-5" });
		const treeModel = welcomeModel.describe({} as never);
		expect(treeModel.c?.[0]).toMatchObject({
			key: "nav",
			c: [
				{ p: { role: "omp.welcome.brand" } },
				{
					p: {
						role: "omp.welcome.context",
						spans: [{ t: "claude-3-5", s: "dim" }],
					},
				},
			],
		});
	});

	it("caches native node and updates on setContext", () => {
		const welcome = new WelcomeComponent("1.0.0");
		welcome.setContext({ project: "proj-1", model: "model-1" });
		const first = welcome.describe({} as never);
		const second = welcome.describe({} as never);
		expect(first).toBe(second);

		welcome.setContext({ project: "proj-2", model: "model-2" });
		const third = welcome.describe({} as never);
		expect(third).not.toBe(first);
		const json = JSON.stringify(third);
		expect(json).toContain("proj-2");
		expect(json).toContain("model-2");
		expect(json).not.toContain("proj-1");
	});

	it("natively truncates overflowing nav context to a single muted span", () => {
		const plain = "nightglide-cli / omlx/endless";
		const welcome = new WelcomeComponent("1.0.0");
		welcome.setContext({ project: "nightglide-cli", model: "omlx/endless" });
		const tree = welcome.describe({ cols: 40 } as never);
		// Same measure as the ANSI path: room keeps a clear column on each side,
		// then the brand width and the minimum gap come off before the context.
		const available = 40 - 2 - visibleWidth("✦ nightglide") - 3;
		expect(visibleWidth(plain)).toBeGreaterThan(available); // precondition: the overflow path
		expect(tree.c?.[0]).toMatchObject({
			key: "nav",
			c: [
				{ p: { role: "omp.welcome.brand" } },
				{
					k: "text",
					p: {
						role: "omp.welcome.context",
						spans: [{ t: truncateToWidth(plain, available), s: "muted" }],
					},
				},
			],
		});
	});

	it("natively omits the nav line and rule when the terminal is narrower than the brand", () => {
		const tree = new WelcomeComponent("1.0.0").describe({ cols: 12 } as never);
		// The lockup alone: no nav row, no rule (and no tip below the 50-column gate).
		expect(tree.c).toHaveLength(1);
		expect(tree.c?.[0]).toMatchObject({ key: "lockup" });
		const json = JSON.stringify(tree);
		expect(json).not.toContain("omp.welcome.nav");
		expect(json).not.toContain("omp.welcome.rule");
	});

	it("natively gates the tip row on the 50-column minimum", () => {
		const welcome = new WelcomeComponent("1.0.0");
		expect(welcome.tip).toBeDefined(); // precondition: a tip exists to gate
		expect(JSON.stringify(welcome.describe({ cols: 49 } as never))).not.toContain("omp.welcome.tip");
		expect(JSON.stringify(welcome.describe({ cols: 50 } as never))).toContain("omp.welcome.tip");
	});

	it("natively keeps the full dual-span nav context at roomy widths", () => {
		const welcome = new WelcomeComponent("1.0.0");
		welcome.setContext({ project: "nightglide-cli", model: "omlx/endless" });
		const tree = welcome.describe({ cols: 100 } as never);
		expect(tree.c?.[0]).toMatchObject({
			key: "nav",
			c: [
				{
					p: {
						role: "omp.welcome.brand",
						spans: [
							{ t: "✦ ", s: "accent" },
							{ t: "nightglide", s: "strong" },
						],
					},
				},
				{
					k: "text",
					p: {
						role: "omp.welcome.context",
						spans: [
							{ t: "nightglide-cli", s: "muted" },
							{ t: " / ", s: "dim" },
							{ t: "omlx/endless", s: "dim" },
						],
					},
				},
			],
		});
	});

	it("rebuilds the native node when the describe width changes", () => {
		const welcome = new WelcomeComponent("1.0.0");
		const wide = welcome.describe({ cols: 100 } as never);
		expect(welcome.describe({ cols: 100 } as never)).toBe(wide);
		const narrow = welcome.describe({ cols: 12 } as never);
		expect(narrow).not.toBe(wide);
		expect(JSON.stringify(narrow)).not.toContain("omp.welcome.nav");
	});

	it("paints the live glow gradient with the aurora theme stops on dark surfaces", async () => {
		const previousThemeName = getCurrentThemeName();
		const terminal = TERMINAL as unknown as { trueColor: boolean };
		const previousTrueColor = terminal.trueColor;
		terminal.trueColor = true;
		const previousNodeEnv = process.env.NODE_ENV;
		// gradientEscape pins the stops to the upstream palette under the test
		// runtime; stepping out of it exercises the live theme selection below.
		process.env.NODE_ENV = "production";
		try {
			await setTheme("nightglide-aurora");
			expect(theme.isLight).toBe(false); // precondition: aurora is a dark theme
			// Each stop anchors a gradient segment endpoint with its exact SGR.
			expect(gradientEscape(0)).toBe("\x1b[38;2;213;166;255m"); // #d5a6ff accent violet
			expect(gradientEscape(1 / 3)).toBe("\x1b[38;2;126;112;165m"); // #7e70a5 twilight violet
			expect(gradientEscape(2 / 3)).toBe("\x1b[38;2;127;215;232m"); // #7fd7e8 glacier cyan
			expect(gradientEscape(1)).toBe("\x1b[38;2;120;229;216m"); // #78e5d8 aurora teal
			// Flight keeps its own periwinkle band; the aurora branch did not swallow it.
			await setTheme("nightglide-flight");
			expect(gradientEscape(0)).toBe("\x1b[38;2;181;182;255m"); // #B5B6FF Flight periwinkle
		} finally {
			if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
			else process.env.NODE_ENV = previousNodeEnv;
			terminal.trueColor = previousTrueColor;
			if (previousThemeName !== undefined) await setTheme(previousThemeName);
		}
	});
});
