import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { DeleteExpenseButton } from "@/components/expenses/delete-expense-button";
import { ExpenseForm } from "@/components/expenses/expense-form";
import { listExpenseKinds } from "@/lib/db/expense-kinds";
import { findExpenseById } from "@/lib/db/expenses";
import { findParticipantsForExpense } from "@/lib/db/participants";

export const metadata: Metadata = { title: "Editar gasto" };

export default async function EditExpensePage({ params }: { params: Promise<{ id: string }> }) {
	const session = await auth();
	if (!session?.user) redirect("/login");
	const id = (await params).id;
	const [expense, participants, expenseKinds] = await Promise.all([
		findExpenseById(id),
		findParticipantsForExpense(id),
		listExpenseKinds(),
	]);
	if (expense.err || participants.err || expenseKinds.err)
		throw new Error("Could not load expense editor.");
	if (!expense.val) notFound();
	return (
		<main className="mx-auto max-w-3xl px-4 py-7 sm:px-7 sm:py-10">
			<Link className="text-ink-muted hover:text-ink text-sm" href={`/expenses/${id}`}>
				← Volver al gasto
			</Link>
			<header className="mt-6 mb-8 flex items-end justify-between gap-4">
				<div>
					<p className="text-accent text-xs font-bold tracking-[0.18em] uppercase">
						Corrección segura
					</p>
					<h1 className="font-display mt-2 text-4xl font-semibold tracking-[-0.03em]">
						Editar gasto
					</h1>
				</div>
				<DeleteExpenseButton expenseId={id} expenseName={expense.val.name} />
			</header>
			<section className="border-line bg-paper rounded-[1.75rem] border p-5 sm:p-8">
				<ExpenseForm
					canEditFinancials={session.user.role === "root" || session.user.role === "admin"}
					defaultDate={expense.val.expenseDate}
					expense={expense.val}
					expenseKinds={expenseKinds.val}
					participants={participants.val}
				/>
			</section>
		</main>
	);
}
