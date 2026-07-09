import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
	databaseErrorResponse,
	unauthorizedResponse,
	validationErrorResponse,
} from "@/lib/api/server";
import { updateShareStatus } from "@/lib/db/expense-shares";
import { ShareStatusInputSchema } from "@/lib/types/expense";

interface ShareRouteContext {
	params: Promise<{ id: string }>;
}

export async function PATCH(request: Request, { params }: ShareRouteContext) {
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
	const parsed = ShareStatusInputSchema.safeParse(body);
	if (!parsed.success) return validationErrorResponse(parsed.error);
	const result = await updateShareStatus((await params).id, parsed.data.status, session.user.id);
	if (result.err) return databaseErrorResponse();
	if (result.val.kind === "not_found")
		return NextResponse.json({ message: "No encontramos ese reembolso." }, { status: 404 });
	if (result.val.kind === "payer_immutable")
		return NextResponse.json(
			{ message: "La parte de quien pagó no se puede cambiar." },
			{ status: 400 },
		);
	return NextResponse.json(result.val.share);
}
