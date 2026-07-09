import { ArrowRight } from "lucide-react";
import type { PendingTransfer } from "@/lib/types/dashboard";
import { formatMoney } from "@/lib/util/format";

export function PendingMatrix({ transfers }: { transfers: PendingTransfer[] }) {
	return (
		<section className="border-line bg-paper rounded-3xl border p-5 sm:p-6">
			<h2 className="font-display text-2xl font-semibold">Reembolsos pendientes</h2>
			{transfers.length ? (
				<div className="mt-4 grid gap-3">
					{transfers.map((transfer) => (
						<div
							className="bg-paper-strong/65 grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-2xl px-4 py-3 text-sm"
							key={`${transfer.from.id}-${transfer.to.id}`}
						>
							<span className="font-semibold">{transfer.from.name}</span>
							<ArrowRight aria-hidden className="text-ink-faint" size={16} />
							<span className="text-right">
								<strong>{formatMoney(transfer.amountMinor)}</strong>
								<small className="text-ink-muted block">a {transfer.to.name}</small>
							</span>
						</div>
					))}
				</div>
			) : (
				<p className="text-ink-muted mt-4 text-sm">
					No hay reembolsos pendientes. Todo está al día.
				</p>
			)}
		</section>
	);
}
