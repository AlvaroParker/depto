import { authenticateRequestActor } from "@/lib/auth/actor";
import {
	actorAuthenticationErrorResponse,
	databaseErrorResponse,
	forbiddenResponse,
} from "@/lib/api/server";
import { revokeOAuthGrantForUser } from "@/lib/db/oauth";

interface GrantRouteContext {
	params: Promise<{ id: string }>;
}

export async function DELETE(request: Request, { params }: GrantRouteContext) {
	const authenticated = await authenticateRequestActor(request, { allowBearer: false });
	if (authenticated.kind !== "authenticated")
		return actorAuthenticationErrorResponse(authenticated, request);
	if (authenticated.actor.role !== "user") return forbiddenResponse();
	const revoked = await revokeOAuthGrantForUser((await params).id, authenticated.actor.userId);
	if (revoked.err) return databaseErrorResponse();
	if (!revoked.val)
		return Response.json({ message: "No encontramos esa conexión." }, { status: 404 });
	return new Response(null, { status: 204 });
}
