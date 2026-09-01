"use client";

import { Pencil, Plus, Save } from "lucide-react";
import { useState, useTransition } from "react";
import type { FormEvent } from "react";
import {
	ExpenseKindIcon,
	EXPENSE_KIND_ICON_OPTIONS,
} from "@/components/expenses/expense-kind-icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import {
	createExpenseKind as createExpenseKindRequest,
	updateExpenseKind as updateExpenseKindRequest,
} from "@/lib/api/expense-kinds";
import type { ExpenseKindIconKey } from "@/lib/const/expense-kinds";
import type { ExpenseKind } from "@/lib/types/expense-kind";
import { cn } from "@/lib/util/cn";

interface ExpenseKindManagementProps {
	initialKinds: ExpenseKind[];
}

interface IconPickerProps {
	error?: string;
	idPrefix: string;
	onChange: (iconKey: ExpenseKindIconKey) => void;
	value: ExpenseKindIconKey;
}

function IconPicker({ error, idPrefix, onChange, value }: IconPickerProps) {
	return (
		<fieldset className="grid gap-3">
			<legend className="text-sm font-medium">Icono</legend>
			<div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
				{EXPENSE_KIND_ICON_OPTIONS.map((option) => {
					const selected = option.iconKey === value;
					return (
						<label
							className={cn(
								"focus-within:ring-accent/20 relative grid min-h-16 cursor-pointer place-items-center gap-1 rounded-xl border px-1 py-2 text-center text-[0.65rem] font-medium transition focus-within:ring-3",
								selected
									? "border-accent/40 bg-accent/10 text-accent-strong"
									: "border-line bg-paper text-ink-muted hover:border-line-strong hover:text-ink",
							)}
							key={option.iconKey}
						>
							<input
								checked={selected}
								className="absolute inset-0 cursor-pointer opacity-0"
								id={`${idPrefix}-${option.iconKey}`}
								name={`${idPrefix}-iconKey`}
								onChange={() => onChange(option.iconKey)}
								type="radio"
								value={option.iconKey}
							/>
							<ExpenseKindIcon aria-hidden iconKey={option.iconKey} size={20} />
							<span>{option.label}</span>
						</label>
					);
				})}
			</div>
			{error ? <span className="text-danger text-xs">{error}</span> : null}
		</fieldset>
	);
}

function sortKinds(kinds: ExpenseKind[]): ExpenseKind[] {
	return [...kinds].sort(
		(first, second) => first.sortOrder - second.sortOrder || first.name.localeCompare(second.name),
	);
}

export function ExpenseKindManagement({ initialKinds }: ExpenseKindManagementProps) {
	const [kinds, setKinds] = useState(initialKinds);
	const [createIconKey, setCreateIconKey] = useState<ExpenseKindIconKey>("other");
	const [editingKind, setEditingKind] = useState<ExpenseKind | null>(null);
	const [editIconKey, setEditIconKey] = useState<ExpenseKindIconKey>("other");
	const [formError, setFormError] = useState("");
	const [fieldErrors, setFieldErrors] = useState<Record<string, string[] | undefined>>({});
	const [editError, setEditError] = useState("");
	const [editFieldErrors, setEditFieldErrors] = useState<Record<string, string[] | undefined>>({});
	const [notice, setNotice] = useState("");
	const [pending, startTransition] = useTransition();

	function submitCreate(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const form = event.currentTarget;
		const formData = new FormData(form);
		setFormError("");
		setFieldErrors({});
		setNotice("");
		startTransition(async () => {
			const result = await createExpenseKindRequest({
				iconKey: createIconKey,
				name: String(formData.get("name") ?? ""),
			});
			if (result.err) {
				setFormError(result.val.message);
				setFieldErrors(result.val.errors ?? {});
				return;
			}
			setKinds((current) => sortKinds([...current, result.val.kind]));
			setNotice(`Categoría “${result.val.kind.name}” creada.`);
			setCreateIconKey("other");
			form.reset();
		});
	}

	function openEditor(expenseKind: ExpenseKind) {
		setEditError("");
		setEditFieldErrors({});
		setNotice("");
		setEditIconKey(expenseKind.iconKey);
		setEditingKind(expenseKind);
	}

	function closeEditor() {
		setEditingKind(null);
		setEditError("");
		setEditFieldErrors({});
	}

	function submitEdit(formData: FormData) {
		if (!editingKind) return;
		setEditError("");
		setEditFieldErrors({});
		setNotice("");
		startTransition(async () => {
			const result = await updateExpenseKindRequest(editingKind.id, {
				iconKey: editIconKey,
				name: String(formData.get("name") ?? ""),
			});
			if (result.err) {
				setEditError(result.val.message);
				setEditFieldErrors(result.val.errors ?? {});
				return;
			}
			setKinds((current) =>
				sortKinds(current.map((kind) => (kind.id === result.val.kind.id ? result.val.kind : kind))),
			);
			setNotice(`Categoría “${result.val.kind.name}” actualizada.`);
			closeEditor();
		});
	}

	return (
		<div className="mt-8 grid gap-6 xl:grid-cols-[minmax(20rem,0.72fr)_minmax(0,1.28fr)]">
			<section className="border-line bg-paper/85 shadow-card rounded-3xl border p-6 sm:p-7">
				<div className="flex items-start gap-4">
					<span className="bg-accent/10 text-accent-strong grid size-11 shrink-0 place-items-center rounded-2xl">
						<Plus aria-hidden size={21} />
					</span>
					<div>
						<h2 className="font-display text-2xl font-semibold">Nueva categoría</h2>
						<p className="text-ink-muted mt-1 text-sm leading-6">
							Crea una categoría y elige el símbolo que la acompañará en cada gasto.
						</p>
					</div>
				</div>
				<form className="mt-7 grid gap-5" onSubmit={submitCreate}>
					<Field
						error={fieldErrors.name?.[0]}
						id="kind-name"
						label="Nombre"
						maxLength={60}
						name="name"
						placeholder="Ej. Vacaciones"
						required
					/>
					<IconPicker
						error={fieldErrors.iconKey?.[0]}
						idPrefix="create-kind"
						onChange={setCreateIconKey}
						value={createIconKey}
					/>
					{formError ? (
						<p
							className="border-danger/20 bg-danger/8 text-danger rounded-xl border px-4 py-3 text-sm"
							role="alert"
						>
							{formError}
						</p>
					) : null}
					<Button className="w-full" disabled={pending} type="submit">
						<Plus aria-hidden size={18} /> {pending ? "Guardando…" : "Crear categoría"}
					</Button>
				</form>
			</section>

			<section>
				<div className="border-line bg-paper-strong/55 mb-4 flex items-center justify-between gap-3 rounded-2xl border px-5 py-4">
					<div>
						<p className="font-display text-xl font-semibold">Categorías disponibles</p>
						<p className="text-ink-muted mt-0.5 text-xs">Se muestran al registrar cada gasto.</p>
					</div>
					<Badge>{kinds.length} en total</Badge>
				</div>
				{notice ? (
					<p
						className="border-positive/20 bg-positive/8 text-positive-strong mb-4 rounded-xl border px-4 py-3 text-sm"
						role="status"
					>
						{notice}
					</p>
				) : null}
				<div className="grid gap-3 sm:grid-cols-2">
					{kinds.map((kind) => (
						<article
							className="border-line bg-paper/90 flex min-w-0 items-center gap-3 rounded-2xl border p-4"
							key={kind.id}
						>
							<span className="bg-accent/10 text-accent-strong grid size-11 shrink-0 place-items-center rounded-xl">
								<ExpenseKindIcon aria-hidden iconKey={kind.iconKey} size={20} />
							</span>
							<div className="min-w-0 flex-1">
								<h3 className="truncate text-sm font-semibold">{kind.name}</h3>
								<p className="text-ink-faint mt-1 text-xs">Orden {kind.sortOrder}</p>
							</div>
							<Button
								aria-label={`Editar ${kind.name}`}
								className="size-11 shrink-0 p-0"
								disabled={pending}
								onClick={() => openEditor(kind)}
								variant="ghost"
							>
								<Pencil aria-hidden size={17} />
							</Button>
						</article>
					))}
				</div>
			</section>

			<Dialog
				description="El cambio se verá también en los gastos que ya usan esta categoría."
				onClose={closeEditor}
				open={Boolean(editingKind)}
				title="Editar categoría"
			>
				{editingKind ? (
					<form action={submitEdit} className="grid gap-5">
						<Field
							defaultValue={editingKind.name}
							error={editFieldErrors.name?.[0]}
							id="edit-kind-name"
							label="Nombre"
							maxLength={60}
							name="name"
							required
						/>
						<IconPicker
							error={editFieldErrors.iconKey?.[0]}
							idPrefix="edit-kind"
							onChange={setEditIconKey}
							value={editIconKey}
						/>
						{editError ? (
							<p
								className="border-danger/20 bg-danger/8 text-danger rounded-xl border px-4 py-3 text-sm"
								role="alert"
							>
								{editError}
							</p>
						) : null}
						<div className="flex justify-end gap-3">
							<Button disabled={pending} onClick={closeEditor} type="button" variant="secondary">
								Cancelar
							</Button>
							<Button disabled={pending} type="submit">
								<Save aria-hidden size={17} /> {pending ? "Guardando…" : "Guardar cambios"}
							</Button>
						</div>
					</form>
				) : null}
			</Dialog>
		</div>
	);
}
