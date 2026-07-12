import { NextResponse } from "next/server";
import { authenticateRequestActor } from "@/lib/auth/actor";
import { actorAuthenticationErrorResponse, databaseErrorResponse } from "@/lib/api/server";
import { findActiveParticipants } from "@/lib/db/participants";

export async function GET(request: Request) {
	const authenticated = await authenticateRequestActor(request, { requiredScope: "expenses:read" });
	if (authenticated.kind !== "authenticated")
		return actorAuthenticationErrorResponse(authenticated, request);
	const result = await findActiveParticipants();
	if (result.err) return databaseErrorResponse();
	return NextResponse.json({ participants: result.val });
}
