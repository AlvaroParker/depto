"use client";

import { Button } from "@/components/ui/button";

export default function UsersError({ reset }: { error: Error; reset: () => void }) {
	return (
		<main className="grid min-h-[70vh] place-items-center px-5 text-center">
			<div>
				<h1 className="font-display text-3xl font-semibold">No pudimos cargar los accesos</h1>
				<p className="text-ink-muted mt-3 mb-6 text-sm">Inténtalo nuevamente en unos segundos.</p>
				<Button onClick={reset}>Reintentar</Button>
			</div>
		</main>
	);
}
