import type { OAuthScope } from "@/lib/types/oauth";

export const AUTHORIZATION_CODE_TTL_SECONDS = 5 * 60;
export const ACCESS_TOKEN_TTL_SECONDS = 60 * 60;
export const REFRESH_TOKEN_TTL_SECONDS = 90 * 24 * 60 * 60;
export const LAST_USE_WRITE_INTERVAL_SECONDS = 60 * 60;
export const OAUTH_CREDENTIAL_BYTES = 32;

export const OAUTH_SCOPES = [
	"expenses:read",
	"expenses:write",
	"reimbursements:write",
	"offline_access",
] as const satisfies readonly OAuthScope[];

export const DEFAULT_OAUTH_SCOPE: OAuthScope = "expenses:read";
