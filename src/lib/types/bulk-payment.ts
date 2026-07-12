import type { Participant } from "@/lib/types/participant";

export interface BulkPaymentResponse {
	amountPaidMinor: number;
	paidAt: string;
	paidExpenseCount: number;
	paidToParticipant: Participant;
	proofAttached: boolean;
}
