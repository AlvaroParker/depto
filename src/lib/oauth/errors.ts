import { NextResponse } from "next/server";

export type OAuthErrorCode =
	| "access_denied"
	| "invalid_client"
	| "invalid_grant"
	| "invalid_request"
	| "invalid_scope"
	| "server_error"
	| "temporarily_unavailable"
	| "unsupported_grant_type";

export function oauthErrorResponse(
	error: OAuthErrorCode,
	description: string,
	status = error === "invalid_client" ? 401 : 400,
): NextResponse {
	const response = NextResponse.json({ error, error_description: description }, { status });
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
