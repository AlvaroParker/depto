import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/util/cn";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
	variant?: "primary" | "secondary" | "danger" | "ghost";
}

export function Button({ className, type = "button", variant = "primary", ...props }: ButtonProps) {
	return (
		<button
			className={cn(
				"inline-flex min-h-11 max-w-full items-center justify-center gap-2 rounded-full px-5 text-center text-sm font-semibold [overflow-wrap:anywhere] transition duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-55",
				variant === "primary" &&
					"bg-accent text-accent-foreground hover:bg-accent-strong focus-visible:outline-accent shadow-[0_8px_24px_-12px_var(--shadow-accent)] hover:-translate-y-0.5",
				variant === "secondary" &&
					"border-line-strong bg-paper text-ink hover:border-ink/40 hover:bg-paper-strong focus-visible:outline-ink border",
				variant === "danger" &&
					"bg-danger hover:bg-danger-strong focus-visible:outline-danger text-white",
				variant === "ghost" &&
					"text-ink-muted hover:bg-ink/6 hover:text-ink focus-visible:outline-ink",
				className,
			)}
			type={type}
			{...props}
		/>
	);
}
