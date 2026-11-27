import { ArrowRight } from "lucide-react";
import { useMemo, useState } from "react";
import { getOverviewStats, getRecentRequests } from "../api";
import { Legend, ShareBar, TimeChart } from "../charts";
import {
	formatCompact,
	formatDurationMs,
	formatErrorRate,
	formatEstimatedCost,
	formatInteger,
	formatMessageCost,
	formatPercent,
	formatRelativeTime,
	formatTokensPerSecond,
} from "../data/formatters";
import { useQuery } from "../data/query";
import { bucketAxis, rangeMeta } from "../data/range";
import { densify } from "../data/series";
import { buildAgentTokenShare, sumConversationTokens } from "../data/view-models";
import type { AgentType, MessageStats, TimeRange } from "../types";
import {
	Badge,
	Card,
	ChartSkeleton,
	type Column,
	Dot,
	EmptyState,
	LabelCell,
	PageHeader,
	QueryView,
	Segmented,
	Stat,
	StatGrid,
	Table,
	TableSkeleton,
} from "../ui";
import { useWebLanguage, type WebTextKey } from "../webI18n";

export interface OverviewRouteProps {
	active: boolean;
	range: TimeRange;
	onRequestClick: (id: number) => void;
}

type ActivityMetric = "requests" | "tokens" | "cost";

const AGENT_LABEL_KEY: Record<AgentType, WebTextKey> = {
	main: "overview.agent.main",
	subagent: "overview.agent.subagent",
	advisor: "overview.agent.advisor",
};
const AGENT_COLOR: Record<AgentType, string> = {
	main: "var(--chart-primary)",
	subagent: "var(--chart-secondary)",
	advisor: "var(--warn)",
};

const TOKEN_MIX = [
	{ key: "input", labelKey: "overview.stat.uncachedInput", color: "#4f9cf9" },
	{ key: "cacheRead", labelKey: "overview.stat.cacheRead", color: "var(--chart-primary)" },
	{ key: "cacheWrite", labelKey: "overview.stat.cacheWrite", color: "var(--warn)" },
	{ key: "output", labelKey: "overview.stat.output", color: "var(--chart-secondary)" },
] as const;

export function OverviewRoute({ active, range, onRequestClick }: OverviewRouteProps) {
	const overview = useQuery(["overview", range], ({ signal }) => getOverviewStats(range, signal), { enabled: active });
	const recent = useQuery(["recent-requests"], ({ signal }) => getRecentRequests(12, signal), { enabled: active });
	const [metric, setMetric] = useState<ActivityMetric>("requests");
	const { lang, t } = useWebLanguage();
	const meta = rangeMeta(range, lang);

	const activityOptions = useMemo(
		() => [
			{ value: "requests" as const, label: t("overview.metric.requests") },
			{ value: "tokens" as const, label: t("overview.metric.tokens") },
			{ value: "cost" as const, label: t("overview.metric.cost") },
		],
		[lang],
	);

	const requestColumns = useMemo<readonly Column<MessageStats>[]>(
		() => [
			{
				key: "model",
				header: t("overview.col.model"),
				render: (row: MessageStats) => <LabelCell primary={row.model} secondary={row.provider} />,
			},
			{
				key: "time",
				header: t("overview.col.when"),
				render: (row: MessageStats) => <span className="muted">{formatRelativeTime(row.timestamp)}</span>,
			},
			{
				key: "tokens",
				header: t("overview.col.tokens"),
				align: "right" as const,
				render: (row: MessageStats) => <span className="num">{formatInteger(row.usage.totalTokens)}</span>,
			},
			{
				key: "cost",
				header: t("overview.col.cost"),
				align: "right" as const,
				render: (row: MessageStats) => <span className="num">{formatMessageCost(row, 4)}</span>,
			},
			{
				key: "duration",
				header: t("overview.col.duration"),
				align: "right" as const,
				render: (row: MessageStats) => <span className="num">{formatDurationMs(row.duration)}</span>,
			},
			{
				key: "status",
				header: t("overview.col.status"),
				align: "right" as const,
				render: (row: MessageStats) =>
					row.errorMessage ? (
						<Badge tone="bad">{t("req.status.failed")}</Badge>
					) : (
						<Badge tone="ok">{t("req.status.ok")}</Badge>
					),
			},
		],
		[lang],
	);

	const series = useMemo(() => {
		const points = overview.data?.timeSeries ?? [];
		const buckets = bucketAxis(
			range,
			points.map(p => p.timestamp),
		);
		return {
			buckets,
			requests: densify(points, buckets, p => p.requests - p.errors),
			errors: densify(points, buckets, p => p.errors),
			tokens: densify(points, buckets, p => p.tokens),
			cost: densify(points, buckets, p => p.cost),
			all: densify(points, buckets, p => p.requests),
		};
	}, [overview.data, range]);

	const chartSeries =
		metric === "requests"
			? [
					{
						key: "ok",
						label: t("overview.series.succeeded"),
						color: "var(--chart-primary)",
						values: series.requests,
					},
					{ key: "err", label: t("overview.series.failed"), color: "var(--bad)", values: series.errors },
				]
			: metric === "tokens"
				? [
						{
							key: "tokens",
							label: t("overview.metric.tokens"),
							color: "var(--chart-primary)",
							values: series.tokens,
						},
					]
				: [
						{
							key: "cost",
							label: t("overview.series.apiEq"),
							color: "var(--chart-secondary)",
							values: series.cost,
						},
					];

	const bucketUnit =
		meta.bucketMs < 3_600_000
			? t("overview.unit.5m")
			: meta.bucketMs < 86_400_000
				? t("overview.unit.hour")
				: t("overview.unit.day");

	return (
		<div className="page">
			<PageHeader title={t("overview.title")} description={t("overview.desc", { window: meta.windowLabel })} />

			<QueryView query={overview} skeleton={<ChartSkeleton height={112} />}>
				{({ overall }) => (
					<div data-stale={overview.stale} className="stack" style={{ gap: 16 }}>
						<StatGrid min={190}>
							<Stat
								label={t("overview.stat.cost")}
								title={t("overview.stat.costTitle")}
								value={formatEstimatedCost(overall.totalCost, overall.unpricedRequests)}
								hint={
									overall.unpricedRequests > 0
										? t("overview.stat.unpriced", { count: formatInteger(overall.unpricedRequests) })
										: undefined
								}
								spark={series.cost}
								sparkColor="var(--chart-secondary)"
							/>
							<Stat
								label={t("overview.stat.requests")}
								value={formatInteger(overall.totalRequests)}
								hint={t("overview.stat.failed", { count: formatInteger(overall.failedRequests) })}
								spark={series.all}
							/>
							<Stat
								label={t("overview.stat.tokens")}
								title={t("overview.stat.tokensTitle")}
								value={formatCompact(sumConversationTokens(overall))}
								hint={t("overview.stat.outputHint", { count: formatCompact(overall.totalOutputTokens) })}
								spark={series.tokens}
							/>
							<Stat
								label={t("overview.stat.cacheRate")}
								title={t("overview.stat.cacheRateTitle")}
								value={formatPercent(overall.cacheRate)}
								hint={t("overview.stat.savedHint", { pct: formatPercent(overall.cacheSavings) })}
							/>
							<Stat
								label={t("overview.stat.errorRate")}
								value={formatErrorRate(overall.errorRate)}
								hint={t("overview.stat.succeededHint", { count: formatInteger(overall.successfulRequests) })}
								spark={series.errors}
								sparkColor="var(--bad)"
							/>
						</StatGrid>
						<StatGrid min={140}>
							<Stat
								size="sm"
								label={t("overview.stat.uncachedInput")}
								value={formatCompact(overall.totalInputTokens)}
							/>
							<Stat
								size="sm"
								label={t("overview.stat.cacheRead")}
								value={formatCompact(overall.totalCacheReadTokens)}
							/>
							<Stat
								size="sm"
								label={t("overview.stat.cacheWrite")}
								value={formatCompact(overall.totalCacheWriteTokens)}
							/>
							<Stat
								size="sm"
								label={t("overview.stat.output")}
								value={formatCompact(overall.totalOutputTokens)}
							/>
							<Stat
								size="sm"
								label={t("overview.stat.premium")}
								value={formatInteger(Math.round(overall.totalPremiumRequests * 100) / 100)}
							/>
							<Stat
								size="sm"
								label={t("overview.stat.tps")}
								value={formatTokensPerSecond(overall.avgTokensPerSecond)}
							/>
							<Stat
								size="sm"
								label={t("overview.stat.avgLatency")}
								value={formatDurationMs(overall.avgDuration)}
							/>
							<Stat size="sm" label={t("overview.stat.avgTtft")} value={formatDurationMs(overall.avgTtft)} />
						</StatGrid>
					</div>
				)}
			</QueryView>

			<div className="grid grid-main-side">
				<Card
					index={1}
					title={t("overview.card.activity")}
					description={t("overview.card.perBucket", { unit: bucketUnit })}
					actions={<Segmented size="sm" options={activityOptions} value={metric} onChange={setMetric} />}
					stale={overview.stale}
				>
					<QueryView query={overview} skeleton={<ChartSkeleton height={260} />}>
						{() => (
							<TimeChart
								buckets={series.buckets}
								bucketMs={meta.bucketMs}
								series={chartSeries}
								height={260}
								format={metric === "cost" ? v => formatEstimatedCost(v, 0) : formatCompact}
							/>
						)}
					</QueryView>
				</Card>

				<Card
					index={2}
					title={t("overview.card.tokenMix")}
					description={t("overview.card.tokenMixDesc")}
					stale={overview.stale}
				>
					<QueryView query={overview} skeleton={<ChartSkeleton height={260} />}>
						{({ overall, byAgentType }) => {
							const mix = {
								input: overall.totalInputTokens,
								cacheRead: overall.totalCacheReadTokens,
								cacheWrite: overall.totalCacheWriteTokens,
								output: overall.totalOutputTokens,
							};
							const total = sumConversationTokens(overall);
							const agents = buildAgentTokenShare(byAgentType);
							return (
								<div className="stack" style={{ gap: 18 }}>
									<div className="stack" style={{ gap: 10 }}>
										<ShareBar
											segments={TOKEN_MIX.map(item => ({
												key: item.key,
												label: t(item.labelKey),
												value: mix[item.key],
												color: item.color,
											}))}
										/>
										<Legend
											items={TOKEN_MIX.map(item => ({
												key: item.key,
												label: t(item.labelKey),
												color: item.color,
												value: total > 0 ? formatPercent(mix[item.key] / total, 0) : "–",
											}))}
										/>
									</div>
									<div className="stack" style={{ gap: 10 }}>
										<div className="section-label" style={{ marginBottom: 0 }}>
											{t("overview.byAgent")}
										</div>
										<ShareBar
											segments={agents.segments.map(s => ({
												key: s.agentType,
												label: t(AGENT_LABEL_KEY[s.agentType]),
												value: s.tokens,
												color: AGENT_COLOR[s.agentType],
											}))}
										/>
										{agents.segments.map(s => (
											<div key={s.agentType} className="row" style={{ justifyContent: "space-between" }}>
												<span className="row">
													<span className="swatch" style={{ background: AGENT_COLOR[s.agentType] }} />
													{t(AGENT_LABEL_KEY[s.agentType])}
													<span className="dim num">
														{formatInteger(s.requests)} {t("overview.reqShort")}
													</span>
												</span>
												<span className="row">
													<span className="dim num">{formatCompact(s.tokens)}</span>
													<span className="num" style={{ minWidth: 48, textAlign: "right" }}>
														{formatPercent(s.share)}
													</span>
												</span>
											</div>
										))}
									</div>
								</div>
							);
						}}
					</QueryView>
				</Card>
			</div>

			<Card
				index={3}
				title={
					<>
						<Dot tone="live" pulse /> {t("overview.card.latest")}
					</>
				}
				description={t("overview.card.latestDesc")}
				actions={
					<a className="btn" data-size="sm" data-variant="ghost" href={`#/requests?range=${range}`}>
						{t("overview.allRequests")} <ArrowRight size={13} />
					</a>
				}
				flush
			>
				<QueryView query={recent} skeleton={<TableSkeleton rows={8} />}>
					{rows => (
						<Table
							rows={rows}
							rowKey={row => row.id ?? `${row.sessionFile}:${row.entryId}`}
							onRowClick={row => row.id !== undefined && onRequestClick(row.id)}
							columns={requestColumns}
							empty={<EmptyState title={t("overview.emptyRequests")} />}
							dense
						/>
					)}
				</QueryView>
			</Card>
		</div>
	);
}
