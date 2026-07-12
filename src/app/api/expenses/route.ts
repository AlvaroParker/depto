import { NextResponse } from "next/server";
import { authenticateRequestActor } from "@/lib/auth/actor";
import {
	actorAuthenticationErrorResponse,
	databaseErrorResponse,
	forbiddenResponse,
	validationErrorResponse,
} from "@/lib/api/server";
import { createExpenseForActor, listExpensesForActor } from "@/lib/services/expenses";
import { ExpenseCreateInputSchema, ExpenseQuerySchema } from "@/lib/types/expense";

export async function GET(request: Request): Promise<NextResponse> {
	const authenticated = await authenticateRequestActor(request, { requiredScope: "expenses:read" });
	if (authenticated.kind !== "authenticated")
		return actorAuthenticationErrorResponse(authenticated, request);
	const url = new URL(request.url);
	const parsed = ExpenseQuerySchema.safeParse(Object.fromEntries(url.searchParams));
	if (!parsed.success) return validationErrorResponse(parsed.error);
	if (parsed.data.pending === "mine" && !authenticated.actor.participantId) {
		return forbiddenResponse();
	}
	const result = await listExpensesForActor(parsed.data, authenticated.actor);
	if (result.err) return databaseErrorResponse();
	return NextResponse.json(result.val);
}

export async function POST(request: Request): Promise<NextResponse> {
	const authenticated = await authenticateRequestActor(request, {
		requiredScope: "expenses:write",
	});
	if (authenticated.kind !== "authenticated")
		return actorAuthenticationErrorResponse(authenticated, request);
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return NextResponse.json(
			{ message: "El cuerpo de la solicitud no es válido." },
			{ status: 400 },
		);
	}
	const parsed = ExpenseCreateInputSchema.safeParse(body);
	if (!parsed.success) return validationErrorResponse(parsed.error);
	const result = await createExpenseForActor(parsed.data, authenticated.actor);
	if (result.kind === "storage_error") return databaseErrorResponse();
	if (result.kind === "invalid_kind") {
		return NextResponse.json(
			{
				code: "VALIDATION_ERROR",
				errors: { kindId: ["Selecciona una categoría válida."] },
				message: "Revisa los datos ingresados.",
			},
			{ status: 400 },
		);
	}
	return NextResponse.json(result.expense, { status: 201 });
}
