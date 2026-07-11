import { readFile } from "node:fs/promises";
import path from "node:path";
import { Miniflare } from "miniflare";

export interface TestBindings {
	database: D1Database;
	dispose: () => Promise<void>;
	receipts: R2Bucket;
}

export async function applyMigrations(database: D1Database, migrations: string[]): Promise<void> {
	for (const migration of migrations) {
		const sql = await readFile(path.join(process.cwd(), "migrations", migration), "utf8");
		const statements = sql
			.split(migration === "0001_initial.sql" ? ";" : /;\s*\n\s*\n/)
			.map((statement) => statement.trim().replace(/;$/, ""))
			.filter(Boolean)
			.map((statement) => database.prepare(statement));
		await database.batch(statements);
	}
}

export async function createUnmigratedTestBindings(): Promise<TestBindings> {
	const miniflare = new Miniflare({
		compatibilityDate: "2026-07-09",
		d1Databases: { DB: crypto.randomUUID() },
		modules: true,
		r2Buckets: { RECEIPTS: crypto.randomUUID() },
		script: "export default { fetch() { return new Response('ok'); } }",
	});
	const database = await miniflare.getD1Database("DB");
	return {
		database,
		dispose: () => miniflare.dispose(),
		receipts: (await miniflare.getR2Bucket("RECEIPTS")) as unknown as R2Bucket,
	};
}

export async function createTestBindings(): Promise<TestBindings> {
	const bindings = await createUnmigratedTestBindings();
	await applyMigrations(bindings.database, [
		"0001_initial.sql",
		"0003_add_user_roles.sql",
		"0004_link_users_and_participants.sql",
		"0005_add_expense_kinds.sql",
		"0006_add_payment_proofs.sql",
	]);
	await bindings.database.batch(
		[
			["participant_alvaro", "Alvaro", "alvaro", 1],
			["participant_camila", "Camila", "camila", 2],
			["participant_trinidad", "Trinidad", "trinidad", 3],
		].map(([id, name, slug, sortOrder]) =>
			bindings.database
				.prepare(
					"INSERT INTO participants (id, name, slug, sort_order, active, created_at, updated_at) VALUES (?, ?, ?, ?, 1, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')",
				)
				.bind(id, name, slug, sortOrder),
		),
	);
	return bindings;
}
