import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
	return (
		<main aria-busy="true" aria-label="Cargando" className="mx-auto max-w-6xl px-4 py-8 sm:px-7">
			<div className="grid gap-4">
				<Skeleton className="h-8 w-40" />
				<Skeleton className="h-28 w-full rounded-3xl" />
				<div className="grid gap-4 sm:grid-cols-3">
					<Skeleton className="h-40 rounded-3xl" />
					<Skeleton className="h-40 rounded-3xl" />
					<Skeleton className="h-40 rounded-3xl" />
				</div>
			</div>
		</main>
	);
}
