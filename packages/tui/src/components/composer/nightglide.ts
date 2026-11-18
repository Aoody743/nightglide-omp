/**
 * Nightglide Horizon Glide composer:
 * A delicate top rule anchor above a clean `❯ ` prompt, docking status line
 * below with elegant breathing room. No heavy enclosing boxes.
 *
 * The top rule carries the shape's state: idle it stays quiet in the host's
 * border color (borderMuted-family by default), while a working session
 * switches the rule to the stable accent and anchors a static `✦` mark at its
 * left end — legible at a glance and a single glyph change, never motion.
 */
import { truncateToWidth, visibleWidth } from "../../utils";
import { renderTopRule } from "./rule";
import type { ComposerChromeContext, ComposerRowContext, ComposerStyle } from "./types";

/** Static working mark anchored at the rule's left end; no animation. */
const WORKING_MARK = "✦ ";

/**
 * Working treatment of the top rule: the stable accent stroke with the static
 * working mark at its left end and the status chip still docked at the right
 * edge. Over-wide chips truncate like {@link renderTopRule}; terminals too
 * narrow for the mark drop the mark before they drop the rule.
 */
function renderWorkingTopRule(ctx: ComposerChromeContext): string {
	const { box, width, accentColor, topBorder } = ctx;
	const markWidth = visibleWidth(WORKING_MARK);
	if (topBorder && topBorder.width > 0 && width > markWidth + 1) {
		let { content, width: chipWidth } = topBorder;
		const chipBudget = width - markWidth - 1;
		if (chipWidth > chipBudget) {
			content = truncateToWidth(content, chipBudget);
			chipWidth = visibleWidth(content);
		}
		const leftFill = Math.max(0, width - markWidth - chipWidth - 1);
		return (
			accentColor(WORKING_MARK) +
			accentColor(box.horizontal.repeat(leftFill)) +
			content +
			accentColor(box.horizontal)
		);
	}
	if (width > markWidth) {
		return accentColor(WORKING_MARK) + accentColor(box.horizontal.repeat(width - markWidth));
	}
	return accentColor(box.horizontal.repeat(width));
}

export const nightglideComposerStyle: ComposerStyle = {
	id: "nightglide",
	sideBorders: false,
	verticalChrome: 1,
	statusAttachment: "top-rule-chip",
	bottomBar: "left",
	bottomBarGap: true,
	defaultPromptGutter: "❯ ",

	defaultPaddingX(): number {
		return 0;
	},

	sideChromeWidth(paddingX: number): number {
		return paddingX;
	},

	renderTop(ctx: ComposerChromeContext): string {
		// Idle keeps the host-driven border stroke (borderMuted-family by default;
		// session/vim/thinking accents when the host re-colors it), so focus and
		// mode signaling still reads through. Working switches to the stable
		// accent plus the static mark: busy is unmistakable, idle stays calm.
		return ctx.working ? renderWorkingTopRule(ctx) : renderTopRule(ctx);
	},

	renderRow(ctx: ComposerRowContext): string[] {
		return [ctx.gutter + ctx.text + ctx.pad];
	},

	renderBottom(): undefined {
		return undefined;
	},
};
