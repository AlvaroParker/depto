import { ExternalLink, Paperclip } from "lucide-react";
import type { ExpenseShare } from "@/lib/types/expense";

export function PaymentProofViewer({
	proof,
	share,
}: {
	proof: NonNullable<ExpenseShare["paymentProof"]>;
	share: ExpenseShare;
}) {
	return (
		<div className="border-positive/20 bg-positive/6 flex flex-wrap items-center justify-between gap-3 rounded-xl border px-3 py-2.5">
			<div className="min-w-0">
				<p className="text-positive-strong flex items-center gap-2 text-xs font-bold">
					<Paperclip aria-hidden size={14} /> Comprobante de pago
				</p>
				<p className="text-ink-muted mt-0.5 max-w-64 truncate text-xs">{proof.filename}</p>
			</div>
			<a
				aria-label={`Ver comprobante de pago de ${share.participant.name}`}
				className="border-positive/30 text-positive-strong hover:bg-positive/10 inline-flex min-h-10 items-center gap-2 rounded-full border px-3 text-xs font-bold transition focus-visible:outline-2 focus-visible:outline-offset-2"
				href={`/api/expense-shares/${share.id}/proof`}
				rel="noreferrer"
				target="_blank"
			>
				Ver comprobante <ExternalLink aria-hidden size={14} />
			</a>
		</div>
	);
}
