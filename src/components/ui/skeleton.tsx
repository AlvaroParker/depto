import { cn } from "@/lib/util/cn";

export function Skeleton({ className }: { className?: string }) {
	return <div aria-hidden className={cn("bg-ink/8 animate-pulse rounded-xl", className)} />;
}
