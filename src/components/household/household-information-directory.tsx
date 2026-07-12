"use client";

import {
	Archive,
	Copy,
	ExternalLink,
	Link2,
	Pencil,
	Plus,
	Save,
	Shapes,
	Trash2,
} from "lucide-react";
import { useState, useTransition } from "react";
import type { FormEvent } from "react";
import {
	ExpenseKindIcon,
	EXPENSE_KIND_ICON_OPTIONS,
} from "@/components/expenses/expense-kind-icon";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, SelectField, TextareaField } from "@/components/ui/field";
import {
	archiveHouseholdInformation,
	createHouseholdInformation,
	updateHouseholdInformation,
} from "@/lib/api/household-information";
import type { ExpenseKindIconKey } from "@/lib/const/expense-kinds";
import type {
	HouseholdInformationFieldInput,
	HouseholdInformationInput,
	HouseholdInformationItem,
} from "@/lib/types/household-information";
import { formatDateTime } from "@/lib/util/format";

interface HouseholdInformationDirectoryProps {
	canManage: boolean;
	initialItems: HouseholdInformationItem[];
}

interface DraftField extends HouseholdInformationFieldInput {
	key: string;
}

interface DraftItem {
	customerReference: string;
	fields: DraftField[];
	iconKey: ExpenseKindIconKey;
	notes: string;
	paymentUrl: string;
	providerName: string;
	title: string;
}

const presets: readonly { iconKey: ExpenseKindIconKey; label: string; title: string }[] = [
	{ iconKey: "water", label: "Agua", title: "Agua" },
	{ iconKey: "electricity", label: "Luz", title: "Luz" },
	{ iconKey: "gas", label: "Gas", title: "Gas" },
	{ iconKey: "building", label: "Gastos comunes", title: "Gastos comunes" },
	{ iconKey: "other", label: "Otro dato", title: "" },
];

function emptyDraft(): DraftItem {
	return {
		customerReference: "",
		fields: [],
		iconKey: "water",
		notes: "",
		paymentUrl: "",
		providerName: "",
		title: "Agua",
	};
}

function draftFromItem(item: HouseholdInformationItem): DraftItem {
	return {
		customerReference: item.customerReference ?? "",
		fields: item.fields.map((field) => ({
			displayType: field.displayType,
			key: field.id,
			label: field.label,
			value: field.value,
		})),
		iconKey: item.iconKey,
		notes: item.notes ?? "",
		paymentUrl: item.paymentUrl ?? "",
		providerName: item.providerName ?? "",
		title: item.title,
	};
}

function inputFromDraft(draft: DraftItem): HouseholdInformationInput {
	return {
		customerReference: draft.customerReference,
		fields: draft.fields.map(({ displayType, label, value }) => ({ displayType, label, value })),
		iconKey: draft.iconKey,
		notes: draft.notes,
		paymentUrl: draft.paymentUrl,
		providerName: draft.providerName,
		title: draft.title,
	};
}

function HouseholdInformationForm({
	draft,
	errors,
	idPrefix,
	onChange,
}: {
	draft: DraftItem;
	errors: Record<string, string[] | undefined>;
	idPrefix: string;
	onChange: (draft: DraftItem) => void;
}) {
	function updateField(key: string, changes: Partial<DraftField>) {
		onChange({
			...draft,
			fields: draft.fields.map((field) => (field.key === key ? { ...field, ...changes } : field)),
		});
	}

	return (
		<div className="grid gap-5">
			<fieldset className="grid gap-3">
				<legend className="text-sm font-medium">Comenzar con</legend>
				<div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
					{presets.map((preset) => (
						<button
							className="border-line bg-paper hover:border-accent/40 focus-visible:outline-accent grid min-h-20 place-items-center gap-1.5 rounded-xl border px-2 py-3 text-xs font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2"
							key={preset.label}
							onClick={() =>
								onChange({ ...draft, iconKey: preset.iconKey, title: preset.title || draft.title })
							}
							type="button"
						>
							<ExpenseKindIcon aria-hidden iconKey={preset.iconKey} size={20} />
							{preset.label}
						</button>
					))}
				</div>
			</fieldset>
			<div className="grid gap-5 sm:grid-cols-2">
				<Field
					error={errors.title?.[0]}
					id={`${idPrefix}-title`}
					label="Nombre"
					maxLength={80}
					onChange={(event) => onChange({ ...draft, title: event.target.value })}
					required
					value={draft.title}
				/>
				<SelectField
					error={errors.iconKey?.[0]}
					id={`${idPrefix}-icon`}
					label="Icono"
					onChange={(event) =>
						onChange({ ...draft, iconKey: event.target.value as ExpenseKindIconKey })
					}
					value={draft.iconKey}
				>
					{EXPENSE_KIND_ICON_OPTIONS.map((option) => (
						<option key={option.iconKey} value={option.iconKey}>
							{option.label}
						</option>
					))}
				</SelectField>
			</div>
			<div className="grid gap-5 sm:grid-cols-2">
				<Field
					error={errors.providerName?.[0]}
					id={`${idPrefix}-provider`}
					label="Empresa o proveedor"
					maxLength={120}
					onChange={(event) => onChange({ ...draft, providerName: event.target.value })}
					placeholder="Ej. Aguas Andinas"
					value={draft.providerName}
				/>
				<Field
					error={errors.customerReference?.[0]}
					hint="Se guarda como texto para conservar ceros iniciales."
					id={`${idPrefix}-reference`}
					label="Nº de cliente o referencia"
					maxLength={120}
					onChange={(event) => onChange({ ...draft, customerReference: event.target.value })}
					value={draft.customerReference}
				/>
			</div>
			<Field
				autoCapitalize="none"
				error={errors.paymentUrl?.[0]}
				id={`${idPrefix}-payment-url`}
				label="Sitio de pago"
				onChange={(event) => onChange({ ...draft, paymentUrl: event.target.value })}
				placeholder="https://..."
				type="url"
				value={draft.paymentUrl}
			/>
			<TextareaField
				error={errors.notes?.[0]}
				id={`${idPrefix}-notes`}
				label="Notas"
				maxLength={2000}
				onChange={(event) => onChange({ ...draft, notes: event.target.value })}
				placeholder="Horarios, instrucciones o información útil. No guardes contraseñas."
				value={draft.notes}
			/>
			<fieldset className="grid gap-3">
				<div className="flex items-center justify-between gap-3">
					<legend className="text-sm font-medium">Campos adicionales</legend>
					<Button
						className="min-h-9 px-3 text-xs"
						disabled={draft.fields.length >= 12}
						onClick={() =>
							onChange({
								...draft,
								fields: [
									...draft.fields,
									{ displayType: "text", key: crypto.randomUUID(), label: "", value: "" },
								],
							})
						}
						type="button"
						variant="secondary"
					>
						<Plus aria-hidden size={15} /> Agregar campo
					</Button>
				</div>
				{errors.fields?.[0] ? <p className="text-danger text-xs">{errors.fields[0]}</p> : null}
				{draft.fields.length ? (
					<div className="grid gap-3">
						{draft.fields.map((field, index) => (
							<div
								className="border-line bg-paper-strong/45 grid gap-3 rounded-2xl border p-4 sm:grid-cols-[0.75fr_0.55fr_1fr_auto] sm:items-end"
								key={field.key}
							>
								<Field
									id={`${idPrefix}-field-label-${field.key}`}
									label={`Etiqueta ${index + 1}`}
									maxLength={60}
									onChange={(event) => updateField(field.key, { label: event.target.value })}
									value={field.label}
								/>
								<SelectField
									id={`${idPrefix}-field-type-${field.key}`}
									label="Tipo"
									onChange={(event) =>
										updateField(field.key, {
											displayType: event.target.value === "link" ? "link" : "text",
										})
									}
									value={field.displayType}
								>
									<option value="text">Texto</option>
									<option value="link">Enlace</option>
								</SelectField>
								<Field
									id={`${idPrefix}-field-value-${field.key}`}
									label="Valor"
									maxLength={500}
									onChange={(event) => updateField(field.key, { value: event.target.value })}
									type={field.displayType === "link" ? "url" : "text"}
									value={field.value}
								/>
								<Button
									aria-label={`Eliminar campo ${index + 1}`}
									className="size-11 p-0"
									onClick={() =>
										onChange({
											...draft,
											fields: draft.fields.filter(({ key }) => key !== field.key),
										})
									}
									type="button"
									variant="ghost"
								>
									<Trash2 aria-hidden size={17} />
								</Button>
							</div>
						))}
					</div>
				) : (
					<p className="text-ink-muted text-xs">
						Úsalos solo cuando los datos principales no alcancen.
					</p>
				)}
			</fieldset>
		</div>
	);
}

export function HouseholdInformationDirectory({
	canManage,
	initialItems,
}: HouseholdInformationDirectoryProps) {
	const [items, setItems] = useState(initialItems);
	const [draft, setDraft] = useState<DraftItem>(emptyDraft);
	const [editingItem, setEditingItem] = useState<HouseholdInformationItem | null>(null);
	const [archivingItem, setArchivingItem] = useState<HouseholdInformationItem | null>(null);
	const [editorOpen, setEditorOpen] = useState(false);
	const [formError, setFormError] = useState("");
	const [fieldErrors, setFieldErrors] = useState<Record<string, string[] | undefined>>({});
	const [notice, setNotice] = useState("");
	const [pending, startTransition] = useTransition();

	function openCreator() {
		setEditingItem(null);
		setDraft(emptyDraft());
		setFormError("");
		setFieldErrors({});
		setEditorOpen(true);
	}

	function openEditor(item: HouseholdInformationItem) {
		setEditingItem(item);
		setDraft(draftFromItem(item));
		setFormError("");
		setFieldErrors({});
		setEditorOpen(true);
	}

	function closeEditor() {
		setEditorOpen(false);
		setEditingItem(null);
		setFormError("");
		setFieldErrors({});
	}

	function submit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setFormError("");
		setFieldErrors({});
		setNotice("");
		startTransition(async () => {
			const input = inputFromDraft(draft);
			const result = editingItem
				? await updateHouseholdInformation(editingItem.id, input)
				: await createHouseholdInformation(input);
			if (result.err) {
				setFormError(result.val.message);
				setFieldErrors(result.val.errors ?? {});
				return;
			}
			setItems((current) =>
				editingItem
					? current.map((item) => (item.id === result.val.item.id ? result.val.item : item))
					: [...current, result.val.item],
			);
			setNotice(
				editingItem
					? `“${result.val.item.title}” fue actualizado.`
					: `“${result.val.item.title}” fue agregado a la casa.`,
			);
			closeEditor();
		});
	}

	function confirmArchive() {
		if (!archivingItem) return;
		setFormError("");
		setNotice("");
		startTransition(async () => {
			const result = await archiveHouseholdInformation(archivingItem.id);
			if (result.err) {
				setFormError(result.val.message);
				setArchivingItem(null);
				return;
			}
			setItems((current) => current.filter(({ id }) => id !== archivingItem.id));
			setNotice(`“${archivingItem.title}” fue archivado.`);
			setArchivingItem(null);
		});
	}

	async function copyReference(item: HouseholdInformationItem) {
		if (!item.customerReference) return;
		try {
			await navigator.clipboard.writeText(item.customerReference);
			setNotice(`Referencia de “${item.title}” copiada.`);
		} catch {
			setNotice("No pudimos copiar la referencia. Puedes seleccionarla manualmente.");
		}
	}

	return (
		<div className="mt-8">
			<div className="mb-5 flex flex-wrap items-center justify-between gap-3">
				<div>
					<h2 className="font-display text-2xl font-semibold">Datos disponibles</h2>
					<p className="text-ink-muted mt-1 text-sm">
						Referencias y accesos que usamos en la casa.
					</p>
				</div>
				{canManage ? (
					<Button onClick={openCreator}>
						<Plus aria-hidden size={17} /> Agregar dato
					</Button>
				) : null}
			</div>
			{formError ? (
				<p
					className="border-danger/20 bg-danger/8 text-danger mb-4 rounded-xl border px-4 py-3 text-sm"
					role="alert"
				>
					{formError}
				</p>
			) : null}
			{notice ? (
				<p
					className="border-positive/20 bg-positive/8 text-positive-strong mb-4 rounded-xl border px-4 py-3 text-sm"
					role="status"
				>
					{notice}
				</p>
			) : null}
			{items.length ? (
				<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
					{items.map((item, index) => (
						<article
							className="animate-rise border-line bg-paper/88 group relative flex min-w-0 flex-col overflow-hidden rounded-3xl border p-5 shadow-[0_24px_65px_-52px_rgba(40,40,34,0.8)] sm:p-6"
							key={item.id}
							style={{ animationDelay: `${Math.min(index, 6) * 45}ms` }}
						>
							<div className="flex items-start gap-4">
								<span className="bg-accent/10 text-accent grid size-12 shrink-0 place-items-center rounded-2xl">
									<ExpenseKindIcon aria-hidden iconKey={item.iconKey} size={23} />
								</span>
								<div className="min-w-0 flex-1">
									<h3 className="font-display truncate text-2xl font-semibold">{item.title}</h3>
									<p className="text-ink-muted mt-1 truncate text-sm">
										{item.providerName ?? "Proveedor no informado"}
									</p>
								</div>
								{canManage ? (
									<div className="flex shrink-0 gap-1">
										<Button
											aria-label={`Editar ${item.title}`}
											className="size-10 p-0"
											onClick={() => openEditor(item)}
											variant="ghost"
										>
											<Pencil aria-hidden size={16} />
										</Button>
										<Button
											aria-label={`Archivar ${item.title}`}
											className="size-10 p-0"
											onClick={() => setArchivingItem(item)}
											variant="ghost"
										>
											<Archive aria-hidden size={16} />
										</Button>
									</div>
								) : null}
							</div>
							<div className="border-line mt-5 grid gap-4 border-t pt-5">
								{item.customerReference ? (
									<div>
										<p className="text-ink-faint text-[0.68rem] font-bold tracking-[0.13em] uppercase">
											Nº de cliente o referencia
										</p>
										<div className="mt-1 flex items-center justify-between gap-3">
											<code className="text-ink font-mono text-sm font-semibold break-all">
												{item.customerReference}
											</code>
											<Button
												aria-label={`Copiar referencia de ${item.title}`}
												className="size-9 shrink-0 p-0"
												onClick={() => copyReference(item)}
												variant="ghost"
											>
												<Copy aria-hidden size={15} />
											</Button>
										</div>
									</div>
								) : null}
								{item.fields.map((field) => (
									<div key={field.id}>
										<p className="text-ink-faint text-[0.68rem] font-bold tracking-[0.13em] uppercase">
											{field.label}
										</p>
										{field.displayType === "link" ? (
											<a
												className="text-accent decoration-accent/30 mt-1 inline-flex items-center gap-1.5 text-sm font-semibold break-all underline underline-offset-4"
												href={field.value}
												rel="noreferrer"
												target="_blank"
											>
												{field.value} <ExternalLink aria-hidden className="shrink-0" size={14} />
											</a>
										) : (
											<p className="mt-1 text-sm font-medium break-words">{field.value}</p>
										)}
									</div>
								))}
								{item.notes ? (
									<p className="text-ink-muted text-sm leading-6 whitespace-pre-wrap">
										{item.notes}
									</p>
								) : null}
							</div>
							<div className="mt-auto pt-5">
								{item.paymentUrl ? (
									<a
										className="bg-accent text-accent-foreground hover:bg-accent-strong flex min-h-11 w-full items-center justify-center gap-2 rounded-full px-5 text-sm font-semibold transition hover:-translate-y-0.5"
										href={item.paymentUrl}
										rel="noreferrer"
										target="_blank"
									>
										<Link2 aria-hidden size={16} /> Ir al sitio de pago{" "}
										<ExternalLink aria-hidden size={14} />
									</a>
								) : null}
								<p className="text-ink-faint mt-4 text-center text-[0.68rem]">
									Actualizado {formatDateTime(item.updatedAt)} por {item.updatedByName}
								</p>
							</div>
						</article>
					))}
				</div>
			) : (
				<EmptyState
					action={
						canManage ? (
							<Button onClick={openCreator}>
								<Plus aria-hidden size={17} /> Agregar el primer dato
							</Button>
						) : undefined
					}
					description={
						canManage
							? "Agrega referencias de servicios y enlaces de pago para que todos puedan encontrarlos."
							: "Un administrador todavía no ha agregado referencias o enlaces para la casa."
					}
					icon={Shapes}
					title="La libreta de la casa está vacía"
				/>
			)}

			<Dialog
				description="La información será visible para todas las personas con acceso a la plataforma."
				onClose={closeEditor}
				open={editorOpen}
				title={editingItem ? "Editar dato de la casa" : "Agregar dato de la casa"}
			>
				<form className="max-h-[72vh] overflow-y-auto pr-1" onSubmit={submit}>
					<HouseholdInformationForm
						draft={draft}
						errors={fieldErrors}
						idPrefix={editingItem ? "edit-household" : "create-household"}
						onChange={setDraft}
					/>
					{formError ? (
						<p
							className="border-danger/20 bg-danger/8 text-danger mt-5 rounded-xl border px-4 py-3 text-sm"
							role="alert"
						>
							{formError}
						</p>
					) : null}
					<div className="bg-paper border-line sticky bottom-0 mt-6 flex justify-end gap-3 border-t py-4">
						<Button disabled={pending} onClick={closeEditor} variant="secondary">
							Cancelar
						</Button>
						<Button disabled={pending} type="submit">
							<Save aria-hidden size={17} /> {pending ? "Guardando…" : "Guardar"}
						</Button>
					</div>
				</form>
			</Dialog>

			<Dialog
				description={
					archivingItem
						? `“${archivingItem.title}” dejará de aparecer para todos los usuarios. Su información se conservará.`
						: undefined
				}
				onClose={() => setArchivingItem(null)}
				open={Boolean(archivingItem)}
				title="Archivar dato"
			>
				<div className="flex justify-end gap-3">
					<Button disabled={pending} onClick={() => setArchivingItem(null)} variant="secondary">
						Cancelar
					</Button>
					<Button disabled={pending} onClick={confirmArchive} variant="danger">
						<Archive aria-hidden size={17} /> {pending ? "Archivando…" : "Archivar"}
					</Button>
				</div>
			</Dialog>
		</div>
	);
}
