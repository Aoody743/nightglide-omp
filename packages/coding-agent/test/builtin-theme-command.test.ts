import { describe, expect, it } from "bun:test";
import { resolveThemeName } from "../src/slash-commands/builtin-theme";

const AVAILABLE = ["nightglide-flight", "nightglide-abyss", "my-custom"];

describe("/theme name resolution", () => {
	it("accepts full names, short nightglide names in any case, and rejects unknown names", () => {
		expect(resolveThemeName("my-custom", AVAILABLE)).toBe("my-custom");
		expect(resolveThemeName("nightglide-flight", AVAILABLE)).toBe("nightglide-flight");
		expect(resolveThemeName(" Abyss ", AVAILABLE)).toBe("nightglide-abyss");
		expect(resolveThemeName("daybreak", AVAILABLE)).toBeUndefined();
		expect(resolveThemeName("", AVAILABLE)).toBeUndefined();
	});
});
