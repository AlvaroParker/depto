import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	deleteParticipantBankAccount,
	findBankTransferDetails,
	findBankTransferDetailsByParticipantIds,
	findParticipantBankAccount,
	upsertParticipantBankAccount,
} from "@/lib/db/bank-accounts";
import { createTestBindings, type TestBindings } from "../fixtures/miniflare";

const NOW = new Date("2026-07-12T15:00:00.000Z");

describe("participant bank accounts", () => {
	let bindings: TestBindings;

	beforeEach(async () => {
		bindings = await createTestBindings();
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

	afterEach(async () => bindings.dispose());

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
});
