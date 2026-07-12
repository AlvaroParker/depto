import type { BankTransferDetails } from "@/lib/types/bank-account";

export function formatBankTransferDetails(details: BankTransferDetails): string {
	return [
		details.name,
		details.rut,
		details.accountType,
		details.accountNumber,
		details.bankName,
		details.email,
	].join("\n");
}
