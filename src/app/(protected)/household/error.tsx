"use client";

import { Button } from "@/components/ui/button";

export default function HouseholdError({ reset }: { reset: () => void }) {
	return (
		<main className="grid min-h-[60vh] place-items-center px-5 text-center">
			<div>
				<h1 className="font-display text-3xl font-semibold">
					No pudimos abrir la libreta de la casa
				</h1>
				<p className="text-ink-muted mt-2 text-sm">Inténtalo nuevamente en un momento.</p>
				<Button className="mt-5" onClick={reset}>
					Reintentar
				</Button>
			</div>
		</main>
	);
}
