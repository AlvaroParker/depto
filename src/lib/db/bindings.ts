import "server-only";

import { getCloudflareContext } from "@opennextjs/cloudflare";

export interface AppBindings {
	APP_BASE_URL: string;
	DB: D1Database;
	RECEIPTS: R2Bucket;
	RESEND_API_KEY: string;
	RESEND_FROM_EMAIL: string;
}

export function getBindings(): AppBindings {
	const { env } = getCloudflareContext();
	return {
		APP_BASE_URL: env.APP_BASE_URL,
		DB: env.DB,
		RECEIPTS: env.RECEIPTS,
		RESEND_API_KEY: env.RESEND_API_KEY,
		RESEND_FROM_EMAIL: env.RESEND_FROM_EMAIL,
	};
}

export function getDatabase(): D1Database {
	return getBindings().DB;
}
