import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { databaseErrorResponse, forbiddenResponse, unauthorizedResponse } from "@/lib/api/server";
import { getBindings } from "@/lib/db/bindings";
import {
	attachSharePaymentProof,
	authorizeSharePaymentProofUpload,
	findSharePaymentProof,
	type ShareMutationAccess,
} from "@/lib/db/expense-shares";
import { receiptContentDisposition } from "@/lib/util/receipts";
import {
	createPaymentProofObjectKey,
	validatePaymentProofMetadata,
} from "@/lib/util/payment-proofs";

interface ProofRouteContext {
	params: Promise<{ id: string }>;
}

function accessErrorResponse(access: Exclude<ShareMutationAccess, { kind: "allowed" }>): Response {
	if (access.kind === "not_found") {
		return NextResponse.json({ message: "No encontramos ese reembolso." }, { status: 404 });
	}
	if (access.kind === "forbidden") return forbiddenResponse();
	return NextResponse.json(
		{ message: "La parte de quien pagó no puede tener comprobante." },
		{ status: 400 },
	);
}

export async function PUT(request: Request, { params }: ProofRouteContext): Promise<Response> {
	const session = await auth();
	if (!session?.user) return unauthorizedResponse();
	const shareId = (await params).id;
	const actor = {
		id: session.user.id,
		participantId: session.user.participantId,
		role: session.user.role,
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

	const { RECEIPTS } = getBindings();
	const objectKey = createPaymentProofObjectKey(shareId, metadata.contentType);
	let object: R2Object;
	try {
		if (typeof FixedLengthStream === "undefined") {
			object = await RECEIPTS.put(objectKey, await request.arrayBuffer(), {
				httpMetadata: { contentType: metadata.contentType },
			});
		} else {
			const fixedLengthBody = new FixedLengthStream(metadata.sizeBytes);
			const [stored] = await Promise.all([
				RECEIPTS.put(objectKey, fixedLengthBody.readable, {
					httpMetadata: { contentType: metadata.contentType },
				}),
				request.body.pipeTo(fixedLengthBody.writable),
			]);
			object = stored;
		}
	} catch (error) {
		console.error("R2 payment proof upload failed.", error);
		return NextResponse.json(
			{ message: "No pudimos guardar el comprobante. Inténtalo nuevamente." },
			{ status: 503 },
		);
	}
	if (object.size !== metadata.sizeBytes) {
		await RECEIPTS.delete(objectKey);
		return NextResponse.json(
			{ message: "El tamaño recibido no coincide con el archivo." },
			{ status: 400 },
		);
	}

	const attached = await attachSharePaymentProof(shareId, { ...metadata, objectKey }, actor);
	if (attached.err) {
		await RECEIPTS.delete(objectKey);
		return databaseErrorResponse();
	}
	if (attached.val.kind !== "updated") {
		await RECEIPTS.delete(objectKey);
		return accessErrorResponse(attached.val);
	}
	if (attached.val.previousObjectKey && attached.val.previousObjectKey !== objectKey) {
		try {
			await RECEIPTS.delete(attached.val.previousObjectKey);
		} catch (error) {
			console.error("R2 replaced payment proof cleanup failed.", error);
		}
	}
	return NextResponse.json(attached.val.share);
}

export async function GET(_request: Request, { params }: ProofRouteContext): Promise<Response> {
	const session = await auth();
	if (!session?.user) return unauthorizedResponse();
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
