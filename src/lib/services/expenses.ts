import "server-only";

import { findExpenseKindById } from "@/lib/db/expense-kinds";
import type { ExpenseIdempotencyInput } from "@/lib/db/expense-idempotency";
import {
	createExpense,
	createExpenseIdempotently,
	findExpenseById,
	listExpenses,
} from "@/lib/db/expenses";
import { getBindings } from "@/lib/db/bindings";
import { findExpenseNotificationRecipients } from "@/lib/db/participants";
import { type ExpenseEmailConfig, sendExpenseCreatedEmails } from "@/lib/email/expense-created";
import type { ExpenseCreateInput, ExpenseDetail } from "@/lib/types/expense";
import type { ExpenseQuery } from "@/lib/types/expense";

export type CreateExpenseServiceResult =
	| { kind: "created"; expense: ExpenseDetail; notification: "sent" | "skipped" | "failed" }
	| { kind: "invalid_kind" }
	| { kind: "storage_error" };

export type CreateIdempotentExpenseServiceResult =
	| { kind: "created"; expense: ExpenseDetail; notification: "sent" | "skipped" | "failed" }
	| { kind: "replayed"; expense: ExpenseDetail }
	| { kind: "conflict" }
	| { kind: "in_progress" }
	| { kind: "invalid_kind" }
	| { kind: "storage_error" };

export interface ExpenseServiceDependencies {
	database?: D1Database;
	email?: ExpenseEmailConfig & { fetcher?: typeof fetch };
}

async function sendCreationNotification(
	expense: ExpenseDetail,
	actor: { displayName: string },
	input: ExpenseCreateInput,
	dependencies: ExpenseServiceDependencies,
): Promise<"sent" | "skipped" | "failed"> {
	if (input.sendEmailNotifications === false) return "skipped";
	const recipients = await findExpenseNotificationRecipients(expense.id, dependencies.database);
	if (recipients.err) return "failed";
	const defaultBindings = dependencies.email ? null : getBindings();
	const email =
		dependencies.email ??
		({
			apiKey: defaultBindings?.RESEND_API_KEY,
			appBaseUrl: defaultBindings?.APP_BASE_URL || "https://depto.parker.ci",
			from: defaultBindings?.RESEND_FROM_EMAIL || "La cuenta <info@depto.parker.ci>",
		} satisfies ExpenseEmailConfig);
	const delivery = await sendExpenseCreatedEmails(
		expense,
		recipients.val,
		actor.displayName,
		email,
		email.fetcher,
	);
	return delivery.kind === "failed" ? "failed" : delivery.kind === "skipped" ? "skipped" : "sent";
}

export async function createExpenseForActor(
	input: ExpenseCreateInput,
	actor: { displayName: string; userId: string },
	dependencies: ExpenseServiceDependencies = {},
): Promise<CreateExpenseServiceResult> {
	const kind = await findExpenseKindById(input.kindId, dependencies.database);
	if (kind.err) return { kind: "storage_error" };
	if (!kind.val) return { kind: "invalid_kind" };
	const created = await createExpense(input, actor.userId, dependencies.database);
	if (created.err) return { kind: "storage_error" };
	return {
		expense: created.val,
		kind: "created",
		notification: await sendCreationNotification(created.val, actor, input, dependencies),
	};
}

export async function createIdempotentExpenseForActor(
	input: ExpenseCreateInput,
	actor: { displayName: string; userId: string },
	idempotency: ExpenseIdempotencyInput,
	dependencies: ExpenseServiceDependencies = {},
): Promise<CreateIdempotentExpenseServiceResult> {
	const kind = await findExpenseKindById(input.kindId, dependencies.database);
	if (kind.err) return { kind: "storage_error" };
	if (!kind.val) return { kind: "invalid_kind" };
	const created = await createExpenseIdempotently(
		input,
		actor.userId,
		idempotency,
		dependencies.database,
	);
	if (created.err) return { kind: "storage_error" };
	if (created.val.kind !== "created") return created.val;
	return {
		expense: created.val.expense,
		kind: "created",
		notification: await sendCreationNotification(created.val.expense, actor, input, dependencies),
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
