import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
	databaseErrorResponse,
	forbiddenResponse,
	unauthorizedResponse,
	validationErrorResponse,
} from "@/lib/api/server";
import { updateOpenShareAmount } from "@/lib/db/expense-shares";
import { OpenShareAmountInputSchema, type OpenShareAmountResponse } from "@/lib/types/expense";

interface AmountRouteContext {
	params: Promise<{ id: string }>;
}

export async function PATCH(
	request: Request,
	{ params }: AmountRouteContext,
): Promise<NextResponse> {
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
	const parsed = OpenShareAmountInputSchema.safeParse(body);
	if (!parsed.success) return validationErrorResponse(parsed.error);
	const result = await updateOpenShareAmount((await params).id, parsed.data.shareAmountMinor, {
		id: session.user.id,
		participantId: session.user.participantId,
		role: session.user.role,
	});
	if (result.err) return databaseErrorResponse();
	if (result.val.kind === "not_found") {
		return NextResponse.json({ message: "No encontramos ese reembolso." }, { status: 404 });
	}
	if (result.val.kind === "forbidden") return forbiddenResponse();
	if (result.val.kind === "not_open") {
		return NextResponse.json(
			{ message: "Solo las cuentas abiertas permiten cambiar montos individuales." },
			{ status: 409 },
		);
	}
	if (result.val.kind === "payer_immutable") {
		return NextResponse.json(
			{ message: "La parte de quien pagó se calcula automáticamente." },
			{ status: 400 },
		);
	}
	if (result.val.kind === "paid_locked") {
		return NextResponse.json(
			{ message: "Devuelve este reembolso a pendiente antes de cambiar el monto." },
			{ status: 409 },
		);
	}
	if (result.val.kind === "amount_exceeds_total") {
		return NextResponse.json(
			{ message: "El monto supera el saldo disponible de la cuenta." },
			{ status: 409 },
		);
	}
	return NextResponse.json<OpenShareAmountResponse>({ shares: result.val.shares });
}
