import { t } from "../i18n";
import { Container, Spacer, Text } from "../index";
import { WidthAwareText } from "../render/index";
import { theme } from "../theme/theme";
import { DynamicBorder } from "../chrome/dynamic-border";
import { formatErrorBlock } from "../chrome/error-block";
import type { NativeNode, NativeUiEvent } from "../native/node";
import { node, span, text } from "../native/describe";
import { actionButton } from "../native/overlay";
import { plainText } from "../native/spans";
import { matchesKey } from "../keys";

/** Max wrapped rows of the error message shown in the pinned banner. */
const MAX_BANNER_ROWS = 4;

/**
 * A persistent error banner pinned above the editor. Unlike the transcript
 * "Error: …" line (which scrolls away as the conversation grows), this stays in
 * the fixed region directly above the input so a turn that ended on a provider
 * error — e.g. Anthropic's "Output blocked by content filtering policy" — cannot
 * be missed. It is cleared when the next turn starts. The message wraps to the
 * render width and keeps {@link MAX_BANNER_ROWS} rows; the expand hint on the
 * overflow row reveals the full body inline in the transcript.
 *
 * Visual hierarchy mirrors the output-block three-state language: the verdict
 * title carries the error color (bold) while the trailing meta drops to dim,
 * and the border keeps its key color from the theme's `error` slot — the same
 * slot semantics `renderOutputBlock` derives for `state === "error"`. The
 * border intentionally has no animation; a static verdict stroke, like the
 * composer's static working mark. Banner chrome copy is localized to Chinese
 * to match the surrounding composer chrome (`↵ 发送 · esc 取消`, the 夜航
 * welcome subtitle); the body stays the verbatim provider message.
 *
 * Natively the transcript's error frame always shows the full message, so the
 * strip is only a reminder and offers a Dismiss button that calls `onDismiss`.
 */
export class ErrorBannerComponent extends Container {
	readonly #message: string;
	readonly #onDismiss: (() => void) | undefined;
	/** Natively the strip shows the headline; Details unfolds the whole message in place. */
	#expanded = false;
	#native: NativeNode | undefined;
	#bodyText: WidthAwareText | undefined;

	constructor(message: string, onDismiss?: () => void) {
		super();
		this.#message = plainText(message).trim();
		this.#onDismiss = onDismiss;
		this.addChild(new Spacer(1));
		// Border stays on the theme's `error` slot (the output-block error-state
		// semantics); `borderAccent` is reserved for live/working frames.
		this.addChild(new DynamicBorder(str => theme.fg("error", str)));
		// Title layer: verdict glyph (theme `status.error` symbol slot, so symbol
		// presets can restyle it) + localized label, bold error — the same
		// "title carries the verdict" layering as an output block's error header.
		// ANSI 快捷键交互与恢复动作：支持 Esc 关闭 (dismiss) 与 Ctrl+O 展开/折叠
		// (toggleDetails) 详细错误信息；由 interactive-mode 在 showPinnedError 挂载时
		// 通过 addInputListener 分发按键并更新渲染。
		this.addChild(new Text(theme.bold(theme.fg("error", `${theme.status.error} ${t("error.title")}`)), 1, 0));
		this.#bodyText = new WidthAwareText(
			contentWidth =>
				formatErrorBlock(message, contentWidth, this.#expanded ? Infinity : MAX_BANNER_ROWS, line =>
					theme.fg("error", line),
				),
			1,
			0,
		);
		this.addChild(this.#bodyText);
		// Meta layer: dim dismissal hint, localized like the composer hints.
		this.addChild(new Text(theme.fg("dim", t("error.hint")), 1, 0));
		this.addChild(new DynamicBorder(str => theme.fg("error", str)));
	}

	get isExpanded(): boolean {
		return this.#expanded;
	}

	dismiss(): void {
		this.#onDismiss?.();
	}

	toggleDetails(): void {
		this.#expanded = !this.#expanded;
		this.#native = undefined;
		this.invalidate();
	}

	handleInput(data: string): boolean {
		if (matchesKey(data, "escape")) {
			this.dismiss();
			return true;
		}
		if (matchesKey(data, "ctrl+o")) {
			this.toggleDetails();
			return true;
		}
		return false;
	}

	/**
	 * An error-tinted strip pinned above the composer: the message's first line
	 * (the transcript's error frame keeps the full message and its actions)
	 * and a Details button that unfolds the rest here, then Dismiss.
	 */
	override describe(): NativeNode {
		if (this.#native) return this.#native;
		const headline =
			this.#message
				.split("\n")
				.find(line => line.trim() !== "")
				?.trim() || "Error";
		const multiline = this.#message !== headline;
		const message = this.#expanded
			? text([span(this.#message, "error")], { wrap: "word", grow: 1 })
			: text([span(headline, "error")], { truncate: "end", lines: 1, grow: 1, title: this.#message });
		const children: NativeNode[] = [message];
		if (multiline || headline.length > 80) {
			children.push(actionButton(this.#expanded ? "Less" : "Details", "details"));
		}
		if (this.#onDismiss) children.push(actionButton("Dismiss", "dismiss"));
		this.#native = node(
			"row",
			{ role: "omp.errorBanner", tone: "error", gap: "sm", align: this.#expanded ? "start" : "center" },
			children,
		);
		return this.#native;
	}

	handleNativeEvent(event: NativeUiEvent): void {
		if (event.type !== "action") return;
		if (event.act === "dismiss") {
			this.dismiss();
			return;
		}
		if (event.act !== "details") return;
		this.toggleDetails();
	}
}
