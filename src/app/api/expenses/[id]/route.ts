import { NextResponse } from "next/server";
import { authenticateRequestActor } from "@/lib/auth/actor";
import {
	actorAuthenticationErrorResponse,
	databaseErrorResponse,
	forbiddenResponse,
	validationErrorResponse,
} from "@/lib/api/server";
import { findExpenseKindById } from "@/lib/db/expense-kinds";
import { softDeleteExpense, updateExpense } from "@/lib/db/expenses";
import { getExpenseForActor } from "@/lib/services/expenses";
import { deletePaymentProofObjectsIfUnreferenced } from "@/lib/services/files";
import { ExpensePatchSchema } from "@/lib/types/expense";

interface ExpenseRouteContext {
	params: Promise<{ id: string }>;
}

export async function PATCH(request: Request, { params }: ExpenseRouteContext) {
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
	const parsed = ExpensePatchSchema.safeParse(body);
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
	const result = await updateExpense((await params).id, parsed.data, undefined, undefined, {
		role: authenticated.actor.role,
	});
	if (result.err) return databaseErrorResponse();
	if (result.val.kind === "not_found")
		return NextResponse.json({ message: "No encontramos ese gasto." }, { status: 404 });
	if (result.val.kind === "paid_reset_required")
		return NextResponse.json(
			{
				code: "PAID_RESET_REQUIRED",
				message: "Confirma que deseas recalcular y reiniciar los reembolsos pagados.",
			},
			{ status: 409 },
		);
	if (result.val.kind === "forbidden") return forbiddenResponse();
	if (result.val.removedPaymentProofObjectKeys.length > 0) {
		await deletePaymentProofObjectsIfUnreferenced(result.val.removedPaymentProofObjectKeys);
	}
	return NextResponse.json(result.val.expense);
}

export async function DELETE(request: Request, { params }: ExpenseRouteContext) {
	const authenticated = await authenticateRequestActor(request, {
		requiredScope: "expenses:write",
	});
	if (authenticated.kind !== "authenticated")
		return actorAuthenticationErrorResponse(authenticated, request);
	const result = await softDeleteExpense((await params).id);
	if (result.err) return databaseErrorResponse();
	if (!result.val)
		return NextResponse.json({ message: "No encontramos ese gasto." }, { status: 404 });
	return new Response(null, { status: 204 });
}

export async function GET(request: Request, { params }: ExpenseRouteContext) {
	const authenticated = await authenticateRequestActor(request, { requiredScope: "expenses:read" });
	if (authenticated.kind !== "authenticated")
		return actorAuthenticationErrorResponse(authenticated, request);
	const { id } = await params;
	const result = await getExpenseForActor(id);
	if (result.err) return databaseErrorResponse();
	if (!result.val) {
		return NextResponse.json({ message: "No encontramos ese gasto." }, { status: 404 });
	}
	return NextResponse.json(result.val);
}
