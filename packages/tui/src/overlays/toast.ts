/**
 * Quiet single-line toast notices for the band just above the composer.
 *
 * A toast is one row: an accent `✦` mark, a space, and the message in the
 * theme's `text` color — no background block, no border, nothing that demands
 * attention beyond existing. The stack keeps at most {@link MAX_TOASTS} toasts
 * (further pushes drop the oldest) and every toast leaves on its own after
 * {@link TOAST_TTL_MS}: with decorative motion on, its last
 * {@link TOAST_FADE_MS} ease toward the terminal background — the same cubic
 * easing, duration, and 40 ms frame cadence as the status line's brand fade
 * (`status-line/component.ts` `BRAND_FADE`) — while `--motion none` shows the
 * toast immediately and removes it immediately at its deadline, with no fade
 * frames ever armed.
 *
 * Timing rides wall-clock deadlines plus plain `setTimeout`/`setInterval`, the
 * arrangement the brand fade and the hook-input countdown already use, so tests
 * drive it with `vi.useFakeTimers` and never wait real time. The fade itself is
 * stateless — each render blends by how close the deadline is — so motion
 * flipping mid-flight snaps or resumes correctly without a tween store.
 *
 * The host mounts the stack as self-clearing chrome beside the model-cycle
 * track (`modes/interactive-mode.ts`): an anchored, editor-adjacent root that
 * is never transcript history, never holds focus, and — empty, its resting
 * state — renders zero rows, so the composer's geometry is untouched until a
 * toast actually lives, and then only borrows rows the chrome floor already
 * holds back for self-clearing HUDs.
 */
import { mixHex, rgbToHex } from "@oh-my-pi/pi-utils/color";
import { motionEffectsEnabled, onMotionEffectsChange } from "../motion-effects";
import { node, span, text } from "../native/describe";
import type { NativeNode } from "../native/node";
import { isNativeRendering } from "../native/state";
import { plainLine } from "../native/spans";
import { theme } from "../theme/theme";
import { FG_RESET, fgAnsi } from "../theme/color";
import { getTerminalBackgroundColor } from "../terminal-capabilities";
import { getPaddingX, padding, truncateToWidth, visibleWidth } from "../utils";
import { Container, type Component } from "../tui";

/** How long a toast stays before it is removed (ms; the motion doc's "展示 3 秒"). */
export const TOAST_TTL_MS = 3000;
/** Duration of the motion-driven fade that closes a toast's life (rust omp's `BRAND_FADE`). */
export const TOAST_FADE_MS = 450;
/** Repaint cadence while a toast fade is in flight (rust omp's `FADE_FRAME`). */
const TOAST_FADE_FRAME_MS = 40;
/** Simultaneous toasts; pushing more drops the oldest. */
export const MAX_TOASTS = 3;

/** The toast's accent mark (single column, Zero Jitter). */
const TOAST_GLYPH = "✦";

/** Cubic ease-in-out, matching the status line's brand fade (rust omp's `EaseInOut`). */
function easeInOut(t: number): number {
	return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

/** The terminal background as CSS hex: the color a fading toast disappears into. */
function fadeTargetHex(): string {
	const packed = getTerminalBackgroundColor();
	return rgbToHex({ r: (packed >> 16) & 0xff, g: (packed >> 8) & 0xff, b: packed & 0xff });
}

/** Fade progress 0..1 across a toast's closing window; 0 whenever motion is off. */
function fadeProgress(deadline: number, now: number): number {
	if (!motionEffectsEnabled()) return 0;
	const remaining = deadline - now;
	if (remaining >= TOAST_FADE_MS) return 0;
	return Math.max(0, Math.min(1, 1 - Math.max(0, remaining) / TOAST_FADE_MS));
}

/** A `✦ message` line, blending toward the terminal background across its fade window. */
class ToastRow implements Component {
	readonly #message: string;
	readonly #deadline: number;
	#cachedLine: string | undefined;
	#cachedWidth = -1;
	#native: NativeNode | undefined;

	constructor(message: string, deadline: number) {
		this.#message = plainLine(message);
		this.#deadline = deadline;
	}

	invalidate(): void {
		this.#cachedLine = undefined;
		this.#native = undefined;
	}

	render(width: number): readonly string[] {
		if (this.#cachedLine !== undefined && this.#cachedWidth === width) return [this.#cachedLine];
		const pad = getPaddingX(1);
		const usable = Math.max(1, width - pad * 2);
		const budget = Math.max(1, usable - visibleWidth(TOAST_GLYPH) - 1);
		const message = truncateToWidth(this.#message, budget);
		const t = easeInOut(fadeProgress(this.#deadline, Date.now()));
		const fading = t > 0;
		const bgHex = fading ? fadeTargetHex() : "";
		const paint = (hex: string, settled: (s: string) => string, s: string): string => {
			if (!fading) return settled(s);
			return fgAnsi(mixHex(hex, bgHex, t), theme.getColorMode()) + s + FG_RESET;
		};
		const line = `${padding(pad)}${paint(theme.getColorHex("accent"), s => theme.fg("accent", s), TOAST_GLYPH)} ${paint(
			theme.getColorHex("text"),
			s => theme.fg("text", s),
			message,
		)}`;
		const trailing = Math.max(0, width - visibleWidth(line));
		this.#cachedLine = line + padding(trailing);
		this.#cachedWidth = width;
		return [this.#cachedLine];
	}

	/** The settled form: an accent mark, the gap, and the single-line message. */
	describe(): NativeNode {
		if (this.#native) return this.#native;
		this.#native = node("row", { role: "omp.toast", align: "center" }, [
			text([span(TOAST_GLYPH, "accent"), span(" ")]),
			text(this.#message, { truncate: "end", lines: 1 }),
		]);
		return this.#native;
	}
}

/** One live toast: its row plus the timers that end it. */
interface ToastEntry {
	row: ToastRow;
	deadline: number;
	/** Fires at the fade onset (motion on) and only nudges the frame timer. */
	onset: NodeJS.Timeout | undefined;
	/** Fires at the deadline and removes the toast whatever motion is doing. */
	deadlineTimer: NodeJS.Timeout | undefined;
}

/**
 * The mounted toast stack: at most {@link MAX_TOASTS} quiet rows above the
 * composer, each dismissing itself. `push` never throws on empty messages
 * (they collapse to a bare mark — the caller decides whether that is worth
 * showing) and never touches focus or the transcript.
 */
export class ToastComponent extends Container {
	#entries: ToastEntry[] = [];
	#fadeFrameTimer: NodeJS.Timeout | undefined;
	readonly #requestRender: () => void;
	readonly #unsubscribeMotion: () => void;

	constructor(options: { requestRender?: () => void } = {}) {
		super();
		this.#requestRender = options.requestRender ?? (() => {});
		this.#unsubscribeMotion = onMotionEffectsChange(() => this.#onMotionChange());
	}

	/** Show a toast for {@link TOAST_TTL_MS}; the oldest row drops past {@link MAX_TOASTS}. */
	push(message: string): void {
		const now = Date.now();
		const entry: ToastEntry = {
			row: new ToastRow(message, now + TOAST_TTL_MS),
			deadline: now + TOAST_TTL_MS,
			onset: undefined,
			deadlineTimer: undefined,
		};
		while (this.#entries.length >= MAX_TOASTS) this.#removeEntry(this.#entries[0]!);
		this.#entries.push(entry);
		this.addChild(entry.row);
		entry.deadlineTimer = this.#arm(entry.deadline - now, () => this.#onDeadlineTimer(entry));
		if (motionEffectsEnabled()) {
			// The fade needs frames from its onset; later flips re-derive from the clock.
			entry.onset = this.#arm(entry.deadline - TOAST_FADE_MS - now, () => this.#onOnsetTimer(entry));
		}
		this.#requestRender();
	}

	/** Drop every toast now (a session or view switch makes them stale). */
	override clear(): void {
		for (const entry of this.#entries.splice(0)) this.#disarmEntry(entry);
		this.#stopFadeFrameTimer();
		super.clear();
	}

	override dispose(): void {
		this.clear();
		this.#unsubscribeMotion();
		super.dispose();
	}

	#arm(delayMs: number, fn: () => void): NodeJS.Timeout {
		const timer = setTimeout(fn, Math.max(1, delayMs));
		timer.unref?.();
		return timer;
	}

	#disarmEntry(entry: ToastEntry): void {
		if (entry.onset) {
			clearTimeout(entry.onset);
			entry.onset = undefined;
		}
		if (entry.deadlineTimer) {
			clearTimeout(entry.deadlineTimer);
			entry.deadlineTimer = undefined;
		}
	}

	#removeEntry(entry: ToastEntry): void {
		const index = this.#entries.indexOf(entry);
		if (index === -1) return;
		this.#disarmEntry(entry);
		this.#entries.splice(index, 1);
		this.removeChild(entry.row);
		if (!this.#entries.some(live => live.deadline - Date.now() < TOAST_FADE_MS)) this.#stopFadeFrameTimer();
		this.#requestRender();
	}

	/** Fade onset: start the frame repaints (motion may have flipped since arming). */
	#onOnsetTimer(entry: ToastEntry): void {
		entry.onset = undefined;
		if (!this.#entries.includes(entry) || !motionEffectsEnabled()) return;
		this.#startFadeFrameTimer();
	}

	#onDeadlineTimer(entry: ToastEntry): void {
		entry.deadlineTimer = undefined;
		this.#removeEntry(entry);
	}

	#startFadeFrameTimer(): void {
		if (this.#fadeFrameTimer || isNativeRendering()) return;
		this.#fadeFrameTimer = setInterval(() => {
			if (!this.#entries.some(live => motionEffectsEnabled() && live.deadline - Date.now() < TOAST_FADE_MS)) {
				this.#stopFadeFrameTimer();
				return;
			}
			this.invalidate();
			this.#requestRender();
		}, TOAST_FADE_FRAME_MS);
		this.#fadeFrameTimer.unref?.();
	}

	#stopFadeFrameTimer(): void {
		if (!this.#fadeFrameTimer) return;
		clearInterval(this.#fadeFrameTimer);
		this.#fadeFrameTimer = undefined;
	}

	/**
	 * A motion flip re-derives everything from the clock: fading rows snap to
	 * their settled colors the next render (progress reads `motionEffectsEnabled`),
	 * and with motion back on, rows already inside their closing window resume
	 * the fade at the phase the deadline implies.
	 */
	#onMotionChange(): void {
		if (!motionEffectsEnabled()) {
			this.#stopFadeFrameTimer();
		} else if (this.#entries.some(live => live.deadline - Date.now() < TOAST_FADE_MS)) {
			this.#startFadeFrameTimer();
		}
		this.#requestRender();
	}
}
