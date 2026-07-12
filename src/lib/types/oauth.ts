import { z } from "zod";

export const OAuthScopeSchema = z.enum([
	"expenses:read",
	"expenses:write",
	"reimbursements:write",
	"offline_access",
]);

export type OAuthScope = z.infer<typeof OAuthScopeSchema>;

export interface OAuthClient {
	clientSecretHash: string | null;
	createdAt: string;
	grantTypes: ("authorization_code" | "refresh_token")[];
	id: string;
	lastUsedAt: string | null;
	name: string;
	redirectUris: string[];
	responseTypes: ["code"];
	revokedAt: string | null;
	tokenEndpointAuthMethod: "none" | "client_secret_post";
}

export interface OAuthGrantSummary {
	clientName: string;
	createdAt: string;
	id: string;
	lastUsedAt: string | null;
	scopes: OAuthScope[];
}

export interface OAuthAccessTokenPrincipal {
	clientId: string;
	grantId: string;
	participantId: string;
	resource: string;
	role: "user";
	scopes: OAuthScope[];
	userId: string;
	username: string;
	displayName: string;
}
