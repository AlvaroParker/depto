import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { canManageUsers } from "@/lib/const/roles";
import {
	databaseErrorResponse,
	forbiddenResponse,
	unauthorizedResponse,
	validationErrorResponse,
} from "@/lib/api/server";
import { updateExpenseKind } from "@/lib/db/expense-kinds";
import { ExpenseKindInputSchema, type ExpenseKindResponse } from "@/lib/types/expense-kind";

export async function PATCH(
	request: Request,
	{ params }: { params: Promise<{ id: string }> },
): Promise<Response> {
	const session = await auth();
	if (!session?.user) return unauthorizedResponse();
	if (!canManageUsers(session.user.role)) return forbiddenResponse();
	const body: unknown = await request.json().catch(() => null);
	const parsed = ExpenseKindInputSchema.safeParse(body);
	if (!parsed.success) return validationErrorResponse(parsed.error);
	const result = await updateExpenseKind((await params).id, parsed.data);
	if (result.err) return databaseErrorResponse();
	if (result.val.kind === "not_found") {
		return NextResponse.json({ message: "No encontramos esa categoría." }, { status: 404 });
	}
	if (result.val.kind === "name_taken") {
		return NextResponse.json(
			{ message: "Ya existe una categoría con ese nombre." },
			{ status: 409 },
		);
	}
	return NextResponse.json<ExpenseKindResponse>({ kind: result.val.expenseKind });
}
