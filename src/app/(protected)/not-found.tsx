import { SearchX } from "lucide-react";
import Link from "next/link";

export default function NotFound() {
	return (
		<main className="grid min-h-[70vh] place-items-center px-5">
			<div className="max-w-md text-center">
				<SearchX aria-hidden className="text-ink-faint mx-auto" size={40} />
				<h1 className="font-display mt-4 text-3xl font-semibold">No encontramos lo que buscas</h1>
				<p className="text-ink-muted mt-3 text-sm">
					Puede que el gasto haya sido eliminado o que el enlace ya no sea válido.
				</p>
				<Link
					className="bg-accent text-accent-foreground mt-6 inline-flex min-h-11 items-center rounded-full px-5 text-sm font-semibold"
					href="/expenses"
				>
					Volver a gastos
				</Link>
			</div>
		</main>
	);
}
