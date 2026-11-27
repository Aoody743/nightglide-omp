import type { Model } from "@oh-my-pi/pi-ai";
import { modelKind } from "@oh-my-pi/pi-catalog/types";
import { editorKey } from "../../chrome/keybinding-hints";
import { type SelectItem, SelectList } from "../../components/select-list";
import { Text } from "../../components/text";
import { WizardStep } from "../../components/wizard-step";
import { type SgrMouseEvent } from "../../mouse";
import type { DescribeContext, NativeNode } from "../../native/node";
import { getSelectListTheme, theme } from "../../theme/theme";
import { Container } from "../../tui";
import { wrapTextWithAnsi } from "../../utils";
import type { SetupRoutingMode, SetupScene, SetupSceneController, SetupSceneHost } from "./types";

const KNOWN_LOCAL_PROVIDER_IDS: ReadonlySet<string> = new Set([
	"omlx",
	"ollama",
	"lm-studio",
	"lmstudio",
	"vllm",
	"llamacpp",
	"llama.cpp",
	"jan",
	"gpustack",
	"localai",
]);

function fallbackIsLocalModel(model: Pick<Model, "provider" | "baseUrl">): boolean {
	if (KNOWN_LOCAL_PROVIDER_IDS.has(model.provider.toLowerCase())) return true;
	if (!model.baseUrl) return false;
	try {
		const hostname = new URL(model.baseUrl).hostname.toLowerCase();
		return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname === "[::1]";
	} catch {
		return false;
	}
}

const MODE_OPTIONS: ReadonlyArray<{ value: SetupRoutingMode; label: string; description: string }> = [
	{
		value: "manual",
		label: "1  Manual (default)",
		description: "Use your selected default model and role settings unchanged",
	},
	{
		value: "local",
		label: "2  Local",
		description: "Bind chat & subagents to local models only; no cloud chat fallback",
	},
	{
		value: "balanced",
		label: "3  Balanced",
		description: "Keep main/thinking/architect (local fallback); run small roles locally first",
	},
	{
		value: "performance",
		label: "4  Performance",
		description: "Point small roles & subagents at your strongest model, with local fallback",
	},
];

type RoutingStep = "mode" | "localModel";

class RoutingSceneController implements SetupSceneController {
	title = "Choose model routing";
	get subtitle(): string {
		return this.#phase === "mode"
			? "Control how sessions and subagents split between local and cloud models."
			: `Pick which local model to prefer, or press ${editorKey("tui.select.cancel")} to go back.`;
	}

	readonly #host: SetupSceneHost;
	#phase: RoutingStep = "mode";
	#modeList: SelectList;
	#localList: SelectList | undefined;
	#pendingMode: SetupRoutingMode;
	#highlightedMode: SetupRoutingMode;
	#committing = false;
	#saveError: string | undefined;
	#step: WizardStep | undefined;

	constructor(host: SetupSceneHost) {
		this.#host = host;
		const configured = host.ctx.routingMode ?? "manual";
		this.#pendingMode = configured;
		this.#highlightedMode = configured;
		this.#modeList = new SelectList(MODE_OPTIONS, MODE_OPTIONS.length, getSelectListTheme());
		const initialIdx = Math.max(
			0,
			MODE_OPTIONS.findIndex(opt => opt.value === configured),
		);
		this.#modeList.setSelectedIndex(initialIdx);
		this.#modeList.onSelectionChange = item => {
			this.#highlightedMode = item.value as SetupRoutingMode;
			this.#saveError = undefined;
			this.#host.requestRender();
		};
		this.#modeList.onSelect = item => {
			void this.#handleModeSelect(item.value as SetupRoutingMode);
		};
		this.#modeList.onCancel = () => host.finish("skipped");
	}

	invalidate(): void {
		if (this.#step) this.#step.invalidate();
		else this.#activeList().invalidate();
	}

	handleInput(data: string): void {
		if (this.#committing) return;
		if (this.#phase === "mode") {
			const quickIndex = data >= "1" && data <= "4" ? Number(data) - 1 : -1;
			if (quickIndex >= 0 && quickIndex < MODE_OPTIONS.length) {
				this.#modeList.setSelectedIndex(quickIndex);
				this.#highlightedMode = MODE_OPTIONS[quickIndex]!.value;
				this.#saveError = undefined;
				this.#host.requestRender();
				return;
			}
		}
		this.#activeList().handleInput(data);
	}

	routeMouse(event: SgrMouseEvent, line: number, col: number): void {
		if (this.#committing) return;
		this.#step?.routeMouse(event, line, col);
	}

	render(width: number, maxLines?: number): readonly string[] {
		const step = this.#syncWizardStep(width);
		step.setMaxHeight(maxLines);
		return step.render(width);
	}

	describe(cx: DescribeContext): NativeNode {
		return this.#syncWizardStep(cx.cols).describe(cx);
	}

	#activeList(): SelectList {
		return this.#phase === "localModel" && this.#localList ? this.#localList : this.#modeList;
	}

	#localChatModels(): Model[] {
		const available = this.#host.ctx.getModels?.().available ?? [];
		const checkLocal = this.#host.ctx.isLocalModel ?? fallbackIsLocalModel;
		return available.filter(model => modelKind(model) === "chat" && checkLocal(model));
	}

	#syncWizardStep(width: number): WizardStep {
		const localModels = this.#localChatModels();
		const activeList = this.#activeList();

		const intro = new Container();
		if (this.#phase === "mode") {
			intro.addChild(
				new Text(
					theme.fg(
						"muted",
						`Pick a routing mode (${editorKey("tui.select.confirm")} to choose, ${editorKey("tui.select.cancel")} to skip). Change anytime in /settings.`,
					),
					0,
					0,
				),
			);
		} else {
			intro.addChild(
				new Text(
					theme.fg(
						"muted",
						localModels.length > 0
							? `Optional: pin nightglide.localModel for ${this.#pendingMode} routing, or auto-detect.`
							: "No local model is currently reachable. Local mode needs a running local server (oMLX, Ollama, LM Studio) to start.",
					),
					0,
					0,
				),
			);
		}

		const preview = new Container();
		if (this.#phase === "mode") {
			for (const line of this.#buildDisclosureLines(this.#highlightedMode, localModels.length, width)) {
				preview.addChild(new Text(line, 0, 0));
			}
		}

		const status = this.#saveError
			? new Text(theme.fg("error", this.#saveError), 0, 0)
			: this.#host.ctx.routingOverrideLayer
				? new Text(
						theme.fg(
							"warning",
							`Note: ${this.#host.ctx.routingOverrideLayer} config currently overrides nightglide.routingMode.`,
						),
						0,
						0,
					)
				: undefined;

		const listItemCount =
			this.#phase === "mode" ? MODE_OPTIONS.length : Math.min(8, Math.max(2, localModels.length + 1));

		if (!this.#step) {
			this.#step = new WizardStep({
				kind: "choice",
				intro,
				preview: this.#phase === "mode" ? { component: preview, optional: true } : undefined,
				content: activeList,
				status,
				minContentLines: listItemCount,
				fitContent: budget => {
					const maxVisible = budget === undefined ? listItemCount : Math.max(1, Math.min(listItemCount, budget));
					activeList.setMaxVisible(maxVisible);
				},
			});
		} else {
			this.#step.setIntro(intro);
			this.#step.setPreview(this.#phase === "mode" ? { component: preview, optional: true } : undefined);
			this.#step.setContent(activeList);
			this.#step.setStatus(status);
		}
		return this.#step;
	}

	#buildDisclosureLines(mode: SetupRoutingMode, localCount: number, width: number): string[] {
		const current = this.#host.ctx.getModels?.().current;
		const currentLabel = current ? `${current.provider}/${current.id}` : "configured default";
		const localSummary =
			localCount > 0
				? `${localCount} local chat model${localCount === 1 ? "" : "s"} detected`
				: "no local model detected yet";
		const lines: string[] = [theme.bold(theme.fg("text", "Where requests go (cloud vs local):"))];

		let bullets: string[];
		switch (mode) {
			case "manual":
				bullets = [
					`• Main & subagents: use ${currentLabel} and any per-role settings as configured.`,
					"• Cloud vs local: sends context to whichever provider you selected (cloud if using a cloud model).",
				];
				break;
			case "local":
				bullets = [
					`• Main & subagents: all chat roles bind to local endpoints (${localSummary}).`,
					"• Cloud vs local: chat roles never fall back to cloud; standalone kind tools (web, speech, vision) keep their own settings.",
					...(localCount === 0
						? ["• Requires a local server (e.g. omlx serve / ollama serve) before starting a session."]
						: []),
				];
				break;
			case "balanced":
				bullets = [
					`• Main, thinking & architect: keep ${currentLabel} with a local fallback.`,
					`• Small & background subagents (smol/task/memory/tiny/widget): run locally first (${localSummary}).`,
					"• Cloud vs local: main chats still reach cloud when your default model is cloud-hosted.",
				];
				break;
			case "performance":
				bullets = [
					`• Main & subagents: route small roles (smol/task/advisor/memory/tiny/widget) to your strongest model (${currentLabel}).`,
					`• Cloud vs local: sends prompts to cloud when default is cloud; local models (${localSummary}) act as fallback.`,
				];
				break;
		}
		for (const bullet of bullets) {
			lines.push(...wrapTextWithAnsi(theme.fg("muted", bullet), width));
		}
		return lines;
	}

	async #handleModeSelect(mode: SetupRoutingMode): Promise<void> {
		this.#pendingMode = mode;
		this.#saveError = undefined;
		if (mode === "manual") {
			await this.#commit(mode, undefined);
			return;
		}
		const localModels = this.#localChatModels();
		if (localModels.length === 0 && mode !== "local") {
			await this.#commit(mode, undefined);
			return;
		}
		this.#enterLocalModelStep(localModels);
	}

	#enterLocalModelStep(localModels: readonly Model[]): void {
		this.#phase = "localModel";
		const items: SelectItem[] =
			localModels.length > 0
				? [
						{
							value: "__auto__",
							label: "Auto-detect local model (recommended)",
							description: "Prefer known local providers (oMLX/Ollama/…) or loopback",
						},
						...localModels.map(model => {
							const selector = `${model.provider}/${model.id}`;
							return {
								value: selector,
								label: selector,
								description: model.name && model.name !== model.id ? model.name : model.baseUrl,
							};
						}),
					]
				: [
						{
							value: "__auto__",
							label: "Save Local mode anyway (auto-detect later)",
							description: "Start a local server before launching a session",
						},
						{
							value: "__back__",
							label: "Choose another routing mode",
							description: "Return to routing mode list",
						},
					];
		const list = new SelectList(items, Math.min(8, items.length), getSelectListTheme());
		const configuredLocal = this.#host.ctx.localModel?.trim();
		if (configuredLocal) {
			const idx = items.findIndex(item => item.value === configuredLocal);
			if (idx >= 0) list.setSelectedIndex(idx);
		}
		list.onSelect = item => {
			if (item.value === "__back__") {
				this.#returnToModeStep();
				return;
			}
			const localChoice = item.value === "__auto__" ? null : item.value;
			void this.#commit(this.#pendingMode, localChoice);
		};
		list.onCancel = () => this.#returnToModeStep();
		this.#localList = list;
		this.#step?.setContent(list);
		this.#host.requestRender();
	}

	#returnToModeStep(): void {
		this.#phase = "mode";
		this.#localList = undefined;
		this.#saveError = undefined;
		this.#step?.setContent(this.#modeList);
		this.#host.requestRender();
	}

	async #commit(mode: SetupRoutingMode, localModel: string | null | undefined): Promise<void> {
		if (this.#committing) return;
		this.#committing = true;
		this.#saveError = undefined;
		this.#host.requestRender();
		try {
			await this.#host.ctx.saveRoutingMode?.(mode, localModel);
			this.#host.finish("done");
		} catch (error) {
			this.#committing = false;
			this.#saveError = error instanceof Error ? error.message : String(error);
			this.#host.requestRender();
		}
	}
}

/** Onboarding step for choosing Nightglide's local/cloud routing posture. */
export const routingSetupScene: SetupScene = {
	id: "routing",
	title: "Choose model routing",
	step: "Routing",
	minVersion: 4,
	mount: host => new RoutingSceneController(host),
};
