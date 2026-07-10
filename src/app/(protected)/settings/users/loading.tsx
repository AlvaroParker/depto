export default function UsersLoading() {
	return (
		<main className="px-4 py-7 sm:px-7 lg:px-12 lg:py-11" aria-label="Cargando usuarios">
			<div className="mx-auto max-w-6xl animate-pulse">
				<div className="bg-line h-3 w-32 rounded" />
				<div className="bg-line mt-4 h-12 w-80 max-w-full rounded-xl" />
				<div className="mt-10 grid gap-6 xl:grid-cols-2">
					<div className="bg-paper-strong h-96 rounded-3xl" />
					<div className="bg-paper-strong h-96 rounded-3xl" />
				</div>
			</div>
		</main>
	);
}
