"use client";

import {
	CheckCircle2,
	Clock3,
	ImagePlus,
	LoaderCircle,
	LockKeyhole,
	Paperclip,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { PaymentProofViewer } from "@/components/expenses/payment-proof-viewer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import {
	MAX_PAYMENT_PROOF_SIZE_BYTES,
	PAYMENT_PROOF_CONTENT_TYPES,
} from "@/lib/const/payment-proofs";
import { apiRequest } from "@/lib/api/client";
import { uploadPaymentProof } from "@/lib/api/payment-proofs";
import type { UserRole } from "@/lib/const/roles";
import type { ExpenseShare } from "@/lib/types/expense";
import { formatDateTime, formatMoney } from "@/lib/util/format";

interface ReimbursementListProps {
	currency: string;
	currentUser: { participantId: string | null; role: UserRole };
	initialShares: ExpenseShare[];
	payeeName: string;
}

function canManageShare(
	share: ExpenseShare,
	currentUser: ReimbursementListProps["currentUser"],
): boolean {
	return (
		currentUser.role === "root" ||
		currentUser.role === "admin" ||
		currentUser.participantId === share.participant.id
	);
}

export function ReimbursementList({
	currency,
	currentUser,
	initialShares,
	payeeName,
}: ReimbursementListProps) {
	const router = useRouter();
	const [shares, setShares] = useState(initialShares);
	const [paymentShare, setPaymentShare] = useState<ExpenseShare | null>(null);
	const [revertShare, setRevertShare] = useState<ExpenseShare | null>(null);
	const [file, setFile] = useState<File | null>(null);
	const [progress, setProgress] = useState<number | null>(null);
	const [error, setError] = useState("");
	const [pending, startTransition] = useTransition();

	function updateLocalShare(updated: ExpenseShare) {
		setShares((current) => current.map((share) => (share.id === updated.id ? updated : share)));
		router.refresh();
	}

	function openPaymentDialog(share: ExpenseShare) {
		setError("");
		setFile(null);
		setProgress(null);
		setPaymentShare(share);
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
		if (!paymentShare) return;
		setError("");
		if (file) {
			const validationError = validateFile(file);
			if (validationError) {
				setError(validationError);
				return;
			}
		}
		startTransition(async () => {
			const result = file
				? await uploadPaymentProof(paymentShare.id, file, setProgress)
				: await apiRequest<ExpenseShare>(`/api/expense-shares/${paymentShare.id}/status`, {
						body: JSON.stringify({ status: "paid" }),
						method: "PATCH",
					});
			setProgress(null);
			if (result.err) {
				setError(result.val.message);
				return;
			}
			updateLocalShare(result.val);
			setPaymentShare(null);
			setFile(null);
		});
	}

	function markPending(share: ExpenseShare) {
		setError("");
		startTransition(async () => {
			const result = await apiRequest<ExpenseShare>(`/api/expense-shares/${share.id}/status`, {
				body: JSON.stringify({ status: "pending" }),
				method: "PATCH",
			});
			if (result.err) {
				setError(result.val.message);
				return;
			}
			updateLocalShare(result.val);
			setRevertShare(null);
		});
	}

	const paymentButtonLabel = paymentShare
		? paymentShare.status === "pending"
			? file
				? "Marcar pagado y subir comprobante"
				: "Marcar pagado sin comprobante"
			: paymentShare.paymentProof
				? "Reemplazar comprobante"
				: "Guardar comprobante"
		: "Guardar";

	return (
		<section className="border-line bg-paper mt-9 rounded-[1.75rem] border p-5 sm:p-7">
			<div className="mb-5 flex items-center justify-between gap-4">
				<div>
					<h2 className="font-display text-2xl font-semibold">División y reembolsos</h2>
					<p className="text-ink-muted mt-1 text-xs">
						Los comprobantes son privados para el hogar.
					</p>
				</div>
				<span className="text-ink-muted text-xs">Exacta entre {shares.length}</span>
			</div>
			<div className="divide-line divide-y">
				{shares.map((share) => {
					const manageable = share.status !== "settled" && canManageShare(share, currentUser);
					return (
						<div className="grid min-h-20 gap-3 py-4" key={share.id}>
							<div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
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
								<strong className="font-display text-xl">
									{formatMoney(share.shareAmountMinor, currency)}
								</strong>
							</div>

							{share.paymentProof ? (
								<PaymentProofViewer proof={share.paymentProof} share={share} />
							) : share.status === "paid" ? (
								<p className="text-ink-faint flex items-center gap-2 text-xs">
									<Paperclip aria-hidden size={14} /> Sin comprobante de pago
								</p>
							) : null}

							{manageable ? (
								<div className="flex flex-wrap justify-end gap-2">
									{share.status === "paid" ? (
										<>
											<Button
												aria-label={`${share.paymentProof ? "Reemplazar" : "Agregar"} comprobante: ${share.participant.name}`}
												disabled={pending}
												onClick={() => openPaymentDialog(share)}
												variant="secondary"
											>
												<ImagePlus aria-hidden size={16} />
												{share.paymentProof ? "Reemplazar" : "Agregar comprobante"}
											</Button>
											<Button
												aria-label={`Marcar pendiente: ${share.participant.name}`}
												disabled={pending}
												onClick={() =>
													share.paymentProof ? setRevertShare(share) : markPending(share)
												}
												variant="ghost"
											>
												Marcar pendiente
											</Button>
										</>
									) : (
										<Button
											aria-label={`Marcar pagado: ${share.participant.name}`}
											disabled={pending}
											onClick={() => openPaymentDialog(share)}
										>
											Marcar pagado
										</Button>
									)}
								</div>
							) : null}
						</div>
					);
				})}
			</div>

			<Dialog
				description={
					paymentShare
						? `${paymentShare.participant.name} debe ${formatMoney(paymentShare.shareAmountMinor, currency)} a ${payeeName}.`
						: undefined
				}
				onClose={() => !pending && setPaymentShare(null)}
				open={Boolean(paymentShare)}
				title={paymentShare?.status === "paid" ? "Comprobante de pago" : "Registrar pago"}
			>
				<div className="grid gap-5">
					<label className="grid gap-2 text-sm font-semibold" htmlFor="payment-proof">
						<span>Comprobante de pago (opcional)</span>
						<input
							accept={PAYMENT_PROOF_CONTENT_TYPES.join(",")}
							className="border-line-strong bg-paper-strong file:bg-ink file:text-paper focus-visible:outline-accent min-h-12 rounded-xl border px-3 py-2 text-sm file:mr-3 file:rounded-full file:border-0 file:px-3 file:py-1.5 file:text-xs file:font-bold focus-visible:outline-2 focus-visible:outline-offset-2"
							disabled={pending}
							id="payment-proof"
							onChange={(event) => {
								setError("");
								setFile(event.target.files?.[0] ?? null);
							}}
							type="file"
						/>
						<span className="text-ink-faint text-xs font-normal">
							JPG, PNG o WebP · máximo 10 MB
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
						<Button disabled={pending} onClick={() => setPaymentShare(null)} variant="ghost">
							Cancelar
						</Button>
						<Button
							disabled={pending || (paymentShare?.status === "paid" && !file)}
							onClick={submitPayment}
						>
							{pending ? <LoaderCircle aria-hidden className="animate-spin" size={16} /> : null}
							{paymentButtonLabel}
						</Button>
					</div>
				</div>
			</Dialog>

			<Dialog
				description="El archivo se eliminará de forma permanente y este monto volverá a aparecer como deuda pendiente."
				onClose={() => !pending && setRevertShare(null)}
				open={Boolean(revertShare)}
				title="Quitar comprobante"
			>
				<div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
					<Button disabled={pending} onClick={() => setRevertShare(null)} variant="ghost">
						Cancelar
					</Button>
					<Button
						disabled={pending}
						onClick={() => revertShare && markPending(revertShare)}
						variant="danger"
					>
						{pending ? <LoaderCircle aria-hidden className="animate-spin" size={16} /> : null}
						Quitar comprobante y marcar pendiente
					</Button>
				</div>
			</Dialog>

			{error && !paymentShare ? (
				<p className="text-danger mt-4 text-sm" role="alert">
					{error}
				</p>
			) : null}
		</section>
	);
}
