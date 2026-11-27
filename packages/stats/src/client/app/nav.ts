import {
	Activity,
	CircleAlert,
	Coins,
	Cpu,
	FolderGit2,
	Frown,
	LayoutGrid,
	type LucideIcon,
	PlugZap,
	ScanSearch,
	Sparkles,
	SquareChartGantt,
	Wrench,
} from "lucide-react";
import type { WebTextKey } from "../webI18n";

export type DashboardSection =
	| "overview"
	| "models"
	| "providers"
	| "costs"
	| "requests"
	| "errors"
	| "traces"
	| "tools"
	| "frustration"
	| "projects"
	| "gain"
	| "spotlight";

export interface NavItem {
	id: DashboardSection;
	label: string;
	labelKey: WebTextKey;
	icon: LucideIcon;
	/** Second key of the `g <key>` jump shortcut. */
	hotkey: string;
}

export interface NavGroup {
	heading: string;
	headingKey: WebTextKey;
	items: readonly NavItem[];
}

/** Sidebar structure; the order here is the order on screen. */
export const NAV: readonly NavGroup[] = [
	{
		heading: "Usage",
		headingKey: "nav.group.usage",
		items: [
			{ id: "overview", label: "Overview", labelKey: "nav.overview", icon: LayoutGrid, hotkey: "o" },
			{ id: "models", label: "Models", labelKey: "nav.models", icon: Cpu, hotkey: "m" },
			{ id: "providers", label: "Providers", labelKey: "nav.providers", icon: PlugZap, hotkey: "p" },
			{ id: "costs", label: "Costs", labelKey: "nav.costs", icon: Coins, hotkey: "c" },
		],
	},
	{
		heading: "Activity",
		headingKey: "nav.group.activity",
		items: [
			{ id: "requests", label: "Requests", labelKey: "nav.requests", icon: Activity, hotkey: "r" },
			{ id: "errors", label: "Errors", labelKey: "nav.errors", icon: CircleAlert, hotkey: "e" },
			{ id: "traces", label: "Traces", labelKey: "nav.traces", icon: SquareChartGantt, hotkey: "t" },
		],
	},
	{
		heading: "Insights",
		headingKey: "nav.group.insights",
		items: [
			{ id: "tools", label: "Tools", labelKey: "nav.tools", icon: Wrench, hotkey: "l" },
			{ id: "frustration", label: "Frustration", labelKey: "nav.frustration", icon: Frown, hotkey: "f" },
			{ id: "projects", label: "Projects", labelKey: "nav.projects", icon: FolderGit2, hotkey: "j" },
			{ id: "gain", label: "Gain", labelKey: "nav.gain", icon: Sparkles, hotkey: "g" },
			{ id: "spotlight", label: "Spotlight", labelKey: "nav.spotlight", icon: ScanSearch, hotkey: "s" },
		],
	},
];

export const NAV_ITEMS: readonly NavItem[] = NAV.flatMap(group => group.items);

export const SECTIONS: readonly DashboardSection[] = NAV_ITEMS.map(item => item.id);

export function navItem(section: DashboardSection): NavItem {
	return NAV_ITEMS.find(item => item.id === section) ?? NAV_ITEMS[0];
}
