"use client";

import { CheckCircle2, Clock3, LoaderCircle, LockKeyhole } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/api/client";
import type { ExpenseShare } from "@/lib/types/expense";
import { formatDateTime, formatMoney } from "@/lib/util/format";

export function ReimbursementList({
	currency,
	initialShares,
}: {
	currency: string;
	initialShares: ExpenseShare[];
}) {
	const router = useRouter();
	const [shares, setShares] = useState(initialShares);
	const [activeId, setActiveId] = useState<string | null>(null);
	const [error, setError] = useState("");
	const [pending, startTransition] = useTransition();

	function toggle(share: ExpenseShare) {
		setError("");
		setActiveId(share.id);
		startTransition(async () => {
			const result = await apiRequest<ExpenseShare>(`/api/expense-shares/${share.id}/status`, {
				body: JSON.stringify({ status: share.status === "paid" ? "pending" : "paid" }),
				method: "PATCH",
			});
			setActiveId(null);
			if (result.err) {
				setError(result.val.message);
				return;
			}
			setShares((current) =>
				current.map((item) => (item.id === result.val.id ? result.val : item)),
			);
			router.refresh();
		});
	}

	return (
		<section className="border-line bg-paper mt-9 rounded-[1.75rem] border p-5 sm:p-7">
			<div className="mb-5 flex items-center justify-between">
				<h2 className="font-display text-2xl font-semibold">División y reembolsos</h2>
				<span className="text-ink-muted text-xs">Exacta entre 3</span>
			</div>
			<div className="divide-line divide-y">
				{shares.map((share) => (
					<div
						className="grid min-h-20 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-3 sm:grid-cols-[minmax(0,1fr)_auto_auto]"
						key={share.id}
					>
						<div>
							<p className="font-semibold">{share.participant.name}</p>
							{share.status === "settled" ? (
								<Badge tone="settled">
									<LockKeyhole aria-hidden size={13} /> Pagó el gasto
								</Badge>
							) : share.status === "paid" ? (
								<Badge tone="paid">
									<CheckCircle2 aria-hidden size={13} /> Reembolsado
								</Badge>
							) : (
								<Badge tone="pending">
									<Clock3 aria-hidden size={13} /> Pendiente
								</Badge>
							)}
							{share.paidAt ? (
								<p className="text-ink-faint mt-1 text-xs">
									Marcado {formatDateTime(share.paidAt)}
								</p>
							) : null}
						</div>
						<strong>{formatMoney(share.shareAmountMinor, currency)}</strong>
						{share.status !== "settled" ? (
							<Button
								className="col-span-2 sm:col-span-1"
								disabled={pending && activeId === share.id}
								onClick={() => toggle(share)}
								variant={share.status === "paid" ? "secondary" : "primary"}
							>
								{pending && activeId === share.id ? (
									<LoaderCircle aria-hidden className="animate-spin" size={16} />
								) : null}
								{share.status === "paid" ? "Marcar pendiente" : "Marcar pagado"}
							</Button>
						) : null}
					</div>
				))}
			</div>
			{error ? (
				<p className="text-danger mt-4 text-sm" role="alert">
					{error}
				</p>
			) : null}
		</section>
	);
}
