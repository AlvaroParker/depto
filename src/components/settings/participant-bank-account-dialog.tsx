"use client";

import { Landmark, LoaderCircle, Save, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, SelectField } from "@/components/ui/field";
import { removeParticipantBankAccount, saveParticipantBankAccount } from "@/lib/api/bank-accounts";
import { BANK_ACCOUNT_TYPES, type ParticipantBankAccount } from "@/lib/types/bank-account";
import type { ManagedUser } from "@/lib/types/user";

interface ParticipantBankAccountDialogProps {
	onClose: () => void;
	onRemoved: () => void;
	onSaved: (bankAccount: ParticipantBankAccount) => void;
	user: ManagedUser;
}

export function ParticipantBankAccountDialog({
	onClose,
	onRemoved,
	onSaved,
	user,
}: ParticipantBankAccountDialogProps) {
	const [confirmingRemoval, setConfirmingRemoval] = useState(false);
	const [error, setError] = useState("");
	const [fieldErrors, setFieldErrors] = useState<Record<string, string[] | undefined>>({});
	const [pending, startTransition] = useTransition();
	const account = user.bankAccount;

	function close() {
		if (pending) return;
		setConfirmingRemoval(false);
		setError("");
		setFieldErrors({});
		onClose();
	}

	function submit(formData: FormData) {
		if (!user.participantId) return;
		setError("");
		setFieldErrors({});
		startTransition(async () => {
			const result = await saveParticipantBankAccount(user.participantId!, {
				accountNumber: String(formData.get("accountNumber") ?? ""),
				accountType: String(
					formData.get("accountType") ?? "",
				) as ParticipantBankAccount["accountType"],
				bankName: String(formData.get("bankName") ?? ""),
				rut: String(formData.get("rut") ?? ""),
			});
			if (result.err) {
				setError(result.val.message);
				setFieldErrors(result.val.errors ?? {});
				return;
			}
			onSaved(result.val.bankAccount);
		});
	}

	function remove() {
		if (!user.participantId) return;
		setError("");
		startTransition(async () => {
			const result = await removeParticipantBankAccount(user.participantId!);
			if (result.err) {
				setError(result.val.message);
				return;
			}
			onRemoved();
		});
	}

	return (
		<Dialog
			description={
				confirmingRemoval
					? `Los pagos a ${user.displayName} dejarán de ofrecer la copia rápida hasta que agregues nuevos datos.`
					: `Estos son los datos que el hogar podrá copiar al registrar pagos a ${user.displayName}.`
			}
			onClose={close}
			open
			title={confirmingRemoval ? "Eliminar datos bancarios" : "Datos bancarios"}
		>
			{confirmingRemoval ? (
				<div className="grid gap-5">
					<div className="border-danger/15 bg-danger/6 text-ink-muted rounded-2xl border px-4 py-4 text-sm leading-6">
						<p className="text-ink font-semibold">{account?.bankName}</p>
						<p>
							{account?.accountType} · {account?.accountNumber}
						</p>
					</div>
					{error ? (
						<p className="text-danger text-sm" role="alert">
							{error}
						</p>
					) : null}
					<div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
						<Button
							disabled={pending}
							onClick={() => setConfirmingRemoval(false)}
							variant="secondary"
						>
							Volver
						</Button>
						<Button disabled={pending} onClick={remove} variant="danger">
							{pending ? (
								<LoaderCircle aria-hidden className="animate-spin" size={16} />
							) : (
								<Trash2 aria-hidden size={16} />
							)}
							{pending ? "Eliminando…" : "Eliminar datos"}
						</Button>
					</div>
				</div>
			) : (
				<form action={submit} className="grid gap-5">
					<div className="border-line bg-paper-strong flex items-center gap-3 rounded-2xl border px-4 py-3">
						<span className="bg-accent/10 text-accent grid size-10 shrink-0 place-items-center rounded-xl">
							<Landmark aria-hidden size={19} />
						</span>
						<div className="min-w-0">
							<p className="truncate text-sm font-semibold">{user.displayName}</p>
							<p className="text-ink-muted truncate text-xs">{user.email}</p>
						</div>
					</div>
					<Field
						autoCapitalize="characters"
						autoComplete="off"
						defaultValue={account?.rut ?? ""}
						error={fieldErrors.rut?.[0]}
						hint="Se validará el dígito verificador."
						id="bank-rut"
						label="RUT"
						maxLength={16}
						name="rut"
						placeholder="12.345.678-5"
						required
					/>
					<SelectField
						defaultValue={account?.accountType ?? BANK_ACCOUNT_TYPES[0]}
						error={fieldErrors.accountType?.[0]}
						id="bank-account-type"
						label="Tipo de cuenta"
						name="accountType"
						required
					>
						{BANK_ACCOUNT_TYPES.map((type) => (
							<option key={type} value={type}>
								{type}
							</option>
						))}
					</SelectField>
					<Field
						autoComplete="off"
						defaultValue={account?.accountNumber ?? ""}
						error={fieldErrors.accountNumber?.[0]}
						hint="Se conserva como texto, incluidos los ceros iniciales."
						id="bank-account-number"
						label="Número de cuenta"
						maxLength={64}
						name="accountNumber"
						required
					/>
					<Field
						autoComplete="organization"
						defaultValue={account?.bankName ?? ""}
						error={fieldErrors.bankName?.[0]}
						id="bank-name"
						label="Banco"
						maxLength={80}
						name="bankName"
						required
					/>
					{error ? (
						<p className="text-danger text-sm" role="alert">
							{error}
						</p>
					) : null}
					<div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-between">
						{account ? (
							<Button disabled={pending} onClick={() => setConfirmingRemoval(true)} variant="ghost">
								<Trash2 aria-hidden size={16} /> Eliminar datos
							</Button>
						) : (
							<span />
						)}
						<div className="flex flex-col-reverse gap-2 sm:flex-row">
							<Button disabled={pending} onClick={close} variant="secondary">
								Cancelar
							</Button>
							<Button disabled={pending} type="submit">
								{pending ? (
									<LoaderCircle aria-hidden className="animate-spin" size={16} />
								) : (
									<Save aria-hidden size={16} />
								)}
								{pending ? "Guardando…" : "Guardar datos"}
							</Button>
						</div>
					</div>
				</form>
			)}
		</Dialog>
	);
}
