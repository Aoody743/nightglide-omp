import { Search } from "lucide-react";
import { useWebLanguage } from "../webI18n";

export interface SearchInputProps {
	value: string;
	onChange: (value: string) => void;
	placeholder?: string;
	label?: string;
	width?: number;
}

/** Text filter with a leading search glyph. */
export function SearchInput({ value, onChange, placeholder, label, width }: SearchInputProps) {
	const { t } = useWebLanguage();
	return (
		<label className="search">
			<Search size={14} />
			<input
				className="input"
				type="search"
				aria-label={label ?? t("ui.filter")}
				value={value}
				placeholder={placeholder ?? t("ui.filterPlaceholder")}
				onChange={e => onChange(e.target.value)}
				style={width !== undefined ? { width } : undefined}
			/>
		</label>
	);
}
