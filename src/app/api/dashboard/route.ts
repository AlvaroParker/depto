import { NextResponse } from "next/server";
import { authenticateRequestActor } from "@/lib/auth/actor";
import { actorAuthenticationErrorResponse, databaseErrorResponse } from "@/lib/api/server";
import { getDashboardSummary } from "@/lib/db/dashboard";

export async function GET(request: Request): Promise<NextResponse> {
	const authenticated = await authenticateRequestActor(request, { requiredScope: "expenses:read" });
	if (authenticated.kind !== "authenticated")
		return actorAuthenticationErrorResponse(authenticated, request);
	const result = await getDashboardSummary({
		currentParticipantId: authenticated.actor.participantId,
	});
	if (result.err) return databaseErrorResponse();
	return NextResponse.json(result.val);
}
