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
	});
});
