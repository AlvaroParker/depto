import "server-only";

import {
	findShareByExpenseAndParticipant,
	updateOpenShareAmount,
	updateShareStatus,
} from "@/lib/db/expense-shares";
import { deletePaymentProofObjectIfUnreferenced } from "@/lib/services/files";
import type { UserRole } from "@/lib/const/roles";

export interface ReimbursementActor {
	participantId: string;
	role: UserRole;
	userId: string;
}

export async function resolveActorShare(expenseId: string, actor: ReimbursementActor) {
	return findShareByExpenseAndParticipant(expenseId, actor.participantId);
}

export async function setActorPaymentStatus(
	expenseId: string,
	status: "paid" | "pending",
	actor: ReimbursementActor,
) {
	const share = await resolveActorShare(expenseId, actor);
	if (share.err || !share.val) return share;
	const updated = await updateShareStatus(share.val.id, status, {
		id: actor.userId,
		participantId: actor.participantId,
		role: actor.role,
	});
	if (updated.ok && updated.val.kind === "updated" && updated.val.removedProofObjectKey) {
		await deletePaymentProofObjectIfUnreferenced(updated.val.removedProofObjectKey);
	}
	return updated;
}

export async function updateActorOpenShareAmount(
	expenseId: string,
	amountMinor: number,
	actor: ReimbursementActor,
) {
	const share = await resolveActorShare(expenseId, actor);
	if (share.err || !share.val) return share;
	return updateOpenShareAmount(share.val.id, amountMinor, {
		id: actor.userId,
		participantId: actor.participantId,
		role: actor.role,
	});
}
