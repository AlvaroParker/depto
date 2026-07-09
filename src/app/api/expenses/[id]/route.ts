import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { databaseErrorResponse, unauthorizedResponse } from "@/lib/api/server";
import { findExpenseById } from "@/lib/db/expenses";

interface ExpenseRouteContext {
	params: Promise<{ id: string }>;
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
