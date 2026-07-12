import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
	databaseErrorResponse,
	forbiddenResponse,
	unauthorizedResponse,
	validationErrorResponse,
} from "@/lib/api/server";
import { canManageUsers } from "@/lib/const/roles";
import {
	createHouseholdInformation,
	listHouseholdInformation,
} from "@/lib/db/household-information";
import {
	HouseholdInformationInputSchema,
	type HouseholdInformationListResponse,
	type HouseholdInformationResponse,
} from "@/lib/types/household-information";

export async function GET(): Promise<Response> {
	const session = await auth();
	if (!session?.user) return unauthorizedResponse();
	const result = await listHouseholdInformation();
	if (result.err) return databaseErrorResponse();
	return NextResponse.json<HouseholdInformationListResponse>({ items: result.val });
}

export async function POST(request: Request): Promise<Response> {
	const session = await auth();
	if (!session?.user) return unauthorizedResponse();
	if (!canManageUsers(session.user.role)) return forbiddenResponse();
	const body: unknown = await request.json().catch(() => null);
	const parsed = HouseholdInformationInputSchema.safeParse(body);
	if (!parsed.success) return validationErrorResponse(parsed.error);
	const result = await createHouseholdInformation(parsed.data, session.user.id);
	if (result.err) return databaseErrorResponse();
	return NextResponse.json<HouseholdInformationResponse>({ item: result.val }, { status: 201 });
}
