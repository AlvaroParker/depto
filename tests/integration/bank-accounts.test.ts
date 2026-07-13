import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
	auth: vi.fn(),
	database: null as D1Database | null,
}));

vi.mock("@/auth", () => ({ auth: state.auth }));
vi.mock("@/lib/db/bindings", () => ({
	getDatabase: () => {
		if (!state.database) throw new Error("Missing test database");
		return state.database;
	},
}));

import {
	DELETE as deleteBankAccountRoute,
	PUT as putBankAccountRoute,
} from "@/app/api/admin/participants/[participantId]/bank-account/route";
import {
	deleteParticipantBankAccount,
	findBankTransferDetails,
	findBankTransferDetailsByParticipantIds,
	findParticipantBankAccount,
	upsertParticipantBankAccount,
} from "@/lib/db/bank-accounts";
import { listManagedUsers } from "@/lib/db/users";
import { createTestBindings, type TestBindings } from "../fixtures/miniflare";

const NOW = new Date("2026-07-12T15:00:00.000Z");

describe("participant bank accounts", () => {
	let bindings: TestBindings;

	beforeEach(async () => {
		bindings = await createTestBindings();
		state.database = bindings.database;
		state.auth.mockReset();
		state.auth.mockResolvedValue({
			user: {
				displayName: "Administradora",
				id: "admin",
				participantId: null,
				role: "admin",
				username: "admin",
			},
		});
		await bindings.database.batch([
			bindings.database
				.prepare(
					`INSERT INTO app_users
					 (id, username, password_hash, display_name, participant_id, role, created_at, updated_at)
					 VALUES ('user_camila', 'camila', 'hash', 'Camila', 'participant_camila', 'user', ?, ?)`,
				)
				.bind(NOW.toISOString(), NOW.toISOString()),
			bindings.database
				.prepare("UPDATE participants SET email = ? WHERE id = 'participant_camila'")
				.bind("camila@example.com"),
		]);
	});

	afterEach(async () => {
		state.database = null;
		await bindings.dispose();
	});

	it("creates and replaces the participant's single bank account", async () => {
		const created = await upsertParticipantBankAccount(
			"participant_camila",
			{
				accountNumber: "001234",
				accountType: "Cuenta Vista",
				bankName: "Banco Estado",
				rut: "18.972.631-7",
			},
			bindings.database,
			NOW,
		);
		expect(created.ok && created.val.kind).toBe("updated");

		const updatedAt = new Date("2026-07-12T16:00:00.000Z");
		const replaced = await upsertParticipantBankAccount(
			"participant_camila",
			{
				accountNumber: "998877",
				accountType: "Cuenta Corriente",
				bankName: "Banco de Chile",
				rut: "18.972.631-7",
			},
			bindings.database,
			updatedAt,
		);
		expect(replaced.ok && replaced.val).toMatchObject({
			bankAccount: {
				accountNumber: "998877",
				createdAt: NOW.toISOString(),
				updatedAt: updatedAt.toISOString(),
			},
			kind: "updated",
		});
		const count = await bindings.database
			.prepare("SELECT COUNT(*) AS count FROM participant_bank_accounts")
			.first<{ count: number }>();
		expect(count?.count).toBe(1);
		const users = await listManagedUsers(bindings.database);
		expect(users.ok && users.val.find(({ id }) => id === "user_camila")?.bankAccount).toMatchObject(
			{
				accountNumber: "998877",
				bankName: "Banco de Chile",
			},
		);
	});

	it("resolves complete transfer details in single and batch reads", async () => {
		await upsertParticipantBankAccount(
			"participant_camila",
			{
				accountNumber: "001234",
				accountType: "Cuenta Vista",
				bankName: "Banco Estado",
				rut: "18.972.631-7",
			},
			bindings.database,
			NOW,
		);

		const detail = await findBankTransferDetails("participant_camila", bindings.database);
		expect(detail.ok && detail.val).toEqual({
			accountNumber: "001234",
			accountType: "Cuenta Vista",
			bankName: "Banco Estado",
			email: "camila@example.com",
			name: "Camila",
			participantId: "participant_camila",
			rut: "18.972.631-7",
		});
		const details = await findBankTransferDetailsByParticipantIds(
			["participant_camila", "participant_alvaro"],
			bindings.database,
		);
		expect(details.ok && Object.keys(details.val)).toEqual(["participant_camila"]);
	});

	it("rejects unmanaged participants and supports explicit removal", async () => {
		const missing = await upsertParticipantBankAccount(
			"participant_alvaro",
			{
				accountNumber: "123",
				accountType: "Cuenta de Ahorro",
				bankName: "Banco",
				rut: "18.972.631-7",
			},
			bindings.database,
			NOW,
		);
		expect(missing.ok && missing.val.kind).toBe("not_found");

		await upsertParticipantBankAccount(
			"participant_camila",
			{
				accountNumber: "123",
				accountType: "Cuenta de Ahorro",
				bankName: "Banco",
				rut: "18.972.631-7",
			},
			bindings.database,
			NOW,
		);
		const deleted = await deleteParticipantBankAccount("participant_camila", bindings.database);
		expect(deleted.ok && deleted.val.kind).toBe("deleted");
		const after = await findParticipantBankAccount("participant_camila", bindings.database);
		expect(after.ok && after.val).toBeNull();
	});

	it("protects the manager route and returns field validation errors", async () => {
		state.auth.mockResolvedValueOnce({
			user: {
				displayName: "Camila",
				id: "user_camila",
				participantId: "participant_camila",
				role: "user",
				username: "camila",
			},
		});
		const context = { params: Promise.resolve({ participantId: "participant_camila" }) };
		const forbidden = await putBankAccountRoute(
			new Request(
				"https://expenses.example/api/admin/participants/participant_camila/bank-account",
				{
					body: JSON.stringify({}),
					method: "PUT",
				},
			),
			context,
		);
		expect(forbidden.status).toBe(403);

		const invalid = await putBankAccountRoute(
			new Request(
				"https://expenses.example/api/admin/participants/participant_camila/bank-account",
				{
					body: JSON.stringify({
						accountNumber: "123",
						accountType: "Cuenta Vista",
						bankName: "Banco Estado",
						rut: "18.972.631-0",
					}),
					method: "PUT",
				},
			),
			context,
		);
		expect(invalid.status).toBe(400);
		expect(await invalid.json()).toMatchObject({ errors: { rut: ["Ingresa un RUT válido."] } });
	});

	it("creates and removes bank details through the manager route", async () => {
		const context = { params: Promise.resolve({ participantId: "participant_camila" }) };
		const saved = await putBankAccountRoute(
			new Request(
				"https://expenses.example/api/admin/participants/participant_camila/bank-account",
				{
					body: JSON.stringify({
						accountNumber: "001234",
						accountType: "Cuenta Vista",
						bankName: "Banco Estado",
						rut: "189726317",
					}),
					method: "PUT",
				},
			),
			context,
		);
		expect(saved.status).toBe(200);
		expect(await saved.json()).toMatchObject({
			bankAccount: { accountNumber: "001234", rut: "18.972.631-7" },
		});

		const removed = await deleteBankAccountRoute(
			new Request(
				"https://expenses.example/api/admin/participants/participant_camila/bank-account",
				{
					method: "DELETE",
				},
			),
			context,
		);
		expect(removed.status).toBe(204);
		expect(
			(await findParticipantBankAccount("participant_camila", bindings.database)).val,
		).toBeNull();
	});
});
