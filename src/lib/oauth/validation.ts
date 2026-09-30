import { z } from "zod";
import { OAUTH_SCOPES } from "./constants";
import { OAuthScopeSchema, type OAuthScope } from "@/lib/types/oauth";

const loopbackHosts = new Set(["127.0.0.1", "[::1]", "::1", "localhost"]);

export function normalizeApplicationOrigin(value: string): string | null {
	try {
		const url = new URL(value);
		const localHttp =
			url.protocol === "http:" &&
			loopbackHosts.has(url.hostname) &&
			process.env.NODE_ENV !== "production";
		if (url.username || url.password || (url.protocol !== "https:" && !localHttp)) return null;
		if (url.pathname !== "/" || url.search || url.hash) return null;
		return url.origin;
	} catch {
		return null;
	}
}

export function isValidRedirectUri(value: string): boolean {
	try {
		const url = new URL(value);
		if (url.username || url.password || url.hash) return false;
		if (url.protocol === "https:") return true;
		return url.protocol === "http:" && loopbackHosts.has(url.hostname);
	} catch {
		return false;
	}
}

export function parseOAuthScopes(value: string | null | undefined): OAuthScope[] | null {
	const requested = (value?.trim() || "expenses:read").split(/\s+/);
	const unique = [...new Set(requested)];
	const parsed = z.array(OAuthScopeSchema).safeParse(unique);
	return parsed.success ? parsed.data.sort() : null;
}

export function serializeOAuthScopes(scopes: Iterable<OAuthScope>): string {
	return [...new Set(scopes)].sort().join(" ");
}

export function hasOAuthScope(granted: Iterable<OAuthScope>, required: OAuthScope): boolean {
	return new Set(granted).has(required);
}

const redirectUrisSchema = z
	.array(z.string().refine(isValidRedirectUri, "Each redirect URI must be an exact safe URI."))
	.min(1)
	.max(20)
	.refine((values) => new Set(values).size === values.length, "Redirect URIs must be unique.");

export const DynamicClientRegistrationSchema = z.object({
	client_name: z.string().trim().min(1).max(100),
	grant_types: z
		.array(z.enum(["authorization_code", "refresh_token"]))
		.min(1)
		.default(["authorization_code"]),
	redirect_uris: redirectUrisSchema,
	response_types: z.array(z.literal("code")).length(1).default(["code"]),
	scope: z
		.string()
		.optional()
		.refine(
			(value) => value === undefined || parseOAuthScopes(value) !== null,
			"Unsupported scope.",
		),
	token_endpoint_auth_method: z.enum(["none", "client_secret_post"]).default("none"),
});

export const SUPPORTED_OAUTH_SCOPES = new Set<string>(OAUTH_SCOPES);
