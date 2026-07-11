import { describe, expect, it, vi } from "vitest";
import { sendExpenseCreatedEmails } from "@/lib/email/expense-created";
import type { ExpenseDetail } from "@/lib/types/expense";

const expense: ExpenseDetail = {
	amountMinor: 30_000,
	createdAt: "2026-07-11T12:00:00.000Z",
	createdByUserId: "user-1",
	currency: "CLP",
	description: null,
	expenseDate: "2026-07-11",
	hasReceipt: false,
	id: "expense-1",
	kind: { iconKey: "groceries", id: "kind-1", name: "Compras", sortOrder: 1 },
	name: "Compra <semanal>",
	payer: { id: "p1", name: "Álvaro & Cía", slug: "alvaro", sortOrder: 1 },
	receiptContentType: null,
	receiptFilename: null,
	receiptSizeBytes: null,
	shares: [],
	updatedAt: "2026-07-11T12:00:00.000Z",
};

const recipients = [
	{ email: "alvaro@example.com", name: "Álvaro", participantId: "p1", shareAmountMinor: 15_000 },
	{ email: "camila@example.com", name: "Camila", participantId: "p2", shareAmountMinor: 15_000 },
];

describe("expense-created email delivery", () => {
	it("sends one private Resend batch message per selected participant", async () => {
		const fetcher = vi
			.fn()
			.mockResolvedValue(new Response(JSON.stringify({ data: [] }), { status: 200 }));
		const result = await sendExpenseCreatedEmails(
			expense,
			recipients,
			"Creador <root>",
			{
				apiKey: "re_test",
				appBaseUrl: "https://depto.parker.ci/",
				from: "La cuenta <info@depto.parker.ci>",
			},
			fetcher as unknown as typeof fetch,
		);

		expect(result).toEqual({ count: 2, kind: "sent" });
		expect(fetcher).toHaveBeenCalledOnce();
		const [url, init] = fetcher.mock.calls[0] as [string, RequestInit];
		expect(url).toBe("https://api.resend.com/emails/batch");
		expect(init.headers).toMatchObject({
			Authorization: "Bearer re_test",
			"Idempotency-Key": "expense-created/expense-1",
		});
		const messages = JSON.parse(String(init.body)) as Array<{
			from: string;
			html: string;
			text: string;
			to: string[];
		}>;
		expect(messages.map(({ to }) => to)).toEqual([["alvaro@example.com"], ["camila@example.com"]]);
		expect(messages[0].from).toBe("La cuenta <info@depto.parker.ci>");
		expect(messages[0].text).toContain("Tu parte: $15.000");
		expect(messages[0].text).toContain("https://depto.parker.ci/expenses/expense-1");
		expect(messages[0].html).toContain("Creador &lt;root&gt;");
		expect(messages[0].html).toContain("Compra &lt;semanal&gt;");
	});

	it("skips unconfigured/local delivery and reports provider failures", async () => {
		const unusedFetcher = vi.fn();
		expect(
			await sendExpenseCreatedEmails(
				expense,
				recipients,
				"Creador",
				{ apiKey: "", appBaseUrl: "http://localhost:3000", from: "sender@example.com" },
				unusedFetcher as unknown as typeof fetch,
			),
		).toEqual({ kind: "skipped", reason: "missing_api_key" });
		expect(unusedFetcher).not.toHaveBeenCalled();

		const failingFetcher = vi.fn().mockResolvedValue(new Response("rate limited", { status: 429 }));
		const failure = await sendExpenseCreatedEmails(
			expense,
			recipients,
			"Creador",
			{ apiKey: "re_test", appBaseUrl: "https://example.com", from: "sender@example.com" },
			failingFetcher as unknown as typeof fetch,
		);
		expect(failure).toMatchObject({ kind: "failed", status: 429 });
	});
});
