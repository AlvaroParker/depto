import { NextResponse } from "next/server";
import { authenticateRequestActor } from "@/lib/auth/actor";
import {
	actorAuthenticationErrorResponse,
	databaseErrorResponse,
	forbiddenResponse,
} from "@/lib/api/server";
import { listOAuthGrantsForUser } from "@/lib/db/oauth";

export async function GET(request: Request) {
	const authenticated = await authenticateRequestActor(request, { allowBearer: false });
	if (authenticated.kind !== "authenticated")
		return actorAuthenticationErrorResponse(authenticated, request);
	if (authenticated.actor.role !== "user") return forbiddenResponse();
	const grants = await listOAuthGrantsForUser(authenticated.actor.userId);
	if (grants.err) return databaseErrorResponse();
	return NextResponse.json({ grants: grants.val });
}
