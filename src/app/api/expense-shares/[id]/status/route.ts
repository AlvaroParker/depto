import { NextResponse } from "next/server";
import { authenticateRequestActor } from "@/lib/auth/actor";
import {
	actorAuthenticationErrorResponse,
	databaseErrorResponse,
	forbiddenResponse,
	validationErrorResponse,
} from "@/lib/api/server";
import { getBindings } from "@/lib/db/bindings";
import { updateShareStatus } from "@/lib/db/expense-shares";
import { ShareStatusInputSchema } from "@/lib/types/expense";

interface ShareRouteContext {
	params: Promise<{ id: string }>;
}

export async function PATCH(request: Request, { params }: ShareRouteContext) {
	const authenticated = await authenticateRequestActor(request, {
		requiredScope: "reimbursements:write",
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
	const parsed = ShareStatusInputSchema.safeParse(body);
	if (!parsed.success) return validationErrorResponse(parsed.error);
	const result = await updateShareStatus((await params).id, parsed.data.status, {
		id: authenticated.actor.userId,
		participantId: authenticated.actor.participantId,
		role: authenticated.actor.role,
	});
	if (result.err) return databaseErrorResponse();
	if (result.val.kind === "not_found")
		return NextResponse.json({ message: "No encontramos ese reembolso." }, { status: 404 });
	if (result.val.kind === "payer_immutable")
		return NextResponse.json(
			{ message: "La parte de quien pagó no se puede cambiar." },
			{ status: 400 },
		);
	if (result.val.kind === "zero_amount")
		return NextResponse.json(
			{ message: "Un monto de $0 no necesita marcarse como pagado." },
			{ status: 400 },
		);
	if (result.val.kind === "forbidden") return forbiddenResponse();
	if (result.val.removedProofObjectKey) {
		try {
			await getBindings().RECEIPTS.delete(result.val.removedProofObjectKey);
		} catch (error) {
			console.error("R2 payment proof cleanup failed after reverting a share.", error);
		}
	}
	return NextResponse.json(result.val.share);
}
