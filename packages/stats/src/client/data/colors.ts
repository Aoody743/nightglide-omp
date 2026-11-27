/**
 * Categorical series colors. Every multi-series chart and table swatch draws
 * from {@link SERIES_COLORS}; ranking keeps the busiest series on the most
 * legible hues and the same key on the same hue across charts of one page.
 */

/** Ten mid-luminance hues aligned with Nightglide's twilight/cyan/indigo/gold palette that read on both themes. */
export const SERIES_COLORS = [
	"#00dbe4", // aqua cyan
	"#7c8bff", // sky indigo
	"#e8a838", // warm gold
	"#2ee6a6", // emerald mint
	"#9b9eff", // twilight periwinkle
	"#4f9cf9", // azure blue
	"#f27c54", // horizon coral
	"#14b8a6", // deep teal
	"#a78bfa", // iris violet
	"#e57399", // twilight rose
];

/** Neutral used for "Other" rollups and unknown buckets. */
export const OTHER_COLOR = "#6c7ba3";

/** Stable identity of a model across providers: `model::provider`. */
export function modelKey(model: string, provider: string): string {
	return `${model}::${provider}`;
}

/**
 * Assign colors by descending weight (ties broken by key) so a model's hue is
 * determined by its rank, not by response order. Used by every per-model view.
 */
export function buildModelColorLookup(
	records: readonly { model: string; provider: string; totalRequests: number }[],
): Map<string, string> {
	return buildColorLookup(
		records.map(record => ({ key: modelKey(record.model, record.provider), weight: record.totalRequests })),
	);
}

/** Generic form of {@link buildModelColorLookup} for any keyed, weighted series. */
export function buildColorLookup(items: readonly { key: string; weight: number }[]): Map<string, string> {
	const ranked = [...items].sort((a, b) => b.weight - a.weight || a.key.localeCompare(b.key));
	return new Map(ranked.map((item, index) => [item.key, SERIES_COLORS[index % SERIES_COLORS.length]]));
}
