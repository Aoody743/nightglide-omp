import { Menu } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { rangeMeta, TIME_RANGES } from "../data/range";
import { useLiveStatus } from "../data/live";
import type { TimeRange } from "../types";
import { Segmented } from "../ui";
import { useWebLanguage } from "../webI18n";
import { CloseButton } from "./CloseButton";
import { isDialogOpen, isTypingTarget } from "./keys";
import { LiveChip } from "./LiveChip";
import { type DashboardSection, NAV } from "./nav";
import { ThemeToggle } from "./ThemeToggle";

export interface ShellProps {
	section: DashboardSection;
	onSectionChange: (section: DashboardSection) => void;
	range: TimeRange;
	onRangeChange: (range: TimeRange) => void;
	children: ReactNode;
}

/**
 * Fixed glass topbar + naked sidebar framing one inset content panel. Owns
 * the global keyboard shortcuts: `1`–`6` pick a range, `g` then a letter jumps
 * to a page.
 */
export function Shell({ section, onSectionChange, range, onRangeChange, children }: ShellProps) {
	const [menuOpen, setMenuOpen] = useState(false);
	const scrolled = useScrolled();
	const { sync } = useLiveStatus();
	const { lang, toggleLang, t } = useWebLanguage();
	useShortcuts(onSectionChange, onRangeChange);

	const rangeOptions = useMemo(
		() =>
			TIME_RANGES.map((item, i) => {
				const meta = rangeMeta(item, lang);
				return {
					value: item,
					label: meta.label,
					title: `${meta.windowLabel} (${i + 1})`,
				};
			}),
		[lang],
	);

	const go = (next: DashboardSection) => {
		onSectionChange(next);
		setMenuOpen(false);
		window.scrollTo({ top: 0 });
	};

	const progress = sync.phase === "syncing" ? (sync.total > 0 ? sync.current / sync.total : null) : undefined;

	return (
		<>
			<div className="shell-ambient" />
			<header className="topbar" data-scrolled={scrolled}>
				<button
					type="button"
					className="btn topbar-menu"
					data-variant="ghost"
					data-icon="true"
					onClick={() => setMenuOpen(true)}
					aria-label={t("topbar.openNav")}
				>
					<Menu size={16} />
				</button>
				<div className="topbar-brand">
					<svg className="topbar-mark" viewBox="0 0 64 64" width="22" height="22" aria-hidden="true">
						<defs>
							<linearGradient id="nightglide-mark-grad" x1="0" y1="0" x2="1" y2="1">
								<stop offset="0" stopColor="#b5b6ff" />
								<stop offset=".38" stopColor="#7c8bff" />
								<stop offset=".78" stopColor="#00dbe4" />
								<stop offset="1" stopColor="#ffd394" />
							</linearGradient>
						</defs>
						<path fill="url(#nightglide-mark-grad)" d="M10 52 16 12h9l15.1 26L44 12h9l-6 40h-9L22.9 26 19 52z" />
						<path fill="#00dbe4" fillOpacity="0.38" d="M25 12l15.1 26-.8 5.2L24.1 17.5z" />
						<polygon fill="#ffd394" points="54,7 57.5,10.5 54,14 50.5,10.5" />
					</svg>
					<span>{t("brand.name")}</span>
					<span className="topbar-slash">/</span>
					<span className="topbar-title">{t("brand.stats")}</span>
				</div>
				<div className="topbar-spacer" />
				<div className="topbar-actions">
					<span className="topbar-hide-narrow">
						<LiveChip />
					</span>
					<Segmented
						options={rangeOptions}
						value={range}
						onChange={onRangeChange}
						aria-label={t("topbar.timeRange")}
					/>
					<button
						type="button"
						className="btn lang-pill"
						data-variant="ghost"
						data-size="sm"
						onClick={toggleLang}
						aria-label={t("topbar.switchLang")}
						title={t("topbar.switchLang")}
					>
						<span data-active={lang === "zh"}>中</span>
						<span className="lang-pill-sep">/</span>
						<span data-active={lang === "en"}>EN</span>
					</button>
					<ThemeToggle />
					<CloseButton />
				</div>
				{progress !== undefined && (
					<div className="topbar-progress">
						<div
							className="topbar-progress-fill"
							data-indeterminate={progress === null}
							style={{ width: `${(progress ?? 0) * 100}%` }}
						/>
					</div>
				)}
			</header>

			{menuOpen && <div className="drawer-scrim" onClick={() => setMenuOpen(false)} role="presentation" />}
			<nav className="sidebar" data-open={menuOpen} aria-label={t("topbar.pages")}>
				{NAV.map(group => (
					<div key={group.heading} className="nav-group">
						<div className="nav-heading">{t(group.headingKey)}</div>
						{group.items.map(item => (
							<button
								key={item.id}
								type="button"
								className="nav-row"
								data-active={item.id === section}
								aria-current={item.id === section ? "page" : undefined}
								onClick={() => go(item.id)}
							>
								<item.icon size={15} />
								<span className="nav-row-label">{t(item.labelKey)}</span>
								<kbd>G {item.hotkey.toUpperCase()}</kbd>
							</button>
						))}
					</div>
				))}
				<div className="sidebar-foot micro">
					<span>
						<span className="kbd">1</span>–<span className="kbd">6</span> {t("sidebar.rangeHint")}
					</span>
					<span>
						<span className="kbd">G</span>
						{lang === "zh" ? t("sidebar.jumpHint") : ` ${t("sidebar.jumpHint")}`}
					</span>
				</div>
			</nav>

			<main className="shell-panel">
				<div className="shell-content">{children}</div>
			</main>
		</>
	);
}

function useScrolled(): boolean {
	const [scrolled, setScrolled] = useState(false);
	useEffect(() => {
		const onScroll = () => setScrolled(window.scrollY > 4);
		onScroll();
		window.addEventListener("scroll", onScroll, { passive: true });
		return () => window.removeEventListener("scroll", onScroll);
	}, []);
	return scrolled;
}

function useShortcuts(onSection: (section: DashboardSection) => void, onRange: (range: TimeRange) => void): void {
	useEffect(() => {
		let pendingG = 0;
		const onKey = (e: KeyboardEvent) => {
			if (e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented) return;
			if (isTypingTarget(e.target) || isDialogOpen()) return;
			const key = e.key.toLowerCase();
			if (pendingG && Date.now() - pendingG < 1200) {
				pendingG = 0;
				const item = NAV.flatMap(group => group.items).find(i => i.hotkey === key);
				if (item) {
					e.preventDefault();
					onSection(item.id);
					window.scrollTo({ top: 0 });
				}
				return;
			}
			if (key === "g") {
				pendingG = Date.now();
				return;
			}
			const index = Number(key) - 1;
			if (Number.isInteger(index) && index >= 0 && index < TIME_RANGES.length) {
				e.preventDefault();
				onRange(TIME_RANGES[index]);
			}
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [onSection, onRange]);
}
