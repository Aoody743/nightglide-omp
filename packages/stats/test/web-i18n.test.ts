import { afterEach, describe, expect, it } from "bun:test";
import { rangeMeta } from "../src/client/data/range";
import { readStoredThemePreference, setThemePreference } from "../src/client/useSystemTheme";
import { getWebLanguage, setWebLanguage, translateWeb } from "../src/client/webI18n";

const originalDescriptors = new Map<string, PropertyDescriptor | undefined>();
const initialLanguage = getWebLanguage();

function setGlobal(name: string, value: unknown): void {
	if (!originalDescriptors.has(name)) {
		originalDescriptors.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
	}
	Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
}

afterEach(() => {
	setWebLanguage(initialLanguage);
	for (const [name, descriptor] of originalDescriptors) {
		if (descriptor) Object.defineProperty(globalThis, name, descriptor);
		else Reflect.deleteProperty(globalThis, name);
	}
	originalDescriptors.clear();
});

describe("webI18n and theme persistence", () => {
	it("persists language switching, updates document lang, and translates time ranges", () => {
		const storage = new Map<string, string>();
		const fakeDoc = { documentElement: { lang: "en" } };
		setGlobal("document", fakeDoc);
		setGlobal("localStorage", {
			getItem: (key: string) => storage.get(key) ?? null,
			setItem: (key: string, value: string) => {
				storage.set(key, value);
			},
		});

		setWebLanguage("en");
		expect(storage.get("nightglide-stats-lang")).toBe("en");
		expect(fakeDoc.documentElement.lang).toBe("en");
		expect(rangeMeta("all", "en")).toMatchObject({ label: "All", windowLabel: "all time" });

		setWebLanguage("zh");
		expect(storage.get("nightglide-stats-lang")).toBe("zh");
		expect(fakeDoc.documentElement.lang).toBe("zh-CN");
		expect(rangeMeta("all", "zh")).toMatchObject({ label: "全部", windowLabel: "全部时间" });
		expect(translateWeb("zh", "overview.desc", { window: rangeMeta("24h", "zh").windowLabel })).toContain(
			"Nightglide 在最近 24 小时内",
		);
	});

	it("prefers nightglide-stats-theme, falls back to omp-stats-theme, and writes both", () => {
		const legacyOnly = new Map<string, string>([["omp-stats-theme", "light"]]);
		expect(readStoredThemePreference({ getItem: key => legacyOnly.get(key) ?? null })).toBe("light");

		const both = new Map<string, string>([
			["omp-stats-theme", "light"],
			["nightglide-stats-theme", "dark"],
		]);
		expect(readStoredThemePreference({ getItem: key => both.get(key) ?? null })).toBe("dark");

		const written = new Map<string, string>();
		setGlobal("localStorage", {
			getItem: (key: string) => written.get(key) ?? null,
			setItem: (key: string, value: string) => {
				written.set(key, value);
			},
		});
		setThemePreference("light");
		expect(written.get("nightglide-stats-theme")).toBe("light");
		expect(written.get("omp-stats-theme")).toBe("light");
	});
});
