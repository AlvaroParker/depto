"use client";

import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ErrorBoundary({
	reset,
}: {
	error: Error & { digest?: string };
	reset: () => void;
}) {
	return (
		<main className="grid min-h-[70vh] place-items-center px-5">
			<div className="max-w-md text-center">
				<AlertTriangle aria-hidden className="text-danger mx-auto" size={36} />
				<h1 className="font-display mt-4 text-3xl font-semibold">Algo no salió como esperábamos</h1>
				<p className="text-ink-muted mt-3 text-sm leading-6">
					No pudimos cargar esta información. Tus datos no se modificaron.
				</p>
				<Button className="mt-6" onClick={reset}>
					Volver a intentar
				</Button>
			</div>
		</main>
	);
}
