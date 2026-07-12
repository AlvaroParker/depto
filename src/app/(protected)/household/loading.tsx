import { Skeleton } from "@/components/ui/skeleton";

export default function HouseholdLoading() {
	return (
		<main className="px-4 py-7 sm:px-7 lg:px-12 lg:py-11">
			<div className="mx-auto max-w-6xl">
				<Skeleton className="h-4 w-36" />
				<Skeleton className="mt-4 h-12 w-[34rem] max-w-full" />
				<Skeleton className="mt-3 h-5 w-[30rem] max-w-full" />
				<div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
					{Array.from({ length: 3 }, (_, index) => (
						<Skeleton className="h-80 rounded-3xl" key={index} />
					))}
				</div>
			</div>
		</main>
	);
}
