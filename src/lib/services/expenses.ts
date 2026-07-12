import "server-only";

import { findExpenseKindById } from "@/lib/db/expense-kinds";
import { createExpense, findExpenseById, listExpenses } from "@/lib/db/expenses";
import { getBindings } from "@/lib/db/bindings";
import { findExpenseNotificationRecipients } from "@/lib/db/participants";
import { sendExpenseCreatedEmails } from "@/lib/email/expense-created";
import type { ExpenseCreateInput, ExpenseDetail } from "@/lib/types/expense";
import type { ExpenseQuery } from "@/lib/types/expense";

export type CreateExpenseServiceResult =
	| { kind: "created"; expense: ExpenseDetail; notification: "sent" | "skipped" | "failed" }
	| { kind: "invalid_kind" }
	| { kind: "storage_error" };

export async function createExpenseForActor(
	input: ExpenseCreateInput,
	actor: { displayName: string; userId: string },
): Promise<CreateExpenseServiceResult> {
	const kind = await findExpenseKindById(input.kindId);
	if (kind.err) return { kind: "storage_error" };
	if (!kind.val) return { kind: "invalid_kind" };
	const created = await createExpense(input, actor.userId);
	if (created.err) return { kind: "storage_error" };
	if (input.sendEmailNotifications === false) {
		return { expense: created.val, kind: "created", notification: "skipped" };
	}
	const recipients = await findExpenseNotificationRecipients(created.val.id);
	if (recipients.err) return { expense: created.val, kind: "created", notification: "failed" };
	const bindings = getBindings();
	const delivery = await sendExpenseCreatedEmails(created.val, recipients.val, actor.displayName, {
		apiKey: bindings.RESEND_API_KEY,
		appBaseUrl: bindings.APP_BASE_URL || "https://depto.parker.ci",
		from: bindings.RESEND_FROM_EMAIL || "La cuenta <info@depto.parker.ci>",
	});
	return {
		expense: created.val,
		kind: "created",
		notification:
			delivery.kind === "failed" ? "failed" : delivery.kind === "skipped" ? "skipped" : "sent",
	};
}

export function listExpensesForActor(
	query: Partial<ExpenseQuery>,
	actor: { participantId: string | null },
) {
	return listExpenses(query, { currentParticipantId: actor.participantId });
}

export function getExpenseForActor(id: string) {
	return findExpenseById(id);
}
