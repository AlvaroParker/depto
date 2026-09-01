"use client";

import { Button } from "@/components/ui/button";

export default function SettingsError({ unstable_retry }: { unstable_retry: () => void }) {
	return (
		<main className="grid min-h-[60vh] place-items-center px-5 text-center">
			<div>
				<h1 className="font-display text-3xl font-semibold">No pudimos cargar tus ajustes</h1>
				<p className="text-ink-muted mt-2 text-sm">
					Vuelve a cargar esta sección. Si el problema continúa, inténtalo más tarde.
				</p>
				<Button className="mt-5" onClick={unstable_retry}>
					Volver a cargar los ajustes
				</Button>
			</div>
		</main>
	);
}
