import type { ExpenseSummary } from "@/lib/types/expense";
import type { Participant } from "@/lib/types/participant";

export interface ParticipantBalance {
	participant: Participant;
	totalPaidMinor: number;
	totalShareMinor: number;
	/** Outstanding amount owed to this person (positive) or by this person (negative). */
	netBalanceMinor: number;
}

export interface PendingTransfer {
	from: Participant;
	to: Participant;
	amountMinor: number;
}

export interface HouseholdDashboardSummary {
	view: "household";
	expenseCount: number;
	totalAmountMinor: number;
	pendingTotalMinor: number;
	balances: ParticipantBalance[];
	pendingMatrix: PendingTransfer[];
	recentExpenses: ExpenseSummary[];
}

export interface PersonalDashboardSummary {
	view: "personal";
	participantId: string;
	amountOwedMinor: number;
	owedExpenseCount: number;
	amountDueToMeMinor: number;
	dueToMeExpenseCount: number;
	spentSoFarMinor: number;
	expectedSpendMinor: number;
	recentExpenses: ExpenseSummary[];
}

export type DashboardSummary = HouseholdDashboardSummary | PersonalDashboardSummary;
