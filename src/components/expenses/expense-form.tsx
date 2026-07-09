"use client";

import { CalendarDays, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Field, TextareaField } from "@/components/ui/field";
import { apiRequest } from "@/lib/api/client";
import type { ExpenseDetail, ExpenseInput } from "@/lib/types/expense";
import type { Participant } from "@/lib/types/participant";

interface ExpenseFormProps {
	defaultDate: string;
	participants: Participant[];
}

export function ExpenseForm({ defaultDate, participants }: ExpenseFormProps) {
	const router = useRouter();
	const [errors, setErrors] = useState<Record<string, string[] | undefined>>({});
	const [formError, setFormError] = useState("");
	const [pending, startTransition] = useTransition();

	function submit(formData: FormData) {
		setErrors({});
		setFormError("");
		const amountValue = String(formData.get("amountMinor") ?? "").replaceAll(/[^0-9]/g, "");
		const input: ExpenseInput = {
			amountMinor: Number(amountValue),
			currency: "CLP",
			description: String(formData.get("description") ?? "").trim() || null,
			expenseDate: String(formData.get("expenseDate") ?? ""),
			name: String(formData.get("name") ?? ""),
			paidByParticipantId: String(formData.get("paidByParticipantId") ?? ""),
		};
		startTransition(async () => {
			const result = await apiRequest<ExpenseDetail>("/api/expenses", {
				body: JSON.stringify(input),
				method: "POST",
			});
			if (result.err) {
				setErrors(result.val.errors ?? {});
				setFormError(result.val.message);
				return;
			}
			router.push(`/expenses/${result.val.id}`);
			router.refresh();
		});
	}

	return (
		<form action={submit} className="grid gap-7">
			<div className="grid gap-5 sm:grid-cols-2">
				<div className="sm:col-span-2">
					<Field
						autoFocus
						error={errors.name?.[0]}
						id="name"
						label="Nombre del gasto"
						maxLength={120}
						name="name"
						placeholder="Ej. Supermercado"
						required
					/>
				</div>
				<Field
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
						defaultValue=""
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
						defaultValue={defaultDate}
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
				<Button disabled={pending} type="submit">
					<Save aria-hidden size={18} /> {pending ? "Guardando…" : "Guardar gasto"}
				</Button>
			</div>
		</form>
	);
}
