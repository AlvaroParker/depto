"use client";

import { CalendarDays, Check, Save, UsersRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { ExpenseKindIcon } from "@/components/expenses/expense-kind-icon";
import { Field, TextareaField } from "@/components/ui/field";
import { apiRequest } from "@/lib/api/client";
import { uploadReceipt } from "@/lib/api/receipts";
import { MAX_RECEIPT_SIZE_BYTES, RECEIPT_CONTENT_TYPES } from "@/lib/const/receipts";
import { DEFAULT_EXPENSE_KIND_ID } from "@/lib/const/expense-kinds";
import type { ExpenseDetail, ExpenseInput } from "@/lib/types/expense";
import type { ExpenseKind } from "@/lib/types/expense-kind";
import type { Participant } from "@/lib/types/participant";

interface ExpenseFormProps {
	defaultDate: string;
	expense?: ExpenseDetail;
	expenseKinds: ExpenseKind[];
	participants: Participant[];
}

export function ExpenseForm({
	defaultDate,
	expense,
	expenseKinds,
	participants,
}: ExpenseFormProps) {
	const router = useRouter();
	const initialParticipantIds = expense
		? expense.shares.map((share) => share.participant.id)
		: participants.map((participant) => participant.id);
	const [participantIds, setParticipantIds] = useState(initialParticipantIds);
	const [payerId, setPayerId] = useState(expense?.payer.id ?? "");
	const [kindId, setKindId] = useState(
		expense?.kind.id ??
			expenseKinds.find((kind) => kind.id === DEFAULT_EXPENSE_KIND_ID)?.id ??
			expenseKinds[0]?.id ??
			"",
	);
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
			kindId,
			name: String(formData.get("name") ?? ""),
			paidByParticipantId: payerId,
			participantIds,
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
					<label className="text-ink grid gap-2 text-sm font-medium" htmlFor="kindId">
						<span>Categoría</span>
						<span className="grid grid-cols-[3rem_minmax(0,1fr)] gap-3">
							<span className="border-accent/20 bg-accent/10 text-accent grid size-12 place-items-center rounded-xl border">
								<ExpenseKindIcon
									aria-hidden
									iconKey={expenseKinds.find((kind) => kind.id === kindId)?.iconKey ?? "other"}
									size={21}
								/>
							</span>
							<select
								aria-invalid={Boolean(errors.kindId)}
								className="border-line-strong bg-paper text-ink focus:border-accent focus:ring-accent/15 min-h-12 w-full rounded-xl border px-4 text-base outline-none focus:ring-3"
								id="kindId"
								name="kindId"
								onChange={(event) => setKindId(event.target.value)}
								required
								value={kindId}
							>
								{expenseKinds.map((kind) => (
									<option key={kind.id} value={kind.id}>
										{kind.name}
									</option>
								))}
							</select>
						</span>
						{errors.kindId?.[0] ? (
							<span className="text-danger text-xs font-normal">{errors.kindId[0]}</span>
						) : null}
					</label>
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
						value={payerId}
						id="paidByParticipantId"
						name="paidByParticipantId"
						onChange={(event) => setPayerId(event.target.value)}
						required
					>
						<option disabled value="">
							Selecciona una persona
						</option>
						{participants
							.filter((participant) => participantIds.includes(participant.id))
							.map((participant) => (
								<option key={participant.id} value={participant.id}>
									{participant.name}
								</option>
							))}
					</select>
					{errors.paidByParticipantId?.[0] ? (
						<span className="text-danger text-xs font-normal">{errors.paidByParticipantId[0]}</span>
					) : null}
				</div>
				<fieldset className="border-line bg-paper-strong/45 grid gap-3 rounded-2xl border p-4 sm:col-span-2">
					<legend className="px-1 text-sm font-semibold">¿Quiénes participan?</legend>
					<p className="text-ink-muted flex items-center gap-2 text-xs leading-5">
						<UsersRound aria-hidden size={16} /> El monto se divide solo entre las personas que
						selecciones.
					</p>
					<div className="grid gap-2 sm:grid-cols-2">
						{participants.map((participant) => {
							const selected = participantIds.includes(participant.id);
							return (
								<label
									className={`focus-within:ring-accent/20 relative flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 transition-colors focus-within:ring-3 ${
										selected
											? "border-accent/45 bg-accent/8 text-ink"
											: "border-line bg-paper text-ink-muted hover:border-line-strong"
									}`}
									key={participant.id}
								>
									<input
										checked={selected}
										className="absolute inset-0 z-10 cursor-pointer opacity-0"
										onChange={(event) => {
											const next = event.target.checked
												? [...participantIds, participant.id]
												: participantIds.filter((id) => id !== participant.id);
											setParticipantIds(next);
											if (!next.includes(payerId)) setPayerId("");
										}}
										type="checkbox"
										value={participant.id}
									/>
									<span
										className={`grid size-6 shrink-0 place-items-center rounded-full border ${
											selected
												? "border-accent bg-accent text-accent-foreground"
												: "border-line-strong bg-paper"
										}`}
									>
										{selected ? <Check aria-hidden size={14} strokeWidth={3} /> : null}
									</span>
									<span className="font-medium">{participant.name}</span>
								</label>
							);
						})}
					</div>
					{errors.participantIds?.[0] || participantIds.length === 0 ? (
						<span className="text-danger text-xs font-normal">
							{errors.participantIds?.[0] ?? "Selecciona al menos una persona."}
						</span>
					) : null}
				</fieldset>
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
					El monto se reparte en partes iguales entre {participantIds.length || "las"}{" "}
					{participantIds.length === 1 ? "persona seleccionada" : "personas seleccionadas"}, sin
					perder ningún peso.
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
