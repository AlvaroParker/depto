import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { databaseErrorResponse, unauthorizedResponse } from "@/lib/api/server";
import { getDashboardSummary } from "@/lib/db/dashboard";

export async function GET(): Promise<NextResponse> {
	const session = await auth();
	if (!session?.user) return unauthorizedResponse();
	const result = await getDashboardSummary({
		currentParticipantId: session.user.participantId,
	});
	if (result.err) return databaseErrorResponse();
	return NextResponse.json(result.val);
}
