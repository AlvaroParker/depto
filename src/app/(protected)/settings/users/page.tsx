import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { UserManagement } from "@/components/settings/user-management";
import { canManageUsers } from "@/lib/const/roles";
import { listManagedUsers } from "@/lib/db/users";

export const metadata: Metadata = { title: "Administrar usuarios" };

export default async function UsersPage() {
	const session = await auth();
	if (!session?.user) redirect("/login");
	if (!canManageUsers(session.user.role)) redirect("/settings");
	const users = await listManagedUsers();
	if (users.err) throw new Error("Could not load users.");

	return (
		<main className="px-4 py-7 sm:px-7 lg:px-12 lg:py-11">
			<div className="mx-auto max-w-6xl">
				<p className="text-accent text-xs font-bold tracking-[0.18em] uppercase">
					Control de acceso
				</p>
				<h1 className="font-display mt-2 text-4xl font-semibold tracking-[-0.035em] sm:text-5xl">
					Las llaves de la casa.
				</h1>
				<p className="text-ink-muted mt-3 max-w-2xl text-sm leading-6">
					Crea administradores y usuarios. Al eliminar un acceso, sus registros financieros
					permanecen intactos.
				</p>
				<UserManagement currentUserId={session.user.id} initialUsers={users.val} />
			</div>
		</main>
	);
}
