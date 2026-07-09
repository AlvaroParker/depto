import { spawnSync } from "node:child_process";
import { hashPassword } from "../src/lib/util/password";

const users = [
	{
		displayName: "Alvaro",
		id: "user_alvaro",
		participantId: "participant_alvaro",
		passwordVariable: "SEED_PASSWORD_ALVARO",
		username: "alvaro",
	},
	{
		displayName: "Camila",
		id: "user_camila",
		participantId: "participant_camila",
		passwordVariable: "SEED_PASSWORD_CAMILA",
		username: "camila",
	},
	{
		displayName: "Trinidad",
		id: "user_trinidad",
		participantId: "participant_trinidad",
		passwordVariable: "SEED_PASSWORD_TRINIDAD",
		username: "trinidad",
	},
] as const;

function sqlValue(value: string): string {
	return `'${value.replaceAll("'", "''")}'`;
}

async function main(): Promise<void> {
	const mode = process.argv.includes("--remote") ? "--remote" : "--local";
	const now = new Date().toISOString();
	const passwordEntries = users.map((user) => {
		const password = process.env[user.passwordVariable];
		if (!password || password.length < 12 || password.length > 128) {
			throw new Error(`${user.passwordVariable} must contain between 12 and 128 characters.`);
		}
		return { password, user };
	});
	const hashes = await Promise.all(passwordEntries.map(({ password }) => hashPassword(password)));
	const values = passwordEntries
		.map(({ user }, index) =>
			[user.id, user.username, hashes[index], user.displayName, user.participantId, now, now]
				.map(sqlValue)
				.join(", "),
		)
		.map((row) => `(${row}, NULL)`)
		.join(",\n");
	const sql = `
INSERT INTO app_users
  (id, username, password_hash, display_name, participant_id, created_at, updated_at, disabled_at)
VALUES
  ${values}
ON CONFLICT(username) DO UPDATE SET
  password_hash = excluded.password_hash,
  display_name = excluded.display_name,
  participant_id = excluded.participant_id,
  updated_at = excluded.updated_at,
  disabled_at = NULL;
`;
	const command = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
	const result = spawnSync(
		command,
		["wrangler", "d1", "execute", "expenses-db", mode, "--command", sql],
		{ stdio: "inherit" },
	);
	if (result.status !== 0) process.exit(result.status ?? 1);
	process.stdout.write(`Seeded ${users.length} application users (${mode.slice(2)}).\n`);
}

void main();
