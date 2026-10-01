"use client";

import { ClipboardPaste, FileUp, LoaderCircle, X } from "lucide-react";
import { type ClipboardEvent, useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

interface AttachmentInputProps {
	accept: readonly string[];
	chooseLabel?: string;
	disabled?: boolean;
	file?: File | null;
	hint: string;
	id?: string;
	label: string;
	onChange: (file: File) => void;
	onClear?: () => void;
}

const imageExtensions: Record<string, string> = {
	"image/jpeg": "jpg",
	"image/png": "png",
	"image/webp": "webp",
};

export function AttachmentInput({
	accept,
	chooseLabel = "Elegir archivo",
	disabled = false,
	file,
	hint,
	id,
	label,
	onChange,
	onClear,
}: AttachmentInputProps) {
	const generatedId = useId();
	const inputId = id ?? generatedId;
	const input = useRef<HTMLInputElement>(null);
	const request = useRef<AbortController | null>(null);
	const [reading, setReading] = useState(false);
	const [error, setError] = useState("");

	useEffect(() => () => request.current?.abort(), [disabled]);

	function select(candidate: File) {
		setError("");
		onChange(candidate);
	}

	function paste(event: ClipboardEvent<HTMLFieldSetElement>) {
		if (disabled || request.current) return;
		const image = Array.from(event.clipboardData.files).find((item) =>
			item.type.startsWith("image/"),
		);
		if (!image) return;
		event.preventDefault();
		select(image);
	}

	async function readClipboard() {
		if (disabled || request.current) return;
		setError("");
		if (!navigator.clipboard?.read) {
			setError("Para pegar, enfoca este botón y presiona Ctrl+V o ⌘V, o elige un archivo.");
			return;
		}
		const controller = new AbortController();
		request.current = controller;
		setReading(true);
		try {
			const items = await navigator.clipboard.read();
			for (const item of items) {
				const type =
					item.types.find((type) => type.startsWith("image/") && accept.includes(type)) ??
					item.types.find((type) => type.startsWith("image/"));
				if (!type) continue;
				const blob = await item.getType(type);
				if (controller.signal.aborted) return;
				select(new File([blob], `imagen-pegada.${imageExtensions[type] ?? "img"}`, { type }));
				return;
			}
			if (!controller.signal.aborted) setError("No hay una imagen en el portapapeles.");
		} catch {
			if (!controller.signal.aborted) {
				setError(
					"No se pudo leer el portapapeles. Enfoca este botón y usa Ctrl+V o ⌘V, o elige un archivo.",
				);
			}
		} finally {
			request.current = null;
			setReading(false);
		}
	}

	return (
		<fieldset className="grid min-w-0 gap-2" onPaste={paste}>
			<legend className="text-ink mb-2 text-sm font-medium">{label}</legend>
			<input
				accept={accept.join(",")}
				aria-hidden="true"
				aria-label={label}
				className="sr-only"
				disabled={disabled || reading}
				id={inputId}
				onChange={(event) => {
					const selected = event.target.files?.[0];
					event.target.value = "";
					if (selected) select(selected);
				}}
				ref={input}
				tabIndex={-1}
				type="file"
			/>
			<div className="flex flex-wrap gap-2">
				<Button
					aria-busy={disabled}
					aria-describedby={`${inputId}-hint`}
					disabled={disabled || reading}
					onClick={() => input.current?.click()}
					variant="secondary"
				>
					<FileUp aria-hidden size={17} /> {chooseLabel}
				</Button>
				<Button
					aria-busy={reading}
					aria-describedby={`${inputId}-paste-hint`}
					disabled={disabled || reading}
					onClick={readClipboard}
					variant="secondary"
				>
					{reading ? (
						<LoaderCircle aria-hidden className="animate-spin" size={17} />
					) : (
						<ClipboardPaste aria-hidden size={17} />
					)}
					Pegar imagen
				</Button>
			</div>
			{file ? (
				<div className="flex min-w-0 items-center gap-2">
					<p className="text-ink-muted min-w-0 text-sm [overflow-wrap:anywhere]" role="status">
						Archivo seleccionado: {file.name}
					</p>
					{onClear ? (
						<Button
							aria-label="Quitar archivo seleccionado"
							className="size-11 shrink-0 p-0"
							disabled={disabled || reading}
							onClick={() => {
								setError("");
								onClear();
							}}
							variant="ghost"
						>
							<X aria-hidden size={16} />
						</Button>
					) : null}
				</div>
			) : null}
			<p className="text-ink-muted text-xs" id={`${inputId}-hint`}>
				{hint}
			</p>
			<p className="text-ink-faint text-xs" id={`${inputId}-paste-hint`}>
				También puedes enfocar «Pegar imagen» y presionar Ctrl+V o ⌘V.
			</p>
			{error ? (
				<p className="text-danger text-sm" role="alert">
					{error}
				</p>
			) : null}
		</fieldset>
	);
}
