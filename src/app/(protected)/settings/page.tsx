import { KeyRound } from "lucide-react";
import Link from "next/link";
import { auth } from "@/auth";
import { canManageUsers } from "@/lib/const/roles";

export default async function SettingsPage() {
	const session = await auth();
	const canManage = session?.user ? canManageUsers(session.user.role) : false;
	return (
		<main className="px-5 py-8 sm:px-8 lg:px-12 lg:py-11">
			<div className="mx-auto max-w-3xl">
				<p className="text-accent text-xs font-bold tracking-[0.18em] uppercase">Ajustes</p>
				<h1 className="font-display mt-2 text-4xl font-semibold">La casa</h1>
				<p className="text-ink-muted mt-3">
					Cada gasto se divide entre las personas que participan en él.
				</p>
				{canManage ? (
					<Link
						className="border-line bg-paper hover:border-accent/35 mt-8 flex items-center gap-4 rounded-2xl border p-5 transition"
						href="/settings/users"
					>
						<span className="bg-accent/10 text-accent grid size-11 place-items-center rounded-2xl">
							<KeyRound aria-hidden size={21} />
						</span>
						<span>
							<strong className="block text-sm">Administrar usuarios</strong>
							<span className="text-ink-muted mt-1 block text-xs">
								Crea administradores y usuarios, o retira sus accesos.
							</span>
						</span>
					</Link>
				) : null}
			</div>
		</main>
	);
}
