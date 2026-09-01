"use client";

import { LoaderCircle, MessageCircle, Save, Trash2 } from "lucide-react";
import { type FormEvent, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { removeTelegramUserId, saveTelegramUserId } from "@/lib/api/telegram";

interface TelegramAccountSettingsProps {
	initialTelegramUserId: string | null;
}

const invalidTelegramUserIdMessage = "Ingresa un ID numérico de Telegram válido.";
const maximumTelegramUserId = 1_099_511_627_775n;

function isValidTelegramUserId(value: string): boolean {
	return /^[1-9][0-9]{0,12}$/.test(value) && BigInt(value) <= maximumTelegramUserId;
}

export function TelegramAccountSettings({ initialTelegramUserId }: TelegramAccountSettingsProps) {
	const [savedTelegramUserId, setSavedTelegramUserId] = useState<string | null>(
		initialTelegramUserId,
	);
	const [telegramUserId, setTelegramUserId] = useState(initialTelegramUserId ?? "");
	const [confirmingRemoval, setConfirmingRemoval] = useState(false);
	const [fieldError, setFieldError] = useState("");
	const [generalError, setGeneralError] = useState("");
	const [removeError, setRemoveError] = useState("");
	const [notice, setNotice] = useState("");
	const [pending, startTransition] = useTransition();

	function clearFeedback() {
		setFieldError("");
		setGeneralError("");
		setNotice("");
	}

	function submit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		clearFeedback();
		const candidate = telegramUserId.trim();
		if (!isValidTelegramUserId(candidate)) {
			setFieldError(invalidTelegramUserIdMessage);
			return;
		}

		const replacing = savedTelegramUserId !== null;
		startTransition(async () => {
			const result = await saveTelegramUserId({ telegramUserId: candidate });
			if (result.err) {
				const apiFieldError = result.val.errors?.telegramUserId?.[0];
				if (apiFieldError) setFieldError(apiFieldError);
				else setGeneralError(result.val.message);
				return;
			}

			setSavedTelegramUserId(result.val.telegramUserId);
			setTelegramUserId(result.val.telegramUserId);
			setNotice(
				replacing ? "Tu ID de Telegram fue actualizado." : "Tu ID de Telegram fue guardado.",
			);
		});
	}

	function remove() {
		setRemoveError("");
		startTransition(async () => {
			const result = await removeTelegramUserId();
			if (result.err) {
				setRemoveError(result.val.message);
				return;
			}

			setSavedTelegramUserId(null);
			setTelegramUserId("");
			setConfirmingRemoval(false);
			setNotice("Tu ID de Telegram fue eliminado.");
		});
	}

	function closeRemovalDialog() {
		if (pending) return;
		setConfirmingRemoval(false);
		setRemoveError("");
	}

	return (
		<>
			<section
				aria-labelledby="telegram-settings-title"
				className="border-line bg-paper/85 mt-8 rounded-3xl border p-5 shadow-[0_22px_60px_-48px_rgba(40,40,34,0.75)] sm:p-7"
			>
				<div className="flex items-start gap-4">
					<span className="bg-accent/10 text-accent grid size-11 shrink-0 place-items-center rounded-2xl">
						<MessageCircle aria-hidden size={21} />
					</span>
					<div className="min-w-0 flex-1">
						<div className="flex flex-wrap items-center gap-x-3 gap-y-2">
							<h2 id="telegram-settings-title" className="font-display text-2xl font-semibold">
								Telegram
							</h2>
							{savedTelegramUserId ? (
								<span className="border-positive/20 bg-positive/10 text-positive-strong inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold">
									<span aria-hidden className="bg-positive size-1.5 rounded-full" />
									Configurado
								</span>
							) : null}
						</div>
						<p className="text-ink-muted mt-1 text-sm leading-6">
							Guarda el ID numérico de tu cuenta para registrar gastos desde el bot.
						</p>
					</div>
				</div>

				<form className="mt-6 grid gap-5" noValidate onSubmit={submit}>
					<Field
						autoCapitalize="none"
						autoComplete="off"
						disabled={pending}
						error={fieldError || undefined}
						hint="Usa el ID numérico, no tu @usuario."
						id="telegram-user-id"
						inputMode="numeric"
						label="ID de usuario de Telegram"
						maxLength={13}
						name="telegramUserId"
						onChange={(event) => {
							setTelegramUserId(event.target.value);
							clearFeedback();
						}}
						pattern="[1-9][0-9]{0,12}"
						placeholder="123456789"
						required
						spellCheck={false}
						type="text"
						value={telegramUserId}
					/>
					<p className="border-line bg-paper-strong/70 text-ink-muted rounded-2xl border px-4 py-3 text-xs leading-5">
						Este dato es declarado por ti y no verificamos que esa cuenta de Telegram te pertenezca.
						Al guardarlo, autorizas al bot a registrar gastos en tu nombre; configura solo tu propia
						cuenta. Eliminarlo revoca ese acceso. Los mensajes y comprobantes que envías al bot son
						procesados por OpenAI. Cloudflare conserva el contexto de la conversación activa por
						hasta 10 minutos desde tu última interacción y luego lo elimina.
					</p>
					{generalError ? (
						<p className="text-danger text-sm" role="alert">
							{generalError}
						</p>
					) : null}
					{notice ? (
						<p className="text-positive-strong text-sm" role="status">
							{notice}
						</p>
					) : null}
					<div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
						{savedTelegramUserId ? (
							<Button
								disabled={pending}
								onClick={() => {
									clearFeedback();
									setRemoveError("");
									setConfirmingRemoval(true);
								}}
								variant="ghost"
							>
								<Trash2 aria-hidden size={16} /> Eliminar ID
							</Button>
						) : (
							<span />
						)}
						<Button className="w-full sm:w-auto" disabled={pending} type="submit">
							{pending ? (
								<LoaderCircle aria-hidden className="animate-spin" size={16} />
							) : (
								<Save aria-hidden size={16} />
							)}
							{pending
								? savedTelegramUserId
									? "Actualizando…"
									: "Guardando…"
								: savedTelegramUserId
									? "Actualizar ID"
									: "Guardar ID"}
						</Button>
					</div>
				</form>
			</section>

			<Dialog
				description="El bot dejará de poder registrar gastos en tu nombre."
				onClose={closeRemovalDialog}
				open={confirmingRemoval}
				title="Eliminar ID de Telegram"
			>
				<div className="grid gap-5">
					<div className="border-danger/15 bg-danger/6 rounded-2xl border px-4 py-4">
						<p className="text-ink-muted text-xs">ID que se eliminará</p>
						<p className="text-ink mt-1 font-mono text-sm font-semibold break-all">
							{savedTelegramUserId}
						</p>
					</div>
					{removeError ? (
						<p className="text-danger text-sm" role="alert">
							{removeError}
						</p>
					) : null}
					<div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
						<Button disabled={pending} onClick={closeRemovalDialog} variant="secondary">
							Cancelar
						</Button>
						<Button disabled={pending} onClick={remove} variant="danger">
							{pending ? (
								<LoaderCircle aria-hidden className="animate-spin" size={16} />
							) : (
								<Trash2 aria-hidden size={16} />
							)}
							{pending ? "Eliminando…" : "Eliminar ID"}
						</Button>
					</div>
				</div>
			</Dialog>
		</>
	);
}
