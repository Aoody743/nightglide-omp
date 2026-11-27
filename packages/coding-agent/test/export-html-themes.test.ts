import { describe, expect, it } from "bun:test";
import { generateThemeStyles, parseExportArgs } from "@oh-my-pi/pi-coding-agent/export/html";
import { webExportThemeVars } from "../src/export/html/web-palette";

describe("HTML export themes", () => {
	it("parses the optional user-theme flag before or after the output path", () => {
		expect(parseExportArgs("--themes export.html")).toEqual({ outputPath: "export.html", useUserThemes: true });
		expect(parseExportArgs("export.html --themes")).toEqual({ outputPath: "export.html", useUserThemes: true });
		expect(parseExportArgs("")).toEqual({ outputPath: undefined, useUserThemes: false });
		expect(() => parseExportArgs("one.html two.html")).toThrow("Usage: /export [--themes] [path]");
	});

	it("emits Nightglide Flight Dark and Cloudlight palettes for web exports", async () => {
		const dark = webExportThemeVars("dark");
		const light = webExportThemeVars("light");
		expect(dark).toContain("--bg-raised: #0c1124;");
		expect(dark).toContain("--accent: #7c8bff;");
		expect(dark).toContain("--link: #00dbe4;");
		expect(dark).toContain("--warn: #ffd394;");
		expect(light).toContain("--bg-raised: #f5f8fc;");
		expect(light).toContain("--accent: #4f67eb;");
		expect(light).toContain("--link: #0099b8;");

		const css = await generateThemeStyles("web");
		expect(css).toContain(':root, :root[data-theme="dark"]');
		expect(css).toContain(':root[data-theme="light"]');
	});
});
