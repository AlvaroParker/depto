import { NextResponse } from "next/server";
import { authenticateRequestActor } from "@/lib/auth/actor";
import { actorAuthenticationErrorResponse, databaseErrorResponse } from "@/lib/api/server";
import { getBindings } from "@/lib/db/bindings";
import { detachExpenseReceipt, findExpenseReceipt } from "@/lib/db/receipts";
import { attachMcpReceipt } from "@/lib/services/files";
import { receiptContentDisposition, validateReceiptMetadata } from "@/lib/util/receipts";

interface ReceiptRouteContext {
	params: Promise<{ id: string }>;
}

export async function PUT(request: Request, { params }: ReceiptRouteContext) {
	const authenticated = await authenticateRequestActor(request, {
		requiredScope: "expenses:write",
	});
	if (authenticated.kind !== "authenticated")
		return actorAuthenticationErrorResponse(authenticated, request);
	const expenseId = (await params).id;
	let metadata;
	try {
		metadata = validateReceiptMetadata({
			contentType: request.headers.get("content-type")?.split(";")[0]?.trim() ?? "",
			filename: decodeURIComponent(request.headers.get("x-receipt-filename") ?? ""),
			sizeBytes: Number(request.headers.get("x-receipt-size")),
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : "El comprobante no es válido.";
		return NextResponse.json({ message }, { status: message.includes("10 MB") ? 413 : 400 });
	}
	if (!request.body)
		return NextResponse.json({ message: "El comprobante está vacío." }, { status: 400 });
	const bytes = new Uint8Array(await request.arrayBuffer());
	if (bytes.byteLength !== metadata.sizeBytes) {
		return NextResponse.json(
			{ message: "El tamaño recibido no coincide con el archivo." },
			{ status: 400 },
		);
	}
	if (
		!(await attachMcpReceipt(expenseId, {
			bytes,
			contentType: metadata.contentType,
			filename: metadata.filename,
		}))
	) {
		return NextResponse.json({ message: "No pudimos guardar el comprobante." }, { status: 503 });
	}
	const { findExpenseById } = await import("@/lib/db/expenses");
	const expense = await findExpenseById(expenseId);
	if (expense.err || !expense.val) return databaseErrorResponse();
	return NextResponse.json(expense.val);
}

export async function GET(request: Request, { params }: ReceiptRouteContext) {
	const authenticated = await authenticateRequestActor(request, { requiredScope: "expenses:read" });
	if (authenticated.kind !== "authenticated")
		return actorAuthenticationErrorResponse(authenticated, request);
	const receipt = await findExpenseReceipt((await params).id);
	if (receipt.err) return databaseErrorResponse();
	if (!receipt.val)
		return NextResponse.json({ message: "No encontramos ese comprobante." }, { status: 404 });
	const object = await getBindings().RECEIPTS.get(receipt.val.objectKey);
	if (!object)
		return NextResponse.json({ message: "No encontramos ese comprobante." }, { status: 404 });
	return new Response(object.body, {
		headers: {
			"cache-control": "private, no-store",
			"content-disposition": receiptContentDisposition(receipt.val.filename),
			"content-length": String(object.size),
			"content-type": receipt.val.contentType,
			"x-content-type-options": "nosniff",
		},
	});
}

export async function DELETE(request: Request, { params }: ReceiptRouteContext) {
	const authenticated = await authenticateRequestActor(request, {
		requiredScope: "expenses:write",
	});
	if (authenticated.kind !== "authenticated")
		return actorAuthenticationErrorResponse(authenticated, request);
	const detached = await detachExpenseReceipt((await params).id);
	if (detached.err) return databaseErrorResponse();
	if (!detached.val.found) {
		return NextResponse.json({ message: "No encontramos ese gasto." }, { status: 404 });
	}
	if (detached.val.objectKey) {
		try {
			await getBindings().RECEIPTS.delete(detached.val.objectKey);
		} catch {
			// Metadata removal is authoritative; object cleanup is best effort.
		}
	}
	return new Response(null, { status: 204 });
}
