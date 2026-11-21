import { describe, expect, it } from "bun:test";
import { parseArgs } from "@oh-my-pi/pi-coding-agent/cli/args";

describe("parseArgs — --classic / --glide layout flags", () => {
	it("selects the layout and the last flag wins", () => {
		expect(parseArgs(["--glide"]).layout).toBe("glide");
		expect(parseArgs(["--classic"]).layout).toBe("classic");
		expect(parseArgs(["--glide", "--classic"]).layout).toBe("classic");
		expect(parseArgs(["prompt"]).layout).toBeUndefined();
	});

	it("does not consume the following argument", () => {
		const result = parseArgs(["--glide", "--model", "opus", "hello"]);
		expect(result.layout).toBe("glide");
		expect(result.model).toBe("opus");
		expect(result.messages).toEqual(["hello"]);
	});
});
