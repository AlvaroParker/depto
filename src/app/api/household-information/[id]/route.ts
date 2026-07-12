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
	archiveHouseholdInformation,
	updateHouseholdInformation,
} from "@/lib/db/household-information";
import {
	HouseholdInformationInputSchema,
	type HouseholdInformationResponse,
} from "@/lib/types/household-information";

interface HouseholdInformationRouteContext {
	params: Promise<{ id: string }>;
}

export async function PATCH(
	request: Request,
	{ params }: HouseholdInformationRouteContext,
): Promise<Response> {
	const session = await auth();
	if (!session?.user) return unauthorizedResponse();
	if (!canManageUsers(session.user.role)) return forbiddenResponse();
	const body: unknown = await request.json().catch(() => null);
	const parsed = HouseholdInformationInputSchema.safeParse(body);
	if (!parsed.success) return validationErrorResponse(parsed.error);
	const result = await updateHouseholdInformation((await params).id, parsed.data, session.user.id);
	if (result.err) return databaseErrorResponse();
	if (result.val.kind === "not_found") {
		return NextResponse.json({ message: "No encontramos ese dato de la casa." }, { status: 404 });
	}
	return NextResponse.json<HouseholdInformationResponse>({ item: result.val.item });
}

export async function DELETE(
	_request: Request,
	{ params }: HouseholdInformationRouteContext,
): Promise<Response> {
	const session = await auth();
	if (!session?.user) return unauthorizedResponse();
	if (!canManageUsers(session.user.role)) return forbiddenResponse();
	const result = await archiveHouseholdInformation((await params).id, session.user.id);
	if (result.err) return databaseErrorResponse();
	if (result.val.kind === "not_found") {
		return NextResponse.json({ message: "No encontramos ese dato de la casa." }, { status: 404 });
	}
	return new Response(null, { status: 204 });
}
