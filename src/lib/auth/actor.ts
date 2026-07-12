import "server-only";

import { auth } from "@/auth";
import { findAccessTokenPrincipal } from "@/lib/db/oauth";
import { sha256Base64Url } from "@/lib/oauth/crypto";
import { getOAuthOrigin } from "@/lib/oauth/metadata";
import type { AuthenticatedActor } from "@/lib/types/actor";
import type { OAuthScope } from "@/lib/types/oauth";

export type ActorAuthenticationResult =
	| { actor: AuthenticatedActor; kind: "authenticated" }
	| { kind: "forbidden"; requiredScope: OAuthScope }
	| { kind: "storage_error" }
	| { kind: "unauthenticated" };

export async function authenticateRequestActor(
	request: Request,
	options: { allowBearer?: boolean; requiredScope?: OAuthScope } = {},
): Promise<ActorAuthenticationResult> {
	const authorization = request.headers.get("authorization");
	if (authorization !== null) {
		if (options.allowBearer === false) return { kind: "unauthenticated" };
		const matched = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(authorization);
		if (!matched) return { kind: "unauthenticated" };
		let resource: string;
		try {
			resource = getOAuthOrigin(request);
		} catch {
			return { kind: "storage_error" };
		}
		const principal = await findAccessTokenPrincipal(await sha256Base64Url(matched[1]), resource);
		if (principal.err) return { kind: "storage_error" };
		if (!principal.val) return { kind: "unauthenticated" };
		if (options.requiredScope && !principal.val.scopes.includes(options.requiredScope)) {
			return { kind: "forbidden", requiredScope: options.requiredScope };
		}
		return {
			actor: {
				clientId: principal.val.clientId,
				displayName: principal.val.displayName,
				grantId: principal.val.grantId,
				participantId: principal.val.participantId,
				role: "user",
				scopes: new Set(principal.val.scopes),
				source: "oauth",
				userId: principal.val.userId,
				username: principal.val.username,
			},
			kind: "authenticated",
		};
	}
	const session = await auth();
	if (!session?.user) return { kind: "unauthenticated" };
	return {
		actor: {
			displayName: session.user.displayName,
			participantId: session.user.participantId,
			role: session.user.role,
			source: "session",
			userId: session.user.id,
			username: session.user.username,
		},
		kind: "authenticated",
	};
}
