import { NextResponse } from "next/server";
import type { ZodError } from "zod";

export function unauthorizedResponse() {
	return NextResponse.json({ message: "Debes iniciar sesión." }, { status: 401 });
}

export function forbiddenResponse() {
	return NextResponse.json(
		{ message: "No tienes permisos para realizar esta acción." },
		{ status: 403 },
	);
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
