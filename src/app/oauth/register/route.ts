import { consumeOAuthRateLimit, createOAuthClient } from "@/lib/db/oauth";
import { createOAuthCredential, sha256Base64Url } from "@/lib/oauth/crypto";
import { oauthErrorResponse, oauthJsonResponse } from "@/lib/oauth/errors";
import { DynamicClientRegistrationSchema, parseOAuthScopes } from "@/lib/oauth/validation";
import { getClientAddress } from "@/lib/util/request";
import { OAUTH_SCOPES } from "@/lib/oauth/constants";

export async function POST(request: Request) {
	const rateLimit = await consumeOAuthRateLimit(
		"registration",
		await sha256Base64Url(getClientAddress(request)),
		{ blockMs: 15 * 60_000, limit: 10, windowMs: 60 * 60_000 },
	);
	if (rateLimit.err) {
		return oauthErrorResponse(
			"temporarily_unavailable",
			"Client registration is unavailable.",
			503,
		);
	}
	if (!rateLimit.val) {
		return oauthErrorResponse("temporarily_unavailable", "Too many registration attempts.", 429);
	}
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return oauthErrorResponse("invalid_request", "Client metadata must be valid JSON.");
	}
	const parsed = DynamicClientRegistrationSchema.safeParse(body);
	if (!parsed.success) {
		return oauthErrorResponse("invalid_request", "Client metadata is invalid.");
	}
	const clientSecret =
		parsed.data.token_endpoint_auth_method === "client_secret_post"
			? createOAuthCredential()
			: null;
	const created = await createOAuthClient({
		clientSecretHash: clientSecret ? await sha256Base64Url(clientSecret) : null,
		grantTypes: parsed.data.grant_types,
		name: parsed.data.client_name,
		redirectUris: parsed.data.redirect_uris,
		responseTypes: ["code"],
		scopes: parsed.data.scope ? parseOAuthScopes(parsed.data.scope)! : [...OAUTH_SCOPES],
		tokenEndpointAuthMethod: parsed.data.token_endpoint_auth_method,
	});
	if (created.err)
		return oauthErrorResponse("server_error", "Client registration is unavailable.", 503);
	return oauthJsonResponse(
		{
			client_id: created.val.id,
			client_id_issued_at: Math.floor(new Date(created.val.createdAt).getTime() / 1000),
			...(clientSecret ? { client_secret: clientSecret, client_secret_expires_at: 0 } : {}),
			client_name: created.val.name,
			grant_types: created.val.grantTypes,
			redirect_uris: created.val.redirectUris,
			response_types: created.val.responseTypes,
			scope: created.val.scopes.join(" "),
			token_endpoint_auth_method: created.val.tokenEndpointAuthMethod,
		},
		{ status: 201 },
	);
}
