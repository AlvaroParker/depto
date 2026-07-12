import {
	consumeOAuthRateLimit,
	findAuthorizationCode,
	findRefreshToken,
	insertAccessAndRefreshTokens,
	markAuthorizationCodeConsumed,
	rotateRefreshToken,
} from "@/lib/db/oauth";
import { createOAuthCredential, sha256Base64Url, verifyPkceS256 } from "@/lib/oauth/crypto";
import { oauthErrorResponse, oauthJsonResponse, type OAuthErrorCode } from "@/lib/oauth/errors";
import { getOAuthOrigin } from "@/lib/oauth/metadata";
import { serializeOAuthScopes } from "@/lib/oauth/validation";
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
) {
	const limited = await consumeOAuthRateLimit(
		"token_failure",
		await sha256Base64Url(`${clientId}:${getClientAddress(request)}`),
		{ blockMs: 15 * 60_000, limit: 20, windowMs: 60 * 60_000 },
	);
	if (limited.ok && !limited.val) {
		return oauthErrorResponse("temporarily_unavailable", "Too many failed token exchanges.", 429);
	}
	return oauthErrorResponse(error, description, status);
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
	const form = await request.formData();
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
		if (!code || code.err || !code.val) {
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
		const consumed = await markAuthorizationCodeConsumed(code.val.id);
		if (consumed.err || !consumed.val) {
			return failedTokenExchange(
				request,
				value("client_id"),
				"invalid_grant",
				"The authorization code was already used.",
			);
		}
		const accessToken = createOAuthCredential();
		const allowsRefresh = code.val.scopes.includes("offline_access");
		const refreshToken = allowsRefresh ? createOAuthCredential() : undefined;
		const inserted = await insertAccessAndRefreshTokens({
			accessTokenHash: await sha256Base64Url(accessToken),
			clientId: code.val.clientId,
			grantId: code.val.grantId,
			...(refreshToken
				? {
						refreshFamilyId: crypto.randomUUID(),
						refreshTokenHash: await sha256Base64Url(refreshToken),
					}
				: {}),
			resource: origin,
			scopes: code.val.scopes,
			userId: code.val.userId,
		});
		if (inserted.err)
			return oauthErrorResponse("server_error", "Token issuance is unavailable.", 503);
		return tokenResponse(accessToken, serializeOAuthScopes(code.val.scopes), refreshToken);
	}

	if (value("grant_type") === "refresh_token") {
		const refreshValue = value("refresh_token");
		const found = refreshValue ? await findRefreshToken(await sha256Base64Url(refreshValue)) : null;
		if (!found || found.err || !found.val) {
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
		const rotated = await rotateRefreshToken(found.val, {
			accessTokenHash: await sha256Base64Url(accessToken),
			refreshTokenHash: await sha256Base64Url(refreshToken),
		});
		if (rotated.err)
			return oauthErrorResponse("server_error", "Token issuance is unavailable.", 503);
		if (rotated.val.kind !== "rotated") {
			return failedTokenExchange(
				request,
				value("client_id"),
				"invalid_grant",
				"The refresh token is invalid or was reused.",
			);
		}
		return tokenResponse(accessToken, found.val.scopes, refreshToken);
	}
	return failedTokenExchange(
		request,
		value("client_id"),
		"unsupported_grant_type",
		"The grant type is not supported.",
	);
}
