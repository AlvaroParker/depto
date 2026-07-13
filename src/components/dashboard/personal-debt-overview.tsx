"use client";

import { ArrowDownLeft, ArrowUpRight, CheckCircle2, LoaderCircle, Paperclip } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { BankAccountCopyAction } from "@/components/payments/bank-account-copy-action";
import {
	MAX_PAYMENT_PROOF_SIZE_BYTES,
	PAYMENT_PROOF_CONTENT_TYPES,
} from "@/lib/const/payment-proofs";
import { payAllDebt } from "@/lib/api/bulk-payments";
import type { PersonalDebtByParticipant } from "@/lib/types/dashboard";
import type { BankTransferDetails } from "@/lib/types/bank-account";
import { formatMoney } from "@/lib/util/format";

function expenseCountLabel(count: number): string {
	return `${count} ${count === 1 ? "gasto" : "gastos"}`;
}

function DebtAmounts({ debt }: { debt: PersonalDebtByParticipant }) {
	return (
		<div className="grid shrink-0 gap-1.5 text-right">
			{debt.amountOwedMinor ? (
				<div>
					<p className="text-pending-strong flex items-center justify-end gap-1.5 text-xs font-semibold">
						<ArrowUpRight aria-hidden size={13} /> Debes {formatMoney(debt.amountOwedMinor)}
					</p>
					<p className="text-ink-faint mt-0.5 text-[0.7rem]">
						{expenseCountLabel(debt.amountOwedExpenseCount)} pendiente
						{debt.amountOwedExpenseCount === 1 ? "" : "s"}
					</p>
				</div>
			) : null}
			{debt.amountDueToMeMinor ? (
				<p className="text-positive-strong flex items-center justify-end gap-1.5 text-xs font-semibold">
					<ArrowDownLeft aria-hidden size={13} /> Te debe {formatMoney(debt.amountDueToMeMinor)}
				</p>
			) : null}
		</div>
	);
}

interface PersonalDebtOverviewProps {
	bankTransferDetailsByParticipantId?: Record<string, BankTransferDetails>;
	debts: PersonalDebtByParticipant[];
}

export function PersonalDebtOverview({
	bankTransferDetailsByParticipantId = {},
	debts,
}: PersonalDebtOverviewProps) {
	const router = useRouter();
	const [selectedDebt, setSelectedDebt] = useState<PersonalDebtByParticipant | null>(null);
	const [file, setFile] = useState<File | null>(null);
	const [progress, setProgress] = useState<number | null>(null);
	const [error, setError] = useState("");
	const [success, setSuccess] = useState("");
	const [pending, startTransition] = useTransition();

	function openPayment(debt: PersonalDebtByParticipant) {
		setError("");
		setFile(null);
		setProgress(null);
		setSelectedDebt(debt);
	}

	function closePayment() {
		if (!pending) setSelectedDebt(null);
	}

	function validateFile(candidate: File): string | null {
		if (!PAYMENT_PROOF_CONTENT_TYPES.includes(candidate.type as never)) {
			return "Usa un archivo JPG, PNG o WebP.";
		}
		if (candidate.size > MAX_PAYMENT_PROOF_SIZE_BYTES) {
			return "El comprobante no puede superar 10 MB.";
		}
		if (candidate.size < 1) return "El comprobante está vacío.";
		return null;
	}

	function submitPayment() {
		if (!selectedDebt) return;
		setError("");
		if (file) {
			const validationError = validateFile(file);
			if (validationError) {
				setError(validationError);
				return;
			}
		}
		startTransition(async () => {
			const result = await payAllDebt(selectedDebt.participant.id, file, setProgress);
			setProgress(null);
			if (result.err) {
				setError(result.val.message);
				return;
			}
			setSuccess(
				`Pago registrado: ${expenseCountLabel(result.val.paidExpenseCount)} por ${formatMoney(result.val.amountPaidMinor)} a ${result.val.paidToParticipant.name}.`,
			);
			setSelectedDebt(null);
			setFile(null);
			router.refresh();
		});
	}

	return (
		<section className="border-line bg-paper mt-4 overflow-hidden rounded-3xl border">
			<header className="border-line border-b px-5 py-4 sm:px-6">
				<h2 className="font-display text-2xl font-semibold">Deudas por persona</h2>
				<p className="text-ink-muted mt-1 text-sm">Tus saldos activos, de mayor a menor.</p>
			</header>
			{success ? (
				<p
					className="border-positive/15 bg-positive/8 text-positive-strong flex items-center gap-2 border-b px-5 py-3 text-sm sm:px-6"
					role="status"
				>
					<CheckCircle2 aria-hidden size={16} /> {success}
				</p>
			) : null}
			{debts.length ? (
				<ul
					aria-label="Resumen de deudas por persona"
					className="divide-line max-h-80 [scrollbar-gutter:stable] divide-y overflow-y-auto overscroll-contain"
				>
					{debts.map((debt) => (
						<li className="grid gap-3 px-5 py-4 sm:px-6" key={debt.participant.id}>
							<div className="flex items-center justify-between gap-4">
								<div className="flex min-w-0 items-center gap-3">
									<span
										aria-hidden
										className="bg-paper-strong text-ink-muted grid size-9 shrink-0 place-items-center rounded-full text-sm font-bold uppercase"
									>
										{debt.participant.name.slice(0, 1)}
									</span>
									<p className="truncate font-semibold">{debt.participant.name}</p>
								</div>
								<DebtAmounts debt={debt} />
							</div>
							{debt.amountOwedMinor ? (
								<div className="flex justify-end">
									<Button
										aria-label={`Pagar todo lo que debes a ${debt.participant.name}: ${formatMoney(debt.amountOwedMinor)}`}
										disabled={pending}
										onClick={() => openPayment(debt)}
										variant="secondary"
									>
										Pagar todo
									</Button>
								</div>
							) : null}
						</li>
					))}
				</ul>
			) : (
				<div className="text-ink-muted flex items-center gap-3 px-5 py-6 text-sm sm:px-6">
					<span className="bg-positive/10 text-positive-strong grid size-9 place-items-center rounded-full">
						<CheckCircle2 aria-hidden size={17} />
					</span>
					No hay deudas activas con otras personas.
				</div>
			)}

			<Dialog
				description={
					selectedDebt
						? `Marcarás como pagados ${expenseCountLabel(selectedDebt.amountOwedExpenseCount)} por un total de ${formatMoney(selectedDebt.amountOwedMinor)}.`
						: undefined
				}
				onClose={closePayment}
				open={Boolean(selectedDebt)}
				title={selectedDebt ? `Pagar deuda a ${selectedDebt.participant.name}` : "Pagar deuda"}
			>
				<div className="grid gap-5">
					<BankAccountCopyAction
						details={
							selectedDebt
								? (bankTransferDetailsByParticipantId[selectedDebt.participant.id] ?? null)
								: null
						}
					/>
					{selectedDebt?.amountDueToMeMinor ? (
						<p className="border-line bg-paper-strong text-ink-muted rounded-2xl border px-4 py-3 text-sm leading-5">
							{selectedDebt.participant.name} todavía te deberá{" "}
							<strong className="text-ink">{formatMoney(selectedDebt.amountDueToMeMinor)}</strong>;
							este pago no compensa esa deuda.
						</p>
					) : null}
					<label className="grid gap-2 text-sm font-semibold" htmlFor="bulk-payment-proof">
						<span>Comprobante de pago (opcional)</span>
						<input
							accept={PAYMENT_PROOF_CONTENT_TYPES.join(",")}
							className="border-line-strong bg-paper-strong file:bg-ink file:text-paper focus-visible:outline-accent min-h-12 rounded-xl border px-3 py-2 text-sm file:mr-3 file:rounded-full file:border-0 file:px-3 file:py-1.5 file:text-xs file:font-bold focus-visible:outline-2 focus-visible:outline-offset-2"
							disabled={pending}
							id="bulk-payment-proof"
							onChange={(event) => {
								setError("");
								setFile(event.target.files?.[0] ?? null);
							}}
							type="file"
						/>
						<span className="text-ink-faint flex items-center gap-1.5 text-xs font-normal">
							<Paperclip aria-hidden size={13} /> JPG, PNG o WebP · máximo 10 MB · privado
						</span>
					</label>
					{progress !== null ? (
						<p className="text-ink-muted text-sm" role="status">
							Subiendo comprobante {progress}%
						</p>
					) : null}
					{error ? (
						<p className="text-danger text-sm" role="alert">
							{error}
						</p>
					) : null}
					<div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
						<Button disabled={pending} onClick={closePayment} variant="ghost">
							Cancelar
						</Button>
						<Button disabled={pending} onClick={submitPayment}>
							{pending ? <LoaderCircle aria-hidden className="animate-spin" size={16} /> : null}
							{selectedDebt
								? file
									? `Pagar ${formatMoney(selectedDebt.amountOwedMinor)} y subir comprobante`
									: `Pagar ${formatMoney(selectedDebt.amountOwedMinor)}`
								: "Pagar todo"}
						</Button>
					</div>
				</div>
			</Dialog>
		</section>
	);
}
