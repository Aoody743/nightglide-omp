import { afterEach, beforeAll, describe, expect, it } from "bun:test";
import { StatusLineComponent } from "../src/status-line/component";
import type { StatusLineHost, StatusLineSession } from "../src/status-line/host";
import type { StatusLineSettings } from "../src/status-line/types";
import { initTheme } from "../src/theme";

const SETTINGS: StatusLineSettings = {
	preset: "custom",
	leftSegments: ["model", "session_name"],
	rightSegments: [],
};

const session = {
	state: { messages: [], model: { id: "test-model", name: "Test Model", thinking: {} }, thinkingLevel: "high" },
	isAutoThinking: false,
	autoResolvedThinkingLevel: () => undefined,
	isFastModeActive: () => false,
	isFastModeEnabled: () => false,
	modelRegistry: { isUsingSubscription: () => false },
	sessionManager: {
		getSessionId: () => "s",
		getSessionName: () => "Hosted Title",
		getUsageStatistics: () => ({
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
		}),
	},
	getAsyncJobSnapshot: () => ({ running: [] }),
} as unknown as StatusLineSession;

const HOST = {
	getSettings: () => SETTINGS,
	gitEnabled: () => false,
	codexResetFireworksEnabled: () => false,
	getSettingsRevision: () => 0,
	getSessionSettingsIdentity: () => null,
	getSessionSettingsRevision: () => 0,
	goalStatusInFooter: () => false,
	activeAccount: () => undefined,
	canFetchUsageReports: () => false,
	fetchUsageReports: () => Promise.resolve(null),
	calculateTokensPerSecond: () => null,
	limitMatchesActiveAccount: () => false,
	computeCompactionBoundaries: () => null,
	lookupPullRequest: () => Promise.resolve({ stdout: "", exitCode: 0 }),
	resolveActiveRepo: () => null,
} as unknown as StatusLineHost<StatusLineSession>;

describe("status line segments hosted elsewhere", () => {
	let component: StatusLineComponent | undefined;
	beforeAll(async () => {
		await initTheme();
	});
	afterEach(() => {
		component?.dispose();
		component = undefined;
	});

	it("drops the model chip while another surface shows it and restores it", () => {
		component = new StatusLineComponent(session, HOST);
		component.updateSettings(SETTINGS);
		const text = () => Bun.stripANSI(component!.renderBottomBar(100, "full") ?? "");

		expect(text()).toContain("Test Model");

		component.setHostedElsewhere(["model"]);
		const hidden = text();
		expect(hidden).not.toContain("Test Model");
		expect(hidden).toContain("Hosted Title");

		component.setHostedElsewhere([]);
		expect(text()).toContain("Test Model");
	});
});
