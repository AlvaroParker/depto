import type { Metadata } from "next";
import { Pencil, Paperclip } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ReimbursementList } from "@/components/expenses/reimbursement-list";
import { findExpenseById } from "@/lib/db/expenses";
import { formatDateTime, formatExpenseDate, formatMoney } from "@/lib/util/format";

interface ExpenseDetailPageProps {
	params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: ExpenseDetailPageProps): Promise<Metadata> {
	const result = await findExpenseById((await params).id);
	return { title: result.ok && result.val ? result.val.name : "Gasto" };
}

export default async function ExpenseDetailPage({ params }: ExpenseDetailPageProps) {
	const result = await findExpenseById((await params).id);
	if (result.err) throw new Error("Could not load expense.");
	if (!result.val) notFound();
	const expense = result.val;
	return (
		<main className="mx-auto max-w-5xl px-4 py-7 sm:px-7 sm:py-10">
			<div className="flex items-center justify-between gap-4">
				<Link className="text-ink-muted hover:text-ink text-sm" href="/expenses">
					← Todos los gastos
				</Link>
				<Link
					className="border-line-strong bg-paper inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm font-semibold"
					href={`/expenses/${expense.id}/edit`}
				>
					<Pencil aria-hidden size={16} /> Editar
				</Link>
			</div>
			<header className="mt-8 grid gap-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
				<div>
					<p className="text-accent text-xs font-bold tracking-[0.18em] uppercase">
						{formatExpenseDate(expense.expenseDate)}
					</p>
					<h1 className="font-display mt-2 text-4xl font-semibold tracking-[-0.03em] sm:text-5xl">
						{expense.name}
					</h1>
					<p className="text-ink-muted mt-3">
						Pagó <strong className="text-ink">{expense.payer.name}</strong>
						{expense.description ? ` · ${expense.description}` : ""}
					</p>
				</div>
				<strong className="font-display text-4xl text-nowrap">
					{formatMoney(expense.amountMinor, expense.currency)}
				</strong>
			</header>

			<ReimbursementList currency={expense.currency} initialShares={expense.shares} />

			<section className="border-line mt-4 grid gap-3 rounded-2xl border border-dashed p-5 sm:grid-cols-[auto_1fr] sm:items-center">
				<Paperclip aria-hidden className="text-ink-faint" size={21} />
				<p className="text-ink-muted text-sm">
					{expense.hasReceipt
						? `Comprobante: ${expense.receiptFilename}`
						: "Este gasto todavía no tiene comprobante."}
				</p>
			</section>
			<p className="text-ink-faint mt-6 text-xs">Creado {formatDateTime(expense.createdAt)}</p>
		</main>
	);
}
