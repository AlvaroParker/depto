import type { DefaultSession } from "next-auth";

declare module "next-auth" {
	interface User {
		displayName: string;
		participantId: string | null;
		username: string;
	}

	interface Session {
		user: {
			displayName: string;
			id: string;
			participantId: string | null;
			username: string;
		} & DefaultSession["user"];
	}
}

declare module "next-auth/jwt" {
	interface JWT {
		displayName: string;
		participantId: string | null;
		username: string;
	}
}
