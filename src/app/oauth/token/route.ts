import {
	consumeOAuthRateLimit,
	findAuthorizationCode,
	findOAuthClient,
	findRefreshToken,
	redeemAuthorizationCode,
	rotateRefreshToken,
} from "@/lib/db/oauth";
import { createOAuthCredential, sha256Base64Url, verifyPkceS256 } from "@/lib/oauth/crypto";
import { oauthErrorResponse, oauthJsonResponse, type OAuthErrorCode } from "@/lib/oauth/errors";
import { getOAuthOrigin } from "@/lib/oauth/metadata";
import { parseOAuthScopes, serializeOAuthScopes } from "@/lib/oauth/validation";
import { getClientAddress } from "@/lib/util/request";

async function clientMatches(
	method: "none" | "client_secret_post",
	expectedHash: string | null,
	clientSecret: string,
): Promise<boolean> {
	if (method === "none") return clientSecret === "";
	return Boolean(
		expectedHash && clientSecret && (await sha256Base64Url(clientSecret)) === expectedHash,
	);
}

function tokenResponse(accessToken: string, scopes: string, refreshToken?: string) {
	return oauthJsonResponse({
		access_token: accessToken,
		expires_in: 3600,
		...(refreshToken ? { refresh_token: refreshToken } : {}),
		scope: scopes,
		token_type: "Bearer",
	});
}

async function failedTokenExchange(
	request: Request,
	clientId: string,
	error: OAuthErrorCode,
	description: string,
	status?: number,
	context: { grantId?: string; reasonCode?: string } = {},
) {
	const clientHash = await sha256Base64Url(clientId);
	const limited = await consumeOAuthRateLimit(
		"token_failure",
		await sha256Base64Url(`${clientId}:${getClientAddress(request)}`),
		{ blockMs: 15 * 60_000, limit: 20, windowMs: 60 * 60_000 },
	);
	if (limited.err)
		return oauthErrorResponse(
			"temporarily_unavailable",
			"Token exchange protection is unavailable.",
			503,
			{ clientHash },
		);
	if (limited.ok && !limited.val) {
		return oauthErrorResponse("temporarily_unavailable", "Too many failed token exchanges.", 429);
	}
	return oauthErrorResponse(error, description, status, { clientHash, ...context });
}

export async function POST(request: Request) {
	if (
		!request.headers
			.get("content-type")
			?.toLowerCase()
			.startsWith("application/x-www-form-urlencoded")
	) {
		return failedTokenExchange(
			request,
			"unknown",
			"invalid_request",
			"Token requests must use form encoding.",
		);
	}
	let form: FormData;
	try {
		form = await request.formData();
	} catch {
		return oauthErrorResponse("invalid_request", "Token requests must contain a valid form.");
	}
	const value = (name: string) =>
		typeof form.get(name) === "string" ? String(form.get(name)) : "";
	const origin = getOAuthOrigin(request);
	if (value("resource") !== origin) {
		return failedTokenExchange(
			request,
			value("client_id"),
			"invalid_grant",
			"The resource is invalid.",
		);
	}
	if (value("grant_type") === "authorization_code") {
		const codeValue = value("code");
		const code = codeValue ? await findAuthorizationCode(await sha256Base64Url(codeValue)) : null;
		if (code?.err)
			return oauthErrorResponse(
				"temporarily_unavailable",
				"Authorization code lookup is unavailable.",
				503,
			);
		if (!code || !code.val) {
			return failedTokenExchange(
				request,
				value("client_id"),
				"invalid_grant",
				"The authorization code is invalid or expired.",
			);
		}
		if (
			code.val.clientId !== value("client_id") ||
			code.val.redirectUri !== value("redirect_uri") ||
			code.val.resource !== origin ||
			!(await clientMatches(
				code.val.tokenEndpointAuthMethod,
				code.val.clientSecretHash,
				value("client_secret"),
			)) ||
			!(await verifyPkceS256(value("code_verifier"), code.val.codeChallenge))
		) {
			return failedTokenExchange(
				request,
				value("client_id"),
				"invalid_grant",
				"The authorization code binding is invalid.",
			);
		}
		const client = await findOAuthClient(code.val.clientId);
		if (client.err)
			return oauthErrorResponse("temporarily_unavailable", "Client lookup is unavailable.", 503);
		if (!client.val?.grantTypes.includes("authorization_code"))
			return oauthErrorResponse(
				"unauthorized_client",
				"The client cannot exchange authorization codes.",
			);
		const accessToken = createOAuthCredential();
		const allowsRefresh =
			code.val.scopes.includes("offline_access") && client.val.grantTypes.includes("refresh_token");
		const refreshToken = allowsRefresh ? createOAuthCredential() : undefined;
		const inserted = await redeemAuthorizationCode(code.val, {
			accessTokenHash: await sha256Base64Url(accessToken),
			...(refreshToken
				? {
						refreshTokenHash: await sha256Base64Url(refreshToken),
					}
				: {}),
		});
		if (inserted.err)
			return oauthErrorResponse("temporarily_unavailable", "Token issuance is unavailable.", 503);
		if (!inserted.val)
			return failedTokenExchange(
				request,
				value("client_id"),
				"invalid_grant",
				"The authorization code was already used or revoked.",
			);
		return tokenResponse(accessToken, serializeOAuthScopes(code.val.scopes), refreshToken);
	}

	if (value("grant_type") === "refresh_token") {
		const refreshValue = value("refresh_token");
		const found = refreshValue ? await findRefreshToken(await sha256Base64Url(refreshValue)) : null;
		if (found?.err)
			return oauthErrorResponse(
				"temporarily_unavailable",
				"Refresh token lookup is unavailable.",
				503,
			);
		if (!found || !found.val) {
			return failedTokenExchange(
				request,
				value("client_id"),
				"invalid_grant",
				"The refresh token is invalid or expired.",
			);
		}
		if (
			found.val.client_id !== value("client_id") ||
			found.val.resource !== origin ||
			!(await clientMatches(
				found.val.token_endpoint_auth_method,
				found.val.client_secret_hash,
				value("client_secret"),
			))
		) {
			return failedTokenExchange(
				request,
				value("client_id"),
				"invalid_grant",
				"The refresh token binding is invalid.",
			);
		}
		const accessToken = createOAuthCredential();
		const refreshToken = createOAuthCredential();
		const client = await findOAuthClient(found.val.client_id);
		if (client.err)
			return oauthErrorResponse("temporarily_unavailable", "Client lookup is unavailable.", 503);
		if (!client.val?.grantTypes.includes("refresh_token"))
			return oauthErrorResponse("unauthorized_client", "The client cannot refresh tokens.");
		const scopes = parseOAuthScopes(value("scope") || found.val.scopes);
		const granted = new Set(found.val.scopes.split(" "));
		if (!scopes || scopes.some((scope) => !granted.has(scope)))
			return oauthErrorResponse("invalid_scope", "Refresh scopes must be a subset of the grant.");
		const rotated = await rotateRefreshToken(found.val, {
			accessTokenHash: await sha256Base64Url(accessToken),
			refreshTokenHash: await sha256Base64Url(refreshToken),
			scopes,
		});
		if (rotated.err)
			return oauthErrorResponse("temporarily_unavailable", "Token issuance is unavailable.", 503);
		if (rotated.val.kind !== "rotated") {
			return failedTokenExchange(
				request,
				value("client_id"),
				"invalid_grant",
				"The refresh token is invalid or was reused.",
				undefined,
				{
					grantId: found.val.grant_id,
					reasonCode:
						rotated.val.kind === "reuse"
							? "refresh_reuse"
							: found.val.expires_at <= new Date().toISOString()
								? "refresh_expired"
								: found.val.revoked_at || found.val.grant_revoked_at || found.val.client_revoked_at
									? "refresh_revoked"
									: "account_ineligible",
				},
			);
		}
		return tokenResponse(accessToken, serializeOAuthScopes(scopes), refreshToken);
	}
	return failedTokenExchange(
		request,
		value("client_id"),
		"unsupported_grant_type",
		"The grant type is not supported.",
	);
}
