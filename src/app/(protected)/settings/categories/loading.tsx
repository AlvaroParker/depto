import { Skeleton } from "@/components/ui/skeleton";

export default function CategoriesLoading() {
	return (
		<main className="px-4 py-7 sm:px-7 lg:px-12 lg:py-11">
			<div className="mx-auto max-w-6xl">
				<Skeleton className="h-4 w-36" />
				<Skeleton className="mt-4 h-12 w-80 max-w-full" />
				<div className="mt-10 grid gap-6 xl:grid-cols-2">
					<Skeleton className="h-[34rem] rounded-3xl" />
					<Skeleton className="h-[34rem] rounded-3xl" />
				</div>
			</div>
		</main>
	);
}
