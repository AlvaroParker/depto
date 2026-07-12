import { NextResponse } from "next/server";
import { authenticateRequestActor } from "@/lib/auth/actor";
import { actorAuthenticationErrorResponse, databaseErrorResponse } from "@/lib/api/server";
import { payAllActorDebt, type BulkPaymentProofFile } from "@/lib/services/bulk-payments";
import type { ApiError } from "@/lib/types/api";
import type { BulkPaymentResponse } from "@/lib/types/bulk-payment";
import { validatePaymentProofMetadata } from "@/lib/util/payment-proofs";

interface BulkPaymentRouteContext {
	params: Promise<{ paidToParticipantId: string }>;
}

export async function POST(
	request: Request,
	{ params }: BulkPaymentRouteContext,
): Promise<NextResponse<ApiError> | NextResponse<BulkPaymentResponse>> {
	const authenticated = await authenticateRequestActor(request, {
		requiredScope: "reimbursements:write",
	});
	if (authenticated.kind !== "authenticated") {
		return actorAuthenticationErrorResponse(authenticated, request);
	}
	if (!authenticated.actor.participantId) {
		return NextResponse.json(
			{ message: "Tu cuenta no está vinculada a una persona del hogar." },
			{ status: 403 },
		);
	}

	let proofFile: BulkPaymentProofFile | null = null;
	const declaredFilename = request.headers.get("x-receipt-filename");
	const declaredSize = request.headers.get("x-receipt-size");
	const contentType = request.headers.get("content-type")?.split(";")[0]?.trim() ?? "";
	const hasProof =
		declaredFilename !== null ||
		declaredSize !== null ||
		(Number(request.headers.get("content-length")) || 0) > 0 ||
		contentType.startsWith("image/");
	if (hasProof) {
		let metadata;
		try {
			metadata = validatePaymentProofMetadata({
				contentType,
				filename: decodeURIComponent(declaredFilename ?? ""),
				sizeBytes: Number(declaredSize),
			});
		} catch (error) {
			const message = error instanceof Error ? error.message : "El comprobante no es válido.";
			return NextResponse.json({ message }, { status: message.includes("10 MB") ? 413 : 400 });
		}
		if (!request.body) {
			return NextResponse.json({ message: "El comprobante está vacío." }, { status: 400 });
		}
		const bytes = new Uint8Array(await request.arrayBuffer());
		if (bytes.byteLength !== metadata.sizeBytes) {
			return NextResponse.json(
				{ message: "El tamaño recibido no coincide con el archivo." },
				{ status: 400 },
			);
		}
		proofFile = { bytes, contentType: metadata.contentType, filename: metadata.filename };
	}

	const result = await payAllActorDebt((await params).paidToParticipantId, proofFile, {
		participantId: authenticated.actor.participantId,
		role: authenticated.actor.role,
		userId: authenticated.actor.userId,
	});
	if (result.err) {
		if (result.val.kind === "database_error") return databaseErrorResponse();
		return NextResponse.json(
			{ message: "No pudimos guardar el comprobante. Inténtalo nuevamente." },
			{ status: 503 },
		);
	}
	if (result.val.kind === "not_found") {
		return NextResponse.json({ message: "No encontramos a esa persona." }, { status: 404 });
	}
	if (result.val.kind === "self_target") {
		return NextResponse.json({ message: "No puedes pagarte a ti mismo." }, { status: 400 });
	}
	if (result.val.kind === "no_debt") {
		return NextResponse.json(
			{ message: "Ya no tienes pagos pendientes con esa persona." },
			{ status: 409 },
		);
	}
	return NextResponse.json(result.val.payment);
}
