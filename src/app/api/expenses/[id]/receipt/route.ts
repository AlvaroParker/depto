import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { databaseErrorResponse, unauthorizedResponse } from "@/lib/api/server";
import { getBindings } from "@/lib/db/bindings";
import { attachExpenseReceipt, findExpenseReceipt } from "@/lib/db/receipts";
import {
	createReceiptObjectKey,
	receiptContentDisposition,
	validateReceiptMetadata,
} from "@/lib/util/receipts";

interface ReceiptRouteContext {
	params: Promise<{ id: string }>;
}

export async function PUT(request: Request, { params }: ReceiptRouteContext) {
	const session = await auth();
	if (!session?.user) return unauthorizedResponse();
	const expenseId = (await params).id;
	const existing = await findExpenseReceipt(expenseId);
	if (existing.err) return databaseErrorResponse();
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
	const { RECEIPTS } = getBindings();
	const objectKey = createReceiptObjectKey(expenseId, metadata.contentType);
	let object: R2Object;
	try {
		object = await RECEIPTS.put(objectKey, request.body, {
			httpMetadata: { contentType: metadata.contentType },
		});
	} catch {
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
	const attached = await attachExpenseReceipt(expenseId, { ...metadata, objectKey });
	if (attached.err || !attached.val.attached) {
		await RECEIPTS.delete(objectKey);
		return attached.err
			? databaseErrorResponse()
			: NextResponse.json({ message: "No encontramos ese gasto." }, { status: 404 });
	}
	if (attached.val.previousObjectKey && attached.val.previousObjectKey !== objectKey)
		await RECEIPTS.delete(attached.val.previousObjectKey);
	const { findExpenseById } = await import("@/lib/db/expenses");
	const expense = await findExpenseById(expenseId);
	if (expense.err || !expense.val) return databaseErrorResponse();
	return NextResponse.json(expense.val);
}

export async function GET(_request: Request, { params }: ReceiptRouteContext) {
	const session = await auth();
	if (!session?.user) return unauthorizedResponse();
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
