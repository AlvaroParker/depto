"use client";

import { CalendarDays, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Field, TextareaField } from "@/components/ui/field";
import { apiRequest } from "@/lib/api/client";
import { uploadReceipt } from "@/lib/api/receipts";
import { MAX_RECEIPT_SIZE_BYTES, RECEIPT_CONTENT_TYPES } from "@/lib/const/receipts";
import type { ExpenseDetail, ExpenseInput } from "@/lib/types/expense";
import type { Participant } from "@/lib/types/participant";

interface ExpenseFormProps {
	defaultDate: string;
	expense?: ExpenseDetail;
	participants: Participant[];
}

export function ExpenseForm({ defaultDate, expense, participants }: ExpenseFormProps) {
	const router = useRouter();
	const [errors, setErrors] = useState<Record<string, string[] | undefined>>({});
	const [formError, setFormError] = useState("");
	const [receiptProgress, setReceiptProgress] = useState<number | null>(null);
	const [savedId, setSavedId] = useState<string | null>(null);
	const [pending, startTransition] = useTransition();

	function submit(formData: FormData) {
		setErrors({});
		setFormError("");
		const amountValue = String(formData.get("amountMinor") ?? "").replaceAll(/[^0-9]/g, "");
		const receipt = formData.get("receipt");
		const file = receipt instanceof File && receipt.size > 0 ? receipt : null;
		if (file && !RECEIPT_CONTENT_TYPES.includes(file.type as never)) {
			setErrors({ receipt: ["Usa un archivo JPG, PNG, WebP o PDF."] });
			return;
		}
		if (file && file.size > MAX_RECEIPT_SIZE_BYTES) {
			setErrors({ receipt: ["El comprobante no puede superar 10 MB."] });
			return;
		}
		const input: ExpenseInput = {
			amountMinor: Number(amountValue),
			currency: "CLP",
			description: String(formData.get("description") ?? "").trim() || null,
			expenseDate: String(formData.get("expenseDate") ?? ""),
			name: String(formData.get("name") ?? ""),
			paidByParticipantId: String(formData.get("paidByParticipantId") ?? ""),
		};
		startTransition(async () => {
			const result = await apiRequest<ExpenseDetail>(
				expense ? `/api/expenses/${expense.id}` : "/api/expenses",
				{
					body: JSON.stringify({
						...input,
						...(expense
							? { resetPaidReimbursements: formData.get("resetPaidReimbursements") === "on" }
							: {}),
					}),
					method: expense ? "PATCH" : "POST",
				},
			);
			if (result.err) {
				setErrors(result.val.errors ?? {});
				setFormError(result.val.message);
				return;
			}
			if (file) {
				setReceiptProgress(0);
				const upload = await uploadReceipt(result.val.id, file, setReceiptProgress);
				setReceiptProgress(null);
				if (upload.err) {
					setSavedId(result.val.id);
					setFormError(`El gasto se guardó, pero el comprobante no: ${upload.val.message}`);
					return;
				}
			}
			router.push(`/expenses/${result.val.id}`);
			router.refresh();
		});
	}

	return (
		<form
			className="grid gap-7"
			onSubmit={(event) => {
				event.preventDefault();
				submit(new FormData(event.currentTarget));
			}}
		>
			<div className="grid gap-5 sm:grid-cols-2">
				<div className="sm:col-span-2">
					<Field
						autoFocus
						defaultValue={expense?.name}
						error={errors.name?.[0]}
						id="name"
						label="Nombre del gasto"
						maxLength={120}
						name="name"
						placeholder="Ej. Supermercado"
						required
					/>
				</div>
				<div className="sm:col-span-2">
					<label className="text-ink grid gap-2 text-sm font-medium" htmlFor="receipt">
						<span>Comprobante (opcional)</span>
						<input
							accept={RECEIPT_CONTENT_TYPES.join(",")}
							className="border-line-strong bg-paper file:bg-paper-strong file:text-ink min-h-12 rounded-xl border px-3 py-2 text-sm file:mr-3 file:rounded-lg file:border-0 file:px-3 file:py-1.5 file:font-semibold"
							id="receipt"
							name="receipt"
							type="file"
						/>
						<span
							className={
								errors.receipt
									? "text-danger text-xs font-normal"
									: "text-ink-muted text-xs font-normal"
							}
						>
							{errors.receipt?.[0] ?? "JPG, PNG, WebP o PDF · máximo 10 MB"}
						</span>
					</label>
				</div>
				<Field
					defaultValue={expense?.amountMinor}
					error={errors.amountMinor?.[0]}
					hint="Monto entero en pesos chilenos"
					id="amountMinor"
					inputMode="numeric"
					label="Monto (CLP)"
					name="amountMinor"
					pattern="[0-9. ]+"
					placeholder="30000"
					required
				/>
				<div className="grid gap-2 text-sm font-medium">
					<label htmlFor="paidByParticipantId">¿Quién pagó?</label>
					<select
						aria-invalid={Boolean(errors.paidByParticipantId)}
						className="border-line-strong bg-paper text-ink focus:border-accent focus:ring-accent/15 min-h-12 w-full rounded-xl border px-4 text-base outline-none focus:ring-3"
						defaultValue={expense?.payer.id ?? ""}
						id="paidByParticipantId"
						name="paidByParticipantId"
						required
					>
						<option disabled value="">
							Selecciona una persona
						</option>
						{participants.map((participant) => (
							<option key={participant.id} value={participant.id}>
								{participant.name}
							</option>
						))}
					</select>
					{errors.paidByParticipantId?.[0] ? (
						<span className="text-danger text-xs font-normal">{errors.paidByParticipantId[0]}</span>
					) : null}
				</div>
				<div className="relative">
					<Field
						className="pr-11"
						defaultValue={expense?.expenseDate ?? defaultDate}
						error={errors.expenseDate?.[0]}
						id="expenseDate"
						label="Fecha"
						name="expenseDate"
						required
						type="date"
					/>
					<CalendarDays
						aria-hidden
						className="text-ink-faint pointer-events-none absolute right-4 bottom-3.5"
						size={18}
					/>
				</div>
				<div className="sm:col-span-2">
					<TextareaField
						defaultValue={expense?.description ?? ""}
						error={errors.description?.[0]}
						id="description"
						label="Descripción (opcional)"
						maxLength={2000}
						name="description"
						placeholder="Agrega un detalle que ayude a reconocerlo"
					/>
				</div>
			</div>

			<div className="border-line bg-paper-strong/55 rounded-2xl border p-4 text-sm">
				<p className="font-semibold">La división se calcula automáticamente</p>
				<p className="text-ink-muted mt-1 leading-6">
					El monto se reparte en partes iguales entre Alvaro, Camila y Trinidad, sin perder ningún
					peso.
				</p>
			</div>
			{expense?.shares.some((share) => share.status === "paid") ? (
				<label className="border-warning/25 bg-warning/8 grid grid-cols-[auto_1fr] gap-3 rounded-2xl border p-4 text-sm">
					<input className="mt-1 size-4" name="resetPaidReimbursements" type="checkbox" />
					<span>
						<strong className="block">Confirmar recálculo financiero</strong>
						<span className="text-ink-muted mt-1 block leading-6">
							Si cambias el monto o quién pagó, se reiniciarán los reembolsos ya marcados como
							pagados.
						</span>
					</span>
				</label>
			) : null}

			{formError ? (
				<p
					className="border-danger/20 bg-danger/8 text-danger rounded-xl border px-4 py-3 text-sm"
					role="alert"
				>
					{formError}
				</p>
			) : null}

			<div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
				<Button disabled={pending} onClick={() => router.back()} type="button" variant="secondary">
					Cancelar
				</Button>
				{savedId ? (
					<a
						className="bg-accent text-accent-foreground inline-flex min-h-11 items-center justify-center rounded-full px-5 text-sm font-semibold"
						href={`/expenses/${savedId}`}
					>
						Ver gasto y reintentar
					</a>
				) : null}
				<Button disabled={pending || Boolean(savedId)} type="submit">
					<Save aria-hidden size={18} />{" "}
					{pending ? "Guardando…" : expense ? "Guardar cambios" : "Guardar gasto"}
				</Button>
				{receiptProgress !== null ? (
					<span className="text-ink-muted self-center text-sm">
						Subiendo comprobante {receiptProgress}%
					</span>
				) : null}
			</div>
		</form>
	);
}
