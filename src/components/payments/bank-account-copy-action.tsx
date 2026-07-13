"use client";

import { Check, Copy, Landmark } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { BankTransferDetails } from "@/lib/types/bank-account";
import { formatBankTransferDetails } from "@/lib/util/bank-accounts";

interface BankAccountCopyActionProps {
	details: BankTransferDetails | null;
}

export function BankAccountCopyAction({ details }: BankAccountCopyActionProps) {
	const [status, setStatus] = useState<"idle" | "copied" | "error">("idle");

	async function copy() {
		if (!details) return;
		try {
			await navigator.clipboard.writeText(formatBankTransferDetails(details));
			setStatus("copied");
		} catch {
			setStatus("error");
		}
	}

	return (
		<div className="border-line bg-paper-strong rounded-2xl border px-4 py-4">
			<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
				<div className="flex min-w-0 items-center gap-3">
					<span className="bg-accent/10 text-accent grid size-10 shrink-0 place-items-center rounded-xl">
						<Landmark aria-hidden size={18} />
					</span>
					<div className="min-w-0">
						<p className="text-sm font-semibold">Datos para transferir</p>
						<p className="text-ink-muted truncate text-xs">
							{details
								? `${details.bankName} · ${details.accountType}`
								: "Sin información disponible"}
						</p>
					</div>
				</div>
				<Button className="shrink-0" disabled={!details} onClick={copy} variant="secondary">
					{status === "copied" ? <Check aria-hidden size={16} /> : <Copy aria-hidden size={16} />}
					{details
						? status === "copied"
							? "Datos copiados"
							: "Copiar datos bancarios"
						: "Datos bancarios no registrados"}
				</Button>
			</div>
			{status === "copied" ? (
				<p className="text-positive-strong mt-3 text-xs" role="status">
					Datos bancarios copiados.
				</p>
			) : status === "error" ? (
				<p className="text-danger mt-3 text-xs" role="alert">
					No pudimos copiar los datos bancarios. Inténtalo nuevamente.
				</p>
			) : null}
		</div>
	);
}
