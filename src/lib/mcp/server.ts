import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { OAuthActor } from "@/lib/types/actor";
import {
	createExpenseTool,
	getExpenseReferenceData,
	getExpenseTool,
	getMyBalance,
	listExpenseTool,
	markMyPaymentPaidWithProofTool,
	setMyPaymentStatusTool,
	updateMyOpenShareAmountTool,
} from "./tools";
import { McpFileInputSchema } from "./files";

const readAnnotations = {
	destructiveHint: false,
	idempotentHint: true,
	openWorldHint: false,
	readOnlyHint: true,
};

export function createExpenseMcpServer(actor: OAuthActor): McpServer {
	const server = new McpServer({ name: "gastos-compartidos", version: "1.0.0" });
	server.registerTool(
		"get_expense_reference_data",
		{
			annotations: readAnnotations,
			description:
				"Obtiene participantes, categorías, monedas, modos de división y límites de archivo.",
			inputSchema: {},
			outputSchema: {
				callerParticipant: z.unknown().nullable(),
				categories: z.array(z.unknown()),
				currencies: z.array(z.string()),
				fileLimits: z.unknown(),
				participants: z.array(z.unknown()),
				splitModes: z.array(z.string()),
			},
		},
		() => getExpenseReferenceData(actor),
	);
	server.registerTool(
		"get_my_balance",
		{
			annotations: readAnnotations,
			description: "Obtiene el saldo personal y las deudas por participante.",
			inputSchema: {},
			outputSchema: { balance: z.unknown() },
		},
		() => getMyBalance(actor),
	);
	server.registerTool(
		"list_expenses",
		{
			annotations: readAnnotations,
			description: "Busca y pagina los gastos de la casa.",
			inputSchema: {
				kind: z.string().optional(),
				page: z.number().int().positive().optional(),
				pageSize: z.number().int().min(1).max(100).optional(),
				payer: z.string().optional(),
				pending: z.enum(["all", "true", "false", "mine"]).optional(),
				q: z.string().max(120).optional(),
			},
			outputSchema: { page: z.unknown() },
		},
		(input) => listExpenseTool(input, actor),
	);
	server.registerTool(
		"get_expense",
		{
			annotations: readAnnotations,
			description: "Obtiene el detalle completo de un gasto.",
			inputSchema: { expenseId: z.string().min(1) },
			outputSchema: { expense: z.unknown() },
		},
		({ expenseId }) => getExpenseTool(expenseId, actor),
	);
	server.registerTool(
		"create_expense",
		{
			_meta: {
				"openai/fileParams": ["receipt"],
			},
			annotations: {
				destructiveHint: false,
				idempotentHint: true,
				openWorldHint: false,
				readOnlyHint: false,
			},
			description: "Crea un gasto con división igual, personalizada o abierta.",
			inputSchema: {
				amountMinor: z.number().int().positive(),
				currency: z.literal("CLP").optional(),
				description: z.string().max(2000).nullable().optional(),
				expenseDate: z.string(),
				idempotencyKey: z.string().min(1).max(128),
				initialPaidParticipantIds: z.array(z.string()).optional(),
				kindId: z.string(),
				name: z.string().min(1).max(120),
				paidByParticipantId: z.string(),
				participantIds: z.array(z.string()).min(1),
				receipt: z.unknown().optional(),
				sendEmailNotifications: z.boolean().default(true),
				shareAllocations: z
					.array(z.object({ participantId: z.string(), shareAmountMinor: z.number().int().min(0) }))
					.optional(),
				splitMode: z.enum(["equal", "custom", "open"]).optional(),
			},
			outputSchema: {
				expense: z.unknown(),
				notification: z.enum(["sent", "skipped", "failed"]).optional(),
				replayed: z.boolean(),
				warning: z.string().optional(),
			},
		},
		(input) => createExpenseTool(input, actor),
	);
	server.registerTool(
		"set_my_payment_status",
		{
			annotations: {
				destructiveHint: true,
				idempotentHint: true,
				openWorldHint: false,
				readOnlyHint: false,
			},
			description: "Marca la parte del usuario conectado como pagada o pendiente.",
			inputSchema: { expenseId: z.string().min(1), status: z.enum(["paid", "pending"]) },
			outputSchema: { share: z.unknown() },
		},
		({ expenseId, status }) => setMyPaymentStatusTool(expenseId, status, actor),
	);
	server.registerTool(
		"mark_my_payment_paid_with_proof",
		{
			_meta: { "openai/fileParams": ["proof"] },
			annotations: {
				destructiveHint: true,
				idempotentHint: true,
				openWorldHint: false,
				readOnlyHint: false,
			},
			description: "Marca la parte del usuario como pagada y adjunta un comprobante de imagen.",
			inputSchema: { expenseId: z.string().min(1), proof: McpFileInputSchema },
			outputSchema: { share: z.unknown() },
		},
		({ expenseId, proof }) => markMyPaymentPaidWithProofTool(expenseId, proof, actor),
	);
	server.registerTool(
		"update_my_open_share_amount",
		{
			annotations: {
				destructiveHint: false,
				idempotentHint: true,
				openWorldHint: false,
				readOnlyHint: false,
			},
			description:
				"Actualiza la parte abierta pendiente del usuario y recalcula el resto del pagador.",
			inputSchema: { amountMinor: z.number().int().min(0), expenseId: z.string().min(1) },
			outputSchema: { shares: z.array(z.unknown()) },
		},
		({ amountMinor, expenseId }) => updateMyOpenShareAmountTool(expenseId, amountMinor, actor),
	);
	return server;
}
