"use client";

import {
	BadgeCheck,
	CalendarDays,
	Check,
	Equal,
	HandCoins,
	Mail,
	Save,
	SlidersHorizontal,
	UsersRound,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ExpenseKindIcon } from "@/components/expenses/expense-kind-icon";
import { AttachmentInput } from "@/components/ui/attachment-input";
import { Button } from "@/components/ui/button";
import { Field, TextareaField } from "@/components/ui/field";
import { apiRequest } from "@/lib/api/client";
import { uploadReceipt } from "@/lib/api/receipts";
import { DEFAULT_EXPENSE_KIND_ID } from "@/lib/const/expense-kinds";
import { MAX_RECEIPT_SIZE_BYTES, RECEIPT_CONTENT_TYPES } from "@/lib/const/receipts";
import type {
	ExpenseDetail,
	ExpenseInput,
	ExpenseShareAllocation,
	ExpenseSplitMode,
} from "@/lib/types/expense";
import type { ExpenseKind } from "@/lib/types/expense-kind";
import type { Participant } from "@/lib/types/participant";
import { formatMoney } from "@/lib/util/format";
import { splitAmount } from "@/lib/util/split-amount";

interface ExpenseFormProps {
	canEditFinancials?: boolean;
	defaultDate: string;
	expense?: ExpenseDetail;
	expenseKinds: ExpenseKind[];
	participants: Participant[];
	payers?: Participant[];
}

const splitModeOptions: Array<{
	description: string;
	icon: typeof Equal;
	label: string;
	value: ExpenseSplitMode;
}> = [
	{
		description: "Calculamos partes iguales y distribuimos cualquier peso restante.",
		icon: Equal,
		label: "Partes iguales",
		value: "equal",
	},
	{
		description: "Define un monto exacto para cada persona antes de guardar.",
		icon: SlidersHorizontal,
		label: "Montos específicos",
		value: "custom",
	},
	{
		description: "Cada persona puede ajustar su parte pendiente; quien pagó cubre el resto.",
		icon: HandCoins,
		label: "Cuenta abierta",
		value: "open",
	},
];

function parseAmount(value: string): number {
	const normalized = value.replaceAll(/[^0-9]/g, "");
	return normalized ? Number(normalized) : 0;
}

function equalAllocationMap(amountMinor: number, participantIds: string[]): Record<string, number> {
	if (amountMinor <= 0 || participantIds.length === 0) {
		return Object.fromEntries(participantIds.map((participantId) => [participantId, 0]));
	}
	const amounts = splitAmount(amountMinor, participantIds.length);
	return Object.fromEntries(
		participantIds.map((participantId, index) => [participantId, amounts[index]]),
	);
}

function matchesEqualAllocation(
	allocations: Record<string, number>,
	amountMinor: number,
	participantIds: string[],
): boolean {
	const equal = equalAllocationMap(amountMinor, participantIds);
	return participantIds.every(
		(participantId) => allocations[participantId] === equal[participantId],
	);
}

export function ExpenseForm({
	canEditFinancials = true,
	defaultDate,
	expense,
	expenseKinds,
	participants,
	payers = participants,
}: ExpenseFormProps) {
	const router = useRouter();
	const initialParticipantIds = expense
		? expense.shares.map((share) => share.participant.id)
		: participants.map((participant) => participant.id);
	const [participantIds, setParticipantIds] = useState(initialParticipantIds);
	const [payerId, setPayerId] = useState(expense?.payer.id ?? "");
	const [amountValue, setAmountValue] = useState(expense ? String(expense.amountMinor) : "");
	const [splitMode, setSplitMode] = useState<ExpenseSplitMode>(expense?.splitMode ?? "equal");
	const [shareAmounts, setShareAmounts] = useState<Record<string, number>>(() =>
		expense
			? Object.fromEntries(
					expense.shares.map((share) => [share.participant.id, share.shareAmountMinor]),
				)
			: Object.fromEntries(participants.map((participant) => [participant.id, 0])),
	);
	const [initialPaidParticipantIds, setInitialPaidParticipantIds] = useState<string[]>([]);
	const [kindId, setKindId] = useState(
		expense?.kind.id ??
			expenseKinds.find((kind) => kind.id === DEFAULT_EXPENSE_KIND_ID)?.id ??
			expenseKinds[0]?.id ??
			"",
	);
	const [errors, setErrors] = useState<Record<string, string[] | undefined>>({});
	const [formError, setFormError] = useState("");
	const [receiptProgress, setReceiptProgress] = useState<number | null>(null);
	const [receipt, setReceipt] = useState<File | null>(null);
	const [savedId, setSavedId] = useState<string | null>(null);
	const [pending, startTransition] = useTransition();

	const amountMinor = parseAmount(amountValue);
	const selectedParticipants = participants.filter((participant) =>
		participantIds.includes(participant.id),
	);
	const selectedParticipantIds = selectedParticipants.map((participant) => participant.id);
	const openNonPayerTotal = selectedParticipants.reduce(
		(sum, participant) =>
			participant.id === payerId ? sum : sum + (shareAmounts[participant.id] ?? 0),
		0,
	);
	const openPayerAmount = Math.max(0, amountMinor - openNonPayerTotal);
	const resolvedShareAmounts = (() => {
		if (splitMode === "equal") return equalAllocationMap(amountMinor, selectedParticipantIds);
		if (splitMode === "open" && payerId) {
			return { ...shareAmounts, [payerId]: openPayerAmount };
		}
		return shareAmounts;
	})();
	const allocatedTotal = selectedParticipants.reduce(
		(sum, participant) => sum + (resolvedShareAmounts[participant.id] ?? 0),
		0,
	);
	const allocationDifference = amountMinor - allocatedTotal;
	const manualAllocationInvalid =
		splitMode !== "equal" &&
		(amountMinor <= 0 || allocatedTotal !== amountMinor || openNonPayerTotal > amountMinor);
	const eligibleInitialPaidParticipants = selectedParticipants.filter(
		(participant) => participant.id !== payerId,
	);
	const financialFieldsLocked = Boolean(expense?.splitMode === "open" && !canEditFinancials);
	const openPayerUnavailable = Boolean(
		payerId && !participants.some((participant) => participant.id === payerId),
	);

	function changeAmount(nextValue: string) {
		const previousAmount = amountMinor;
		const nextAmount = parseAmount(nextValue);
		setAmountValue(nextValue);
		if (
			splitMode !== "equal" &&
			matchesEqualAllocation(shareAmounts, previousAmount, selectedParticipantIds)
		) {
			setShareAmounts(equalAllocationMap(nextAmount, selectedParticipantIds));
		}
	}

	function changeSplitMode(nextMode: ExpenseSplitMode) {
		if (financialFieldsLocked) return;
		const nextParticipantIds =
			nextMode === "open" && payerId && !participantIds.includes(payerId)
				? [...participantIds, payerId]
				: participantIds;
		if (nextParticipantIds !== participantIds) setParticipantIds(nextParticipantIds);
		if (splitMode === "equal" && nextMode !== "equal") {
			setShareAmounts(equalAllocationMap(amountMinor, nextParticipantIds));
		} else if (splitMode === "open" && nextMode === "custom" && payerId) {
			setShareAmounts((current) => ({
				...current,
				[payerId]: resolvedShareAmounts[payerId] ?? 0,
			}));
		}
		setSplitMode(nextMode);
	}

	function changePayer(nextPayerId: string) {
		if (splitMode === "open") {
			if (nextPayerId && !participantIds.includes(nextPayerId)) {
				setParticipantIds((current) => [...current, nextPayerId]);
			}
			if (payerId) {
				setShareAmounts((current) => ({
					...current,
					[payerId]: resolvedShareAmounts[payerId] ?? 0,
					...(nextPayerId ? { [nextPayerId]: current[nextPayerId] ?? 0 } : {}),
				}));
			}
		}
		setPayerId(nextPayerId);
		setInitialPaidParticipantIds((current) =>
			current.filter((participantId) => participantId !== nextPayerId),
		);
	}

	function buildShareAllocations(): ExpenseShareAllocation[] | undefined {
		if (splitMode === "equal") return undefined;
		return selectedParticipants.map((participant) => ({
			participantId: participant.id,
			shareAmountMinor: resolvedShareAmounts[participant.id] ?? 0,
		}));
	}

	function submit(formData: FormData) {
		setErrors({});
		setFormError("");
		if (manualAllocationInvalid) {
			setErrors({
				shareAllocations: [
					openNonPayerTotal > amountMinor
						? "Los montos elegidos superan el total del gasto."
						: "Los montos deben sumar exactamente el total del gasto.",
				],
			});
			return;
		}
		const file = receipt;
		if (file && !RECEIPT_CONTENT_TYPES.includes(file.type as never)) {
			setErrors({ receipt: ["Usa un archivo JPG, PNG, WebP o PDF."] });
			return;
		}
		if (file && file.size > MAX_RECEIPT_SIZE_BYTES) {
			setErrors({ receipt: ["El comprobante no puede superar 10 MB."] });
			return;
		}
		if (file && file.size < 1) {
			setErrors({ receipt: ["El comprobante está vacío."] });
			return;
		}
		const input: ExpenseInput = {
			amountMinor,
			currency: "CLP",
			description: String(formData.get("description") ?? "").trim() || null,
			expenseDate: String(formData.get("expenseDate") ?? ""),
			kindId,
			name: String(formData.get("name") ?? ""),
			paidByParticipantId: payerId,
			participantIds,
			shareAllocations: buildShareAllocations(),
			splitMode,
		};
		startTransition(async () => {
			const result = await apiRequest<ExpenseDetail>(
				expense ? `/api/expenses/${expense.id}` : "/api/expenses",
				{
					body: JSON.stringify({
						...input,
						...(expense
							? { resetPaidReimbursements: formData.get("resetPaidReimbursements") === "on" }
							: {
									initialPaidParticipantIds,
									sendEmailNotifications: formData.get("sendEmailNotifications") === "on",
								}),
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
					setFormError(
						"El gasto se guardó sin el comprobante. Abre el gasto para volver a subir el archivo.",
					);
					return;
				}
			}
			router.push(`/expenses/${result.val.id}`);
			router.refresh();
		});
	}

	return (
		<form
			className="grid max-w-full min-w-0 gap-7"
			onSubmit={(event) => {
				event.preventDefault();
				submit(new FormData(event.currentTarget));
			}}
		>
			<div className="grid max-w-full min-w-0 gap-5 sm:grid-cols-2">
				<div className="min-w-0 sm:col-span-2">
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
				<div className="min-w-0 sm:col-span-2">
					<label
						className="text-ink grid max-w-full min-w-0 gap-2 text-sm font-medium"
						htmlFor="kindId"
					>
						<span>Categoría</span>
						<span className="grid min-w-0 grid-cols-[3rem_minmax(0,1fr)] gap-3">
							<span className="border-accent/20 bg-accent/10 text-accent-strong grid size-12 place-items-center rounded-xl border">
								<ExpenseKindIcon
									aria-hidden
									iconKey={expenseKinds.find((kind) => kind.id === kindId)?.iconKey ?? "other"}
									size={21}
								/>
							</span>
							<select
								aria-invalid={Boolean(errors.kindId)}
								className="border-line-strong bg-paper text-ink focus:border-accent focus:ring-accent/15 min-h-12 w-full max-w-full min-w-0 rounded-xl border px-4 text-base outline-none focus:ring-3"
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
				<div className="min-w-0 sm:col-span-2">
					<AttachmentInput
						accept={RECEIPT_CONTENT_TYPES}
						disabled={pending}
						file={receipt}
						hint="JPG, PNG, WebP o PDF · máximo 10 MB"
						id="receipt"
						label="Comprobante (opcional)"
						onChange={(file) => {
							setReceipt(file);
							setErrors((current) => ({ ...current, receipt: undefined }));
						}}
						onClear={() => {
							setReceipt(null);
							setErrors((current) => ({ ...current, receipt: undefined }));
						}}
					/>
					{errors.receipt?.[0] ? (
						<p className="text-danger mt-2 text-xs" role="alert">
							{errors.receipt[0]}
						</p>
					) : null}
				</div>
				<Field
					disabled={financialFieldsLocked}
					error={errors.amountMinor?.[0]}
					hint="Monto entero en pesos chilenos"
					id="amountMinor"
					inputMode="numeric"
					label="Monto (CLP)"
					name="amountMinor"
					onChange={(event) => changeAmount(event.target.value)}
					pattern="[0-9. ]+"
					placeholder="30000"
					required
					value={amountValue}
				/>
				<div className="grid max-w-full min-w-0 gap-2 text-sm font-medium">
					<label htmlFor="paidByParticipantId">¿Quién pagó?</label>
					<select
						aria-invalid={Boolean(errors.paidByParticipantId)}
						className="border-line-strong bg-paper text-ink focus:border-accent focus:ring-accent/15 min-h-12 w-full max-w-full min-w-0 rounded-xl border px-4 text-base outline-none focus:ring-3 disabled:opacity-60"
						disabled={financialFieldsLocked}
						id="paidByParticipantId"
						name="paidByParticipantId"
						onChange={(event) => changePayer(event.target.value)}
						required
						value={payerId}
					>
						<option disabled value="">
							Selecciona una persona
						</option>
						{payers.map((participant) => (
							<option key={participant.id} value={participant.id}>
								{participant.name}
							</option>
						))}
					</select>
					{errors.paidByParticipantId?.[0] ? (
						<span className="text-danger text-xs">{errors.paidByParticipantId[0]}</span>
					) : null}
				</div>

				<fieldset className="border-line bg-paper-strong/45 grid max-w-full min-w-0 gap-3 rounded-2xl border p-4 sm:col-span-2">
					<legend className="px-1 text-sm font-semibold">¿Entre quiénes se divide?</legend>
					<p className="text-ink-muted flex items-center gap-2 text-xs leading-5">
						<UsersRound aria-hidden size={16} /> Cada persona seleccionada recibe una parte. Quien
						pagó puede quedar fuera, salvo en una cuenta abierta.
					</p>
					<div className="grid min-w-0 gap-2 sm:grid-cols-2">
						{participants.map((participant) => {
							const selected = participantIds.includes(participant.id);
							const requiredOpenPayer = splitMode === "open" && participant.id === payerId;
							const selectionLocked = financialFieldsLocked || requiredOpenPayer;
							return (
								<label
									className={`focus-within:ring-accent/20 relative flex min-h-12 min-w-0 items-center gap-3 rounded-xl border px-4 py-3 transition-colors focus-within:ring-3 ${
										selected
											? "border-accent/45 bg-accent/8 text-ink"
											: "border-line bg-paper text-ink-muted"
									} ${selectionLocked ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
									key={participant.id}
								>
									<input
										checked={selected}
										className="absolute inset-0 z-10 cursor-pointer opacity-0 disabled:cursor-not-allowed"
										disabled={selectionLocked}
										onChange={(event) => {
											const next = event.target.checked
												? [...participantIds, participant.id]
												: participantIds.filter((id) => id !== participant.id);
											setParticipantIds(next);
											if (event.target.checked) {
												setShareAmounts((current) => ({ ...current, [participant.id]: 0 }));
											}
											setInitialPaidParticipantIds((current) =>
												current.filter((participantId) => next.includes(participantId)),
											);
										}}
										type="checkbox"
									/>
									<span
										className={`grid size-6 place-items-center rounded-full border ${selected ? "border-accent bg-accent text-accent-foreground" : "border-line-strong bg-paper"}`}
									>
										{selected ? <Check aria-hidden size={14} strokeWidth={3} /> : null}
									</span>
									<span className="min-w-0 font-medium [overflow-wrap:anywhere]">
										{participant.name}
									</span>
								</label>
							);
						})}
					</div>
					{errors.participantIds?.[0] || participantIds.length === 0 ? (
						<span className="text-danger text-xs">
							{errors.participantIds?.[0] ?? "Selecciona al menos una persona."}
						</span>
					) : null}
				</fieldset>

				<fieldset className="border-line grid max-w-full min-w-0 gap-3 rounded-2xl border p-4 sm:col-span-2">
					<legend className="px-1 text-sm font-semibold">¿Cómo se divide?</legend>
					<div className="grid min-w-0 gap-2 sm:grid-cols-3">
						{splitModeOptions.map((option) => {
							const selected = splitMode === option.value;
							const optionDisabled =
								financialFieldsLocked || (option.value === "open" && openPayerUnavailable);
							const Icon = option.icon;
							return (
								<label
									className={`relative grid min-h-32 min-w-0 gap-2 rounded-xl border p-4 transition ${
										selected ? "border-accent/50 bg-accent/8" : "border-line bg-paper"
									} ${optionDisabled ? "cursor-not-allowed opacity-60" : "hover:border-line-strong cursor-pointer"}`}
									key={option.value}
								>
									<input
										checked={selected}
										className="absolute inset-0 opacity-0"
										disabled={optionDisabled}
										name="splitMode"
										onChange={() => changeSplitMode(option.value)}
										type="radio"
									/>
									<Icon
										aria-hidden
										className={selected ? "text-accent-strong" : "text-ink-faint"}
										size={20}
									/>
									<strong className="text-sm">{option.label}</strong>
									<span className="text-ink-muted text-xs leading-5">{option.description}</span>
								</label>
							);
						})}
					</div>
					{openPayerUnavailable ? (
						<p className="text-ink-muted text-xs leading-5">
							Para usar una cuenta abierta, elige primero a una persona activa como pagadora.
						</p>
					) : null}
					{financialFieldsLocked ? (
						<p className="text-ink-muted text-xs leading-5">
							Solo una persona administradora puede cambiar la estructura de una cuenta abierta.
						</p>
					) : null}
				</fieldset>

				{splitMode !== "equal" ? (
					<fieldset className="border-accent/20 bg-accent/5 grid max-w-full min-w-0 gap-4 rounded-2xl border p-4 sm:col-span-2">
						<legend className="px-1 text-sm font-semibold">
							{splitMode === "custom" ? "Montos por persona" : "Montos iniciales"}
						</legend>
						<div className="grid min-w-0 gap-3">
							{selectedParticipants.map((participant) => {
								const isOpenPayer = splitMode === "open" && participant.id === payerId;
								return (
									<label
										className="border-line bg-paper grid min-w-0 gap-2 rounded-xl border p-3 sm:grid-cols-[minmax(0,1fr)_10rem] sm:items-center"
										htmlFor={`share-${participant.id}`}
										key={participant.id}
									>
										<span className="min-w-0">
											<strong className="block text-sm">{participant.name}</strong>
											<span className="text-ink-muted text-xs">
												{isOpenPayer ? "Cubre el saldo restante" : "Monto en CLP"}
											</span>
										</span>
										<input
											aria-label={`Monto de ${participant.name}`}
											className="border-line-strong bg-paper-strong text-ink focus:border-accent focus:ring-accent/15 min-h-11 w-full max-w-full min-w-0 rounded-xl border px-3 text-right text-base font-semibold outline-none focus:ring-3 disabled:opacity-60"
											disabled={financialFieldsLocked || isOpenPayer}
											id={`share-${participant.id}`}
											inputMode="numeric"
											onChange={(event) => {
												const nextAmount = parseAmount(event.target.value);
												setShareAmounts((current) => ({
													...current,
													[participant.id]: nextAmount,
												}));
												if (nextAmount === 0) {
													setInitialPaidParticipantIds((current) =>
														current.filter((id) => id !== participant.id),
													);
												}
											}}
											pattern="[0-9. ]+"
											value={resolvedShareAmounts[participant.id] ?? 0}
										/>
									</label>
								);
							})}
						</div>
						<div className="border-line flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-sm">
							<span className="text-ink-muted">
								Asignado {formatMoney(allocatedTotal)} de {formatMoney(amountMinor)}
							</span>
							<strong className={manualAllocationInvalid ? "text-danger" : "text-positive-strong"}>
								{openNonPayerTotal > amountMinor
									? `Excede por ${formatMoney(openNonPayerTotal - amountMinor)}`
									: allocationDifference === 0
										? "Total completo"
										: `Faltan ${formatMoney(allocationDifference)}`}
							</strong>
						</div>
						{errors.shareAllocations?.[0] ? (
							<span className="text-danger text-xs" role="alert">
								{errors.shareAllocations[0]}
							</span>
						) : null}
					</fieldset>
				) : null}

				{!expense ? (
					<fieldset className="border-positive/20 bg-positive/5 grid max-w-full min-w-0 gap-3 rounded-2xl border p-4 sm:col-span-2">
						<legend className="px-1 text-sm font-semibold">¿Quién ya pagó su parte?</legend>
						<p className="text-ink-muted flex items-start gap-2 text-xs leading-5">
							<BadgeCheck aria-hidden className="text-positive mt-0.5" size={16} />
							Marca reembolsos ya recibidos. En una cuenta abierta se guarda exactamente el monto
							indicado arriba.
						</p>
						{payerId && eligibleInitialPaidParticipants.length > 0 ? (
							<div className="grid min-w-0 gap-2 sm:grid-cols-2">
								{eligibleInitialPaidParticipants.map((participant) => {
									const paid = initialPaidParticipantIds.includes(participant.id);
									const shareAmount = resolvedShareAmounts[participant.id] ?? 0;
									return (
										<label
											className={`flex min-h-12 min-w-0 items-center gap-3 rounded-xl border px-4 py-3 ${
												paid ? "border-positive/40 bg-positive/10" : "border-line bg-paper"
											} ${shareAmount === 0 ? "cursor-not-allowed opacity-55" : "cursor-pointer"}`}
											key={participant.id}
										>
											<input
												checked={paid}
												className="accent-positive size-4"
												disabled={shareAmount === 0}
												onChange={(event) =>
													setInitialPaidParticipantIds((current) =>
														event.target.checked
															? [...current, participant.id]
															: current.filter((id) => id !== participant.id),
													)
												}
												type="checkbox"
											/>
											<span className="min-w-0">
												<strong className="block text-sm">{participant.name}</strong>
												<span className="text-ink-muted text-xs">{formatMoney(shareAmount)}</span>
											</span>
										</label>
									);
								})}
							</div>
						) : null}
						{errors.initialPaidParticipantIds?.[0] ? (
							<span className="text-danger text-xs">{errors.initialPaidParticipantIds[0]}</span>
						) : null}
					</fieldset>
				) : null}

				<div className="relative min-w-0">
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
				<div className="min-w-0 sm:col-span-2">
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
				{!expense ? (
					<label className="border-line bg-paper-strong/55 focus-within:ring-accent/20 flex min-w-0 cursor-pointer items-center justify-between gap-4 rounded-2xl border p-4 transition focus-within:ring-3 sm:col-span-2">
						<span className="flex min-w-0 items-start gap-3">
							<span className="bg-accent/10 text-accent-strong mt-0.5 grid size-9 shrink-0 place-items-center rounded-full">
								<Mail aria-hidden size={17} />
							</span>
							<span className="min-w-0">
								<strong className="block text-sm">Enviar notificaciones por correo</strong>
								<span className="text-ink-muted mt-1 block text-xs leading-5">
									Avisa a las personas participantes cuando guardes el gasto.
								</span>
							</span>
						</span>
						<span className="relative inline-flex shrink-0">
							<input
								className="peer absolute inset-0 z-10 cursor-pointer opacity-0"
								defaultChecked
								name="sendEmailNotifications"
								role="switch"
								type="checkbox"
							/>
							<span className="bg-line-strong peer-checked:bg-accent peer-focus-visible:outline-accent pointer-events-none relative h-7 w-12 rounded-full transition-colors duration-200 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 after:absolute after:top-1 after:left-1 after:size-5 after:rounded-full after:bg-white after:shadow-sm after:transition-transform after:duration-200 peer-checked:after:translate-x-5" />
						</span>
					</label>
				) : null}
			</div>

			<div className="border-line bg-paper-strong/55 rounded-2xl border p-4 text-sm">
				<p className="font-semibold">
					{splitMode === "equal"
						? "La división se calcula automáticamente"
						: splitMode === "custom"
							? "La división queda fijada al guardar"
							: "La cuenta permanece abierta"}
				</p>
				<p className="text-ink-muted mt-1 leading-6">
					{splitMode === "open"
						? "Cada participante puede ajustar su monto pendiente. Las partes pagadas quedan bloqueadas y quien pagó absorbe el saldo restante."
						: "Todos los montos se guardan en pesos enteros y siempre suman exactamente el total."}
				</p>
			</div>
			{expense?.shares.some((share) => share.status === "paid") && !financialFieldsLocked ? (
				<label className="border-warning/25 bg-warning/8 grid grid-cols-[auto_1fr] gap-3 rounded-2xl border p-4 text-sm">
					<input className="mt-1 size-4" name="resetPaidReimbursements" type="checkbox" />
					<span>
						<strong className="text-warning-strong block">Confirmar recálculo financiero</strong>
						<span className="text-ink-muted mt-1 block leading-6">
							Los cambios financieros reiniciarán reembolsos pagados y eliminarán sus comprobantes.
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
						Ir al gasto para subirlo
					</a>
				) : null}
				<Button disabled={pending || Boolean(savedId)} type="submit">
					<Save aria-hidden size={18} />{" "}
					{pending
						? expense
							? "Guardando cambios del gasto…"
							: "Guardando gasto…"
						: expense
							? "Guardar cambios"
							: "Guardar gasto"}
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
