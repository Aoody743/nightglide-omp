import { describe, expect, it, vi } from "bun:test";
import { EventController } from "@oh-my-pi/pi-coding-agent/modes/controllers/event-controller";
import { createInteractiveModeContext } from "./helpers/interactive-mode-context";

/**
 * The toast layer on top of the retry-fallback transcript notice
 * (#handleRetryFallbackSucceeded): a quiet `已回退到 <model>` line above the
 * composer, while `showStatus` keeps writing the durable transcript notice.
 * `model_changed` deliberately never toasts — see the handler's comment.
 */
describe("EventController toast notices", () => {
	it("toasts the fallback model once when retry_fallback_succeeded fires, keeping the status notice", async () => {
		const showToast = vi.fn();
		const showStatus = vi.fn();
		const updateWelcomeContext = vi.fn();
		const ctx = createInteractiveModeContext({ showToast, showStatus, updateWelcomeContext });
		const controller = new EventController(ctx);
		await controller.handleEvent({
			type: "retry_fallback_succeeded",
			model: "local/qwen2.5-7b",
			role: "primary",
		});
		expect(showToast).toHaveBeenCalledTimes(1);
		expect(showToast).toHaveBeenCalledWith("已回退到 local/qwen2.5-7b");
		expect(showStatus).toHaveBeenCalledTimes(1);
		expect(showStatus).toHaveBeenCalledWith("Fallback succeeded on local/qwen2.5-7b");
		expect(updateWelcomeContext).toHaveBeenCalledTimes(1);
	});

	it("never toasts on model_changed: a manual pick and a fallback land on the same event", async () => {
		const showToast = vi.fn();
		const ctx = createInteractiveModeContext({ showToast });
		const controller = new EventController(ctx);
		await controller.handleEvent({ type: "model_changed" });
		expect(showToast).not.toHaveBeenCalled();
	});
});
