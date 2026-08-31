import { NextResponse } from "next/server";
import {
	actorAuthenticationErrorResponse,
	databaseErrorResponse,
	forbiddenResponse,
	validationErrorResponse,
} from "@/lib/api/server";
import { authenticateRequestActor } from "@/lib/auth/actor";
import { clearTelegramUserIdForUser, setTelegramUserIdForUser } from "@/lib/db/telegram";
import type { ApiError } from "@/lib/types/api";
import { TelegramUserIdInputSchema, type TelegramUserIdResponse } from "@/lib/types/telegram";

type TelegramPutResponse = NextResponse<ApiError> | NextResponse<TelegramUserIdResponse>;
type TelegramDeleteResponse = NextResponse<ApiError> | Response;

function notFoundResponse(): NextResponse<ApiError> {
	return NextResponse.json({ message: "No encontramos tu cuenta." }, { status: 404 });
}

export async function PUT(request: Request): Promise<TelegramPutResponse> {
	const authenticated = await authenticateRequestActor(request, { allowBearer: false });
	if (authenticated.kind !== "authenticated") {
		return actorAuthenticationErrorResponse(authenticated, request);
	}
	if (authenticated.actor.role !== "user") return forbiddenResponse();

	const body: unknown = await request.json().catch(() => null);
	const parsed = TelegramUserIdInputSchema.safeParse(body);
	if (!parsed.success) return validationErrorResponse(parsed.error);

	const saved = await setTelegramUserIdForUser(
		authenticated.actor.userId,
		parsed.data.telegramUserId,
	);
	if (saved.err) return databaseErrorResponse();
	if (saved.val.kind === "not_found") return notFoundResponse();
	if (saved.val.kind === "telegram_user_id_taken") {
		const message = "Ese ID de Telegram ya está configurado en otra cuenta.";
		return NextResponse.json<ApiError>(
			{
				code: "TELEGRAM_USER_ID_TAKEN",
				errors: { telegramUserId: [message] },
				message,
			},
			{ status: 409 },
		);
	}
	return NextResponse.json<TelegramUserIdResponse>({ telegramUserId: saved.val.telegramUserId });
}

export async function DELETE(request: Request): Promise<TelegramDeleteResponse> {
	const authenticated = await authenticateRequestActor(request, { allowBearer: false });
	if (authenticated.kind !== "authenticated") {
		return actorAuthenticationErrorResponse(authenticated, request);
	}
	if (authenticated.actor.role !== "user") return forbiddenResponse();

	const cleared = await clearTelegramUserIdForUser(authenticated.actor.userId);
	if (cleared.err) return databaseErrorResponse();
	if (cleared.val.kind === "not_found") return notFoundResponse();
	return new Response(null, { status: 204 });
}
