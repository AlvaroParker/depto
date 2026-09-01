import { ExternalLink, FileCheck2 } from "lucide-react";

export function ReceiptViewer({ expenseId, filename }: { expenseId: string; filename: string }) {
	return (
		<a
			className="text-accent-strong inline-flex min-h-11 items-center gap-2 text-sm font-semibold"
			href={`/api/expenses/${expenseId}/receipt`}
			rel="noreferrer"
			target="_blank"
		>
			<FileCheck2 aria-hidden size={18} /> Ver {filename}
			<ExternalLink aria-hidden size={14} />
		</a>
	);
}
