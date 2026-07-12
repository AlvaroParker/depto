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
	if (result.kind === "storage_error") return databaseErrorResponse();
	if (result.kind === "forbidden") {
		const response = forbiddenResponse();
		response.headers.set(
			"WWW-Authenticate",
			`Bearer error="insufficient_scope", scope="${result.requiredScope}"`,
		);
		return response;
	}
	return bearerUnauthorizedResponse(request);
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
