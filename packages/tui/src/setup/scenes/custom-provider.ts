import { formTheme } from "../../chrome/form-theme";
import { editorKey } from "../../chrome/keybinding-hints";
import { TextFormField } from "../../components/form";
import { type SelectItem, SelectList } from "../../components/select-list";
import { Spacer } from "../../components/spacer";
import { Text } from "../../components/text";
import { type MouseRoutable, type SgrMouseEvent } from "../../mouse";
import { node, span, text } from "../../native/describe";
import type { DescribeContext, NativeChild, NativeNode } from "../../native/node";
import { overlayCard } from "../../native/overlay";
import { getSelectListTheme, theme } from "../../theme/theme";
import { Container, type Component, type Focusable } from "../../tui";
import { wrapTextWithAnsi } from "../../utils";
import type {
	SaveSetupCustomProviderInput,
	SetupCustomProviderApi,
	SetupCustomProviderSummary,
	SetupHost,
} from "./types";

const PROVIDER_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,39}$/;

type CustomProviderPhase =
	| "loading"
	| "menu"
	| "providerAction"
	| "confirmDelete"
	| "id"
	| "baseUrl"
	| "api"
	| "apiKey"
	| "saving"
	| "error";

export type CustomProviderDialogResult =
	| { readonly kind: "saved"; readonly provider: string; readonly modelCount: number }
	| { readonly kind: "deleted"; readonly provider: string };

interface DraftProvider {
	id: string;
	baseUrl: string;
	api: SetupCustomProviderApi;
	apiKey: string;
}

function isValidProviderId(id: string): boolean {
	return PROVIDER_ID_PATTERN.test(id);
}

function isValidBaseUrl(url: string): boolean {
	try {
		const parsed = new URL(url);
		return (parsed.protocol === "http:" || parsed.protocol === "https:") && parsed.host.length > 0;
	} catch {
		return false;
	}
}

function redactSecret(message: string, secret: string | undefined): string {
	const trimmed = secret?.trim();
	if (!trimmed) return message;
	return message.split(trimmed).join("[redacted]");
}

function toApiProtocol(api: string | undefined): SetupCustomProviderApi {
	return api === "anthropic-messages" ? "anthropic-messages" : "openai-completions";
}

/**
 * In-scene dialog for adding, editing, testing discovery on, and removing
 * custom OpenAI/Anthropic-compatible providers during onboarding.
 */
export class CustomProviderDialog implements Component, Focusable, MouseRoutable {
	#host: SetupHost;
	#requestRender: () => void;
	#onDone: (result: CustomProviderDialogResult) => void;
	#onCancel: () => void;

	#phase: CustomProviderPhase = "loading";
	#existing: SetupCustomProviderSummary[] = [];
	#editing: SetupCustomProviderSummary | undefined;
	#draft: DraftProvider = { id: "", baseUrl: "", api: "openai-completions", apiKey: "" };
	#activeField: TextFormField | undefined;
	#activeList: SelectList | undefined;
	#errorMessage: string | undefined;
	#focused = false;
	#useTerminalCursor = false;
	#disposed = false;
	#contentRowStart = 0;

	constructor(options: {
		host: SetupHost;
		requestRender: () => void;
		onDone: (result: CustomProviderDialogResult) => void;
		onCancel: () => void;
	}) {
		this.#host = options.host;
		this.#requestRender = options.requestRender;
		this.#onDone = options.onDone;
		this.#onCancel = options.onCancel;
		void this.#loadInitial();
	}

	get focused(): boolean {
		return this.#focused;
	}

	set focused(value: boolean) {
		this.#focused = value;
		if (this.#activeField) this.#activeField.focused = value;
	}

	setUseTerminalCursor(useTerminalCursor: boolean): void {
		this.#useTerminalCursor = useTerminalCursor;
		this.#activeField?.setUseTerminalCursor(useTerminalCursor);
	}

	pasteText(content: string): void {
		this.#activeField?.pasteText(content);
	}

	dispose(): void {
		this.#disposed = true;
		this.#clearActiveControls();
	}

	invalidate(): void {
		this.#activeField?.invalidate();
		this.#activeList?.invalidate();
	}

	handleInput(data: string): void {
		if (this.#phase === "loading" || this.#phase === "saving") {
			if (data === "\x1b") {
				this.#disposed = true;
				this.#onCancel();
			}
			return;
		}
		if (this.#activeField) {
			this.#activeField.handleInput(data);
			return;
		}
		this.#activeList?.handleInput(data);
	}

	routeMouse(event: SgrMouseEvent, line: number, col: number): void {
		if (this.#activeList) {
			this.#activeList.routeMouse(event, line - this.#contentRowStart, col);
			return;
		}
		if (this.#activeField) {
			this.#activeField.routeMouse(event, line - this.#contentRowStart, col);
		}
	}

	render(width: number, maxLines?: number): readonly string[] {
		const container = new Container();
		const heading = this.#headingText();
		container.addChild(new Text(theme.bold(theme.fg("accent", heading)), 0, 0));
		container.addChild(new Spacer(1));

		const headerRows = container.render(width).length;
		this.#contentRowStart = headerRows;

		if (this.#phase === "loading") {
			container.addChild(new Text(theme.fg("muted", "Loading custom providers…"), 0, 0));
		} else if (this.#phase === "saving") {
			container.addChild(
				new Text(
					theme.fg("muted", `Connecting to ${this.#draft.id} (${this.#draft.baseUrl}) and discovering models…`),
					0,
					0,
				),
			);
			container.addChild(new Spacer(1));
			container.addChild(new Text(theme.fg("dim", `(${editorKey("tui.select.cancel")} to cancel)`), 0, 0));
		} else if (this.#phase === "error") {
			for (const wrapped of wrapTextWithAnsi(theme.fg("error", this.#errorMessage ?? "Connection failed."), width)) {
				container.addChild(new Text(wrapped, 0, 0));
			}
			container.addChild(new Spacer(1));
			this.#contentRowStart = container.render(width).length;
			if (this.#activeList) container.addChild(this.#activeList);
		} else if (this.#activeField) {
			container.addChild(this.#activeField);
		} else if (this.#activeList) {
			if (this.#phase === "menu") {
				container.addChild(
					new Text(theme.fg("muted", "Pick a custom provider to edit or remove, or add a new endpoint."), 0, 0),
				);
				container.addChild(new Spacer(1));
			} else if (this.#phase === "api") {
				container.addChild(new Text(theme.fg("muted", `${this.#draft.id} · API protocol`), 0, 0));
				container.addChild(new Spacer(1));
			} else if (this.#phase === "confirmDelete") {
				container.addChild(
					new Text(
						theme.fg("warning", `Remove ${this.#draft.id} from models.yml and delete any stored key?`),
						0,
						0,
					),
				);
				container.addChild(new Spacer(1));
			}
			this.#contentRowStart = container.render(width).length;
			container.addChild(this.#activeList);
		}

		const lines = container.render(width);
		if (maxLines === undefined || lines.length <= maxLines) return lines;
		const head = Math.min(2, maxLines);
		return [...lines.slice(0, head), ...lines.slice(lines.length - (maxLines - head))];
	}

	describe(_cx: DescribeContext): NativeNode {
		const children: NativeChild[] = [];
		if (this.#phase === "loading") {
			children.push(node("spinner", { label: [span("Loading custom providers…", "muted")] }));
		} else if (this.#phase === "saving") {
			children.push(
				node("spinner", {
					label: [span(`Connecting to ${this.#draft.id} and discovering models…`, "muted")],
				}),
			);
		} else if (this.#phase === "error") {
			children.push(text([span(this.#errorMessage ?? "Connection failed.", "error")], { wrap: "word" }));
			if (this.#activeList) children.push(this.#activeList);
		} else if (this.#activeField) {
			children.push(this.#activeField);
		} else if (this.#activeList) {
			children.push(this.#activeList);
		}
		return overlayCard("omp.setup.custom-provider", this.#headingText(), children);
	}

	#headingText(): string {
		if (this.#phase === "menu") return "Custom providers (Base URL + API key)";
		if (this.#phase === "providerAction" || this.#phase === "confirmDelete") {
			return `Custom provider · ${this.#draft.id}`;
		}
		return this.#editing ? `Edit custom provider · ${this.#draft.id}` : "Add custom provider (Base URL + API key)";
	}

	async #loadInitial(): Promise<void> {
		try {
			const list = await this.#host.listCustomProviders?.();
			if (this.#disposed) return;
			this.#existing = [...(list ?? [])];
		} catch {
			if (this.#disposed) return;
			this.#existing = [];
		}
		if (this.#existing.length === 0) {
			this.#enterIdStep();
		} else {
			this.#enterMenu();
		}
		this.#requestRender();
	}

	#clearActiveControls(): void {
		if (this.#activeField) {
			this.#activeField.focused = false;
			this.#activeField.dispose();
			this.#activeField = undefined;
		}
		this.#activeList = undefined;
	}

	#setField(field: TextFormField): void {
		this.#clearActiveControls();
		field.focused = this.#focused;
		field.setUseTerminalCursor(this.#useTerminalCursor);
		this.#activeField = field;
		this.#requestRender();
	}

	#setList(list: SelectList): void {
		this.#clearActiveControls();
		this.#activeList = list;
		this.#requestRender();
	}

	#enterMenu(): void {
		this.#phase = "menu";
		this.#editing = undefined;
		const items: SelectItem[] = [
			{ value: "__add__", label: "＋ Add new custom provider", description: "Configure Base URL and API key" },
			...this.#existing.map(provider => ({
				value: `edit:${provider.id}`,
				label: provider.id,
				description: `${provider.baseUrl} (${provider.api})`,
			})),
		];
		const list = new SelectList(items, Math.min(8, items.length), getSelectListTheme());
		list.onSelect = item => {
			if (item.value === "__add__") {
				this.#draft = { id: "", baseUrl: "", api: "openai-completions", apiKey: "" };
				this.#enterIdStep();
				return;
			}
			const id = item.value.slice("edit:".length);
			const target = this.#existing.find(entry => entry.id === id);
			if (!target) return;
			this.#editing = target;
			this.#draft = {
				id: target.id,
				baseUrl: target.baseUrl,
				api: toApiProtocol(target.api),
				apiKey: "",
			};
			this.#enterProviderAction();
		};
		list.onCancel = () => this.#onCancel();
		this.#setList(list);
	}

	#enterProviderAction(): void {
		this.#phase = "providerAction";
		const items: SelectItem[] = [
			{ value: "edit", label: "Edit Base URL, API type, or key", description: this.#draft.baseUrl },
			{ value: "delete", label: "Delete custom provider", description: "Remove from models.yml and key store" },
		];
		const list = new SelectList(items, items.length, getSelectListTheme());
		list.onSelect = item => {
			if (item.value === "edit") {
				this.#enterBaseUrlStep();
			} else {
				this.#enterConfirmDelete();
			}
		};
		list.onCancel = () => this.#enterMenu();
		this.#setList(list);
	}

	#enterConfirmDelete(): void {
		this.#phase = "confirmDelete";
		const items: SelectItem[] = [
			{ value: "no", label: "Cancel", description: `Keep ${this.#draft.id}` },
			{ value: "yes", label: `Delete ${this.#draft.id}`, description: "Remove config and stored key" },
		];
		const list = new SelectList(items, items.length, getSelectListTheme());
		list.onSelect = item => {
			if (item.value === "yes") {
				void this.#deleteCurrent();
			} else {
				this.#enterProviderAction();
			}
		};
		list.onCancel = () => this.#enterProviderAction();
		this.#setList(list);
	}

	#enterIdStep(): void {
		this.#phase = "id";
		this.#editing = undefined;
		const existingIds = new Set(this.#existing.map(provider => provider.id));
		const cancelAction = this.#existing.length > 0 ? "back" : "cancel";
		const field = new TextFormField({
			theme: formTheme,
			label: "Provider name",
			description: "Lowercase letters, digits, and dashes (e.g. omlx, ollama, my-relay).",
			initialValue: this.#draft.id,
			prompt: "> ",
			empty: "reject",
			emptyError: "Enter a provider name.",
			validate: value => {
				const trimmed = value.trim();
				if (!isValidProviderId(trimmed)) {
					return "Use lowercase letters, digits, and - (starting with a letter or digit).";
				}
				if (existingIds.has(trimmed)) {
					return "That provider already exists; select it from the list to edit.";
				}
				return undefined;
			},
			hint: `${editorKey("tui.input.submit")} next · ${editorKey("tui.select.cancel")} ${cancelAction}`,
			onSubmit: value => {
				this.#draft.id = value.trim();
				this.#enterBaseUrlStep();
			},
			onCancel: () => {
				if (this.#existing.length > 0) this.#enterMenu();
				else this.#onCancel();
			},
			requestRender: this.#requestRender,
		});
		this.#setField(field);
	}

	#enterBaseUrlStep(): void {
		this.#phase = "baseUrl";
		const field = new TextFormField({
			theme: formTheme,
			label: `${this.#draft.id} · Base URL`,
			description:
				"e.g. http://127.0.0.1:8000/v1 (oMLX), http://127.0.0.1:11434/v1 (Ollama), or https://relay.example/v1",
			initialValue: this.#draft.baseUrl,
			prompt: "> ",
			empty: "reject",
			emptyError: "Enter a Base URL starting with http:// or https://.",
			validate: value =>
				isValidBaseUrl(value.trim()) ? undefined : "Enter a valid http:// or https:// URL with a host.",
			hint: `${editorKey("tui.input.submit")} next · ${editorKey("tui.select.cancel")} back`,
			onSubmit: value => {
				this.#draft.baseUrl = value.trim();
				this.#enterApiStep();
			},
			onCancel: () => {
				if (this.#editing) this.#enterProviderAction();
				else this.#enterIdStep();
			},
			requestRender: this.#requestRender,
		});
		this.#setField(field);
	}

	#enterApiStep(): void {
		this.#phase = "api";
		const items: SelectItem[] = [
			{
				value: "openai-completions",
				label: "OpenAI-compatible",
				description: "/v1/chat/completions (oMLX, Ollama, vLLM, most relays)",
			},
			{
				value: "anthropic-messages",
				label: "Anthropic-compatible",
				description: "/v1/messages",
			},
		];
		const list = new SelectList(items, items.length, getSelectListTheme());
		list.setSelectedIndex(this.#draft.api === "anthropic-messages" ? 1 : 0);
		list.onSelect = item => {
			this.#draft.api = toApiProtocol(item.value);
			this.#enterApiKeyStep();
		};
		list.onCancel = () => this.#enterBaseUrlStep();
		this.#setList(list);
	}

	#enterApiKeyStep(): void {
		this.#phase = "apiKey";
		const note = this.#editing
			? "Leave empty to keep the saved key. Input is masked; stored in ~/.omp/agent/agent.db (mode 0600)."
			: "Leave empty for keyless local servers (oMLX, Ollama). Input is masked; stored in ~/.omp/agent/agent.db (mode 0600).";
		const field = new TextFormField({
			theme: formTheme,
			label: `${this.#draft.id} · API key`,
			description: note,
			secret: true,
			prompt: "> ",
			empty: "submit",
			hint: `${editorKey("tui.input.submit")} save & discover models · ${editorKey("tui.select.cancel")} back`,
			onSubmit: value => {
				this.#draft.apiKey = value;
				void this.#save();
			},
			onCancel: () => this.#enterApiStep(),
			requestRender: this.#requestRender,
		});
		this.#setField(field);
	}

	#enterErrorStep(message: string): void {
		this.#phase = "error";
		this.#errorMessage = redactSecret(message, this.#draft.apiKey);
		// Once written to models.yml, editing keeps the id rather than hitting "already exists".
		const items: SelectItem[] = [
			{ value: "retry", label: "Edit settings & retry", description: "Adjust Base URL, API type, or key" },
			{ value: "back", label: "Return to provider list", description: "Keep saved entry and leave this dialog" },
		];
		const list = new SelectList(items, items.length, getSelectListTheme());
		list.onSelect = item => {
			if (item.value === "retry") {
				this.#editing = {
					id: this.#draft.id,
					baseUrl: this.#draft.baseUrl,
					api: this.#draft.api,
				};
				this.#enterBaseUrlStep();
			} else {
				this.#onCancel();
			}
		};
		list.onCancel = () => this.#onCancel();
		this.#setList(list);
	}

	async #save(): Promise<void> {
		this.#phase = "saving";
		this.#clearActiveControls();
		this.#requestRender();
		const payload: SaveSetupCustomProviderInput = {
			id: this.#draft.id,
			baseUrl: this.#draft.baseUrl,
			api: this.#draft.api,
			apiKey: this.#draft.apiKey.trim() || undefined,
		};
		try {
			const result = await this.#host.saveCustomProvider?.(payload);
			if (this.#disposed) return;
			if (!result) {
				this.#enterErrorStep("Custom provider saving is unavailable in this environment.");
				return;
			}
			if (result.error) {
				this.#enterErrorStep(`Saved ${payload.id}, but model discovery failed: ${result.error}`);
				return;
			}
			if (result.modelCount === 0) {
				this.#enterErrorStep(
					`Saved ${payload.id} to models.yml, but no models came back from ${payload.baseUrl}. Check Base URL, API type, and key.`,
				);
				return;
			}
			this.#onDone({ kind: "saved", provider: payload.id, modelCount: result.modelCount });
		} catch (error) {
			if (this.#disposed) return;
			const raw = error instanceof Error ? error.message : String(error);
			this.#enterErrorStep(raw);
		}
	}

	async #deleteCurrent(): Promise<void> {
		const id = this.#draft.id;
		this.#phase = "saving";
		this.#clearActiveControls();
		this.#requestRender();
		try {
			await this.#host.removeCustomProvider?.(id);
			if (this.#disposed) return;
			this.#onDone({ kind: "deleted", provider: id });
		} catch (error) {
			if (this.#disposed) return;
			this.#enterErrorStep(error instanceof Error ? error.message : String(error));
		}
	}
}
