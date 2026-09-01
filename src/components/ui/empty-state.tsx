import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

interface EmptyStateProps {
	action?: ReactNode;
	description: string;
	icon: LucideIcon;
	title: string;
}

export function EmptyState({ action, description, icon: Icon, title }: EmptyStateProps) {
	return (
		<div className="border-line-strong bg-paper/75 rounded-3xl border border-dashed px-6 py-12 text-center">
			<div className="bg-accent/10 text-accent-strong mx-auto grid size-12 place-items-center rounded-2xl">
				<Icon aria-hidden size={22} />
			</div>
			<h2 className="font-display text-ink mt-4 text-xl font-semibold">{title}</h2>
			<p className="text-ink-muted mx-auto mt-2 max-w-md text-sm leading-6">{description}</p>
			{action ? <div className="mt-5">{action}</div> : null}
		</div>
	);
}
