"use client";

import { X } from "lucide-react";
import { type KeyboardEvent, type ReactNode, useEffect, useId, useRef } from "react";
import { Button } from "@/components/ui/button";

const focusableSelector = [
	"a[href]",
	"button:not([disabled])",
	'input:not([disabled]):not([type="hidden"])',
	"select:not([disabled])",
	"textarea:not([disabled])",
	'[contenteditable="true"]',
	'[tabindex]:not([tabindex="-1"])',
].join(",");

interface DialogProps {
	children: ReactNode;
	description?: string;
	onClose: () => void;
	open: boolean;
	title: string;
}

export function Dialog({ children, description, onClose, open, title }: DialogProps) {
	const dialogRef = useRef<HTMLDialogElement>(null);
	const returnFocusRef = useRef<HTMLElement | null>(null);
	const titleId = useId();
	const descriptionId = useId();

	function keepFocusInside(event: KeyboardEvent<HTMLDialogElement>) {
		if (event.key !== "Tab") return;
		const focusableElements = Array.from(
			event.currentTarget.querySelectorAll<HTMLElement>(focusableSelector),
		).filter(
			(element) =>
				element.getAttribute("aria-hidden") !== "true" && element.getClientRects().length > 0,
		);
		const first = focusableElements[0];
		const last = focusableElements.at(-1);
		if (!first || !last) return;

		if (event.shiftKey && document.activeElement === first) {
			event.preventDefault();
			last.focus();
		} else if (!event.shiftKey && document.activeElement === last) {
			event.preventDefault();
			first.focus();
		}
	}

	useEffect(() => {
		const dialog = dialogRef.current;
		if (!dialog || !open) return;

		const activeElement = document.activeElement;
		if (activeElement instanceof HTMLElement && !dialog.contains(activeElement)) {
			returnFocusRef.current = activeElement;
		}

		if (!dialog.open) {
			if (typeof dialog.showModal === "function") dialog.showModal();
			else dialog.setAttribute("open", "");
		}

		const previousBodyOverflow = document.body.style.overflow;
		document.body.style.overflow = "hidden";
		dialog.querySelector<HTMLElement>("[data-dialog-close]")?.focus();

		return () => {
			if (dialog.open) {
				if (typeof dialog.close === "function") dialog.close();
				else dialog.removeAttribute("open");
			}
			document.body.style.overflow = previousBodyOverflow;
			if (returnFocusRef.current?.isConnected) returnFocusRef.current.focus();
		};
	}, [open]);

	return (
		<dialog
			aria-describedby={description ? descriptionId : undefined}
			aria-labelledby={titleId}
			aria-modal="true"
			className="backdrop:bg-ink/45 fixed inset-0 z-50 m-0 h-dvh max-h-dvh w-screen max-w-none overflow-hidden border-0 bg-transparent p-0 text-inherit backdrop:backdrop-blur-[2px]"
			onCancel={(event) => {
				event.preventDefault();
				onClose();
			}}
			onKeyDown={keepFocusInside}
			ref={dialogRef}
		>
			<div
				className="flex h-full min-h-0 items-end justify-center pt-[env(safe-area-inset-top)] sm:items-center sm:p-6"
				onMouseDown={(event) => event.currentTarget === event.target && onClose()}
			>
				<div className="animate-rise border-line bg-paper flex max-h-full w-full min-w-0 flex-col overflow-hidden rounded-t-3xl border shadow-2xl sm:max-h-[calc(100dvh-3rem)] sm:max-w-lg sm:rounded-3xl">
					<div className="flex shrink-0 items-start justify-between gap-4 px-5 pt-5 pb-4 sm:px-6 sm:pt-6">
						<div className="min-w-0">
							<h2 className="font-display text-ink text-2xl font-semibold" id={titleId}>
								{title}
							</h2>
							{description ? (
								<p className="text-ink-muted mt-1 text-sm" id={descriptionId}>
									{description}
								</p>
							) : null}
						</div>
						<Button
							aria-label="Cerrar"
							className="-mt-2 -mr-2 size-11 shrink-0 p-0"
							data-dialog-close
							onClick={onClose}
							variant="ghost"
						>
							<X aria-hidden size={20} />
						</Button>
					</div>
					<div className="min-h-0 overflow-y-auto overscroll-contain px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:px-6 sm:pb-6">
						{children}
					</div>
				</div>
			</div>
		</dialog>
	);
}
