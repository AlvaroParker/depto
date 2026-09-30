import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
	ListToolsRequestSchema,
	type CallToolResult,
	type Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import type { OAuthActor } from "@/lib/types/actor";
import type { OAuthScope } from "@/lib/types/oauth";
import { ExpenseDateSchema } from "@/lib/types/expense";
import * as handlers from "./tools";
import { McpInlineFileSchema, McpRemoteFileSchema } from "./files";
import { mcpBusinessError } from "./results";
import {
	BalanceSchema,
	DebtInputSchema,
	DebtSchema,
	ExpenseSchema,
	FileMetadataSchema,
	KindSchema,
	PageSchema,
	ParticipantSchema,
	PaymentSchema,
	ReportInputSchema,
	ReportSchema,
	ShareSchema,
	expenseInputShape,
} from "./schemas";

export function createExpenseMcpServer(actor: OAuthActor): McpServer {
	const server = new McpServer({ name: "gastos-compartidos", version: "1.1.0" });
	const definitions: (Tool & { securitySchemes: { type: string; scopes: OAuthScope[] }[] })[] = [];
	function register<S extends z.ZodRawShape>(
		name: string,
		scope: OAuthScope,
		description: string,
		input: S,
		output: z.ZodRawShape,
		handler: (input: z.output<z.ZodObject<S>>) => Promise<CallToolResult>,
		options: {
			mutation?: boolean;
			destructive?: boolean;
			idempotent?: boolean;
			fileParams?: string[];
		} = {},
	) {
		const securitySchemes = [{ type: "oauth2", scopes: [scope] }];
		const annotations = {
			readOnlyHint: !options.mutation,
			destructiveHint: options.destructive ?? false,
			idempotentHint: options.idempotent ?? true,
			openWorldHint: false,
		};
		const _meta = {
			securitySchemes,
			...(options.fileParams ? { "openai/fileParams": options.fileParams } : {}),
		};
		const inputSchema = z.object(input);
		const outputSchema = z.object(output);
		const wireOutputSchema = z.union([
			outputSchema,
			z.object({
				code: z.string(),
				message: z.string(),
				issues: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
			}),
		]);
		server.registerTool<typeof outputSchema, typeof inputSchema>(
			name,
			{ description, inputSchema, outputSchema, annotations, _meta },
			async (args) => {
				const fields = args as Record<string, unknown>;
				for (const field of options.fileParams ?? []) {
					if (fields[field] !== undefined && fields[`${field}Inline`] !== undefined)
						return mcpBusinessError(`Envía solo ${field} o ${field}Inline.`, "VALIDATION_ERROR");
				}
				try {
					return await handler(args as z.output<z.ZodObject<S>>);
				} catch {
					return mcpBusinessError(
						"La operación no está disponible. Consulta su estado antes de reintentar.",
						"TEMPORARILY_UNAVAILABLE",
					);
				}
			},
		);
		// SDK 1.x omits nonstandard top-level fields from tools/list. Publish the same
		// schemas and policy here so ChatGPT sees securitySchemes as well as its _meta mirror.
		definitions.push({
			name,
			description,
			annotations,
			_meta,
			securitySchemes,
			inputSchema: z.toJSONSchema(inputSchema, { io: "input" }) as Tool["inputSchema"],
			outputSchema: { ...z.toJSONSchema(wireOutputSchema), type: "object" } as Tool["outputSchema"],
		});
	}
	const expenseId = z.string().min(1).describe("ID obtenido al listar o crear gastos.");
	const write = { mutation: true };
	const destructive = { mutation: true, destructive: true };
	const fileInput = {
		receipt: McpRemoteFileSchema.optional(),
		receiptInline: McpInlineFileSchema.optional(),
	};
	const proofInput = {
		proof: McpRemoteFileSchema.optional(),
		proofInline: McpInlineFileSchema.optional(),
	};
	register(
		"get_expense_reference_data",
		"expenses:read",
		"Obtiene IDs de participantes y categorías, monedas, divisiones y límites de archivo. Consulta antes de crear o editar un gasto.",
		{},
		{
			callerParticipant: ParticipantSchema.nullable(),
			categories: z.array(KindSchema),
			participants: z.array(ParticipantSchema),
			currencies: z.array(z.string()),
			splitModes: z.array(z.string()),
			fileLimits: z.object({
				maxBytes: z.number().int(),
				proofTypes: z.array(z.string()),
				receiptTypes: z.array(z.string()),
			}),
		},
		() => handlers.getExpenseReferenceData(actor),
	);
	register(
		"get_my_balance",
		"expenses:read",
		"Obtiene cuánto debe el usuario conectado y cuánto le deben, por persona, en pesos CLP.",
		{},
		{ balance: BalanceSchema },
		() => handlers.getMyBalance(actor),
	);
	register(
		"list_expenses",
		"expenses:read",
		"Busca gastos de la casa con fechas inclusivas y paginación. pending=mine muestra reembolsos pendientes del usuario conectado.",
		{
			kind: z.string().optional(),
			payer: z.string().optional(),
			page: z.number().int().min(1).max(1_000_000).optional(),
			pageSize: z.number().int().min(1).max(100).optional(),
			pending: z.enum(["all", "true", "false", "mine"]).optional(),
			q: z.string().max(120).optional(),
			dateFrom: ExpenseDateSchema.optional(),
			dateTo: ExpenseDateSchema.optional(),
		},
		{ page: PageSchema },
		(input) => handlers.listExpenseTool(input, actor),
	);
	register(
		"get_expense",
		"expenses:read",
		"Obtiene el detalle completo, partes y metadatos de archivos de un gasto.",
		{ expenseId },
		{ expense: ExpenseSchema },
		(input) => handlers.getExpenseTool(input.expenseId, actor),
	);
	register(
		"create_expense",
		"expenses:write",
		"Crea un gasto en CLP con división equal, custom u open. Usa una clave nueva por gasto y reutiliza la misma en reintentos. Envía avisos por correo salvo sendEmailNotifications=false. Si falla el recibo, reintenta la misma clave o usa attach_expense_receipt.",
		{
			...expenseInputShape,
			...fileInput,
			idempotencyKey: z.string().trim().min(1).max(128),
			initialPaidParticipantIds: z.array(z.string()).optional(),
			sendEmailNotifications: z.boolean().default(true),
		},
		{
			expense: ExpenseSchema,
			notification: z.enum(["sent", "skipped", "failed"]).optional(),
			replayed: z.boolean(),
			warning: z.string().optional(),
		},
		(input) => handlers.createExpenseTool(input, actor),
		{ ...write, fileParams: ["receipt"] },
	);
	register(
		"set_my_payment_status",
		"reimbursements:write",
		"Marca exclusivamente la parte del usuario conectado como pagada o pendiente. Volver a pendiente elimina su comprobante de pago.",
		{ expenseId, status: z.enum(["paid", "pending"]) },
		{ share: ShareSchema },
		(input) => handlers.setMyPaymentStatusTool(input.expenseId, input.status, actor),
		destructive,
	);
	register(
		"mark_my_payment_paid_with_proof",
		"reimbursements:write",
		"Marca la parte del usuario conectado como pagada y reemplaza su comprobante. Envía proof (archivo de ChatGPT) o proofInline (base64), en JPG, PNG o WebP, hasta 10 MB.",
		{ expenseId, ...proofInput },
		{ share: ShareSchema },
		(input) =>
			handlers.markMyPaymentPaidWithProofTool(
				input.expenseId,
				input.proof ?? input.proofInline,
				actor,
			),
		{ ...destructive, fileParams: ["proof"], idempotent: false },
	);
	register(
		"update_my_open_share_amount",
		"reimbursements:write",
		"Cambia el monto pendiente propio en una división abierta, en CLP enteros, y recalcula el resto del pagador.",
		{ expenseId, amountMinor: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER) },
		{ shares: z.array(ShareSchema) },
		(input) => handlers.updateMyOpenShareAmountTool(input.expenseId, input.amountMinor, actor),
		write,
	);
	register(
		"update_expense",
		"expenses:write",
		"Actualiza un gasto con sus datos completos; consulta get_expense antes. Los cambios financieros pueden requerir reiniciar pagos y los permisos del usuario siguen aplicando.",
		{
			expenseId,
			...expenseInputShape,
			resetPaidReimbursements: z
				.boolean()
				.default(false)
				.describe(
					"Usar true solo tras confirmar explícitamente con el usuario el reinicio de los pagos permitidos.",
				),
		},
		{ expense: ExpenseSchema },
		(input) => handlers.updateExpenseTool(input.expenseId, input, actor),
		destructive,
	);
	register(
		"delete_expense",
		"expenses:write",
		"Elimina un gasto de los saldos y listados activos, conservando su historial. Confirma con el usuario antes de eliminarlo.",
		{ expenseId },
		{ expenseId: z.string(), deleted: z.boolean() },
		(input) => handlers.deleteExpenseTool(input.expenseId, actor),
		destructive,
	);
	register(
		"attach_expense_receipt",
		"expenses:write",
		"Adjunta o reemplaza el recibo de un gasto existente. Envía receipt o receiptInline; JPG, PNG, WebP o PDF, hasta 10 MB.",
		{ expenseId, ...fileInput },
		{ expense: ExpenseSchema },
		(input) =>
			handlers.attachReceiptTool(input.expenseId, input.receipt ?? input.receiptInline, actor),
		{ ...destructive, fileParams: ["receipt"], idempotent: false },
	);
	register(
		"remove_expense_receipt",
		"expenses:write",
		"Retira el recibo de un gasto sin cambiar sus montos o pagos.",
		{ expenseId },
		{ expenseId: z.string(), removed: z.boolean() },
		(input) => handlers.removeReceiptTool(input.expenseId, actor),
		destructive,
	);
	register(
		"read_expense_file",
		"expenses:read",
		"Lee el contenido privado de un recibo o comprobante de pago. Usa shareId de get_expense para payment_proof. Devuelve imágenes o un recurso PDF incorporado; no genera enlaces públicos.",
		{
			expenseId,
			kind: z.enum(["receipt", "payment_proof"]),
			shareId: z.string().min(1).optional(),
		},
		{ file: FileMetadataSchema },
		(input) => handlers.readExpenseFileTool(input, actor),
	);
	register(
		"pay_all_my_debt",
		"reimbursements:write",
		"Marca todos los reembolsos pendientes propios hacia una persona como pagados. No transfiere dinero. Confirma el destinatario y el total consultando get_my_debt_breakdown. Comprobante de imagen opcional.",
		{ paidToParticipantId: z.string().min(1), ...proofInput },
		{ payment: PaymentSchema.nullable(), alreadyPaid: z.boolean() },
		(input) =>
			handlers.payAllMyDebtTool(input.paidToParticipantId, input.proof ?? input.proofInline, actor),
		{ ...write, idempotent: false, fileParams: ["proof"] },
	);
	register(
		"get_my_debt_breakdown",
		"expenses:read",
		"Lista los gastos pendientes entre el usuario conectado y otra persona, en una dirección, con totales y paginación.",
		DebtInputSchema.shape,
		{ debt: DebtSchema },
		(input) => handlers.getMyDebtBreakdownTool(input, actor),
	);
	register(
		"get_expense_report",
		"expenses:read",
		"Suma los gastos de toda la casa en un rango de fechas inclusivo, agrupados por categoría y pagador. Los importes son pesos CLP enteros, no deudas ni cuotas personales.",
		ReportInputSchema.shape,
		{ report: ReportSchema },
		(input) => handlers.getExpenseReportTool(input, actor),
	);
	server.server.setRequestHandler(ListToolsRequestSchema, () => ({ tools: definitions }));
	return server;
}
