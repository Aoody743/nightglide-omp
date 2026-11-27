import { RefreshCw } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { formatInteger } from "../data/formatters";
import { useLiveStatus } from "../data/live";
import { Dot } from "../ui";
import { useWebLanguage, type WebLanguage, translateWeb } from "../webI18n";

/** Topbar ingest status; click to sync now. */
export function LiveChip() {
	const { sync, indexingHours, connected, requestSync } = useLiveStatus();
	const now = useNow(sync.phase === "idle" ? 15_000 : null);
	const { lang, t } = useWebLanguage();

	let body: ReactNode;
	let title: string;
	if (!connected) {
		body = (
			<>
				<Dot tone="warn" />
				<span>{t("live.reconnecting")}</span>
			</>
		);
		title = t("live.reconnectingTitle");
	} else if (sync.phase === "syncing") {
		body = (
			<>
				<RefreshCw size={13} className="spin" />
				<span>{t("live.syncing")}</span>
				{sync.total > 0 && (
					<span className="live-chip-count">
						{formatInteger(sync.current)}/{formatInteger(sync.total)}
					</span>
				)}
			</>
		);
		title = t("live.syncingTitle");
	} else if (sync.phase === "error") {
		body = (
			<>
				<Dot tone="bad" />
				<span>{t("live.syncFailed")}</span>
			</>
		);
		title = t("live.syncFailedTitle", { error: sync.error ?? t("live.syncFailed") });
	} else if (indexingHours > INDEXING_VISIBLE_HOURS) {
		body = (
			<>
				<RefreshCw size={13} className="spin" />
				<span>{t("live.indexing")}</span>
				<span className="live-chip-count">{t("live.indexingLeft", { hours: formatInteger(indexingHours) })}</span>
			</>
		);
		title = t("live.indexingTitle");
	} else {
		body = (
			<>
				<Dot tone="live" pulse />
				<span>{t("live.live")}</span>
				{sync.lastSyncedAt !== null && (
					<span className="live-chip-count">{ago(now - sync.lastSyncedAt, lang)}</span>
				)}
			</>
		);
		title = t("live.liveTitle");
	}

	return (
		<button
			type="button"
			className="live-chip"
			onClick={requestSync}
			disabled={sync.phase === "syncing"}
			title={title}
		>
			{body}
		</button>
	);
}

/** A handful of dirty hours is normal live churn; only a real backlog is worth showing. */
const INDEXING_VISIBLE_HOURS = 24;

function useNow(intervalMs: number | null): number {
	const [now, setNow] = useState(Date.now);
	useEffect(() => {
		if (intervalMs === null) return;
		setNow(Date.now());
		const timer = setInterval(() => setNow(Date.now()), intervalMs);
		return () => clearInterval(timer);
	}, [intervalMs]);
	return now;
}

function ago(ms: number, lang: WebLanguage): string {
	const s = Math.max(0, Math.round(ms / 1000));
	if (s < 45) return translateWeb(lang, "live.justNow");
	const m = Math.round(s / 60);
	if (m < 60) return translateWeb(lang, "live.minAgo", { n: m });
	const h = Math.round(m / 60);
	return h < 24
		? translateWeb(lang, "live.hourAgo", { n: h })
		: translateWeb(lang, "live.dayAgo", { n: Math.round(h / 24) });
}
