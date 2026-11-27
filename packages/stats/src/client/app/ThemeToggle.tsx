import { type LucideIcon, Monitor, Moon, Sun } from "lucide-react";
import { type ThemePreference, useThemePreference } from "../useSystemTheme";
import { useWebLanguage, type WebTextKey } from "../webI18n";

const NEXT_PREFERENCE: Record<ThemePreference, ThemePreference> = {
	system: "light",
	light: "dark",
	dark: "system",
};

const PREFERENCE_ICON: Record<ThemePreference, LucideIcon> = {
	system: Monitor,
	light: Sun,
	dark: Moon,
};

const PREFERENCE_LABEL_KEY: Record<ThemePreference, WebTextKey> = {
	system: "theme.system",
	light: "theme.light",
	dark: "theme.dark",
};

/** Cycles system → light → dark. */
export function ThemeToggle() {
	const { preference, setPreference } = useThemePreference();
	const { t } = useWebLanguage();
	const Icon = PREFERENCE_ICON[preference];
	const label = t(PREFERENCE_LABEL_KEY[preference]);

	return (
		<button
			type="button"
			className="btn"
			data-variant="ghost"
			data-icon="true"
			onClick={() => setPreference(NEXT_PREFERENCE[preference])}
			aria-label={t("theme.switchAria", { label })}
			title={t("theme.switchTitle", { label })}
		>
			<Icon size={15} />
		</button>
	);
}
