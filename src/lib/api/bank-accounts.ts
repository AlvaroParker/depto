import { apiRequest, type ApiResult } from "@/lib/api/client";
import type {
	ParticipantBankAccountInput,
	ParticipantBankAccountResponse,
} from "@/lib/types/bank-account";

function bankAccountPath(participantId: string): string {
	return `/api/admin/participants/${encodeURIComponent(participantId)}/bank-account`;
}

export function saveParticipantBankAccount(
	participantId: string,
	input: ParticipantBankAccountInput,
): Promise<ApiResult<ParticipantBankAccountResponse>> {
	return apiRequest<ParticipantBankAccountResponse>(bankAccountPath(participantId), {
		body: JSON.stringify(input),
		method: "PUT",
	});
}

export function removeParticipantBankAccount(participantId: string): Promise<ApiResult<null>> {
	return apiRequest<null>(bankAccountPath(participantId), { method: "DELETE" });
}
