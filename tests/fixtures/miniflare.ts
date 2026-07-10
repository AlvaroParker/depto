import { readFile } from "node:fs/promises";
import path from "node:path";
import { Miniflare } from "miniflare";

export interface TestBindings {
	database: D1Database;
	dispose: () => Promise<void>;
	receipts: R2Bucket;
}

export async function createTestBindings(): Promise<TestBindings> {
	const miniflare = new Miniflare({
		compatibilityDate: "2026-07-09",
		d1Databases: { DB: crypto.randomUUID() },
		modules: true,
		r2Buckets: { RECEIPTS: crypto.randomUUID() },
		script: "export default { fetch() { return new Response('ok'); } }",
	});
	const database = await miniflare.getD1Database("DB");
	for (const migration of [
		"0001_initial.sql",
		"0002_seed_participants.sql",
		"0003_add_user_roles.sql",
	]) {
		const sql = await readFile(path.join(process.cwd(), "migrations", migration), "utf8");
		const statements = (
			migration === "0003_add_user_roles.sql" ? sql.split(/;\s*\n\s*\n/) : sql.split(";")
		)
			.map((statement) => statement.trim())
			.filter(Boolean)
			.map((statement) => database.prepare(statement));
		await database.batch(statements);
	}
	return {
		database,
		dispose: () => miniflare.dispose(),
		receipts: (await miniflare.getR2Bucket("RECEIPTS")) as unknown as R2Bucket,
	};
}
