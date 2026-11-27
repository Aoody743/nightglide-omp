import { useSyncExternalStore } from "react";

export type WebLanguage = "zh" | "en";

const STORAGE_KEY = "nightglide-stats-lang";

export const WEB_TEXT = {
	// Brand & topbar
	"brand.name": { zh: "Nightglide", en: "Nightglide" },
	"brand.stats": { zh: "统计面板", en: "Stats" },
	"topbar.openNav": { zh: "打开导航", en: "Open navigation" },
	"topbar.pages": { zh: "页面导航", en: "Pages" },
	"topbar.timeRange": { zh: "时间范围", en: "Time range" },
	"topbar.switchLang": { zh: "切换界面语言 (中 / EN)", en: "Switch interface language (中 / EN)" },

	// Sidebar navigation
	"nav.group.usage": { zh: "用量", en: "Usage" },
	"nav.group.activity": { zh: "活动", en: "Activity" },
	"nav.group.insights": { zh: "洞察", en: "Insights" },
	"nav.overview": { zh: "总览", en: "Overview" },
	"nav.models": { zh: "模型", en: "Models" },
	"nav.providers": { zh: "提供商", en: "Providers" },
	"nav.costs": { zh: "费用", en: "Costs" },
	"nav.requests": { zh: "请求", en: "Requests" },
	"nav.errors": { zh: "错误", en: "Errors" },
	"nav.traces": { zh: "追踪", en: "Traces" },
	"nav.tools": { zh: "工具", en: "Tools" },
	"nav.frustration": { zh: "挫败度", en: "Frustration" },
	"nav.projects": { zh: "项目", en: "Projects" },
	"nav.gain": { zh: "压缩收益", en: "Gain" },
	"nav.spotlight": { zh: "Spotlight", en: "Spotlight" },
	"sidebar.rangeHint": { zh: "时间范围", en: "range" },
	"sidebar.jumpHint": { zh: "+键 跳转", en: "then letter to jump" },

	// Time ranges
	"range.1h.label": { zh: "1h", en: "1h" },
	"range.24h.label": { zh: "24h", en: "24h" },
	"range.7d.label": { zh: "7d", en: "7d" },
	"range.30d.label": { zh: "30d", en: "30d" },
	"range.90d.label": { zh: "90d", en: "90d" },
	"range.all.label": { zh: "全部", en: "All" },
	"range.1h.window": { zh: "最近 1 小时", en: "the last hour" },
	"range.24h.window": { zh: "最近 24 小时", en: "the last 24 hours" },
	"range.7d.window": { zh: "最近 7 天", en: "the last 7 days" },
	"range.30d.window": { zh: "最近 30 天", en: "the last 30 days" },
	"range.90d.window": { zh: "最近 90 天", en: "the last 90 days" },
	"range.all.window": { zh: "全部时间", en: "all time" },

	// Live status chip
	"live.reconnecting": { zh: "重连中", en: "Reconnecting" },
	"live.reconnectingTitle": {
		zh: "与统计服务器的实时连接已断开，正在重试",
		en: "Lost the live connection to the stats server; retrying",
	},
	"live.syncing": { zh: "同步中", en: "Syncing" },
	"live.syncingTitle": { zh: "正在导入会话文件", en: "Ingesting session files" },
	"live.syncFailed": { zh: "同步失败", en: "Sync failed" },
	"live.syncFailedTitle": { zh: "{error} — 点击重试", en: "{error} — click to retry" },
	"live.indexing": { zh: "索引中", en: "Indexing" },
	"live.indexingLeft": { zh: "剩余 {hours}h", en: "{hours}h left" },
	"live.indexingTitle": {
		zh: "正在构建每小时汇总，较早时间范围将逐步补齐",
		en: "Building hourly rollups; older ranges fill in as it goes",
	},
	"live.live": { zh: "实时", en: "Live" },
	"live.liveTitle": { zh: "点击立即同步会话文件", en: "Click to sync session files now" },
	"live.justNow": { zh: "刚刚", en: "just now" },
	"live.minAgo": { zh: "{n}分钟前", en: "{n}m ago" },
	"live.hourAgo": { zh: "{n}小时前", en: "{n}h ago" },
	"live.dayAgo": { zh: "{n}天前", en: "{n}d ago" },

	// Theme toggle & close button
	"theme.system": { zh: "跟随系统主题", en: "System theme" },
	"theme.light": { zh: "云光浅色主题", en: "Cloudlight theme" },
	"theme.dark": { zh: "夜航深色主题", en: "Flight Dark theme" },
	"theme.switchAria": { zh: "{label}（点击切换）", en: "{label} (click to switch)" },
	"theme.switchTitle": { zh: "{label} — 点击切换", en: "{label} — click to switch" },
	"close.label": { zh: "关闭", en: "Close" },
	"close.title": { zh: "关闭统计面板 (Esc)", en: "Close the dashboard (Esc)" },

	// Shared UI primitives
	"ui.emptyTitle": { zh: "暂无数据", en: "Nothing here yet" },
	"ui.retry": { zh: "重试", en: "Retry" },
	"ui.close": { zh: "关闭", en: "Close" },
	"ui.cancel": { zh: "取消", en: "Cancel" },
	"ui.copy": { zh: "复制", en: "Copy" },
	"ui.copied": { zh: "已复制", en: "Copied" },
	"ui.filter": { zh: "筛选", en: "Filter" },
	"ui.filterPlaceholder": { zh: "筛选…", en: "Filter…" },
	"ui.showMore": { zh: "展开更多", en: "Show more" },
	"ui.showFewer": { zh: "收起", en: "Show fewer" },
	"ui.countOf": { zh: "已显示 {shown} / {total}", en: "{shown} of {total}" },
	"ui.noDataInRange": { zh: "该时间范围内暂无数据", en: "No data in this range" },
	"ui.total": { zh: "合计", en: "Total" },

	// Request drawer
	"req.status.ok": { zh: "成功", en: "OK" },
	"req.status.aborted": { zh: "已中止", en: "Aborted" },
	"req.status.failed": { zh: "失败", en: "Failed" },
	"req.titleFallback": { zh: "请求详情", en: "Request" },
	"req.traceBtn": { zh: "追踪", en: "Trace" },
	"req.traceTitle": { zh: "在追踪视图中打开该请求的会话", en: "Open this request's session in the trace view" },
	"req.errorLabel": { zh: "错误", en: "Error" },
	"req.section.timing": { zh: "耗时指标", en: "Timing" },
	"req.section.tokens": { zh: "Token 用量", en: "Tokens" },
	"req.section.cost": { zh: "等效 API 费用", en: "API-equivalent cost" },
	"req.section.identity": { zh: "标识信息", en: "Identity" },
	"req.kv.started": { zh: "开始时间", en: "Started" },
	"req.kv.duration": { zh: "总耗时", en: "Duration" },
	"req.kv.ttft": { zh: "首字延迟", en: "Time to first token" },
	"req.kv.tps": { zh: "输出速率", en: "Output tokens/s" },
	"req.kv.input": { zh: "未缓存输入", en: "Uncached input" },
	"req.kv.cacheRead": { zh: "缓存读取", en: "Cache read" },
	"req.kv.cacheWrite": { zh: "缓存写入", en: "Cache write" },
	"req.kv.output": { zh: "输出", en: "Output" },
	"req.kv.total": { zh: "总计", en: "Total" },
	"req.kv.premium": { zh: "高级请求数", en: "Premium requests" },
	"req.kv.inputShort": { zh: "输入", en: "Input" },
	"req.kv.reqId": { zh: "请求 ID", en: "Request id" },
	"req.kv.entryId": { zh: "条目 ID", en: "Entry id" },
	"req.kv.stopReason": { zh: "停止原因", en: "Stop reason" },
	"req.kv.api": { zh: "接口", en: "API" },
	"req.kv.project": { zh: "项目", en: "Project" },
	"req.kv.sessionFile": { zh: "会话文件", en: "Session file" },
	"req.json.output": { zh: "输出消息", en: "Output message" },
	"req.json.entry": { zh: "会话条目", en: "Session entry" },
	"req.json.row": { zh: "统计记录", en: "Stats row" },

	// Overview route
	"overview.title": { zh: "总览", en: "Overview" },
	"overview.desc": {
		zh: "Nightglide 在{window}内的全部会话活动概览。",
		en: "Everything Nightglide did across your sessions in {window}.",
	},
	"overview.stat.cost": { zh: "等效 API 费用", en: "API-equivalent cost" },
	"overview.stat.costTitle": {
		zh: "按公开 API 费率折算的等效费用",
		en: "What this usage would cost at public API rates",
	},
	"overview.stat.unpriced": { zh: "{count} 次未定价", en: "{count} unpriced" },
	"overview.stat.requests": { zh: "请求数", en: "Requests" },
	"overview.stat.failed": { zh: "{count} 次失败", en: "{count} failed" },
	"overview.stat.tokens": { zh: "会话 Token", en: "Conversation tokens" },
	"overview.stat.tokensTitle": {
		zh: "未缓存输入 + 缓存读取 + 缓存写入 + 输出",
		en: "Uncached input + cache reads + cache writes + output",
	},
	"overview.stat.outputHint": { zh: "{count} 输出", en: "{count} output" },
	"overview.stat.cacheRate": { zh: "缓存命中率", en: "Cache rate" },
	"overview.stat.cacheRateTitle": {
		zh: "缓存读取 ÷ (未缓存输入 + 缓存读取)",
		en: "Cache reads ÷ (uncached input + cache reads)",
	},
	"overview.stat.savedHint": { zh: "节省 {pct}", en: "{pct} saved" },
	"overview.stat.errorRate": { zh: "错误率", en: "Error rate" },
	"overview.stat.succeededHint": { zh: "{count} 次成功", en: "{count} succeeded" },
	"overview.stat.uncachedInput": { zh: "未缓存输入", en: "Uncached input" },
	"overview.stat.cacheRead": { zh: "缓存读取", en: "Cache read" },
	"overview.stat.cacheWrite": { zh: "缓存写入", en: "Cache write" },
	"overview.stat.output": { zh: "输出", en: "Output" },
	"overview.stat.premium": { zh: "高级请求", en: "Premium requests" },
	"overview.stat.tps": { zh: "输出速率 (tok/s)", en: "Tokens/s" },
	"overview.stat.avgLatency": { zh: "平均耗时", en: "Avg latency" },
	"overview.stat.avgTtft": { zh: "平均首字延迟", en: "Avg TTFT" },
	"overview.card.activity": { zh: "活动趋势", en: "Activity" },
	"overview.card.perBucket": { zh: "按{unit}统计", en: "Per {unit}" },
	"overview.unit.5m": { zh: "5 分钟", en: "5 minutes" },
	"overview.unit.hour": { zh: "小时", en: "hour" },
	"overview.unit.day": { zh: "天", en: "day" },
	"overview.metric.requests": { zh: "请求", en: "Requests" },
	"overview.metric.tokens": { zh: "Token", en: "Tokens" },
	"overview.metric.cost": { zh: "费用", en: "Cost" },
	"overview.series.succeeded": { zh: "成功", en: "Succeeded" },
	"overview.series.failed": { zh: "失败", en: "Failed" },
	"overview.series.apiEq": { zh: "等效 API 费用", en: "API-equivalent" },
	"overview.card.tokenMix": { zh: "Token 构成", en: "Token mix" },
	"overview.card.tokenMixDesc": { zh: "会话 Token 分布去向", en: "Where conversation tokens went" },
	"overview.byAgent": { zh: "按智能体分布", en: "By agent" },
	"overview.agent.main": { zh: "主智能体", en: "Main agent" },
	"overview.agent.subagent": { zh: "子智能体", en: "Subagents" },
	"overview.agent.advisor": { zh: "顾问", en: "Advisor" },
	"overview.reqShort": { zh: "请求", en: "req" },
	"overview.card.latest": { zh: "最新请求", en: "Latest requests" },
	"overview.card.latestDesc": {
		zh: "所有会话中最近的模型调用",
		en: "Most recent model calls across every session",
	},
	"overview.allRequests": { zh: "全部请求", en: "All requests" },
	"overview.col.model": { zh: "模型", en: "Model" },
	"overview.col.when": { zh: "时间", en: "When" },
	"overview.col.tokens": { zh: "Token", en: "Tokens" },
	"overview.col.cost": { zh: "费用", en: "Cost" },
	"overview.col.duration": { zh: "耗时", en: "Duration" },
	"overview.col.status": { zh: "状态", en: "Status" },
	"overview.emptyRequests": { zh: "暂无请求记录", en: "No requests yet" },

	// Other route headers & empty states
	"models.title": { zh: "模型", en: "Models" },
	"models.desc": {
		zh: "{window}内各模型承担的工作量与响应速度。",
		en: "Which models did the work in {window}, and how fast they answered.",
	},
	"models.empty": { zh: "该时间范围内暂无模型用量", en: "No model usage in this range" },
	"models.emptyHint": { zh: "请在右上角选择更宽的时间范围。", en: "Pick a wider range in the top bar." },

	"providers.title": { zh: "提供商", en: "Providers" },
	"providers.desc": {
		zh: "{window}内各提供商的消耗、稳定性与订阅额度余量。",
		en: "Burn, reliability and subscription headroom per provider over {window}.",
	},
	"providers.empty": { zh: "该时间范围内暂无请求", en: "No requests in this range" },

	"costs.title": { zh: "费用", en: "Costs" },
	"costs.desc": {
		zh: "按公开 API 费率折算{window}内的用量费用；无公开定价的订阅请求计为未定价，不计作免费。",
		en: "What {window} of usage would cost at public API rates. Subscription usage without a public price is counted as unpriced, not free.",
	},
	"costs.empty": { zh: "该时间范围内暂无用量", en: "No usage in this range" },

	"requests.title": { zh: "请求", en: "Requests" },
	"requests.desc": {
		zh: "Nightglide 在{window}内的全部模型调用记录（按时间倒序）。点击任意行查看完整载荷。",
		en: "Every model call Nightglide made in {window}, newest first. Open a row for its full payload.",
	},
	"requests.empty": { zh: "{window}内暂无请求", en: "No requests in {window}" },
	"requests.emptyMatch": { zh: "没有匹配的请求", en: "No requests match" },
	"requests.emptyMatchHint": { zh: "请清除搜索关键词或状态筛选。", en: "Clear the search or status filter." },

	"errors.title": { zh: "错误", en: "Errors" },
	"errors.desc": {
		zh: "{window}内失败的模型请求，按错误特征归组。点击失败记录查看完整载荷。",
		en: "Failed model requests in {window}, grouped by error signature. Open a failure for its full payload.",
	},
	"errors.empty": { zh: "{window}内无失败请求", en: "No failures in {window}" },
	"errors.emptyHint": { zh: "所有请求均已成功或中止。", en: "Every request succeeded or was aborted." },
	"errors.emptyModels": { zh: "暂无受影响模型", en: "No affected models" },
	"errors.emptyMatch": { zh: "没有匹配的失败记录", en: "No failures match" },
	"errors.emptyMatchHint": { zh: "请清除搜索或筛选条件。", en: "Clear the search or the selected filters." },

	"traces.title": { zh: "追踪", en: "Traces" },
	"traces.desc": {
		zh: "已折叠子智能体活动的近期会话列表。打开会话可查看火焰图时间线。",
		en: "Recent sessions with subagent activity folded in. Open one to inspect its timeline.",
	},
	"traces.sessions": { zh: "会话列表", en: "Sessions" },
	"traces.empty": { zh: "未找到会话", en: "No sessions found" },
	"traces.emptyHint": { zh: "执行同步以索引近期会话。", en: "Run a sync to index recent activity." },
	"traces.emptyMatch": { zh: "没有匹配的会话", en: "No matching sessions" },
	"traces.emptyMatchHint": { zh: "请尝试其他筛选条件。", en: "Try a different filter." },
	"traces.searchPlaceholder": { zh: "按标题、项目或模型筛选…", en: "Filter by title, project, model…" },
	"traceView.back": { zh: "会话列表", en: "Sessions" },
	"traceView.refresh": { zh: "刷新追踪", en: "Refresh trace" },

	"tools.title": { zh: "工具", en: "Tools" },
	"tools.desc": {
		zh: "Nightglide 在{window}内调用的工具分布、失败率及归因成本。",
		en: "Which tools Nightglide called in {window}, how often they failed, and what they cost.",
	},
	"tools.empty": { zh: "该时间范围内暂无工具调用", en: "No tool calls in this range" },

	"frustration.title": { zh: "挫败度", en: "Frustration" },
	"frustration.desc": {
		zh: "{window}内各模型版本触发用户不满情绪的频率分布。",
		en: "How often your messages sound annoyed, per model version, in {window}.",
	},
	"frustration.empty": { zh: "该时间范围内暂无用户消息", en: "No user messages in this range" },

	"projects.title": { zh: "项目", en: "Projects" },
	"projects.desc": { zh: "{window}内按会话工作目录汇总的用量分布。", en: "Usage by session folder in {window}." },
	"projects.empty": { zh: "该时间范围内暂无项目目录", en: "No project folders in this range" },
	"projects.emptyMatch": { zh: "没有匹配的项目目录", en: "No folders match" },

	"gain.title": { zh: "压缩收益", en: "Gain" },
	"gain.desc": {
		zh: "snapcompact 在{window}内{scope}拦截出上下文的 Token 节省量。",
		en: "Tokens snapcompact kept out of context{scope} in {window}.",
	},
	"gain.empty": { zh: "{window}内{scope}暂无节省记录", en: "No savings recorded{scope} in {window}" },

	"spotlight.title": { zh: "Spotlight", en: "Spotlight" },
	"spotlight.desc": {
		zh: "{window}内工具输出裁剪的净节省量（对比 Nightglide 未裁剪基线，已扣除因裁剪引起的回查 Token）。",
		en: "What shaping tool output saved in {window} against what Nightglide would have shown unshaped, after taking back what the agent fetched again because of a cut.",
	},
} as const satisfies Record<string, { zh: string; en: string }>;

export type WebTextKey = keyof typeof WEB_TEXT;

function readStoredLanguage(): WebLanguage {
	try {
		if (typeof localStorage !== "undefined") {
			const stored = localStorage.getItem(STORAGE_KEY);
			if (stored === "zh" || stored === "en") return stored;
		}
	} catch {
		// Ignore restricted storage contexts.
	}
	if (typeof navigator !== "undefined" && typeof navigator.language === "string") {
		const lang = navigator.language.toLowerCase();
		if (lang.startsWith("zh")) return "zh";
		if (lang.startsWith("en")) return "en";
	}
	return "zh";
}

let currentLanguage: WebLanguage = readStoredLanguage();
const listeners = new Set<() => void>();

function applyLanguageAttr(lang: WebLanguage): void {
	if (typeof document !== "undefined") {
		document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
	}
}

if (typeof document !== "undefined") {
	applyLanguageAttr(currentLanguage);
}

function emit(): void {
	for (const listener of listeners) listener();
}

function subscribe(callback: () => void): () => void {
	listeners.add(callback);
	return () => listeners.delete(callback);
}

/** Update and persist the active dashboard UI language. */
export function setWebLanguage(next: WebLanguage): void {
	if (currentLanguage === next) return;
	currentLanguage = next;
	try {
		if (typeof localStorage !== "undefined") localStorage.setItem(STORAGE_KEY, next);
	} catch {
		// Ignore restricted storage contexts.
	}
	applyLanguageAttr(next);
	emit();
}

/** Read the active language outside React components. */
export function getWebLanguage(): WebLanguage {
	return currentLanguage;
}

/** Format one localized string from {@link WEB_TEXT}, filling `{key}` placeholders. */
export function translateWeb(lang: WebLanguage, key: WebTextKey, vars?: Record<string, string | number>): string {
	let text: string = WEB_TEXT[key][lang];
	if (vars) {
		for (const [name, value] of Object.entries(vars)) {
			text = text.replaceAll(`{${name}}`, String(value));
		}
	}
	return text;
}

/** Subscribe to the active Nightglide Stats interface language and translation helper. */
export function useWebLanguage(): {
	lang: WebLanguage;
	setLang: (next: WebLanguage) => void;
	toggleLang: () => void;
	t: (key: WebTextKey, vars?: Record<string, string | number>) => string;
} {
	const lang = useSyncExternalStore(
		subscribe,
		() => currentLanguage,
		() => "zh" as WebLanguage,
	);
	return {
		lang,
		setLang: setWebLanguage,
		toggleLang: () => setWebLanguage(lang === "zh" ? "en" : "zh"),
		t: (key, vars) => translateWeb(lang, key, vars),
	};
}
