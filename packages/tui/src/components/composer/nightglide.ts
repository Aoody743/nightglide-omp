/**
 * Nightglide Horizon Glide composer:
 * A delicate top rule anchor above a clean `❯ ` prompt, docking status line
 * below with elegant breathing room. No heavy enclosing boxes.
 */
import { renderTopRule } from "./rule";
import type { ComposerChromeContext, ComposerRowContext, ComposerStyle } from "./types";

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
		return renderTopRule(ctx);
	},

	renderRow(ctx: ComposerRowContext): string[] {
		return [ctx.gutter + ctx.text + ctx.pad];
	},

	renderBottom(): undefined {
		return undefined;
	},
};
