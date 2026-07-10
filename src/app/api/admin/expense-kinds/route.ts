import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { canManageUsers } from "@/lib/const/roles";
import {
	databaseErrorResponse,
	forbiddenResponse,
	unauthorizedResponse,
	validationErrorResponse,
} from "@/lib/api/server";
import { createExpenseKind, listExpenseKinds } from "@/lib/db/expense-kinds";
import {
	ExpenseKindInputSchema,
	type ExpenseKindListResponse,
	type ExpenseKindResponse,
} from "@/lib/types/expense-kind";

async function authorizeManager(): Promise<Response | null> {
	const session = await auth();
	if (!session?.user) return unauthorizedResponse();
	if (!canManageUsers(session.user.role)) return forbiddenResponse();
	return null;
}

export async function GET(): Promise<Response> {
	const unauthorized = await authorizeManager();
	if (unauthorized) return unauthorized;
	const result = await listExpenseKinds();
	if (result.err) return databaseErrorResponse();
	return NextResponse.json<ExpenseKindListResponse>({ kinds: result.val });
}

export async function POST(request: Request): Promise<Response> {
	const unauthorized = await authorizeManager();
	if (unauthorized) return unauthorized;
	const body: unknown = await request.json().catch(() => null);
	const parsed = ExpenseKindInputSchema.safeParse(body);
	if (!parsed.success) return validationErrorResponse(parsed.error);
	const result = await createExpenseKind(parsed.data);
	if (result.err) return databaseErrorResponse();
	if (result.val.kind === "name_taken") {
		return NextResponse.json(
			{ message: "Ya existe una categoría con ese nombre." },
			{ status: 409 },
		);
	}
	return NextResponse.json<ExpenseKindResponse>({ kind: result.val.expenseKind }, { status: 201 });
}
