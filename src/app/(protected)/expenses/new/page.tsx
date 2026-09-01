import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ExpenseForm } from "@/components/expenses/expense-form";
import { listExpenseKinds } from "@/lib/db/expense-kinds";
import { findActiveParticipants } from "@/lib/db/participants";

export const metadata: Metadata = { title: "Agregar gasto" };

export default async function NewExpensePage() {
	const [participants, expenseKinds] = await Promise.all([
		findActiveParticipants(),
		listExpenseKinds(),
	]);
	if (participants.err || expenseKinds.err || expenseKinds.val.length === 0) notFound();
	const defaultDate = new Intl.DateTimeFormat("en-CA", {
		timeZone: "America/Santiago",
	}).format(new Date());
	return (
		<main className="mx-auto max-w-3xl px-4 py-7 sm:px-7 sm:py-10">
			<Link
				className="text-ink-muted hover:text-ink inline-flex min-h-11 items-center text-sm"
				href="/expenses"
			>
				← Volver a gastos
			</Link>
			<header className="mt-6 mb-8">
				<p className="text-accent text-xs font-bold tracking-[0.18em] uppercase">Nuevo registro</p>
				<h1 className="font-display mt-2 text-4xl font-semibold tracking-[-0.03em]">
					Agregar gasto
				</h1>
				<p className="text-ink-muted mt-3">
					Anota quién pagó y nosotros hacemos la división exacta.
				</p>
			</header>
			<section className="border-line bg-paper min-w-0 rounded-[1.75rem] border p-5 shadow-[0_24px_60px_-46px_rgba(40,40,34,0.55)] sm:p-8">
				<ExpenseForm
					defaultDate={defaultDate}
					expenseKinds={expenseKinds.val}
					participants={participants.val}
				/>
			</section>
		</main>
	);
}
