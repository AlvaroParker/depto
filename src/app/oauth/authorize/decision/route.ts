import { auth } from "@/auth";
import {
	consumeOAuthRateLimit,
	createGrantAndAuthorizationCode,
	findOAuthClient,
} from "@/lib/db/oauth";
import { createOAuthCredential, sha256Base64Url } from "@/lib/oauth/crypto";
import { oauthErrorResponse } from "@/lib/oauth/errors";
import { getOAuthOrigin } from "@/lib/oauth/metadata";
import { parseOAuthScopes } from "@/lib/oauth/validation";
import { getClientAddress } from "@/lib/util/request";

export async function POST(request: Request) {
	const origin = getOAuthOrigin(request);
	if (request.headers.get("origin") !== origin) {
		return oauthErrorResponse("invalid_request", "The consent origin is invalid.", 403);
	}
	const session = await auth();
	if (!session?.user || session.user.role !== "user" || !session.user.participantId) {
		return oauthErrorResponse("access_denied", "A regular participant account is required.", 403);
	}
	const form = await request.formData();
	const value = (name: string) =>
		typeof form.get(name) === "string" ? String(form.get(name)) : "";
	const clientId = value("client_id");
	const rateLimit = await consumeOAuthRateLimit(
		"authorization",
		await sha256Base64Url(`${clientId}:${getClientAddress(request)}`),
		{ blockMs: 15 * 60_000, limit: 20, windowMs: 60 * 60_000 },
	);
	if (rateLimit.err) {
		return oauthErrorResponse("temporarily_unavailable", "Authorization is unavailable.", 503);
	}
	if (!rateLimit.val) {
		return oauthErrorResponse("temporarily_unavailable", "Too many authorization attempts.", 429);
	}
	const redirectUri = value("redirect_uri");
	const state = value("state");
	const resource = value("resource");
	const scopes = parseOAuthScopes(value("scope"));
	const client = await findOAuthClient(clientId);
	if (client.err)
		return oauthErrorResponse("temporarily_unavailable", "Client lookup is unavailable.", 503);
	if (
		!client.val ||
		client.val.revokedAt ||
		!client.val.redirectUris.includes(redirectUri) ||
		!state ||
		resource !== origin ||
		value("response_type") !== "code" ||
		value("code_challenge_method") !== "S256" ||
		!/^[A-Za-z0-9_-]{43}$/.test(value("code_challenge")) ||
		!scopes ||
		!client.val.grantTypes.includes("authorization_code") ||
		scopes.some((scope) => !client.val!.scopes.includes(scope)) ||
		(scopes.includes("offline_access") && !client.val.grantTypes.includes("refresh_token"))
	) {
		return oauthErrorResponse("invalid_request", "The authorization request is invalid.");
	}
	const destination = new URL(redirectUri);
	if (value("decision") !== "approve") {
		destination.searchParams.set("error", "access_denied");
		destination.searchParams.set("state", state);
		return Response.redirect(destination, 303);
	}
	const code = createOAuthCredential();
	const issued = await createGrantAndAuthorizationCode({
		clientId,
		codeChallenge: value("code_challenge"),
		codeHash: await sha256Base64Url(code),
		redirectUri,
		resource,
		scopes,
		userId: session.user.id,
	});
	if (issued.err) return oauthErrorResponse("server_error", "Authorization is unavailable.", 503);
	destination.searchParams.set("code", code);
	destination.searchParams.set("state", state);
	return Response.redirect(destination, 303);
}
