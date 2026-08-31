import { Skeleton } from "@/components/ui/skeleton";

export default function SettingsLoading() {
	return (
		<main aria-label="Cargando ajustes" className="px-5 py-8 sm:px-8 lg:px-12 lg:py-11">
			<div className="mx-auto max-w-3xl">
				<Skeleton className="h-3 w-20" />
				<Skeleton className="mt-4 h-12 w-56 max-w-full" />
				<Skeleton className="mt-4 h-5 w-[32rem] max-w-full" />
				<Skeleton className="mt-8 h-80 rounded-3xl" />
				<Skeleton className="mt-10 h-44 rounded-3xl" />
			</div>
		</main>
	);
}
