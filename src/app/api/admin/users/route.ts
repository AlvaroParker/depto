import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { canManageUsers } from "@/lib/const/roles";
import {
	databaseErrorResponse,
	forbiddenResponse,
	unauthorizedResponse,
	validationErrorResponse,
} from "@/lib/api/server";
import { createManagedUser, findAppUserByUsername, listManagedUsers } from "@/lib/db/users";
import { CreateManagedUserInputSchema, type UserListResponse } from "@/lib/types/user";
import type { SessionUser } from "@/lib/types/user";

type ManagerAuthorization =
	{ allowed: false; response: Response } | { allowed: true; user: SessionUser };

async function authorizeManager(): Promise<ManagerAuthorization> {
	const session = await auth();
	if (!session?.user) return { allowed: false, response: unauthorizedResponse() };
	if (!canManageUsers(session.user.role)) {
		return { allowed: false, response: forbiddenResponse() };
	}
	return { allowed: true, user: session.user };
}

export async function GET(): Promise<Response> {
	const authorization = await authorizeManager();
	if (!authorization.allowed) return authorization.response;
	const users = await listManagedUsers();
	if (users.err) return databaseErrorResponse();
	return NextResponse.json<UserListResponse>({ users: users.val });
}

export async function POST(request: Request): Promise<Response> {
	const authorization = await authorizeManager();
	if (!authorization.allowed) return authorization.response;

	const body: unknown = await request.json().catch(() => null);
	const parsed = CreateManagedUserInputSchema.safeParse(body);
	if (!parsed.success) return validationErrorResponse(parsed.error);

	const created = await createManagedUser(parsed.data);
	if (created.err) {
		const existing = await findAppUserByUsername(parsed.data.username);
		if (existing.ok && existing.val) {
			return NextResponse.json(
				{ message: "Ese nombre de usuario ya está ocupado." },
				{ status: 409 },
			);
		}
		return databaseErrorResponse();
	}
	return NextResponse.json({ user: created.val }, { status: 201 });
}
