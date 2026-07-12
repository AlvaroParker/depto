import { getBindings } from "@/lib/db/bindings";
import { OAUTH_SCOPES } from "./constants";
import { normalizeApplicationOrigin } from "./validation";

export function getOAuthOrigin(request?: Request): string {
	const configured = normalizeApplicationOrigin(getBindings().APP_BASE_URL);
	if (configured) return configured;
	if (request) {
		const requestOrigin = normalizeApplicationOrigin(new URL(request.url).origin);
		if (requestOrigin) return requestOrigin;
	}
	throw new Error("APP_BASE_URL must be configured as an HTTPS origin.");
}

export function createProtectedResourceMetadata(origin: string) {
	return {
		authorization_servers: [origin],
		bearer_methods_supported: ["header"],
		resource: origin,
		scopes_supported: [...OAUTH_SCOPES],
	};
}

export function createAuthorizationServerMetadata(origin: string) {
	return {
		authorization_endpoint: `${origin}/oauth/authorize`,
		code_challenge_methods_supported: ["S256"],
		grant_types_supported: ["authorization_code", "refresh_token"],
		issuer: origin,
		registration_endpoint: `${origin}/oauth/register`,
		response_types_supported: ["code"],
		revocation_endpoint: `${origin}/oauth/revoke`,
		scopes_supported: [...OAUTH_SCOPES],
		token_endpoint: `${origin}/oauth/token`,
		token_endpoint_auth_methods_supported: ["none", "client_secret_post"],
	};
}
