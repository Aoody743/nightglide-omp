import { motionEffectsEnabled, onMotionEffectsChange } from "../motion-effects";
import { getCurrentThemeName } from "../theme/theme";
import type { Component } from "../tui";
import { renderDiveFrame } from "./nightglide-scene-dive";
import { renderFlightFrame } from "./nightglide-scene-flight";

/** Ambient scene occupies ordinary dock rows, never terminal scrollback. */
export class NightglideScene implements Component {
	#phase = 0;
	#timer: NodeJS.Timeout | undefined;
	#unsubscribe: () => void;

	constructor(
		readonly requestRender: () => void,
		readonly terminalRows: () => number,
	) {
		this.#unsubscribe = onMotionEffectsChange(() => this.#syncTimer());
		this.#syncTimer();
	}

	#syncTimer(): void {
		if (!motionEffectsEnabled()) {
			if (this.#timer) clearInterval(this.#timer);
			this.#timer = undefined;
			this.requestRender();
			return;
		}
		if (!this.#timer) {
			this.#timer = setInterval(() => {
				this.#phase++;
				this.requestRender();
			}, 100);
			this.#timer.unref();
		}
	}

	render(width: number): readonly string[] {
		if (this.terminalRows() < 24 || width < 40) return [];
		const name = getCurrentThemeName() ?? "nightglide-flight";
		const dive = name === "nightglide-abyss" || name === "nightglide-daybreak";
		const dark = name !== "nightglide-cloudlight" && name !== "nightglide-daybreak";
		const phase = motionEffectsEnabled() ? this.#phase : 0;
		return dive ? renderDiveFrame(width, phase, 3, dark) : renderFlightFrame(width, phase, 3, dark);
	}

	dispose(): void {
		if (this.#timer) clearInterval(this.#timer);
		this.#timer = undefined;
		this.#unsubscribe();
	}
}
