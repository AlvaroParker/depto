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
import {
	acknowledgeTelegramPrivacyNotice as acknowledgeTelegramPrivacyNoticeForRpc,
	getTelegramBalance as getTelegramBalanceForRpc,
	getTelegramDebtBreakdown as getTelegramDebtBreakdownForRpc,
	getTelegramExpense as getTelegramExpenseForRpc,
	getTelegramExpenseContext as getTelegramExpenseContextForRpc,
	getTelegramPrivacyNoticeState as getTelegramPrivacyNoticeStateForRpc,
	listTelegramExpenses as listTelegramExpensesForRpc,
} from "@/lib/telegram/conversation-service";
import type {
	AcknowledgeTelegramPrivacyNoticeResult,
	GetTelegramBalanceResult,
	GetTelegramDebtBreakdownResult,
	GetTelegramExpenseContextResult,
	GetTelegramExpenseResult,
	GetTelegramPrivacyNoticeStateResult,
	ListTelegramExpensesResult,
} from "@/lib/telegram/conversation-contract";

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
	getTelegramExpenseContext(request: unknown): Promise<GetTelegramExpenseContextResult> {
		return getTelegramExpenseContextForRpc(request, { database: this.env.DB });
	}

	getTelegramBalance(request: unknown): Promise<GetTelegramBalanceResult> {
		return getTelegramBalanceForRpc(request, { database: this.env.DB });
	}

	getTelegramDebtBreakdown(request: unknown): Promise<GetTelegramDebtBreakdownResult> {
		return getTelegramDebtBreakdownForRpc(request, { database: this.env.DB });
	}

	getTelegramPrivacyNoticeState(request: unknown): Promise<GetTelegramPrivacyNoticeStateResult> {
		return getTelegramPrivacyNoticeStateForRpc(request, { database: this.env.DB });
	}

	acknowledgeTelegramPrivacyNotice(
		request: unknown,
	): Promise<AcknowledgeTelegramPrivacyNoticeResult> {
		return acknowledgeTelegramPrivacyNoticeForRpc(request, { database: this.env.DB });
	}

	listTelegramExpenses(request: unknown): Promise<ListTelegramExpensesResult> {
		return listTelegramExpensesForRpc(request, { database: this.env.DB });
	}

	getTelegramExpense(request: unknown): Promise<GetTelegramExpenseResult> {
		return getTelegramExpenseForRpc(request, { database: this.env.DB });
	}

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
