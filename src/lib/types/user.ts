export interface AppUser {
	id: string;
	username: string;
	passwordHash: string;
	displayName: string;
	participantId: string | null;
	disabledAt: string | null;
}

export interface SessionUser {
	id: string;
	username: string;
	displayName: string;
	participantId: string | null;
}

export type LoginAttemptScope = "username" | "ip";

export interface LoginAttempt {
	scope: LoginAttemptScope;
	keyHash: string;
	attemptCount: number;
	windowStartedAt: string;
	lockedUntil: string | null;
	updatedAt: string;
}
