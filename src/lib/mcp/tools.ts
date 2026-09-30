import { getDashboardSummary } from "@/lib/db/dashboard";
import { listExpenseKinds, findExpenseKindById } from "@/lib/db/expense-kinds";
import { softDeleteExpense, updateExpense } from "@/lib/db/expenses";
import { getExpenseReport } from "@/lib/db/expense-reports";
import { findTelegramDebtBreakdown } from "@/lib/db/telegram-debts";
import { detachExpenseReceipt, findExpenseReceipt } from "@/lib/db/receipts";
import { findSharePaymentProof } from "@/lib/db/expense-shares";
import { getBindings } from "@/lib/db/bindings";
import { payAllActorDebt } from "@/lib/services/bulk-payments";
import { validatePaymentProofMetadata } from "@/lib/util/payment-proofs";
import { getOAuthOrigin } from "@/lib/oauth/metadata";
import { DebtInputSchema, ReportInputSchema } from "./schemas";
import { findActiveParticipants } from "@/lib/db/participants";
import { sha256Base64Url } from "@/lib/oauth/crypto";
import {
	createIdempotentExpenseForActor,
	getExpenseForActor,
	listExpensesForActor,
} from "@/lib/services/expenses";
import {
	attachActorPaymentProof,
	attachMcpReceipt,
	deletePaymentProofObjectsIfUnreferenced,
} from "@/lib/services/files";
import { setActorPaymentStatus, updateActorOpenShareAmount } from "@/lib/services/reimbursements";
import type { OAuthActor } from "@/lib/types/actor";
import {
	ExpenseCreateInputSchema,
	ExpenseQuerySchema,
	ExpensePatchSchema,
} from "@/lib/types/expense";
import type { OAuthScope } from "@/lib/types/oauth";
import { mcpBusinessError, mcpSuccess, mcpValidationError } from "./results";
import { acquireMcpFile, McpFileInputSchema, type McpFileInput } from "./files";

const receiptTypes = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
const proofTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

function requireScope(actor: OAuthActor, scope: OAuthScope) {
	if (actor.scopes.has(scope)) return null;
	return {
		...mcpBusinessError(
			`Falta el permiso ${scope}. Autoriza este permiso desde tu aplicación conectada.`,
			"INSUFFICIENT_SCOPE",
		),
		_meta: {
			"mcp/www_authenticate": [
				`Bearer resource_metadata="${getOAuthOrigin()}/.well-known/oauth-protected-resource", error="insufficient_scope", error_description="Additional permission required", scope="${scope}"`,
			],
		},
	};
}

function acquireFile(input: McpFileInput, types: ReadonlySet<string>) {
	const configured = getBindings().MCP_FILE_ALLOWED_HOSTS;
	return acquireMcpFile(input, types, {
		allowedHosts: configured
			? configured
					.split(",")
					.map((host) => host.trim().toLowerCase())
					.filter(Boolean)
			: undefined,
	});
}

export async function getExpenseReferenceData(actor: OAuthActor) {
	const denied = requireScope(actor, "expenses:read");
	if (denied) return denied;
	const [participants, categories] = await Promise.all([
		findActiveParticipants(),
		listExpenseKinds(),
	]);
	if (participants.err || categories.err)
		return mcpBusinessError("No pudimos cargar los datos de referencia.");
	return mcpSuccess("Datos de referencia listos.", {
		callerParticipant: participants.val.find(({ id }) => id === actor.participantId) ?? null,
		categories: categories.val,
		currencies: ["CLP"],
		fileLimits: {
			maxBytes: 10_485_760,
			proofTypes: ["image/jpeg", "image/png", "image/webp"],
			receiptTypes: ["image/jpeg", "image/png", "image/webp", "application/pdf"],
		},
		participants: participants.val,
		splitModes: ["equal", "custom", "open"],
	});
}

export async function getMyBalance(actor: OAuthActor) {
	const denied = requireScope(actor, "expenses:read");
	if (denied) return denied;
	const result = await getDashboardSummary({ currentParticipantId: actor.participantId });
	if (result.err) return mcpBusinessError("No pudimos calcular tu saldo.");
	return mcpSuccess("Tu saldo está actualizado.", { balance: result.val });
}

export async function listExpenseTool(input: unknown, actor: OAuthActor) {
	const denied = requireScope(actor, "expenses:read");
	if (denied) return denied;
	const parsed = ExpenseQuerySchema.safeParse(input);
	if (!parsed.success) return mcpValidationError(parsed.error);
	const result = await listExpensesForActor(parsed.data, actor);
	if (result.err) return mcpBusinessError("No pudimos listar los gastos.");
	return mcpSuccess(`Encontramos ${result.val.total} gastos.`, { page: result.val });
}

export async function getExpenseTool(expenseId: string, actor: OAuthActor) {
	const denied = requireScope(actor, "expenses:read");
	if (denied) return denied;
	const result = await getExpenseForActor(expenseId);
	if (result.err) return mcpBusinessError("No pudimos cargar el gasto.");
	if (!result.val) return mcpBusinessError("No encontramos ese gasto.", "NOT_FOUND");
	return mcpSuccess(`Detalle de ${result.val.name}.`, { expense: result.val });
}

export async function createExpenseTool(input: Record<string, unknown>, actor: OAuthActor) {
	const denied = requireScope(actor, "expenses:write");
	if (denied) return denied;
	const idempotencyKey =
		typeof input.idempotencyKey === "string" ? input.idempotencyKey.trim() : "";
	if (!idempotencyKey || idempotencyKey.length > 128) {
		return mcpBusinessError("Debes enviar una clave de idempotencia válida.", "VALIDATION_ERROR");
	}
	const expenseInput = { ...input };
	delete expenseInput.idempotencyKey;
	delete expenseInput.receipt;
	const parsed = ExpenseCreateInputSchema.safeParse(expenseInput);
	if (!parsed.success) return mcpValidationError(parsed.error);
	const requestHash = await sha256Base64Url(JSON.stringify(parsed.data));
	const reservationInput = {
		idempotencyKey,
		requestHash,
		toolName: "create_expense",
		userId: actor.userId,
	};
	const created = await createIdempotentExpenseForActor(parsed.data, actor, reservationInput);
	if (created.kind === "conflict") {
		return mcpBusinessError("La clave de idempotencia ya se usó con otros datos.", "CONFLICT");
	}
	if (created.kind === "in_progress") {
		return mcpBusinessError("Ya hay una creación en curso con esta clave.", "IN_PROGRESS");
	}
	if (created.kind === "invalid_kind") {
		return mcpBusinessError("La categoría no es válida.", "VALIDATION_ERROR");
	}
	if (created.kind !== "created" && created.kind !== "replayed") {
		return mcpBusinessError("No pudimos crear el gasto.");
	}
	let warning: string | undefined;
	let expense = created.expense;
	if ((input.receipt || input.receiptInline) && !expense.hasReceipt) {
		const receipt = McpFileInputSchema.safeParse(input.receipt ?? input.receiptInline);
		if (!receipt.success) {
			warning = "El gasto se creó, pero el descriptor del recibo no era válido.";
		} else {
			try {
				const file = await acquireFile(receipt.data, receiptTypes);
				if (!(await attachMcpReceipt(created.expense.id, file, true))) {
					warning = "El gasto se creó, pero no pudimos adjuntar el recibo.";
				} else {
					const refreshed = await getExpenseForActor(expense.id);
					if (refreshed.ok && refreshed.val) expense = refreshed.val;
					else
						warning =
							"Recibo adjuntado. Consulta el gasto nuevamente para ver sus datos actualizados.";
				}
			} catch {
				warning =
					"El gasto se creó sin recibo. Reintenta con la misma clave y un archivo válido de hasta 10 MB.";
			}
		}
	}
	return mcpSuccess("Gasto creado correctamente.", {
		expense,
		...(created.kind === "created" ? { notification: created.notification } : {}),
		replayed: created.kind === "replayed",
		...(warning ? { warning } : {}),
	});
}

export async function markMyPaymentPaidWithProofTool(
	expenseId: string,
	proof: unknown,
	actor: OAuthActor,
) {
	const denied = requireScope(actor, "reimbursements:write");
	if (denied) return denied;
	const parsed = McpFileInputSchema.safeParse(proof);
	if (!parsed.success)
		return mcpBusinessError("El descriptor del comprobante no es válido.", "VALIDATION_ERROR");
	try {
		const file = await acquireFile(parsed.data, proofTypes);
		const share = await attachActorPaymentProof(expenseId, file, actor);
		if (!share)
			return mcpBusinessError("No pudimos adjuntar el comprobante.", "INVALID_TRANSITION");
		return mcpSuccess("Pago marcado y comprobante adjuntado.", { share });
	} catch {
		return mcpBusinessError(
			"No pudimos leer el comprobante. Usa una imagen JPG, PNG o WebP de hasta 10 MB e inténtalo nuevamente.",
			"VALIDATION_ERROR",
		);
	}
}

export async function setMyPaymentStatusTool(
	expenseId: string,
	status: "paid" | "pending",
	actor: OAuthActor,
) {
	const denied = requireScope(actor, "reimbursements:write");
	if (denied) return denied;
	const result = await setActorPaymentStatus(expenseId, status, actor);
	if (result.err) return mcpBusinessError("No pudimos actualizar el reembolso.");
	if (!result.val || !("kind" in result.val) || result.val.kind !== "updated") {
		return mcpBusinessError("No se pudo aplicar ese cambio de reembolso.", "INVALID_TRANSITION");
	}
	return mcpSuccess("Estado de pago actualizado.", { share: result.val.share });
}

export async function updateMyOpenShareAmountTool(
	expenseId: string,
	amountMinor: number,
	actor: OAuthActor,
) {
	const denied = requireScope(actor, "reimbursements:write");
	if (denied) return denied;
	const result = await updateActorOpenShareAmount(expenseId, amountMinor, actor);
	if (result.err) return mcpBusinessError("No pudimos actualizar el monto.");
	if (!result.val || !("kind" in result.val) || result.val.kind !== "updated") {
		return mcpBusinessError("No se pudo aplicar ese monto abierto.", "INVALID_TRANSITION");
	}
	return mcpSuccess("Monto abierto actualizado.", { shares: result.val.shares });
}

export async function updateExpenseTool(expenseId: string, input: unknown, actor: OAuthActor) {
	const denied = requireScope(actor, "expenses:write");
	if (denied) return denied;
	const parsed = ExpensePatchSchema.safeParse(input);
	if (!parsed.success) return mcpValidationError(parsed.error);
	const kind = await findExpenseKindById(parsed.data.kindId);
	if (kind.err) return mcpBusinessError("No pudimos validar la categoría.");
	if (!kind.val)
		return mcpBusinessError("La categoría no existe.", "VALIDATION_ERROR", {
			issues: [{ path: "kindId", message: "Consulta las categorías disponibles." }],
		});
	const result = await updateExpense(expenseId, parsed.data, undefined, undefined, {
		role: actor.role,
	});
	if (result.err) return mcpBusinessError("No pudimos actualizar el gasto.");
	if (result.val.kind === "not_found")
		return mcpBusinessError("No encontramos ese gasto.", "NOT_FOUND");
	if (result.val.kind === "paid_reset_required")
		return mcpBusinessError(
			"Confirma con el usuario el reinicio de reembolsos antes de enviar resetPaidReimbursements=true.",
			"PAID_RESET_REQUIRED",
		);
	if (result.val.kind === "forbidden")
		return mcpBusinessError(
			"Solo administración puede recalcular una cuenta abierta. Puedes ajustar tu parte pendiente con update_my_open_share_amount.",
			"FORBIDDEN",
		);
	await deletePaymentProofObjectsIfUnreferenced(result.val.removedPaymentProofObjectKeys);
	return mcpSuccess("Gasto actualizado.", { expense: result.val.expense });
}

export async function deleteExpenseTool(expenseId: string, actor: OAuthActor) {
	const denied = requireScope(actor, "expenses:write");
	if (denied) return denied;
	const result = await softDeleteExpense(expenseId);
	if (result.err) return mcpBusinessError("No pudimos eliminar el gasto.");
	if (!result.val) return mcpBusinessError("No encontramos ese gasto activo.", "NOT_FOUND");
	return mcpSuccess("Gasto eliminado de los saldos; se conserva su historial.", {
		expenseId,
		deleted: true,
	});
}

export async function attachReceiptTool(expenseId: string, input: unknown, actor: OAuthActor) {
	const denied = requireScope(actor, "expenses:write");
	if (denied) return denied;
	const file = McpFileInputSchema.safeParse(input);
	if (!file.success) return mcpValidationError(file.error);
	const existing = await getExpenseForActor(expenseId);
	if (existing.err) return mcpBusinessError("No pudimos cargar el gasto.");
	if (!existing.val) return mcpBusinessError("No encontramos ese gasto.", "NOT_FOUND");
	try {
		if (!(await attachMcpReceipt(expenseId, await acquireFile(file.data, receiptTypes))))
			return mcpBusinessError("No pudimos guardar el recibo.");
	} catch {
		return mcpBusinessError(
			"No pudimos leer el recibo. Adjunta JPG, PNG, WebP o PDF de hasta 10 MB.",
			"INVALID_FILE",
		);
	}
	const updated = await getExpenseForActor(expenseId);
	if (updated.err || !updated.val)
		return mcpBusinessError("Recibo guardado; consulta nuevamente el gasto.");
	return mcpSuccess("Recibo adjuntado.", { expense: updated.val });
}

export async function removeReceiptTool(expenseId: string, actor: OAuthActor) {
	const denied = requireScope(actor, "expenses:write");
	if (denied) return denied;
	const detached = await detachExpenseReceipt(expenseId);
	if (detached.err) return mcpBusinessError("No pudimos quitar el recibo.");
	if (!detached.val.found) return mcpBusinessError("No encontramos ese gasto.", "NOT_FOUND");
	if (detached.val.objectKey)
		await getBindings()
			.RECEIPTS.delete(detached.val.objectKey)
			.catch(() => undefined);
	return mcpSuccess("Recibo retirado del gasto.", { expenseId, removed: true });
}

export async function readExpenseFileTool(
	input: { expenseId: string; kind: "receipt" | "payment_proof"; shareId?: string },
	actor: OAuthActor,
) {
	const denied = requireScope(actor, "expenses:read");
	if (denied) return denied;
	const expense = await getExpenseForActor(input.expenseId);
	if (expense.err) return mcpBusinessError("No pudimos cargar el gasto.");
	if (!expense.val) return mcpBusinessError("No encontramos ese gasto.", "NOT_FOUND");
	if (
		input.kind === "payment_proof" &&
		!expense.val.shares.some((share) => share.id === input.shareId)
	)
		return mcpBusinessError(
			"Selecciona una parte de este gasto mediante shareId.",
			"VALIDATION_ERROR",
		);
	const file =
		input.kind === "receipt"
			? await findExpenseReceipt(input.expenseId)
			: await findSharePaymentProof(input.shareId!);
	if (file.err) return mcpBusinessError("No pudimos cargar el archivo.");
	if (!file.val) return mcpBusinessError("Este gasto o parte no tiene archivo.", "NOT_FOUND");
	try {
		const object = await getBindings().RECEIPTS.get(file.val.objectKey);
		if (!object) return mcpBusinessError("El archivo no está disponible.", "NOT_FOUND");
		if (object.size > 10_485_760) {
			await object.body.cancel();
			return mcpBusinessError("El archivo supera el límite de 10 MB.", "INVALID_FILE");
		}
		const data = Buffer.from(await object.arrayBuffer()).toString("base64");
		const metadata = {
			filename: file.val.filename,
			contentType: file.val.contentType,
			sizeBytes: file.val.sizeBytes,
		};
		const result = mcpSuccess("Archivo privado obtenido.", { file: metadata });
		if (file.val.contentType.startsWith("image/"))
			result.content.push({ type: "image", data, mimeType: file.val.contentType });
		else
			result.content.push({
				type: "resource",
				resource: {
					uri: `depto://expenses/${encodeURIComponent(input.expenseId)}/receipt`,
					mimeType: file.val.contentType,
					blob: data,
				},
			});
		return result;
	} catch {
		return mcpBusinessError("No pudimos leer el archivo. Inténtalo nuevamente.");
	}
}

export async function payAllMyDebtTool(
	paidToParticipantId: string,
	proof: unknown,
	actor: OAuthActor,
) {
	const denied = requireScope(actor, "reimbursements:write");
	if (denied) return denied;
	let file = null;
	if (proof !== undefined) {
		const parsed = McpFileInputSchema.safeParse(proof);
		if (!parsed.success) return mcpValidationError(parsed.error);
		try {
			const acquired = await acquireFile(parsed.data, proofTypes);
			file = {
				...validatePaymentProofMetadata({ ...acquired, sizeBytes: acquired.bytes.byteLength }),
				bytes: acquired.bytes,
			};
		} catch {
			return mcpBusinessError("No pudimos leer el comprobante de pago.", "INVALID_FILE");
		}
	}
	const result = await payAllActorDebt(paidToParticipantId, file, actor);
	if (result.err) return mcpBusinessError("No pudimos marcar los pagos.");
	if (result.val.kind === "no_debt")
		return mcpSuccess("No tienes deuda pendiente con esa persona.", {
			payment: null,
			alreadyPaid: true,
		});
	if (result.val.kind !== "updated")
		return mcpBusinessError("Selecciona otra persona válida como destinatario.", "INVALID_TARGET");
	return mcpSuccess("Tus reembolsos pendientes fueron marcados como pagados.", {
		payment: result.val.payment,
		alreadyPaid: false,
	});
}

export async function getMyDebtBreakdownTool(input: unknown, actor: OAuthActor) {
	const denied = requireScope(actor, "expenses:read");
	if (denied) return denied;
	const parsed = DebtInputSchema.safeParse(input);
	if (!parsed.success) return mcpValidationError(parsed.error);
	const result = await findTelegramDebtBreakdown({
		...parsed.data,
		callerParticipantId: actor.participantId,
	});
	if (result.err) return mcpBusinessError("No pudimos cargar los detalles de deuda.");
	return mcpSuccess("Detalle de los reembolsos pendientes.", {
		debt: { ...result.val, page: parsed.data.page, pageSize: parsed.data.pageSize },
	});
}

export async function getExpenseReportTool(input: unknown, actor: OAuthActor) {
	const denied = requireScope(actor, "expenses:read");
	if (denied) return denied;
	const parsed = ReportInputSchema.safeParse(input);
	if (!parsed.success) return mcpValidationError(parsed.error);
	const report = await getExpenseReport(parsed.data);
	if (report.err) return mcpBusinessError("No pudimos calcular el informe.");
	return mcpSuccess("Informe de gastos de la casa por categoría y pagador.", {
		report: report.val,
	});
}
