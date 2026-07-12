import { NextResponse } from "next/server";
import { authenticateRequestActor } from "@/lib/auth/actor";
import {
	actorAuthenticationErrorResponse,
	databaseErrorResponse,
	forbiddenResponse,
} from "@/lib/api/server";
import { getBindings } from "@/lib/db/bindings";
import {
	authorizeSharePaymentProofUpload,
	findSharePaymentProof,
	type ShareMutationAccess,
} from "@/lib/db/expense-shares";
import { attachPaymentProofToShare } from "@/lib/services/files";
import { receiptContentDisposition } from "@/lib/util/receipts";
import { validatePaymentProofMetadata } from "@/lib/util/payment-proofs";

interface ProofRouteContext {
	params: Promise<{ id: string }>;
}

function accessErrorResponse(access: Exclude<ShareMutationAccess, { kind: "allowed" }>): Response {
	if (access.kind === "not_found") {
		return NextResponse.json({ message: "No encontramos ese reembolso." }, { status: 404 });
	}
	if (access.kind === "forbidden") return forbiddenResponse();
	if (access.kind === "zero_amount") {
		return NextResponse.json(
			{ message: "Un monto de $0 no puede tener comprobante de pago." },
			{ status: 400 },
		);
	}
	return NextResponse.json(
		{ message: "La parte de quien pagó no puede tener comprobante." },
		{ status: 400 },
	);
}

export async function PUT(request: Request, { params }: ProofRouteContext): Promise<Response> {
	const authenticated = await authenticateRequestActor(request, {
		requiredScope: "reimbursements:write",
	});
	if (authenticated.kind !== "authenticated")
		return actorAuthenticationErrorResponse(authenticated, request);
	const shareId = (await params).id;
	const actor = {
		id: authenticated.actor.userId,
		participantId: authenticated.actor.participantId,
		role: authenticated.actor.role,
	};
	const access = await authorizeSharePaymentProofUpload(shareId, actor);
	if (access.err) return databaseErrorResponse();
	if (access.val.kind !== "allowed") return accessErrorResponse(access.val);

	let metadata;
	try {
		metadata = validatePaymentProofMetadata({
			contentType: request.headers.get("content-type")?.split(";")[0]?.trim() ?? "",
			filename: decodeURIComponent(request.headers.get("x-receipt-filename") ?? ""),
			sizeBytes: Number(request.headers.get("x-receipt-size")),
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
	const attached = await attachPaymentProofToShare(
		shareId,
		{ bytes, contentType: metadata.contentType, filename: metadata.filename },
		{ participantId: actor.participantId, role: actor.role, userId: actor.id },
	);
	if (!attached) {
		return NextResponse.json(
			{ message: "No pudimos guardar el comprobante. Inténtalo nuevamente." },
			{ status: 503 },
		);
	}
	return NextResponse.json(attached);
}

export async function GET(request: Request, { params }: ProofRouteContext): Promise<Response> {
	const authenticated = await authenticateRequestActor(request, { requiredScope: "expenses:read" });
	if (authenticated.kind !== "authenticated")
		return actorAuthenticationErrorResponse(authenticated, request);
	const proof = await findSharePaymentProof((await params).id);
	if (proof.err) return databaseErrorResponse();
	if (!proof.val) {
		return NextResponse.json({ message: "No encontramos ese comprobante." }, { status: 404 });
	}
	const object = await getBindings().RECEIPTS.get(proof.val.objectKey);
	if (!object) {
		return NextResponse.json({ message: "No encontramos ese comprobante." }, { status: 404 });
	}
	return new Response(object.body, {
		headers: {
			"cache-control": "private, no-store",
			"content-disposition": receiptContentDisposition(proof.val.filename),
			"content-length": String(object.size),
			"content-type": proof.val.contentType,
			"x-content-type-options": "nosniff",
		},
	});
}
