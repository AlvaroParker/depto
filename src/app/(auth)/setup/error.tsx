"use client";

import { Button } from "@/components/ui/button";

export default function SetupError({ reset }: { error: Error; reset: () => void }) {
	return (
		<div className="grid min-h-screen place-items-center px-5">
			<div className="border-line bg-paper max-w-md rounded-3xl border p-8 text-center">
				<h1 className="font-display text-3xl font-semibold">No pudimos iniciar la configuración</h1>
				<p className="text-ink-muted mt-3 mb-6 text-sm">
					Revisa la conexión del servicio y vuelve a intentarlo.
				</p>
				<Button onClick={reset}>Volver a intentar la configuración</Button>
			</div>
		</div>
	);
}
