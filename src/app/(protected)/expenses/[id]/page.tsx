import type { Metadata } from "next";
import { Pencil, Paperclip } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { ReimbursementList } from "@/components/expenses/reimbursement-list";
import { ExpenseKindIcon } from "@/components/expenses/expense-kind-icon";
import { ReceiptField } from "@/components/expenses/receipt-field";
import { ReceiptViewer } from "@/components/expenses/receipt-viewer";
import { findExpenseById } from "@/lib/db/expenses";
import { findBankTransferDetails } from "@/lib/db/bank-accounts";
import { formatDateTime, formatExpenseDate, formatMoney } from "@/lib/util/format";

interface ExpenseDetailPageProps {
	params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: ExpenseDetailPageProps): Promise<Metadata> {
	const result = await findExpenseById((await params).id);
	return { title: result.ok && result.val ? result.val.name : "Gasto" };
}

export default async function ExpenseDetailPage({ params }: ExpenseDetailPageProps) {
	const session = await auth();
	if (!session?.user) redirect("/login");
	const result = await findExpenseById((await params).id);
	if (result.err) throw new Error("Could not load expense.");
	if (!result.val) notFound();
	const expense = result.val;
	const bankTransferDetails = await findBankTransferDetails(expense.payer.id);
	if (bankTransferDetails.err) throw new Error("Could not load bank transfer details.");
	return (
		<main className="mx-auto max-w-5xl min-w-0 px-4 py-7 sm:px-7 sm:py-10">
			<div className="flex items-center justify-between gap-4">
				<Link
					className="text-ink-muted hover:text-ink inline-flex min-h-11 items-center text-sm"
					href="/expenses"
				>
					← Todos los gastos
				</Link>
				<Link
					className="border-line-strong bg-paper inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm font-semibold"
					href={`/expenses/${expense.id}/edit`}
				>
					<Pencil aria-hidden size={16} /> Editar
				</Link>
			</div>
			<header className="mt-8 grid min-w-0 gap-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
				<div className="grid min-w-0 grid-cols-[3rem_minmax(0,1fr)] gap-4">
					<span className="bg-accent/10 text-accent-strong mt-1 grid size-12 place-items-center rounded-2xl">
						<ExpenseKindIcon aria-hidden iconKey={expense.kind.iconKey} size={22} />
					</span>
					<div className="min-w-0">
						<p className="text-accent-strong text-xs font-bold tracking-[0.18em] uppercase">
							{expense.kind.name} · {formatExpenseDate(expense.expenseDate)}
						</p>
						<h1 className="font-display mt-2 text-3xl font-semibold tracking-[-0.03em] [overflow-wrap:anywhere] sm:text-5xl">
							{expense.name}
						</h1>
						<p className="text-ink-muted mt-3 [overflow-wrap:anywhere]">
							Pagó <strong className="text-ink">{expense.payer.name}</strong>
							{expense.description ? ` · ${expense.description}` : ""}
						</p>
					</div>
				</div>
				<strong className="font-display max-w-full text-[clamp(1.75rem,8vw,2.25rem)] leading-none [overflow-wrap:anywhere]">
					{formatMoney(expense.amountMinor, expense.currency)}
				</strong>
			</header>

			<ReimbursementList
				amountMinor={expense.amountMinor}
				currency={expense.currency}
				currentUser={{
					participantId: session.user.participantId,
					role: session.user.role,
				}}
				initialShares={expense.shares}
				payeeBankTransferDetails={bankTransferDetails.val}
				payeeName={expense.payer.name}
				splitMode={expense.splitMode}
			/>

			<section className="border-line mt-4 grid min-w-0 gap-3 rounded-2xl border border-dashed p-5 sm:grid-cols-[auto_1fr] sm:items-center">
				<Paperclip aria-hidden className="text-ink-faint" size={21} />
				<div className="min-w-0">
					<p className="text-ink-muted mb-2 text-sm">
						{expense.hasReceipt
							? "Comprobante guardado de forma privada."
							: "Este gasto todavía no tiene comprobante."}
					</p>
					{expense.hasReceipt && expense.receiptFilename ? (
						<ReceiptViewer expenseId={expense.id} filename={expense.receiptFilename} />
					) : null}
					<ReceiptField expenseId={expense.id} />
				</div>
			</section>
			<p className="text-ink-faint mt-6 text-xs">Creado {formatDateTime(expense.createdAt)}</p>
		</main>
	);
}
