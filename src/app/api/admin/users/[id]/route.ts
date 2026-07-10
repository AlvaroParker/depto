import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { canManageUsers } from "@/lib/const/roles";
import { databaseErrorResponse, forbiddenResponse, unauthorizedResponse } from "@/lib/api/server";
import { disableManagedUser } from "@/lib/db/users";

interface UserRouteContext {
	params: Promise<{ id: string }>;
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
