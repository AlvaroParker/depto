import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { databaseErrorResponse, unauthorizedResponse } from "@/lib/api/server";
import { findActiveParticipants } from "@/lib/db/participants";

export async function GET() {
	const session = await auth();
	if (!session?.user) return unauthorizedResponse();
	const result = await findActiveParticipants();
	if (result.err) return databaseErrorResponse();
	return NextResponse.json({ participants: result.val });
}
