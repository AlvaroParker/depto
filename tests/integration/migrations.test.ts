import { afterEach, describe, expect, it } from "vitest";
import {
	applyMigrations,
	createUnmigratedTestBindings,
	type TestBindings,
} from "../fixtures/miniflare";

describe("production user-participant migration", () => {
	let bindings: TestBindings | undefined;

	afterEach(async () => bindings?.dispose());

	it("backfills regular users, unlinks privileged users, and preserves historical expenses", async () => {
		bindings = await createUnmigratedTestBindings();
		await applyMigrations(bindings.database, ["0001_initial.sql", "0003_add_user_roles.sql"]);
		const timestamp = "2026-07-09T00:00:00.000Z";
		await bindings.database.batch([
			bindings.database
				.prepare(
					"INSERT INTO participants (id, name, slug, sort_order, active, created_at, updated_at) VALUES ('legacy-root-participant', 'Legacy root', 'legacy-root', 1, 1, ?, ?)",
				)
				.bind(timestamp, timestamp),
			bindings.database
				.prepare(
					"INSERT INTO participants (id, name, slug, sort_order, active, created_at, updated_at) VALUES ('linked-user-participant', 'Old name', 'linked-user', 2, 1, ?, ?)",
				)
				.bind(timestamp, timestamp),
			bindings.database
				.prepare(
					"INSERT INTO app_users (id, username, password_hash, display_name, participant_id, role, created_at, updated_at) VALUES ('root', 'root', 'hash', 'Root', 'legacy-root-participant', 'root', ?, ?)",
				)
				.bind(timestamp, timestamp),
			bindings.database
				.prepare(
					"INSERT INTO app_users (id, username, password_hash, display_name, participant_id, role, created_at, updated_at) VALUES ('linked-user', 'linked', 'hash', 'Linked name', 'linked-user-participant', 'user', ?, ?)",
				)
				.bind(timestamp, timestamp),
			bindings.database
				.prepare(
					"INSERT INTO app_users (id, username, password_hash, display_name, participant_id, role, created_at, updated_at) VALUES ('missing-user', 'missing', 'hash', 'Missing link', NULL, 'user', ?, ?)",
				)
				.bind(timestamp, timestamp),
			bindings.database
				.prepare(
					"INSERT INTO expenses (id, name, amount_minor, currency, expense_date, paid_by_participant_id, created_by_user_id, created_at, updated_at) VALUES ('legacy-expense', 'Legacy', 1000, 'CLP', '2026-07-09', 'legacy-root-participant', 'root', ?, ?)",
				)
				.bind(timestamp, timestamp),
		]);

		await applyMigrations(bindings.database, ["0004_link_users_and_participants.sql"]);

		const users = await bindings.database
			.prepare("SELECT id, participant_id FROM app_users ORDER BY id")
			.all<{ id: string; participant_id: string | null }>();
		expect(users.results).toEqual([
			{ id: "linked-user", participant_id: "linked-user-participant" },
			{ id: "missing-user", participant_id: "participant-user-missing-user" },
			{ id: "root", participant_id: null },
		]);
		const participants = await bindings.database
			.prepare("SELECT id, name, active FROM participants ORDER BY sort_order")
			.all<{ active: number; id: string; name: string }>();
		expect(participants.results).toEqual([
			{ active: 0, id: "legacy-root-participant", name: "Legacy root" },
			{ active: 1, id: "linked-user-participant", name: "Linked name" },
			{ active: 1, id: "participant-user-missing-user", name: "Missing link" },
		]);
		const expense = await bindings.database
			.prepare("SELECT paid_by_participant_id FROM expenses WHERE id = 'legacy-expense'")
			.first<{ paid_by_participant_id: string }>();
		expect(expense?.paid_by_participant_id).toBe("legacy-root-participant");
		await expect(
			bindings.database
				.prepare(
					"INSERT INTO app_users (id, username, password_hash, display_name, participant_id, role, created_at, updated_at) VALUES ('invalid-user', 'invalid-user', 'hash', 'Invalid', NULL, 'user', ?, ?)",
				)
				.bind(timestamp, timestamp)
				.run(),
		).rejects.toThrow(/regular users require a participant/i);
		await expect(
			bindings.database
				.prepare(
					"INSERT INTO app_users (id, username, password_hash, display_name, participant_id, role, created_at, updated_at) VALUES ('invalid-admin', 'invalid-admin', 'hash', 'Invalid', 'linked-user-participant', 'admin', ?, ?)",
				)
				.bind(timestamp, timestamp)
				.run(),
		).rejects.toThrow(/privileged users cannot have one/i);

		await applyMigrations(bindings.database, ["0005_add_expense_kinds.sql"]);
		const kinds = await bindings.database
			.prepare("SELECT name, icon_key FROM expense_kinds ORDER BY sort_order")
			.all<{ icon_key: string; name: string }>();
		expect(kinds.results).toHaveLength(17);
		expect(kinds.results[0]).toEqual({ icon_key: "house", name: "Arriendo" });
		expect(kinds.results.at(-1)).toEqual({ icon_key: "other", name: "Otros" });
		const categorizedExpense = await bindings.database
			.prepare("SELECT kind_id FROM expenses WHERE id = 'legacy-expense'")
			.first<{ kind_id: string }>();
		expect(categorizedExpense?.kind_id).toBe("kind-other");
		await expect(
			bindings.database
				.prepare("UPDATE expenses SET kind_id = NULL WHERE id = 'legacy-expense'")
				.run(),
		).rejects.toThrow(/expenses require a kind/i);

		await applyMigrations(bindings.database, ["0006_add_payment_proofs.sql"]);
		const proofTable = await bindings.database
			.prepare(
				"SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'expense_share_payment_proofs'",
			)
			.first<{ name: string }>();
		expect(proofTable?.name).toBe("expense_share_payment_proofs");

		await applyMigrations(bindings.database, ["0007_add_participant_emails.sql"]);
		await bindings.database
			.prepare("UPDATE participants SET email = 'linked@example.com' WHERE id = ?")
			.bind("linked-user-participant")
			.run();
		await expect(
			bindings.database
				.prepare("UPDATE participants SET email = 'linked@example.com' WHERE id = ?")
				.bind("participant-user-missing-user")
				.run(),
		).rejects.toThrow(/unique constraint/i);
		const legacyEmail = await bindings.database
			.prepare("SELECT email FROM participants WHERE id = 'legacy-root-participant'")
			.first<{ email: string | null }>();
		expect(legacyEmail?.email).toBeNull();

		await applyMigrations(bindings.database, ["0008_add_expense_split_modes.sql"]);
		const migratedExpense = await bindings.database
			.prepare("SELECT split_mode FROM expenses WHERE id = 'legacy-expense'")
			.first<{ split_mode: string }>();
		expect(migratedExpense?.split_mode).toBe("equal");
		await expect(
			bindings.database
				.prepare("UPDATE expenses SET split_mode = 'invalid' WHERE id = 'legacy-expense'")
				.run(),
		).rejects.toThrow(/check constraint/i);

		await applyMigrations(bindings.database, ["0009_add_household_information.sql"]);
		const householdTables = await bindings.database
			.prepare(
				"SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'household_information_%' ORDER BY name",
			)
			.all<{ name: string }>();
		expect(householdTables.results.map(({ name }) => name)).toEqual([
			"household_information_fields",
			"household_information_items",
		]);

		await applyMigrations(bindings.database, ["0010_add_oauth_mcp.sql"]);
		const oauthTables = await bindings.database
			.prepare(
				`SELECT name FROM sqlite_master
				 WHERE type = 'table' AND (name LIKE 'oauth_%' OR name = 'mcp_idempotency_records')
				 ORDER BY name`,
			)
			.all<{ name: string }>();
		expect(oauthTables.results.map(({ name }) => name)).toEqual([
			"mcp_idempotency_records",
			"oauth_access_tokens",
			"oauth_authorization_codes",
			"oauth_clients",
			"oauth_grants",
			"oauth_rate_limits",
			"oauth_refresh_tokens",
		]);
	});
});
