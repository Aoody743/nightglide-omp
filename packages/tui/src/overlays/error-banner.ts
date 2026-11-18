import { Container, Spacer, Text } from "../index";
import { WidthAwareText } from "../render/index";
import { theme } from "../theme/theme";
import { DynamicBorder } from "../chrome/dynamic-border";
import { formatErrorBlock } from "../chrome/error-block";
import type { NativeNode, NativeUiEvent } from "../native/node";
import { node, span, text } from "../native/describe";
import { actionButton } from "../native/overlay";
import { plainText } from "../native/spans";

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
		// TODO(recovery-actions): 本轮只做视觉与提示层。若要加"查看详情"等恢复动作，
		// 需要打通的事件通路：1) 在 app-keybindings 注册专用键位（ANSI 路径目前
		// 只有 formatErrorBlock 的 ctrl+o 展开通路，作用于 transcript 的 inline
		// error，而非本横幅）；2) interactive-mode 在 showPinnedError 构造本组件时
		// 传入 onAction 回调并接住该键（interactive-mode 由并行任务独占，禁止本轮
		// 接线）；3) 组件层参照下方 handleNativeEvent 的 "details"/"dismiss" 通路
		// 为 ANSI 键盘事件新增 action 分支。接线前不得渲染任何动作按钮。
		this.addChild(new Text(theme.bold(theme.fg("error", `${theme.status.error} 错误`)), 1, 0));
		this.addChild(
			new WidthAwareText(
				contentWidth =>
					formatErrorBlock(message, contentWidth, MAX_BANNER_ROWS, line => theme.fg("error", line)),
				1,
				0,
			),
		);
		// Meta layer: dim dismissal hint, localized like the composer hints.
		this.addChild(new Text(theme.fg("dim", "发送下一条消息后自动消失"), 1, 0));
		this.addChild(new DynamicBorder(str => theme.fg("error", str)));
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
			this.#onDismiss?.();
			return;
		}
		if (event.act !== "details") return;
		this.#expanded = !this.#expanded;
		this.#native = undefined;
	}
}
