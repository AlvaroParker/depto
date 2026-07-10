import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";
import { SESSION_MAX_AGE_SECONDS } from "@/lib/const/auth";
import { isUserRole } from "@/lib/const/roles";
import { authenticateCredentials } from "@/lib/auth/authenticate";
import { findAppUserById } from "@/lib/db/users";
import { getClientAddress } from "@/lib/util/request";

const signInSchema = z.object({
	password: z.string().min(8).max(128),
	username: z.string().trim().min(3).max(32),
});

export const { auth, handlers, signIn, signOut } = NextAuth({
	callbacks: {
		async jwt({ token, user }) {
			if (user) {
				token.displayName = user.displayName;
				token.participantId = user.participantId;
				token.role = user.role;
				token.username = user.username;
				return token;
			}

			if (!token.sub) return null;
			const currentUser = await findAppUserById(token.sub);
			if (currentUser.err || !currentUser.val || currentUser.val.disabledAt) return null;
			token.displayName = currentUser.val.displayName;
			token.participantId = currentUser.val.participantId;
			token.role = currentUser.val.role;
			token.username = currentUser.val.username;
			return token;
		},
		session({ session, token }) {
			session.user.id = token.sub ?? "";
			session.user.displayName =
				typeof token.displayName === "string" ? token.displayName : (session.user.name ?? "");
			session.user.participantId =
				typeof token.participantId === "string" ? token.participantId : null;
			session.user.role = isUserRole(token.role) ? token.role : "user";
			session.user.username = typeof token.username === "string" ? token.username : "";
			return session;
		},
	},
	pages: { signIn: "/login" },
	providers: [
		Credentials({
			credentials: {
				password: { label: "Contraseña", type: "password" },
				username: { label: "Usuario", type: "text" },
			},
			async authorize(credentials, request) {
				const parsed = signInSchema.safeParse(credentials);
				if (!parsed.success) return null;
				const result = await authenticateCredentials({
					clientAddress: getClientAddress(request),
					password: parsed.data.password,
					username: parsed.data.username,
				});
				if (result.err) {
					console.error("Credentials authentication failed because storage is unavailable.");
					return null;
				}
				if (!result.val) return null;
				return {
					displayName: result.val.displayName,
					id: result.val.id,
					name: result.val.displayName,
					participantId: result.val.participantId,
					role: result.val.role,
					username: result.val.username,
				};
			},
		}),
	],
	secret: process.env.AUTH_SECRET,
	session: { maxAge: SESSION_MAX_AGE_SECONDS, strategy: "jwt" },
	trustHost: true,
	useSecureCookies: process.env.NEXTJS_ENV !== "development",
});
