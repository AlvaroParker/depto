import type { UserRole } from "@/lib/const/roles";
import type { OAuthScope } from "@/lib/types/oauth";

interface BaseActor {
	displayName: string;
	participantId: string | null;
	role: UserRole;
	userId: string;
	username: string;
}

export interface SessionActor extends BaseActor {
	source: "session";
}

export interface OAuthActor extends BaseActor {
	clientId: string;
	grantId: string;
	participantId: string;
	role: "user";
	scopes: ReadonlySet<OAuthScope>;
	source: "oauth";
}

export type AuthenticatedActor = SessionActor | OAuthActor;
