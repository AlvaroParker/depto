import { findOAuthClient, revokeOAuthToken } from "@/lib/db/oauth";
import { sha256Base64Url } from "@/lib/oauth/crypto";
import { oauthErrorResponse, oauthJsonResponse } from "@/lib/oauth/errors";

export async function POST(request: Request) {
	if (
		!request.headers
			.get("content-type")
			?.toLowerCase()
			.startsWith("application/x-www-form-urlencoded")
	) {
		return oauthErrorResponse("invalid_request", "Revocation requests must use form encoding.");
	}
	const form = await request.formData();
	const value = (name: string) =>
		typeof form.get(name) === "string" ? String(form.get(name)) : "";
	const client = await findOAuthClient(value("client_id"));
	if (client.err || !client.val || client.val.revokedAt) {
		return oauthErrorResponse("invalid_client", "Client authentication failed.");
	}
	if (client.val.tokenEndpointAuthMethod === "client_secret_post") {
		const supplied = value("client_secret");
		if (!supplied || (await sha256Base64Url(supplied)) !== client.val.clientSecretHash) {
			return oauthErrorResponse("invalid_client", "Client authentication failed.");
		}
	}
	const token = value("token");
	if (token)
		await revokeOAuthToken(await sha256Base64Url(token), undefined, undefined, client.val.id);
	return oauthJsonResponse({}, { status: 200 });
}
