import "server-only";

import { getCloudflareContext } from "@opennextjs/cloudflare";

export interface AppBindings {
	DB: D1Database;
	RECEIPTS: R2Bucket;
}

export function getBindings(): AppBindings {
	const { env } = getCloudflareContext();
	return { DB: env.DB, RECEIPTS: env.RECEIPTS };
}

export function getDatabase(): D1Database {
	return getBindings().DB;
}
