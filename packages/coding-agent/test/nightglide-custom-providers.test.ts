import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { YAML } from "bun";
import {
	isValidBaseUrl,
	isValidProviderId,
	listCustomProviders,
	removeCustomProvider,
	saveCustomProvider,
} from "@oh-my-pi/pi-coding-agent/config/nightglide-custom-providers";
import { getOAuthProviders, getSignInProviders } from "@oh-my-pi/pi-ai/oauth";

let dir: string;

beforeEach(async () => {
	dir = await fs.mkdtemp(path.join(os.tmpdir(), "ng-custom-providers-"));
});
afterEach(async () => {
	await fs.rm(dir, { recursive: true, force: true });
});

const read = async () => YAML.parse(await Bun.file(path.join(dir, "models.yml")).text()) as Record<string, any>;

describe("custom providers in models.yml", () => {
	it("adds a keyless provider with discovery and auth none", async () => {
		const saved = await saveCustomProvider(
			{ id: "local", baseUrl: "http://127.0.0.1:8000/v1", api: "openai-completions" },
			dir,
		);
		expect(saved).toEqual({ keyless: true });
		expect((await read()).providers.local).toEqual({
			baseUrl: "http://127.0.0.1:8000/v1",
			api: "openai-completions",
			discovery: { type: "openai-models-list" },
			auth: "none",
		});
	});

	it("keeps a typed key out of the file and hands it back to store", async () => {
		const saved = await saveCustomProvider(
			{ id: "relay", baseUrl: "https://relay.example/v1", api: "anthropic-messages", apiKey: " sk-test " },
			dir,
		);
		expect(saved).toEqual({ storeKey: "sk-test", keyless: false });
		const entry = (await read()).providers.relay;
		expect(entry.apiKey).toBeUndefined();
		expect(entry.auth).toBeUndefined();
	});

	it("edits an entry without losing its other fields, and a model-list entry keeps its key inline", async () => {
		await Bun.write(
			path.join(dir, "models.yml"),
			"# mine\nproviders:\n  plus:\n    baseUrl: http://a/v1\n    api: openai-completions\n    apiKey: old\n    models:\n      - id: m1\n  other:\n    baseUrl: http://b/v1\n",
		);
		const saved = await saveCustomProvider(
			{ id: "plus", baseUrl: "http://c/v1", api: "openai-completions", apiKey: "new" },
			dir,
		);
		expect(saved.storeKey).toBeUndefined();
		const doc = await read();
		expect(doc.providers.plus).toMatchObject({ baseUrl: "http://c/v1", apiKey: "new", models: [{ id: "m1" }] });
		expect(doc.providers.plus.discovery).toBeUndefined();
		expect(doc.providers.other.baseUrl).toBe("http://b/v1");
		// The first rewrite keeps the original, comments and all.
		expect(await Bun.file(path.join(dir, "models.yml.bak")).text()).toStartWith("# mine");
	});

	it("an edit with an empty key keeps the current key", async () => {
		await Bun.write(path.join(dir, "models.yml"), "providers:\n  r:\n    baseUrl: http://a/v1\n    apiKey: keep\n");
		await saveCustomProvider({ id: "r", baseUrl: "http://a/v2", api: "openai-completions", apiKey: "" }, dir);
		const entry = (await read()).providers.r;
		expect(entry.apiKey).toBe("keep");
		expect(entry.auth).toBeUndefined();
	});

	it("lists and removes custom providers", async () => {
		await saveCustomProvider({ id: "one", baseUrl: "http://a/v1", api: "openai-completions" }, dir);
		expect((await listCustomProviders(dir)).map(provider => provider.id)).toEqual(["one"]);
		expect(await removeCustomProvider("one", dir)).toBe(true);
		expect(await removeCustomProvider("one", dir)).toBe(false);
		expect(await listCustomProviders(dir)).toEqual([]);
	});

	it("rejects bad names and URLs", async () => {
		expect(isValidProviderId("My Relay")).toBe(false);
		expect(isValidBaseUrl("127.0.0.1:8000")).toBe(false);
		await expect(
			saveCustomProvider({ id: "ok", baseUrl: "ftp://x", api: "openai-completions" }, dir),
		).rejects.toThrow();
	});
});

describe("sign-in list", () => {
	it("offers account sign-ins only and keeps the full list for credential lookups", () => {
		const signIn = new Set(getSignInProviders().map(provider => provider.id));
		for (const id of ["anthropic", "openai-codex", "github-copilot", "snowflake", "cursor"])
			expect(signIn.has(id)).toBe(true);
		for (const id of ["venice", "xiaomi", "alibaba-coding-plan", "cloudflare-ai-gateway"])
			expect(signIn.has(id)).toBe(false);
		expect(getSignInProviders().every(provider => provider.loginKind !== "api-key")).toBe(true);
		const all = new Set(getOAuthProviders().map(provider => provider.id));
		expect(all.has("venice")).toBe(true);
		expect(signIn.size).toBeLessThan(30);
	});
});
