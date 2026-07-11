import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
	databaseErrorResponse,
	forbiddenResponse,
	unauthorizedResponse,
	validationErrorResponse,
} from "@/lib/api/server";
import { findExpenseKindById } from "@/lib/db/expense-kinds";
import { createExpense, listExpenses } from "@/lib/db/expenses";
import { ExpenseInputSchema, ExpenseQuerySchema } from "@/lib/types/expense";

export async function GET(request: Request): Promise<NextResponse> {
	const session = await auth();
	if (!session?.user) return unauthorizedResponse();
	const url = new URL(request.url);
	const parsed = ExpenseQuerySchema.safeParse(Object.fromEntries(url.searchParams));
	if (!parsed.success) return validationErrorResponse(parsed.error);
	if (parsed.data.pending === "mine" && !session.user.participantId) {
		return forbiddenResponse();
	}
	const result = await listExpenses(parsed.data, {
		currentParticipantId: session.user.participantId,
	});
	if (result.err) return databaseErrorResponse();
	return NextResponse.json(result.val);
}

export async function POST(request: Request) {
	const session = await auth();
	if (!session?.user) return unauthorizedResponse();
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return NextResponse.json(
			{ message: "El cuerpo de la solicitud no es válido." },
			{ status: 400 },
		);
	}
	const parsed = ExpenseInputSchema.safeParse(body);
	if (!parsed.success) return validationErrorResponse(parsed.error);
	const expenseKind = await findExpenseKindById(parsed.data.kindId);
	if (expenseKind.err) return databaseErrorResponse();
	if (!expenseKind.val) {
		return NextResponse.json(
			{
				code: "VALIDATION_ERROR",
				errors: { kindId: ["Selecciona una categoría válida."] },
				message: "Revisa los datos ingresados.",
			},
			{ status: 400 },
		);
	}
	const result = await createExpense(parsed.data, session.user.id);
	if (result.err) return databaseErrorResponse();
	return NextResponse.json(result.val, { status: 201 });
}
