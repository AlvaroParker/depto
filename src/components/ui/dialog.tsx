"use client";

import { X } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";

interface DialogProps {
	children: ReactNode;
	description?: string;
	onClose: () => void;
	open: boolean;
	title: string;
}

export function Dialog({ children, description, onClose, open, title }: DialogProps) {
	if (!open) return null;
	return (
		<div
			aria-label={title}
			aria-modal="true"
			className="bg-ink/45 fixed inset-0 z-50 grid place-items-end p-0 backdrop-blur-[2px] sm:place-items-center sm:p-6"
			onMouseDown={(event) => event.currentTarget === event.target && onClose()}
			role="dialog"
		>
			<div className="animate-rise border-line bg-paper w-full rounded-t-3xl border p-6 shadow-2xl sm:max-w-lg sm:rounded-3xl">
				<div className="mb-5 flex items-start justify-between gap-4">
					<div>
						<h2 className="font-display text-ink text-2xl font-semibold">{title}</h2>
						{description ? <p className="text-ink-muted mt-1 text-sm">{description}</p> : null}
					</div>
					<Button
						aria-label="Cerrar"
						className="-mt-2 -mr-2 size-11 p-0"
						onClick={onClose}
						variant="ghost"
					>
						<X aria-hidden size={20} />
					</Button>
				</div>
				{children}
			</div>
		</div>
	);
}
