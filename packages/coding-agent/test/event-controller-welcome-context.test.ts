import { describe, expect, it, vi } from "bun:test";
import { EventController } from "@oh-my-pi/pi-coding-agent/modes/controllers/event-controller";
import { createInteractiveModeContext } from "./helpers/interactive-mode-context";

describe("EventController welcome context synchronization", () => {
	it("calls updateWelcomeContext when model_changed fires", async () => {
		const updateWelcomeContext = vi.fn();
		const ctx = createInteractiveModeContext({
			updateWelcomeContext,
		});
		const controller = new EventController(ctx);
		await controller.handleEvent({ type: "model_changed" });
		expect(updateWelcomeContext).toHaveBeenCalledTimes(1);
		expect(ctx.ui.requestRender).toHaveBeenCalled();
	});

	it("calls updateWelcomeContext when retry_fallback_succeeded fires", async () => {
		const updateWelcomeContext = vi.fn();
		const ctx = createInteractiveModeContext({
			updateWelcomeContext,
			showStatus: vi.fn(),
		});
		const controller = new EventController(ctx);
		await controller.handleEvent({
			type: "retry_fallback_succeeded",
			model: "anthropic/claude-3-5-sonnet",
			role: "primary",
		});
		expect(updateWelcomeContext).toHaveBeenCalledTimes(1);
	});
});
