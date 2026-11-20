import { describe, expect, it } from "bun:test";
import { NightglideScene } from "../src/components/nightglide-scene";
import { motionEffectsEnabled, setMotionEffects } from "../src/motion-effects";
import { getCurrentThemeName, setTheme } from "../src/theme/theme";

describe("Nightglide scene", () => {
	it("switches families and stops repainting when motion is disabled", async () => {
		const originalTheme = getCurrentThemeName() ?? "nightglide-flight";
		const originalMotion = motionEffectsEnabled();
		let repaints = 0;
		let scene: NightglideScene | undefined;
		try {
			await setTheme("nightglide-flight");
			setMotionEffects(false);
			scene = new NightglideScene(
				() => repaints++,
				() => 30,
			);
			const flight = scene.render(100).map(Bun.stripANSI).join("\n");
			await setTheme("nightglide-abyss");
			const dive = scene.render(100).map(Bun.stripANSI).join("\n");
			expect(flight).not.toEqual(dive);
			const before = repaints;
			await Bun.sleep(150);
			expect(repaints).toBe(before);
			setMotionEffects(true);
			await Bun.sleep(150);
			expect(repaints).toBeGreaterThan(before);
			setMotionEffects(false);
			expect(scene.render(100)).toHaveLength(3);
		} finally {
			scene?.dispose();
			await setTheme(originalTheme);
			setMotionEffects(originalMotion);
		}
	});
});
