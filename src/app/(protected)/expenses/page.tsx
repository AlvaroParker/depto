import type { Metadata } from "next";
import { Plus } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { ExpenseFilters } from "@/components/expenses/expense-filters";
import { ExpenseList } from "@/components/expenses/expense-list";
import { listExpenseKinds } from "@/lib/db/expense-kinds";
import { listExpenses } from "@/lib/db/expenses";
import { findActiveParticipants } from "@/lib/db/participants";
import { ExpenseQuerySchema } from "@/lib/types/expense";

export const metadata: Metadata = { title: "Gastos" };

interface ExpensesPageProps {
	searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function pageHref(
	query: {
		kind?: string;
		q?: string;
		payer?: string;
		pending?: boolean | "mine";
		pageSize: number;
	},
	page: number,
) {
	const values = new URLSearchParams();
	if (query.q) values.set("q", query.q);
	if (query.kind) values.set("kind", query.kind);
	if (query.payer) values.set("payer", query.payer);
	if (query.pending !== undefined) values.set("pending", String(query.pending));
	values.set("page", String(page));
	values.set("pageSize", String(query.pageSize));
	return `/expenses?${values}`;
}

export default async function ExpensesPage({ searchParams }: ExpensesPageProps) {
	const session = await auth();
	if (!session?.user) redirect("/login");
	const raw = await searchParams;
	const flat = Object.fromEntries(
		Object.entries(raw).flatMap(([key, value]) =>
			typeof value === "string" ? [[key, value]] : [],
		),
	);
	const parsed = ExpenseQuerySchema.safeParse(flat);
	const query = parsed.success ? parsed.data : ExpenseQuerySchema.parse({});
	if (query.pending === "mine" && !session.user.participantId) redirect("/expenses");
	const [result, participants, expenseKinds] = await Promise.all([
		listExpenses(query, { currentParticipantId: session.user.participantId }),
		findActiveParticipants(),
		listExpenseKinds(),
	]);
	if (result.err || participants.err || expenseKinds.err)
		throw new Error("Could not load expenses.");
	const totalPages = Math.max(1, Math.ceil(result.val.total / result.val.pageSize));
	return (
		<main className="mx-auto max-w-6xl px-4 py-7 sm:px-7 sm:py-10">
			<header className="mb-8 flex items-end justify-between gap-4">
				<div>
					<p className="text-accent text-xs font-bold tracking-[0.18em] uppercase">
						Historial compartido
					</p>
					<h1 className="font-display mt-2 text-4xl font-semibold tracking-[-0.03em]">Gastos</h1>
					<p className="text-ink-muted mt-2 text-sm">
						{result.val.total} registro{result.val.total === 1 ? "" : "s"}
					</p>
				</div>
				<Link
					className="bg-accent text-accent-foreground hidden min-h-11 items-center gap-2 rounded-full px-5 text-sm font-semibold sm:flex"
					href="/expenses/new"
				>
					<Plus aria-hidden size={18} /> Agregar gasto
				</Link>
			</header>
			<ExpenseFilters
				canFilterMyPending={Boolean(session.user.participantId)}
				expenseKinds={expenseKinds.val}
				participants={participants.val}
				query={query}
			/>
			<ExpenseList
				expenses={result.val.expenses}
				personalParticipantId={query.pending === "mine" ? session.user.participantId : null}
			/>
			{totalPages > 1 ? (
				<nav aria-label="Paginación de gastos" className="mt-6 flex items-center justify-between">
					<span className="text-ink-muted text-sm">
						Página {result.val.page} de {totalPages}
					</span>
					<div className="flex gap-2">
						{result.val.page > 1 ? (
							<Link
								className="border-line-strong bg-paper inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-semibold"
								href={pageHref(query, result.val.page - 1)}
							>
								Anterior
							</Link>
						) : null}
						{result.val.page < totalPages ? (
							<Link
								className="border-line-strong bg-paper inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-semibold"
								href={pageHref(query, result.val.page + 1)}
							>
								Siguiente
							</Link>
						) : null}
					</div>
				</nav>
			) : null}
		</main>
	);
}
