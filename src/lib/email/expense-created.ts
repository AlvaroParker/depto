import type { ExpenseNotificationRecipient } from "@/lib/db/participants";
import type { ExpenseDetail } from "@/lib/types/expense";
import { formatExpenseDate, formatMoney } from "@/lib/util/format";

const RESEND_BATCH_URL = "https://api.resend.com/emails/batch";

export interface ExpenseEmailConfig {
	apiKey?: string;
	appBaseUrl: string;
	from: string;
}

export type ExpenseEmailResult =
	| { kind: "sent"; count: number }
	| { kind: "skipped"; reason: "missing_api_key" | "no_recipients" }
	| { kind: "failed"; message: string; status?: number };

function escapeHtml(value: string): string {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&#039;");
}

function buildMessage(
	expense: ExpenseDetail,
	recipient: ExpenseNotificationRecipient,
	creatorName: string,
	config: ExpenseEmailConfig,
) {
	const expenseUrl = `${config.appBaseUrl.replace(/\/$/, "")}/expenses/${encodeURIComponent(expense.id)}`;
	const total = formatMoney(expense.amountMinor, expense.currency);
	const share = formatMoney(recipient.shareAmountMinor, expense.currency);
	const date = formatExpenseDate(expense.expenseDate);
	const subject = `Nuevo gasto compartido: ${expense.name}`;
	const text = [
		`Hola ${recipient.name},`,
		"",
		`${creatorName} registró un nuevo gasto compartido contigo.`,
		`Gasto: ${expense.name}`,
		`Total: ${total}`,
		`Tu parte: ${share}`,
		`Pagó: ${expense.payer.name}`,
		`Fecha: ${date}`,
		"",
		`Revisa el detalle: ${expenseUrl}`,
	].join("\n");
	const html = `
		<div style="font-family:ui-sans-serif,system-ui,sans-serif;color:#292923;line-height:1.6;max-width:560px">
			<p>Hola ${escapeHtml(recipient.name)},</p>
			<p><strong>${escapeHtml(creatorName)}</strong> registró un nuevo gasto compartido contigo.</p>
			<div style="background:#f7f1e7;border:1px solid #e6d9c8;border-radius:16px;padding:20px;margin:20px 0">
				<h1 style="font-size:22px;margin:0 0 12px">${escapeHtml(expense.name)}</h1>
				<p style="margin:4px 0">Total: <strong>${escapeHtml(total)}</strong></p>
				<p style="margin:4px 0">Tu parte: <strong>${escapeHtml(share)}</strong></p>
				<p style="margin:4px 0">Pagó: ${escapeHtml(expense.payer.name)}</p>
				<p style="margin:4px 0">Fecha: ${escapeHtml(date)}</p>
			</div>
			<p><a href="${escapeHtml(expenseUrl)}" style="background:#a94f35;color:#fff;text-decoration:none;border-radius:10px;padding:11px 16px;display:inline-block">Ver gasto</a></p>
		</div>`;

	return { from: config.from, html, subject, text, to: [recipient.email] };
}

export async function sendExpenseCreatedEmails(
	expense: ExpenseDetail,
	recipients: ExpenseNotificationRecipient[],
	creatorName: string,
	config: ExpenseEmailConfig,
	fetcher: typeof fetch = fetch,
): Promise<ExpenseEmailResult> {
	if (recipients.length === 0) return { kind: "skipped", reason: "no_recipients" };
	if (!config.apiKey?.trim()) return { kind: "skipped", reason: "missing_api_key" };

	try {
		const response = await fetcher(RESEND_BATCH_URL, {
			body: JSON.stringify(
				recipients.map((recipient) => buildMessage(expense, recipient, creatorName, config)),
			),
			headers: {
				Authorization: `Bearer ${config.apiKey}`,
				"Content-Type": "application/json",
				"Idempotency-Key": `expense-created/${expense.id}`,
			},
			method: "POST",
		});
		if (!response.ok) {
			return {
				kind: "failed",
				message: `Resend rejected the batch (${response.status}).`,
				status: response.status,
			};
		}
		return { count: recipients.length, kind: "sent" };
	} catch (error) {
		return {
			kind: "failed",
			message: error instanceof Error ? error.message : "Resend request failed.",
		};
	}
}
