import { NextResponse } from "next/server";

export type OAuthErrorCode =
	| "access_denied"
	| "invalid_client"
	| "invalid_grant"
	| "invalid_request"
	| "invalid_scope"
	| "server_error"
	| "temporarily_unavailable"
	| "unauthorized_client"
	| "unsupported_grant_type";

export function oauthErrorResponse(
	error: OAuthErrorCode,
	description: string,
	status = error === "invalid_client" ? 401 : 400,
	context: { clientHash?: string; grantId?: string; reasonCode?: string } = {},
): NextResponse {
	const requestId = crypto.randomUUID();
	console.warn(
		JSON.stringify({
			event: "oauth_error",
			error,
			reason: description,
			status,
			requestId,
			...context,
		}),
	);
	const response = NextResponse.json(
		{ error, error_description: description, request_id: requestId },
		{ status },
	);
	response.headers.set("X-Request-Id", requestId);
	if (status === 503 || status === 429)
		response.headers.set("Retry-After", status === 429 ? "900" : "5");
	response.headers.set("Cache-Control", "no-store");
	response.headers.set("Pragma", "no-cache");
	return response;
}

export function oauthJsonResponse(body: unknown, init?: ResponseInit): NextResponse {
	const response = NextResponse.json(body, init);
	response.headers.set("Cache-Control", "no-store");
	response.headers.set("Pragma", "no-cache");
	return response;
}
