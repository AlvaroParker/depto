"use client";

import { ArrowDownLeft, ArrowUpRight, CheckCircle2, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { AttachmentInput } from "@/components/ui/attachment-input";
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
		<div className="grid max-w-full min-w-0 gap-1.5 text-left sm:shrink-0 sm:text-right">
			{debt.amountOwedMinor ? (
				<div>
					<p className="text-pending-strong flex min-w-0 flex-wrap items-center gap-1.5 text-xs font-semibold [overflow-wrap:anywhere] sm:justify-end">
						<ArrowUpRight aria-hidden className="shrink-0" size={13} /> Debes{" "}
						{formatMoney(debt.amountOwedMinor)}
					</p>
					<p className="text-ink-faint mt-0.5 text-[0.7rem]">
						{expenseCountLabel(debt.amountOwedExpenseCount)} pendiente
						{debt.amountOwedExpenseCount === 1 ? "" : "s"}
					</p>
				</div>
			) : null}
			{debt.amountDueToMeMinor ? (
				<p className="text-positive-strong flex min-w-0 flex-wrap items-center gap-1.5 text-xs font-semibold [overflow-wrap:anywhere] sm:justify-end">
					<ArrowDownLeft aria-hidden className="shrink-0" size={13} /> Te debe{" "}
					{formatMoney(debt.amountDueToMeMinor)}
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
		<section className="border-line bg-paper mt-4 max-w-full min-w-0 overflow-hidden rounded-3xl border">
			<header className="border-line border-b px-5 py-4 sm:px-6">
				<h2 className="font-display text-2xl font-semibold">Deudas por persona</h2>
				<p className="text-ink-muted mt-1 text-sm">Tus saldos activos, de mayor a menor.</p>
			</header>
			{success ? (
				<p
					className="border-positive/15 bg-positive/8 text-positive-strong flex min-w-0 items-center gap-2 border-b px-5 py-3 text-sm [overflow-wrap:anywhere] sm:px-6"
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
						<li className="grid min-w-0 gap-3 px-5 py-4 sm:px-6" key={debt.participant.id}>
							<div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
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
						<p className="border-line bg-paper-strong text-ink-muted rounded-2xl border px-4 py-3 text-sm leading-5 [overflow-wrap:anywhere]">
							{selectedDebt.participant.name} todavía te deberá{" "}
							<strong className="text-ink">{formatMoney(selectedDebt.amountDueToMeMinor)}</strong>;
							este pago no compensa esa deuda.
						</p>
					) : null}
					<AttachmentInput
						accept={PAYMENT_PROOF_CONTENT_TYPES}
						disabled={pending}
						file={file}
						hint="JPG, PNG o WebP · máximo 10 MB · privado"
						id="bulk-payment-proof"
						label="Comprobante de pago (opcional)"
						onChange={(file) => {
							setError("");
							setFile(file);
						}}
						onClear={() => {
							setError("");
							setFile(null);
						}}
					/>
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
					<div className="flex min-w-0 flex-col-reverse gap-2 sm:flex-row sm:justify-end">
						<Button disabled={pending} onClick={closePayment} variant="ghost">
							Cancelar
						</Button>
						<Button
							className="max-w-full min-w-0 text-center [overflow-wrap:anywhere]"
							disabled={pending}
							onClick={submitPayment}
						>
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
