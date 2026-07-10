import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { ExpenseKindManagement } from "@/components/settings/expense-kind-management";
import { canManageUsers } from "@/lib/const/roles";
import { listExpenseKinds } from "@/lib/db/expense-kinds";

export const metadata: Metadata = { title: "Administrar categorías" };

export default async function CategoriesPage() {
	const session = await auth();
	if (!session?.user) redirect("/login");
	if (!canManageUsers(session.user.role)) redirect("/settings");
	const result = await listExpenseKinds();
	if (result.err) throw new Error("Could not load expense kinds.");

	return (
		<main className="px-4 py-7 sm:px-7 lg:px-12 lg:py-11">
			<div className="mx-auto max-w-6xl">
				<p className="text-accent text-xs font-bold tracking-[0.18em] uppercase">
					Orden de la casa
				</p>
				<h1 className="font-display mt-2 text-4xl font-semibold tracking-[-0.035em] sm:text-5xl">
					Cada gasto, en su lugar.
				</h1>
				<p className="text-ink-muted mt-3 max-w-2xl text-sm leading-6">
					Organiza los gastos con categorías reconocibles y un icono fácil de encontrar.
				</p>
				<ExpenseKindManagement initialKinds={result.val} />
			</div>
		</main>
	);
}
