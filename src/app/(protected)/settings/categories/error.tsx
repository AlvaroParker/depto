"use client";

import { Button } from "@/components/ui/button";

export default function CategoriesError({ reset }: { reset: () => void }) {
	return (
		<main className="grid min-h-[60vh] place-items-center px-5 text-center">
			<div>
				<h1 className="font-display text-3xl font-semibold">No pudimos cargar las categorías</h1>
				<p className="text-ink-muted mt-2 text-sm">
					Vuelve a cargar la lista. Si el problema continúa, inténtalo más tarde.
				</p>
				<Button className="mt-5" onClick={reset}>
					Volver a cargar las categorías
				</Button>
			</div>
		</main>
	);
}
