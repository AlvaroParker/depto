import type { DefaultSession } from "next-auth";
import type { UserRole } from "@/lib/const/roles";

declare module "next-auth" {
	interface User {
		displayName: string;
		participantId: string | null;
		role: UserRole;
		username: string;
	}

	interface Session {
		user: {
			displayName: string;
			id: string;
			participantId: string | null;
			role: UserRole;
			username: string;
		} & DefaultSession["user"];
	}
}

declare module "next-auth/jwt" {
	interface JWT {
		displayName: string;
		participantId: string | null;
		role: UserRole;
		username: string;
	}
}
