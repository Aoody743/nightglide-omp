import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "bun:test";
import { MAX_TOASTS, ToastComponent, TOAST_FADE_MS, TOAST_TTL_MS } from "../src/overlays/toast";
import { setMotionEffects } from "../src/motion-effects";
import { initTheme, theme } from "../src/theme";

const WIDTH = 80;

/** Render the stack and strip ANSI: the toast's visible shape is `✦ <message>`. */
function rows(stack: ToastComponent, width = WIDTH): readonly string[] {
	return stack.render(width);
}

function plain(stack: ToastComponent, width = WIDTH): string {
	return rows(stack, width)
		.map(row => Bun.stripANSI(row))
		.join("\n")
		.trim();
}

beforeAll(async () => {
	await initTheme();
});

beforeEach(() => {
	vi.useFakeTimers({ now: 0 });
	setMotionEffects(true);
});

afterEach(() => {
	// Motion is process-global: hand the next suite the enabled default back.
	setMotionEffects(true);
	vi.useRealTimers();
});

describe("ToastComponent", () => {
	it("renders one quiet row: accent ✦ mark plus the message in text color", () => {
		const stack = new ToastComponent();
		stack.push("已回退到 anthropic/claude-sonnet");
		const rendered = rows(stack);
		// Exactly one row — no spacer, no border, no background block.
		expect(rendered).toHaveLength(1);
		expect(Bun.stripANSI(rendered[0]!).trim()).toBe("✦ 已回退到 anthropic/claude-sonnet");
		expect(rendered[0]).toContain(theme.fg("accent", "✦"));
		expect(rendered[0]).toContain(theme.fg("text", "已回退到 anthropic/claude-sonnet"));
		// Quiet: no error/warning chrome and the message carries no bold.
		expect(rendered[0]).not.toContain(theme.fg("error", ""));
		expect(rendered[0]).not.toContain(theme.fg("warning", ""));
		stack.dispose();
	});

	it("sanitizes a message to a single line", () => {
		const stack = new ToastComponent();
		stack.push("line one\nline\ttwo");
		expect(Bun.stripANSI(rows(stack)[0]!)).toContain("line one line two");
		stack.dispose();
	});

	it("dismisses itself after 3s on the injected clock (no real waiting)", () => {
		const requestRender = vi.fn();
		const stack = new ToastComponent({ requestRender });
		stack.push("主题:nightglide-flight");
		expect(rows(stack)).toHaveLength(1);
		// Just before the deadline the toast is still up.
		vi.advanceTimersByTime(TOAST_TTL_MS - 1);
		expect(rows(stack)).toHaveLength(1);
		// At the deadline the removal timer fires and the stack is empty.
		vi.advanceTimersByTime(1);
		expect(rows(stack)).toHaveLength(0);
		expect(requestRender).toHaveBeenCalled();
		stack.dispose();
	});

	it("fades toward the background across the last 450ms with motion on", () => {
		const stack = new ToastComponent();
		const message = "主题:nightglide-aurora";
		stack.push(message);
		const settled = rows(stack)[0]!;
		const settledMessageAnsi = theme.fg("text", message);
		expect(settled).toContain(settledMessageAnsi);

		// Before the fade window nothing blends.
		vi.advanceTimersByTime(TOAST_TTL_MS - TOAST_FADE_MS - 100);
		stack.invalidate();
		expect(rows(stack)[0]).toBe(settled);

		// Into the fade window the frame timer repaints and the colors blend:
		// same visible text, no longer the settled text-color escape.
		vi.advanceTimersByTime(100 + TOAST_FADE_MS / 2);
		const fading = rows(stack)[0]!;
		expect(Bun.stripANSI(fading).trim()).toBe(Bun.stripANSI(settled).trim());
		expect(fading).not.toContain(settledMessageAnsi);
		expect(fading).not.toBe(settled);

		// The fade ends with removal at the deadline.
		vi.advanceTimersByTime(TOAST_FADE_MS);
		expect(rows(stack)).toHaveLength(0);
		stack.dispose();
	});

	it("shows no fade with motion off: full color until an instant vanish", () => {
		const requestRender = vi.fn();
		setMotionEffects(false);
		const stack = new ToastComponent({ requestRender });
		stack.push("主题:nightglide-daybreak");
		const settled = rows(stack)[0]!;
		// All the way to 1ms before the deadline the row holds its settled color.
		vi.advanceTimersByTime(TOAST_TTL_MS - 1);
		stack.invalidate();
		expect(rows(stack)[0]).toBe(settled);
		// Exactly one removal render beyond the push itself — no fade frames.
		const rendersAfterPush = requestRender.mock.calls.length;
		vi.advanceTimersByTime(1);
		expect(rows(stack)).toHaveLength(0);
		expect(requestRender.mock.calls.length).toBe(rendersAfterPush + 1);
		stack.dispose();
	});

	it("snaps a mid-fade toast back to full color when motion turns off", () => {
		setMotionEffects(true);
		const stack = new ToastComponent();
		const message = "已回退到 local/qwen2.5";
		stack.push(message);
		const settled = rows(stack)[0]!;
		vi.advanceTimersByTime(TOAST_TTL_MS - TOAST_FADE_MS + 100);
		stack.invalidate();
		expect(rows(stack)[0]).not.toBe(settled);
		setMotionEffects(false);
		stack.invalidate();
		expect(rows(stack)[0]).toBe(settled);
		// And it still leaves instantly at its deadline.
		vi.advanceTimersByTime(TOAST_TTL_MS);
		expect(rows(stack)).toHaveLength(0);
		stack.dispose();
		setMotionEffects(true);
	});

	it("resumes the fade when motion turns back on inside the closing window", () => {
		setMotionEffects(false);
		const stack = new ToastComponent();
		stack.push("主题:titanium");
		const settled = rows(stack)[0]!;
		vi.advanceTimersByTime(TOAST_TTL_MS - TOAST_FADE_MS + 100);
		stack.invalidate();
		expect(rows(stack)[0]).toBe(settled);
		setMotionEffects(true);
		stack.invalidate();
		expect(rows(stack)[0]).not.toBe(settled);
		vi.advanceTimersByTime(TOAST_FADE_MS);
		expect(rows(stack)).toHaveLength(0);
		stack.dispose();
	});

	it("keeps at most 3 toasts, dropping the oldest", () => {
		const stack = new ToastComponent();
		for (let i = 1; i <= MAX_TOASTS + 1; i++) stack.push(`toast ${i}`);
		const text = plain(stack);
		expect(rows(stack)).toHaveLength(MAX_TOASTS);
		expect(text).not.toContain("toast 1");
		expect(text).toContain("toast 2");
		expect(text).toContain(`toast ${MAX_TOASTS + 1}`);
		stack.dispose();
	});

	it("renders zero rows while empty, so the mounted band changes no geometry", () => {
		const stack = new ToastComponent();
		expect(rows(stack)).toHaveLength(0);
		// Each live toast is exactly one row — the band never grows beyond its count.
		stack.push("a");
		expect(rows(stack)).toHaveLength(1);
		stack.push("b");
		expect(rows(stack)).toHaveLength(2);
		stack.clear();
		expect(rows(stack)).toHaveLength(0);
		stack.dispose();
	});

	it("clear drops live toasts and their timers", () => {
		const requestRender = vi.fn();
		const stack = new ToastComponent({ requestRender });
		stack.push("toast");
		stack.clear();
		expect(rows(stack)).toHaveLength(0);
		const renders = requestRender.mock.calls.length;
		vi.advanceTimersByTime(TOAST_TTL_MS * 2);
		expect(rows(stack)).toHaveLength(0);
		expect(requestRender.mock.calls.length).toBe(renders);
		stack.dispose();
	});

	it("clears toasts whose message was pushed before dispose and stops all timers", () => {
		const requestRender = vi.fn();
		const stack = new ToastComponent({ requestRender });
		stack.push("toast");
		stack.dispose();
		const renders = requestRender.mock.calls.length;
		vi.advanceTimersByTime(TOAST_TTL_MS * 2);
		expect(rows(stack)).toHaveLength(0);
		expect(requestRender.mock.calls.length).toBe(renders);
	});

	it("truncates a long message to the render width on one row", () => {
		const stack = new ToastComponent();
		stack.push("x".repeat(200));
		const rendered = rows(stack);
		expect(rendered).toHaveLength(1);
		const stripped = Bun.stripANSI(rendered[0]!);
		expect(stripped.startsWith(" ✦ ")).toBe(true);
		expect(stripped.length).toBeLessThanOrEqual(WIDTH);
		stack.dispose();
	});
});
