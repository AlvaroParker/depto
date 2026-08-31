import { KeyRound, Tags } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@/auth";
import { ConnectedApplications } from "@/components/settings/connected-applications";
import { TelegramAccountSettings } from "@/components/settings/telegram-account-settings";
import { canManageUsers } from "@/lib/const/roles";
import { listOAuthGrantsForUser } from "@/lib/db/oauth";
import { findTelegramUserIdForUser } from "@/lib/db/telegram";
import type { OAuthGrantSummary } from "@/lib/types/oauth";

export const metadata: Metadata = { title: "Ajustes" };

export default async function SettingsPage() {
	const session = await auth();
	const canManage = session?.user ? canManageUsers(session.user.role) : false;
	let grants: OAuthGrantSummary[] = [];
	let telegramUserId: string | null = null;
	if (session?.user.role === "user") {
		const [grantsResult, telegramResult] = await Promise.all([
			listOAuthGrantsForUser(session.user.id),
			findTelegramUserIdForUser(session.user.id),
		]);
		grants = grantsResult.ok ? grantsResult.val : [];
		if (telegramResult.err || telegramResult.val.kind === "not_found") {
			throw new Error("Could not load the Telegram profile setting.");
		}
		telegramUserId = telegramResult.val.telegramUserId;
	}
	return (
		<main className="px-5 py-8 sm:px-8 lg:px-12 lg:py-11">
			<div className="mx-auto max-w-3xl">
				<p className="text-accent text-xs font-bold tracking-[0.18em] uppercase">Ajustes</p>
				<h1 className="font-display mt-2 text-4xl font-semibold">
					{canManage ? "La casa" : "Tu cuenta"}
				</h1>
				<p className="text-ink-muted mt-3">
					{canManage
						? "Cada gasto se divide entre las personas que participan en él."
						: "Administra tus datos personales y las aplicaciones que pueden acceder a tu cuenta."}
				</p>
				{canManage ? (
					<div className="mt-8 grid gap-4 sm:grid-cols-2">
						<Link
							className="border-line bg-paper hover:border-accent/35 flex items-center gap-4 rounded-2xl border p-5 transition"
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
						<Link
							className="border-line bg-paper hover:border-accent/35 flex items-center gap-4 rounded-2xl border p-5 transition"
							href="/settings/categories"
						>
							<span className="bg-positive/10 text-positive-strong grid size-11 place-items-center rounded-2xl">
								<Tags aria-hidden size={21} />
							</span>
							<span>
								<strong className="block text-sm">Administrar categorías</strong>
								<span className="text-ink-muted mt-1 block text-xs">
									Crea categorías y elige sus iconos.
								</span>
							</span>
						</Link>
					</div>
				) : null}
				{session?.user.role === "user" ? (
					<>
						<TelegramAccountSettings initialTelegramUserId={telegramUserId} />
						<ConnectedApplications initialGrants={grants} />
					</>
				) : null}
			</div>
		</main>
	);
}
