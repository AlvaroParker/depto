import { WorkerEntrypoint } from "cloudflare:workers";
import {
	attachTelegramExpenseReceipt as attachTelegramExpenseReceiptForRpc,
	createTelegramExpense as createTelegramExpenseForRpc,
	findTelegramExpense as findTelegramExpenseForRpc,
	type TelegramExpenseServiceDependencies,
} from "@/lib/telegram/expense-service";
import type {
	AttachTelegramExpenseReceiptResult,
	CreateTelegramExpenseResult,
	FindTelegramExpenseResult,
} from "@/lib/telegram/expense-contract";

function dependencies(env: CloudflareEnv): TelegramExpenseServiceDependencies {
	return {
		appBaseUrl: env.APP_BASE_URL,
		database: env.DB,
		receipts: env.RECEIPTS,
		resendApiKey: env.RESEND_API_KEY,
		resendFromEmail: env.RESEND_FROM_EMAIL,
	};
}

export class TelegramExpenses extends WorkerEntrypoint<CloudflareEnv> {
	findTelegramExpense(request: unknown): Promise<FindTelegramExpenseResult> {
		return findTelegramExpenseForRpc(request, dependencies(this.env));
	}

	createTelegramExpense(
		request: unknown,
		receiptStream?: ReadableStream<Uint8Array>,
	): Promise<CreateTelegramExpenseResult> {
		return createTelegramExpenseForRpc(request, receiptStream, dependencies(this.env));
	}

	attachTelegramExpenseReceipt(
		request: unknown,
		receiptStream: ReadableStream<Uint8Array>,
	): Promise<AttachTelegramExpenseReceiptResult> {
		return attachTelegramExpenseReceiptForRpc(request, receiptStream, dependencies(this.env));
	}
}
