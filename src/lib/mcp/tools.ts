import { getDashboardSummary } from "@/lib/db/dashboard";
import { listExpenseKinds } from "@/lib/db/expense-kinds";
import { findActiveParticipants } from "@/lib/db/participants";
import { sha256Base64Url } from "@/lib/oauth/crypto";
import {
	createIdempotentExpenseForActor,
	getExpenseForActor,
	listExpensesForActor,
} from "@/lib/services/expenses";
import { attachActorPaymentProof, attachMcpReceipt } from "@/lib/services/files";
import { setActorPaymentStatus, updateActorOpenShareAmount } from "@/lib/services/reimbursements";
import type { OAuthActor } from "@/lib/types/actor";
import { ExpenseCreateInputSchema, ExpenseQuerySchema } from "@/lib/types/expense";
import type { OAuthScope } from "@/lib/types/oauth";
import { mcpBusinessError, mcpSuccess } from "./results";
import { acquireMcpFile, McpFileInputSchema } from "./files";

const receiptTypes = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
const proofTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

function requireScope(actor: OAuthActor, scope: OAuthScope) {
	return actor.scopes.has(scope)
		? null
		: mcpBusinessError(`Falta el permiso ${scope}.`, "INSUFFICIENT_SCOPE");
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
	if (!parsed.success) return mcpBusinessError("Los filtros no son válidos.", "VALIDATION_ERROR");
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
	if (!parsed.success)
		return mcpBusinessError("Los datos del gasto no son válidos.", "VALIDATION_ERROR");
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
	if (created.kind === "replayed") {
		return mcpSuccess("El gasto ya había sido creado; devolvemos el original.", {
			expense: created.expense,
			replayed: true,
		});
	}
	if (created.kind === "invalid_kind") {
		return mcpBusinessError("La categoría no es válida.", "VALIDATION_ERROR");
	}
	if (created.kind !== "created") {
		return mcpBusinessError("No pudimos crear el gasto.");
	}
	let warning: string | undefined;
	if (input.receipt) {
		const receipt = McpFileInputSchema.safeParse(input.receipt);
		if (!receipt.success) {
			warning = "El gasto se creó, pero el descriptor del recibo no era válido.";
		} else {
			try {
				const file = await acquireMcpFile(receipt.data, receiptTypes);
				if (!(await attachMcpReceipt(created.expense.id, file))) {
					warning = "El gasto se creó, pero no pudimos adjuntar el recibo.";
				}
			} catch (error) {
				warning =
					error instanceof Error
						? `El gasto se creó, pero ${error.message.toLowerCase()}`
						: "El gasto se creó sin recibo.";
			}
		}
	}
	return mcpSuccess("Gasto creado correctamente.", {
		expense: created.expense,
		notification: created.notification,
		replayed: false,
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
		const file = await acquireMcpFile(parsed.data, proofTypes);
		const share = await attachActorPaymentProof(expenseId, file, actor);
		if (!share)
			return mcpBusinessError("No pudimos adjuntar el comprobante.", "INVALID_TRANSITION");
		return mcpSuccess("Pago marcado y comprobante adjuntado.", { share });
	} catch (error) {
		return mcpBusinessError(
			error instanceof Error ? error.message : "El comprobante no es válido.",
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
