import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
	databaseErrorResponse,
	forbiddenResponse,
	unauthorizedResponse,
	validationErrorResponse,
} from "@/lib/api/server";
import { findExpenseKindById } from "@/lib/db/expense-kinds";
import { getBindings } from "@/lib/db/bindings";
import { findExpenseById, softDeleteExpense, updateExpense } from "@/lib/db/expenses";
import { ExpensePatchSchema } from "@/lib/types/expense";

interface ExpenseRouteContext {
	params: Promise<{ id: string }>;
}

export async function PATCH(request: Request, { params }: ExpenseRouteContext) {
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
		role: session.user.role,
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
		try {
			await getBindings().RECEIPTS.delete(result.val.removedPaymentProofObjectKeys);
		} catch (error) {
			console.error("R2 payment proof cleanup failed after expense recalculation.", error);
		}
	}
	return NextResponse.json(result.val.expense);
}

export async function DELETE(_request: Request, { params }: ExpenseRouteContext) {
	const session = await auth();
	if (!session?.user) return unauthorizedResponse();
	const result = await softDeleteExpense((await params).id);
	if (result.err) return databaseErrorResponse();
	if (!result.val)
		return NextResponse.json({ message: "No encontramos ese gasto." }, { status: 404 });
	return new Response(null, { status: 204 });
}

export async function GET(_request: Request, { params }: ExpenseRouteContext) {
	const session = await auth();
	if (!session?.user) return unauthorizedResponse();
	const { id } = await params;
	const result = await findExpenseById(id);
	if (result.err) return databaseErrorResponse();
	if (!result.val) {
		return NextResponse.json({ message: "No encontramos ese gasto." }, { status: 404 });
	}
	return NextResponse.json(result.val);
}
