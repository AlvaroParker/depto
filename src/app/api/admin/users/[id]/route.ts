import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { canManageUsers } from "@/lib/const/roles";
import {
	databaseErrorResponse,
	forbiddenResponse,
	unauthorizedResponse,
	validationErrorResponse,
} from "@/lib/api/server";
import { disableManagedUser, updateManagedUser } from "@/lib/db/users";
import { UpdateManagedUserInputSchema, type ManagedUserResponse } from "@/lib/types/user";

interface UserRouteContext {
	params: Promise<{ id: string }>;
}

export async function PATCH(request: Request, { params }: UserRouteContext): Promise<Response> {
	const session = await auth();
	if (!session?.user) return unauthorizedResponse();
	if (!canManageUsers(session.user.role)) return forbiddenResponse();

	const body: unknown = await request.json().catch(() => null);
	const parsed = UpdateManagedUserInputSchema.safeParse(body);
	if (!parsed.success) return validationErrorResponse(parsed.error);

	const result = await updateManagedUser((await params).id, parsed.data);
	if (result.err) return databaseErrorResponse();
	if (result.val.kind === "not_found") {
		return NextResponse.json({ message: "No encontramos ese usuario." }, { status: 404 });
	}
	if (result.val.kind === "role_protected") {
		return NextResponse.json(
			{ message: "Solo puedes editar cuentas con rol Usuario." },
			{ status: 409 },
		);
	}
	if (result.val.kind === "username_taken") {
		return NextResponse.json(
			{ message: "Ese nombre de usuario ya está ocupado." },
			{ status: 409 },
		);
	}
	if (result.val.kind === "email_taken") {
		return NextResponse.json({ message: "Ese correo ya está ocupado." }, { status: 409 });
	}
	return NextResponse.json<ManagedUserResponse>({ user: result.val.user });
}

export async function DELETE(_request: Request, { params }: UserRouteContext): Promise<Response> {
	const session = await auth();
	if (!session?.user) return unauthorizedResponse();
	if (!canManageUsers(session.user.role)) return forbiddenResponse();

	const result = await disableManagedUser((await params).id, session.user.id);
	if (result.err) return databaseErrorResponse();
	if (result.val.kind === "not_found") {
		return NextResponse.json({ message: "No encontramos ese usuario." }, { status: 404 });
	}
	if (result.val.kind === "root_protected") {
		return NextResponse.json({ message: "El usuario root no se puede eliminar." }, { status: 409 });
	}
	if (result.val.kind === "self_protected") {
		return NextResponse.json({ message: "No puedes eliminar tu propia cuenta." }, { status: 409 });
	}
	return new Response(null, { status: 204 });
}
