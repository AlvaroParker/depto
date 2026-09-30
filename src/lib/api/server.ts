import { NextResponse } from "next/server";
import type { ZodError } from "zod";
import type { ActorAuthenticationResult } from "@/lib/auth/actor";
import { getOAuthOrigin } from "@/lib/oauth/metadata";

export function unauthorizedResponse() {
	return NextResponse.json({ message: "Debes iniciar sesión." }, { status: 401 });
}

export function forbiddenResponse() {
	return NextResponse.json(
		{ message: "No tienes permisos para realizar esta acción." },
		{ status: 403 },
	);
}

export function bearerUnauthorizedResponse(request: Request) {
	const response = unauthorizedResponse();
	try {
		response.headers.set(
			"WWW-Authenticate",
			`Bearer resource_metadata="${getOAuthOrigin(request)}/.well-known/oauth-protected-resource"`,
		);
	} catch {
		// Configuration failures remain a generic authentication error at this boundary.
	}
	return response;
}

export function actorAuthenticationErrorResponse(
	result: Exclude<ActorAuthenticationResult, { kind: "authenticated" }>,
	request: Request,
) {
	const requestId = crypto.randomUUID();
	console.warn(
		JSON.stringify({ event: "oauth_resource_error", reasonCode: result.kind, requestId }),
	);
	const diagnostic = <T>(response: NextResponse<T>): NextResponse<T> => {
		response.headers.set("X-Request-Id", requestId);
		response.headers.set("Cache-Control", "no-store");
		return response;
	};
	if (result.kind === "storage_error") {
		const response = databaseErrorResponse();
		response.headers.set("Retry-After", "5");
		return diagnostic(response);
	}
	if (result.kind === "forbidden") {
		const response = forbiddenResponse();
		response.headers.set(
			"WWW-Authenticate",
			`Bearer error="insufficient_scope", scope="${result.requiredScope}"`,
		);
		return diagnostic(response);
	}
	return diagnostic(bearerUnauthorizedResponse(request));
}

export function databaseErrorResponse() {
	return NextResponse.json(
		{ message: "No pudimos acceder a los datos. Inténtalo nuevamente." },
		{ status: 503 },
	);
}

export function validationErrorResponse(error: ZodError) {
	const errors: Record<string, string[]> = {};
	for (const issue of error.issues) {
		const field = String(issue.path[0] ?? "form");
		(errors[field] ??= []).push(issue.message);
	}
	return NextResponse.json(
		{ code: "VALIDATION_ERROR", errors, message: "Revisa los datos ingresados." },
		{ status: 400 },
	);
}
