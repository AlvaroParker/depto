import {
	BookOpenText,
	CircleDollarSign,
	House,
	Plus,
	ReceiptText,
	Settings,
	Tags,
	Users,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import type { SessionUser } from "@/lib/types/user";
import { ActiveNavigationLink } from "@/components/layout/active-navigation-link";
import { SignOutButton } from "@/components/layout/sign-out-button";
import { canManageUsers, ROLE_LABELS } from "@/lib/const/roles";

const baseNavigation = [
	{ href: "/", icon: House, label: "Resumen" },
	{ href: "/expenses", icon: ReceiptText, label: "Gastos" },
	{ href: "/household", icon: BookOpenText, label: "Casa" },
	{ href: "/settings", icon: Settings, label: "Ajustes" },
] as const;

interface AppShellProps {
	children: ReactNode;
	user: SessionUser;
}

export function AppShell({ children, user }: AppShellProps) {
	const navigation = canManageUsers(user.role)
		? [
				...baseNavigation,
				{ href: "/settings/categories", icon: Tags, label: "Categorías" },
				{ href: "/settings/users", icon: Users, label: "Usuarios" },
			]
		: baseNavigation;
	const navigationHrefs = navigation.map(({ href }) => href);
	const mobileNavigationHrefs = baseNavigation.map(({ href }) => href);
	return (
		<div className="mx-auto min-h-dvh max-w-[92rem] lg:grid lg:grid-cols-[16rem_minmax(0,1fr)]">
			<aside className="border-line bg-paper/72 sticky top-0 hidden h-screen border-r px-5 py-7 backdrop-blur lg:flex lg:flex-col">
				<Link className="flex items-center gap-3 px-2" href="/">
					<span className="bg-accent text-accent-foreground grid size-10 place-items-center rounded-2xl">
						<CircleDollarSign aria-hidden size={22} strokeWidth={1.8} />
					</span>
					<span>
						<strong className="font-display block text-lg leading-none">La cuenta</strong>
						<small className="text-ink-muted text-[0.65rem] tracking-[0.12em] uppercase">
							de la casa
						</small>
					</span>
				</Link>
				<nav aria-label="Principal" className="mt-12 grid gap-2">
					{navigation.map(({ href, icon: Icon, label }) => (
						<ActiveNavigationLink
							activeClassName="border-accent/25 bg-accent/10 text-accent-strong shadow-[inset_3px_0_0_var(--accent)]"
							className="text-ink-muted hover:bg-ink/6 hover:text-ink focus-visible:outline-accent flex min-h-11 items-center gap-3 rounded-xl border border-transparent px-3 text-sm font-medium transition focus-visible:outline-2 focus-visible:outline-offset-2"
							href={href}
							key={href}
							navigationHrefs={navigationHrefs}
						>
							<Icon aria-hidden size={19} />
							{label}
						</ActiveNavigationLink>
					))}
				</nav>
				<Link
					className="bg-accent text-accent-foreground hover:bg-accent-strong mt-6 flex min-h-12 items-center justify-center gap-2 rounded-full px-4 text-sm font-semibold shadow-[0_10px_24px_-14px_var(--shadow-accent)] transition hover:-translate-y-0.5"
					href="/expenses/new"
				>
					<Plus aria-hidden size={18} /> Agregar gasto
				</Link>
				<div className="border-line mt-auto flex items-center gap-3 border-t pt-5">
					<span className="bg-positive/12 font-display text-positive-strong grid size-10 place-items-center rounded-full font-semibold">
						{user.displayName.slice(0, 1).toUpperCase()}
					</span>
					<div className="min-w-0 flex-1">
						<p className="truncate text-sm font-semibold">{user.displayName}</p>
						<p className="text-ink-muted truncate text-xs">
							@{user.username} · {ROLE_LABELS[user.role]}
						</p>
					</div>
					<SignOutButton />
				</div>
			</aside>
			<div className="min-w-0 pb-[calc(6rem+env(safe-area-inset-bottom))] max-[299px]:pb-[calc(10rem+env(safe-area-inset-bottom))] lg:pb-0">
				{children}
			</div>
			<nav
				aria-label="Principal"
				className="border-line bg-paper/94 shadow-card fixed z-40 flex flex-wrap rounded-2xl border p-1.5 backdrop-blur lg:hidden"
				style={{
					bottom: "max(0.75rem, env(safe-area-inset-bottom))",
					left: "max(0.75rem, env(safe-area-inset-left))",
					right: "max(0.75rem, env(safe-area-inset-right))",
				}}
			>
				{baseNavigation.slice(0, 2).map(({ href, icon: Icon, label }) => (
					<ActiveNavigationLink
						activeClassName="bg-accent/10 text-accent-strong"
						className="text-ink-muted flex min-h-14 min-w-12 flex-1 basis-13 flex-col items-center justify-center gap-0.5 rounded-xl px-1 text-center text-[0.65rem] leading-tight font-semibold transition"
						href={href}
						key={href}
						navigationHrefs={mobileNavigationHrefs}
					>
						<Icon aria-hidden size={19} /> {label}
					</ActiveNavigationLink>
				))}
				<Link
					className="bg-accent text-accent-foreground flex min-h-14 min-w-12 flex-1 basis-13 flex-col items-center justify-center gap-0.5 rounded-xl px-1 text-center text-[0.65rem] leading-tight font-semibold"
					href="/expenses/new"
				>
					<Plus aria-hidden size={19} /> Agregar
				</Link>
				{baseNavigation.slice(2).map(({ href, icon: Icon, label }) => (
					<ActiveNavigationLink
						activeClassName="bg-accent/10 text-accent-strong"
						className="text-ink-muted flex min-h-14 min-w-12 flex-1 basis-13 flex-col items-center justify-center gap-0.5 rounded-xl px-1 text-center text-[0.62rem] leading-tight font-semibold transition"
						href={href}
						key={href}
						navigationHrefs={mobileNavigationHrefs}
					>
						<Icon aria-hidden size={19} /> {label}
					</ActiveNavigationLink>
				))}
			</nav>
		</div>
	);
}
