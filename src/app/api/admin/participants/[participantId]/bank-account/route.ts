import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
	databaseErrorResponse,
	forbiddenResponse,
	unauthorizedResponse,
	validationErrorResponse,
} from "@/lib/api/server";
import { canManageUsers } from "@/lib/const/roles";
import { deleteParticipantBankAccount, upsertParticipantBankAccount } from "@/lib/db/bank-accounts";
import {
	ParticipantBankAccountInputSchema,
	type ParticipantBankAccountResponse,
} from "@/lib/types/bank-account";

interface BankAccountRouteContext {
	params: Promise<{ participantId: string }>;
}

async function authorizeManager(): Promise<Response | null> {
	const session = await auth();
	if (!session?.user) return unauthorizedResponse();
	if (!canManageUsers(session.user.role)) return forbiddenResponse();
	return null;
}

export async function PUT(
	request: Request,
	{ params }: BankAccountRouteContext,
): Promise<Response> {
	const denied = await authorizeManager();
	if (denied) return denied;

	const body: unknown = await request.json().catch(() => null);
	const parsed = ParticipantBankAccountInputSchema.safeParse(body);
	if (!parsed.success) return validationErrorResponse(parsed.error);

	const result = await upsertParticipantBankAccount((await params).participantId, parsed.data);
	if (result.err) return databaseErrorResponse();
	if (result.val.kind === "not_found") {
		return NextResponse.json({ message: "No encontramos ese participante." }, { status: 404 });
	}
	return NextResponse.json<ParticipantBankAccountResponse>({
		bankAccount: result.val.bankAccount,
	});
}

export async function DELETE(
	_request: Request,
	{ params }: BankAccountRouteContext,
): Promise<Response> {
	const denied = await authorizeManager();
	if (denied) return denied;

	const result = await deleteParticipantBankAccount((await params).participantId);
	if (result.err) return databaseErrorResponse();
	if (result.val.kind === "not_found") {
		return NextResponse.json({ message: "No encontramos ese participante." }, { status: 404 });
	}
	return new Response(null, { status: 204 });
}
