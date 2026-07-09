import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
	databaseErrorResponse,
	unauthorizedResponse,
	validationErrorResponse,
} from "@/lib/api/server";
import { createExpense, listExpenses } from "@/lib/db/expenses";
import { ExpenseInputSchema, ExpenseQuerySchema } from "@/lib/types/expense";

export async function GET(request: Request) {
	const session = await auth();
	if (!session?.user) return unauthorizedResponse();
	const url = new URL(request.url);
	const parsed = ExpenseQuerySchema.safeParse(Object.fromEntries(url.searchParams));
	if (!parsed.success) return validationErrorResponse(parsed.error);
	const result = await listExpenses(parsed.data);
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
	const result = await createExpense(parsed.data, session.user.id);
	if (result.err) return databaseErrorResponse();
	return NextResponse.json(result.val, { status: 201 });
}
