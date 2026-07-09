import "server-only";

import { Err, Ok, type Result } from "ts-results";

export interface DbError {
	kind: "database";
	cause: unknown;
}

export async function safeDbCall<T>(operation: () => Promise<T>): Promise<Result<T, DbError>> {
	try {
		return Ok(await operation());
	} catch (cause) {
		return Err({ cause, kind: "database" });
	}
}
