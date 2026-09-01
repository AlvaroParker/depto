import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createExpense } from "@/lib/db/expenses";
import {
	getTelegramBalance,
	getTelegramExpense,
	getTelegramExpenseContext,
	listTelegramExpenses,
	type TelegramConversationServiceDependencies,
} from "@/lib/telegram/conversation-service";
import type { ExpenseDetail } from "@/lib/types/expense";
import { createTestBindings, type TestBindings } from "../fixtures/miniflare";

const NOW = new Date("2026-08-31T12:00:00.000Z");
const actorRequest = { telegramUserId: "111111", version: 1 } as const;

describe("Telegram conversation read service", () => {
	let bindings: TestBindings;
	let dependencies: TelegramConversationServiceDependencies;
	let expenses: {
		actorAsParticipant: ExpenseDetail;
		actorAsPayer: ExpenseDetail;
		otherActorExpense: ExpenseDetail;
		unrelated: ExpenseDetail;
	};

	beforeEach(async () => {
		bindings = await createTestBindings();
		dependencies = { database: bindings.database };
		await bindings.database.batch([
			bindings.database.prepare(
				`INSERT INTO app_users
				 (id, username, password_hash, display_name, participant_id, role,
				  telegram_user_id, created_at, updated_at)
				 VALUES ('user_alvaro', 'alvaro', 'hash', 'Alvaro', 'participant_alvaro',
				         'user', '111111', '${NOW.toISOString()}', '${NOW.toISOString()}')`,
			),
			bindings.database.prepare(
				`INSERT INTO app_users
				 (id, username, password_hash, display_name, participant_id, role,
				  telegram_user_id, created_at, updated_at)
				 VALUES ('user_camila', 'camila', 'hash', 'Camila', 'participant_camila',
				         'user', '222222', '${NOW.toISOString()}', '${NOW.toISOString()}')`,
			),
		]);

		async function expense(
			input: Parameters<typeof createExpense>[0],
			createdAtOffset: number,
		): Promise<ExpenseDetail> {
			const created = await createExpense(
				input,
				"user_alvaro",
				bindings.database,
				new Date(NOW.getTime() + createdAtOffset),
			);
			if (created.err) throw new Error("Could not create the Telegram read fixture.");
			return created.val;
		}

		expenses = {
			actorAsPayer: await expense(
				{
					amountMinor: 9_000,
					currency: "CLP",
					description: "Cuenta compartida",
					expenseDate: "2026-08-30",
					kindId: "kind-gas",
					name: "Gas hogar",
					paidByParticipantId: "participant_alvaro",
					participantIds: ["participant_camila", "participant_trinidad"],
				},
				1_000,
			),
			actorAsParticipant: await expense(
				{
					amountMinor: 6_000,
					currency: "CLP",
					description: "Compra semanal",
					expenseDate: "2026-08-31",
					kindId: "kind-groceries",
					name: "Mercado semanal",
					paidByParticipantId: "participant_camila",
					participantIds: ["participant_alvaro", "participant_camila"],
				},
				2_000,
			),
			unrelated: await expense(
				{
					amountMinor: 3_000,
					currency: "CLP",
					expenseDate: "2026-09-01",
					kindId: "kind-food",
					name: "Pan ajeno",
					paidByParticipantId: "participant_camila",
					participantIds: ["participant_camila"],
				},
				3_000,
			),
			otherActorExpense: await expense(
				{
					amountMinor: 12_000,
					currency: "CLP",
					expenseDate: "2026-08-29",
					kindId: "kind-internet",
					name: "Internet hogar",
					paidByParticipantId: "participant_trinidad",
					participantIds: ["participant_alvaro", "participant_trinidad"],
				},
				4_000,
			),
		};
	});

	afterEach(async () => bindings.dispose());

	it("returns active reference data and current upload constraints for the caller", async () => {
		const result = await getTelegramExpenseContext(actorRequest, dependencies);

		expect(result).toMatchObject({
			data: {
				caller: {
					displayName: "Alvaro",
					participant: { id: "participant_alvaro", name: "Alvaro", slug: "alvaro" },
				},
				currencies: ["CLP"],
				fileLimits: {
					paymentProofs: {
						contentTypes: ["image/jpeg", "image/png", "image/webp"],
						maxBytes: 10_485_760,
					},
					receipts: {
						contentTypes: ["image/jpeg", "image/png", "image/webp", "application/pdf"],
						maxBytes: 10_485_760,
					},
				},
				splitModes: ["equal", "custom"],
			},
			kind: "ok",
			version: 1,
		});
		if (result.kind !== "ok") throw new Error("Expected Telegram context.");
		expect(result.data.participants.map(({ id }) => id)).toEqual([
			"participant_alvaro",
			"participant_camila",
			"participant_trinidad",
		]);
		expect(result.data.categories[0]).toEqual({
			id: "kind-rent",
			name: "Arriendo",
			sortOrder: 1,
		});
		expect(result.data.categories.at(-1)).toEqual({
			id: "kind-other",
			name: "Otros",
			sortOrder: 17,
		});
	});

	it("maps the actor's personal balance and excludes unrelated recent expenses", async () => {
		const result = await getTelegramBalance(actorRequest, dependencies);

		expect(result).toMatchObject({
			data: {
				amountDueToMeMinor: 9_000,
				amountOwedMinor: 9_000,
				currency: "CLP",
				dueToMeExpenseCount: 1,
				expectedSpendMinor: 9_000,
				owedExpenseCount: 2,
				participantId: "participant_alvaro",
				spentSoFarMinor: 9_000,
			},
			kind: "ok",
			version: 1,
		});
		if (result.kind !== "ok") throw new Error("Expected Telegram balance.");
		expect(result.data.recentExpenses.map(({ name }) => name)).toEqual([
			"Mercado semanal",
			"Gas hogar",
			"Internet hogar",
		]);
		expect(
			result.data.debtsByParticipant.map((debt) => ({
				due: debt.amountDueToMeMinor,
				name: debt.participant.name,
				owed: debt.amountOwedMinor,
			})),
		).toEqual([
			{ due: 4_500, name: "Trinidad", owed: 6_000 },
			{ due: 4_500, name: "Camila", owed: 3_000 },
		]);
	});

	it("paginates and filters only expenses involving the resolved actor", async () => {
		const firstPage = await listTelegramExpenses(
			{ ...actorRequest, query: { page: 1, pageSize: 1 } },
			dependencies,
		);
		const secondPage = await listTelegramExpenses(
			{ ...actorRequest, query: { page: 2, pageSize: 1 } },
			dependencies,
		);
		const filtered = await listTelegramExpenses(
			{
				...actorRequest,
				query: {
					kindId: "kind-groceries",
					payerId: "participant_camila",
					pending: "mine",
					q: " semanal ",
				},
			},
			dependencies,
		);

		expect(firstPage).toMatchObject({
			data: { page: 1, pageSize: 1, total: 3 },
			kind: "ok",
			version: 1,
		});
		expect(secondPage).toMatchObject({
			data: { page: 2, pageSize: 1, total: 3 },
			kind: "ok",
			version: 1,
		});
		expect(filtered).toMatchObject({ data: { page: 1, pageSize: 10, total: 1 }, kind: "ok" });
		if (firstPage.kind !== "ok" || secondPage.kind !== "ok" || filtered.kind !== "ok") {
			throw new Error("Expected actor-scoped Telegram pages.");
		}
		expect(firstPage.data.expenses.map(({ name }) => name)).toEqual(["Mercado semanal"]);
		expect(secondPage.data.expenses.map(({ name }) => name)).toEqual(["Gas hogar"]);
		expect(filtered.data.expenses.map(({ name }) => name)).toEqual(["Mercado semanal"]);
		expect(firstPage.data.expenses.some(({ id }) => id === expenses.unrelated.id)).toBe(false);
	});

	it("returns detail to a payer or share participant without internal account metadata", async () => {
		const payerResult = await getTelegramExpense(
			{ ...actorRequest, expenseId: expenses.actorAsPayer.id },
			dependencies,
		);
		const participantResult = await getTelegramExpense(
			{ ...actorRequest, expenseId: expenses.actorAsParticipant.id },
			dependencies,
		);

		expect(payerResult).toMatchObject({
			data: {
				amountMinor: 9_000,
				currency: "CLP",
				name: "Gas hogar",
				payer: { id: "participant_alvaro", slug: "alvaro", sortOrder: 1 },
				receipt: null,
				shares: [
					{ participant: { id: "participant_camila" }, shareAmountMinor: 4_500 },
					{ participant: { id: "participant_trinidad" }, shareAmountMinor: 4_500 },
				],
			},
			kind: "ok",
			version: 1,
		});
		expect(participantResult).toMatchObject({
			data: { id: expenses.actorAsParticipant.id, name: "Mercado semanal" },
			kind: "ok",
		});
		if (payerResult.kind !== "ok") throw new Error("Expected expense detail.");
		expect(payerResult.data).not.toHaveProperty("createdByUserId");
		expect(payerResult.data.shares[0]).not.toHaveProperty("paymentProof");
	});

	it("conceals unrelated and missing expenses with the same not-found result", async () => {
		expect(
			await getTelegramExpense({ ...actorRequest, expenseId: expenses.unrelated.id }, dependencies),
		).toEqual({ kind: "not_found", version: 1 });
		expect(
			await getTelegramExpense(
				{ ...actorRequest, expenseId: "expense-that-does-not-exist" },
				dependencies,
			),
		).toEqual({ kind: "not_found", version: 1 });
	});

	it("revalidates unknown and disabled Telegram accounts on every read", async () => {
		expect(
			await getTelegramExpenseContext({ telegramUserId: "999999", version: 1 }, dependencies),
		).toEqual({ kind: "unauthorized", version: 1 });

		await bindings.database
			.prepare("UPDATE app_users SET disabled_at = ? WHERE id = 'user_alvaro'")
			.bind(NOW.toISOString())
			.run();

		expect(await getTelegramExpenseContext(actorRequest, dependencies)).toEqual({
			kind: "unauthorized",
			version: 1,
		});
		expect(await getTelegramBalance(actorRequest, dependencies)).toEqual({
			kind: "unauthorized",
			version: 1,
		});
		expect(await listTelegramExpenses({ ...actorRequest, query: {} }, dependencies)).toEqual({
			kind: "unauthorized",
			version: 1,
		});
		expect(
			await getTelegramExpense(
				{ ...actorRequest, expenseId: expenses.actorAsPayer.id },
				dependencies,
			),
		).toEqual({ kind: "unauthorized", version: 1 });
	});

	it("rejects malformed request data before touching the ledger", async () => {
		expect(await getTelegramExpenseContext({}, dependencies)).toEqual({
			kind: "invalid_request",
			version: 1,
		});
		expect(await getTelegramBalance({ ...actorRequest, extra: true }, dependencies)).toEqual({
			kind: "invalid_request",
			version: 1,
		});
		expect(
			await listTelegramExpenses({ ...actorRequest, query: { pageSize: 11 } }, dependencies),
		).toEqual({ kind: "invalid_request", version: 1 });
		expect(await getTelegramExpense({ ...actorRequest, expenseId: "" }, dependencies)).toEqual({
			kind: "invalid_request",
			version: 1,
		});
	});

	it("maps database failures to the stable storage error without throwing", async () => {
		const brokenDependencies = {
			database: {
				prepare() {
					throw new Error("database unavailable");
				},
			} as unknown as D1Database,
		};

		expect(await getTelegramExpenseContext(actorRequest, brokenDependencies)).toEqual({
			kind: "storage_error",
			version: 1,
		});
		expect(await getTelegramBalance(actorRequest, brokenDependencies)).toEqual({
			kind: "storage_error",
			version: 1,
		});
		expect(await listTelegramExpenses({ ...actorRequest, query: {} }, brokenDependencies)).toEqual({
			kind: "storage_error",
			version: 1,
		});
		expect(
			await getTelegramExpense(
				{ ...actorRequest, expenseId: expenses.actorAsPayer.id },
				brokenDependencies,
			),
		).toEqual({ kind: "storage_error", version: 1 });
	});
});
