import type {
	InputHTMLAttributes,
	ReactNode,
	SelectHTMLAttributes,
	TextareaHTMLAttributes,
} from "react";
import { cn } from "@/lib/util/cn";

interface FieldShellProps {
	children: ReactNode;
	error?: string;
	hint?: string;
	id: string;
	label: string;
}

function FieldShell({ children, error, hint, id, label }: FieldShellProps) {
	const message = error ?? hint;
	return (
		<div className="text-ink grid max-w-full min-w-0 gap-2 text-sm font-medium">
			<label htmlFor={id}>{label}</label>
			{children}
			{message ? (
				<span
					className={cn("text-xs font-normal", error ? "text-danger" : "text-ink-muted")}
					id={`${id}-message`}
				>
					{message}
				</span>
			) : null}
		</div>
	);
}

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
	error?: string;
	hint?: string;
	label: string;
}

export function Field({ className, error, hint, id, label, ...props }: FieldProps) {
	if (!id) throw new Error("Field requires an id.");
	return (
		<FieldShell error={error} hint={hint} id={id} label={label}>
			<input
				aria-describedby={error || hint ? `${id}-message` : undefined}
				aria-invalid={Boolean(error)}
				className={cn(
					"border-line-strong bg-paper text-ink placeholder:text-ink-faint focus:border-accent focus:ring-accent/15 min-h-12 w-full max-w-full min-w-0 rounded-xl border px-4 text-base transition outline-none focus:ring-3",
					error && "border-danger focus:border-danger focus:ring-danger/15",
					className,
				)}
				id={id}
				{...props}
			/>
		</FieldShell>
	);
}

interface SelectFieldProps extends SelectHTMLAttributes<HTMLSelectElement> {
	error?: string;
	hint?: string;
	label: string;
}

export function SelectField({ className, error, hint, id, label, ...props }: SelectFieldProps) {
	if (!id) throw new Error("SelectField requires an id.");
	return (
		<FieldShell error={error} hint={hint} id={id} label={label}>
			<select
				aria-describedby={error || hint ? `${id}-message` : undefined}
				aria-invalid={Boolean(error)}
				aria-label={label}
				className={cn(
					"border-line-strong bg-paper text-ink focus:border-accent focus:ring-accent/15 min-h-12 w-full max-w-full min-w-0 rounded-xl border px-4 text-base transition outline-none focus:ring-3",
					error && "border-danger focus:border-danger focus:ring-danger/15",
					className,
				)}
				id={id}
				{...props}
			/>
		</FieldShell>
	);
}

interface TextareaFieldProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
	error?: string;
	hint?: string;
	label: string;
}

export function TextareaField({ className, error, hint, id, label, ...props }: TextareaFieldProps) {
	if (!id) throw new Error("TextareaField requires an id.");
	return (
		<FieldShell error={error} hint={hint} id={id} label={label}>
			<textarea
				aria-describedby={error || hint ? `${id}-message` : undefined}
				aria-invalid={Boolean(error)}
				className={cn(
					"border-line-strong bg-paper text-ink placeholder:text-ink-faint focus:border-accent focus:ring-accent/15 min-h-28 w-full max-w-full min-w-0 resize-y rounded-xl border px-4 py-3 text-base transition outline-none focus:ring-3",
					error && "border-danger focus:border-danger focus:ring-danger/15",
					className,
				)}
				id={id}
				{...props}
			/>
		</FieldShell>
	);
}
