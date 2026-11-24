/**
 * Nightglide: custom providers — any OpenAI- or Anthropic-compatible endpoint added by Base URL.
 *
 * Entries live where OMP already reads them, `providers.<id>` in `~/.omp/agent/models.yml`, in the
 * shape a hand-written entry takes: `baseUrl`, `api`, and `discovery: openai-models-list` so the
 * model list comes from the endpoint's `/models`. The API key goes to OMP's credential store
 * (agent.db), not the file — except for an entry that lists its own models, which OMP requires to
 * carry its key inline. Rewriting YAML drops comments, so the first write keeps a `.bak` copy.
 */
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { getAgentDir, isEnoent, stringifyYamlConfig } from "@oh-my-pi/pi-utils";
import { YAML } from "bun";

/** Wire protocol of a custom provider. */
export type CustomProviderApi = "openai-completions" | "anthropic-messages";

export interface CustomProvider {
	id: string;
	baseUrl: string;
	api: string;
	/** The entry lists its own models (no discovery); its key then stays inline in models.yml. */
	hasModelList: boolean;
	/** The entry carries an inline `apiKey` in models.yml. */
	hasInlineKey: boolean;
}

/** Lowercase letters, digits and dashes, starting with a letter or digit. */
const PROVIDER_ID = /^[a-z0-9][a-z0-9-]{0,39}$/;

export function isValidProviderId(id: string): boolean {
	return PROVIDER_ID.test(id);
}

/** An `http(s)://` URL with a host. */
export function isValidBaseUrl(url: string): boolean {
	try {
		const parsed = new URL(url);
		return (parsed.protocol === "http:" || parsed.protocol === "https:") && parsed.host.length > 0;
	} catch {
		return false;
	}
}

/** The models file OMP reads: `models.yml`, or an existing `models.yaml`. */
async function modelsFilePath(agentDir: string): Promise<string> {
	const yml = path.join(agentDir, "models.yml");
	const yaml = path.join(agentDir, "models.yaml");
	if (await Bun.file(yml).exists()) return yml;
	return (await Bun.file(yaml).exists()) ? yaml : yml;
}

type ModelsDocument = Record<string, unknown> & { providers?: Record<string, Record<string, unknown>> };

async function readModels(file: string): Promise<ModelsDocument> {
	let text: string;
	try {
		text = await Bun.file(file).text();
	} catch (err) {
		if (isEnoent(err)) return {};
		throw err;
	}
	const parsed: unknown = text.trim() ? YAML.parse(text) : {};
	if (parsed === null || parsed === undefined) return {};
	if (typeof parsed !== "object" || Array.isArray(parsed)) throw new Error(`${file} is not a YAML mapping`);
	return parsed as ModelsDocument;
}

async function writeModels(file: string, doc: ModelsDocument): Promise<void> {
	const backup = `${file}.bak`;
	if ((await Bun.file(file).exists()) && !(await Bun.file(backup).exists())) {
		await fs.copyFile(file, backup);
	}
	const temp = `${file}.tmp-${process.pid}`;
	await Bun.write(temp, stringifyYamlConfig(doc));
	await fs.rename(temp, file);
}

function toCustomProvider(id: string, entry: Record<string, unknown>): CustomProvider | undefined {
	if (typeof entry.baseUrl !== "string") return undefined;
	return {
		id,
		baseUrl: entry.baseUrl,
		api: typeof entry.api === "string" ? entry.api : "openai-completions",
		hasModelList: Array.isArray(entry.models) && entry.models.length > 0,
		hasInlineKey: typeof entry.apiKey === "string" && entry.apiKey.length > 0,
	};
}

/** Providers in models.yml that point at an endpoint by Base URL. */
export async function listCustomProviders(agentDir = getAgentDir()): Promise<CustomProvider[]> {
	const doc = await readModels(await modelsFilePath(agentDir));
	return Object.entries(doc.providers ?? {}).flatMap(([id, entry]) => {
		const provider = entry && typeof entry === "object" ? toCustomProvider(id, entry) : undefined;
		return provider ? [provider] : [];
	});
}

export interface SaveCustomProvider {
	id: string;
	baseUrl: string;
	api: CustomProviderApi;
	/** Undefined or empty keeps the current key (none for a new provider). */
	apiKey?: string;
}

export interface SavedCustomProvider {
	/** The key to put in the credential store; undefined when none was given or it stays inline. */
	storeKey?: string;
	/** The provider has no key at all (a keyless local server). */
	keyless: boolean;
}

/**
 * Add or update a custom provider in models.yml, keeping every other field of an existing entry.
 * Returns what the caller must do with the key.
 */
export async function saveCustomProvider(
	input: SaveCustomProvider,
	agentDir = getAgentDir(),
): Promise<SavedCustomProvider> {
	if (!isValidProviderId(input.id)) throw new Error(`Invalid provider name: ${input.id}`);
	if (!isValidBaseUrl(input.baseUrl)) throw new Error(`Invalid Base URL: ${input.baseUrl}`);
	const file = await modelsFilePath(agentDir);
	const doc = await readModels(file);
	const providers = { ...doc.providers };
	const existing = providers[input.id] ?? {};
	const entry: Record<string, unknown> = { ...existing, baseUrl: input.baseUrl, api: input.api };
	const hasModelList = Array.isArray(existing.models) && existing.models.length > 0;
	if (!hasModelList && entry.discovery === undefined) entry.discovery = { type: "openai-models-list" };
	const newKey = input.apiKey?.trim() || undefined;
	let storeKey: string | undefined;
	if (newKey && hasModelList) {
		// OMP requires an inline key for an entry that lists its own models.
		entry.apiKey = newKey;
		delete entry.auth;
	} else if (newKey) {
		// The stored key only applies once no inline key outranks it.
		delete entry.apiKey;
		delete entry.auth;
		storeKey = newKey;
	}
	const keyless =
		!newKey && typeof entry.apiKey !== "string" && existing.auth !== "apiKey" && !(input.id in (doc.providers ?? {}));
	if (keyless) entry.auth = "none";
	providers[input.id] = entry;
	await writeModels(file, { ...doc, providers });
	return { ...(storeKey ? { storeKey } : {}), keyless };
}

/** Remove a provider entry from models.yml; false when there was none. */
export async function removeCustomProvider(id: string, agentDir = getAgentDir()): Promise<boolean> {
	const file = await modelsFilePath(agentDir);
	const doc = await readModels(file);
	if (!doc.providers || !(id in doc.providers)) return false;
	const providers = { ...doc.providers };
	delete providers[id];
	await writeModels(file, { ...doc, providers });
	return true;
}
