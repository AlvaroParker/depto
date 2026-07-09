import type { ReactNode } from "react";
import { cn } from "@/lib/util/cn";

interface BadgeProps {
	children: ReactNode;
	className?: string;
	tone?: "neutral" | "pending" | "paid" | "settled";
}

export function Badge({ children, className, tone = "neutral" }: BadgeProps) {
	return (
		<span
			className={cn(
				"inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold",
				tone === "neutral" && "border-line bg-paper-strong text-ink-muted",
				tone === "pending" && "border-pending/20 bg-pending/10 text-pending-strong",
				tone === "paid" && "border-positive/20 bg-positive/10 text-positive-strong",
				tone === "settled" && "border-ink/10 bg-ink/7 text-ink",
				className,
			)}
		>
			{children}
		</span>
	);
}
