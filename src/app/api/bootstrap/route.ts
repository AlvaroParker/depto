import { NextResponse } from "next/server";
import { databaseErrorResponse, validationErrorResponse } from "@/lib/api/server";
import { createRootUser, findAppUserByUsername, hasRootUser } from "@/lib/db/users";
import { BootstrapRootInputSchema, type BootstrapStatus } from "@/lib/types/user";

export async function GET(): Promise<Response> {
	const root = await hasRootUser();
	if (root.err) return databaseErrorResponse();
	return NextResponse.json<BootstrapStatus>({ needsBootstrap: !root.val });
}

export async function POST(request: Request): Promise<Response> {
	const root = await hasRootUser();
	if (root.err) return databaseErrorResponse();
	if (root.val) {
		return NextResponse.json(
			{ message: "La configuración inicial ya fue completada." },
			{ status: 409 },
		);
	}

	const body: unknown = await request.json().catch(() => null);
	const parsed = BootstrapRootInputSchema.safeParse(body);
	if (!parsed.success) return validationErrorResponse(parsed.error);

	const created = await createRootUser(parsed.data);
	if (created.err) {
		const [rootAfterFailure, existingUsername] = await Promise.all([
			hasRootUser(),
			findAppUserByUsername(parsed.data.username),
		]);
		if (rootAfterFailure.ok && rootAfterFailure.val) {
			return NextResponse.json(
				{ message: "La configuración inicial ya fue completada." },
				{ status: 409 },
			);
		}
		if (existingUsername.ok && existingUsername.val) {
			return NextResponse.json(
				{ message: "Ese nombre de usuario ya está ocupado." },
				{ status: 409 },
			);
		}
		return databaseErrorResponse();
	}

	return NextResponse.json({ user: created.val }, { status: 201 });
}
