import { ArrowRight, CheckCircle2, Clock3, Paperclip } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import type { ExpenseSummary } from "@/lib/types/expense";
import { formatExpenseDate, formatMoney } from "@/lib/util/format";

export function ExpenseList({ expenses }: { expenses: ExpenseSummary[] }) {
	if (expenses.length === 0) {
		return (
			<EmptyState
				action={
					<Link
						className="bg-accent text-accent-foreground inline-flex min-h-11 items-center rounded-full px-5 text-sm font-semibold"
						href="/expenses/new"
					>
						Agregar el primer gasto
					</Link>
				}
				description="Cuando registres un gasto compartido, aparecerá aquí con su división."
				icon={Paperclip}
				title="Todavía no hay gastos"
			/>
		);
	}
	return (
		<div className="grid gap-3">
			{expenses.map((expense) => {
				const pending = expense.shares.filter((share) => share.status === "pending").length;
				return (
					<Link
						className="group border-line bg-paper hover:border-line-strong hover:shadow-card grid gap-4 rounded-2xl border p-4 transition sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center sm:px-5"
						href={`/expenses/${expense.id}`}
						key={expense.id}
					>
						<div className="min-w-0">
							<div className="flex items-center gap-2">
								<h2 className="truncate font-semibold">{expense.name}</h2>
								{expense.hasReceipt ? (
									<Paperclip aria-label="Con comprobante" className="text-accent" size={15} />
								) : null}
							</div>
							<p className="text-ink-muted mt-1 text-sm">
								{formatExpenseDate(expense.expenseDate)} · Pagó {expense.payer.name}
							</p>
						</div>
						<div className="flex items-center justify-between gap-3 sm:block sm:text-right">
							<strong className="font-display text-xl">
								{formatMoney(expense.amountMinor, expense.currency)}
							</strong>
							<div className="mt-1">
								{pending ? (
									<Badge tone="pending">
										<Clock3 aria-hidden size={13} /> {pending} pendiente{pending === 1 ? "" : "s"}
									</Badge>
								) : (
									<Badge tone="paid">
										<CheckCircle2 aria-hidden size={13} /> Al día
									</Badge>
								)}
							</div>
						</div>
						<ArrowRight
							aria-hidden
							className="text-ink-faint group-hover:text-accent hidden transition sm:block"
							size={19}
						/>
					</Link>
				);
			})}
		</div>
	);
}
