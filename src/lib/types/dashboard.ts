import type { ExpenseSummary } from "@/lib/types/expense";
import type { Participant } from "@/lib/types/participant";

export interface ParticipantBalance {
	participant: Participant;
	totalPaidMinor: number;
	totalShareMinor: number;
	netBalanceMinor: number;
}

export interface PendingTransfer {
	from: Participant;
	to: Participant;
	amountMinor: number;
}

export interface DashboardSummary {
	expenseCount: number;
	totalAmountMinor: number;
	pendingTotalMinor: number;
	balances: ParticipantBalance[];
	pendingMatrix: PendingTransfer[];
	recentExpenses: ExpenseSummary[];
}
