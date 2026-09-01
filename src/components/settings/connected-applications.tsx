"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import type { OAuthGrantSummary } from "@/lib/types/oauth";

const scopeLabels: Record<string, string> = {
	"expenses:read": "Lectura de gastos",
	"expenses:write": "Cambios en gastos",
	"reimbursements:write": "Cambios en reembolsos",
	offline_access: "Conexión persistente",
};

export function ConnectedApplications({ initialGrants }: { initialGrants: OAuthGrantSummary[] }) {
	const [grants, setGrants] = useState(initialGrants);
	const [error, setError] = useState<string | null>(null);
	const [pending, startTransition] = useTransition();

	function disconnect(grant: OAuthGrantSummary) {
		if (!window.confirm(`¿Desconectar ${grant.clientName}?`)) return;
		setError(null);
		startTransition(async () => {
			const response = await fetch(`/api/oauth/grants/${encodeURIComponent(grant.id)}`, {
				method: "DELETE",
			});
			if (!response.ok) {
				setError("No pudimos desconectar la aplicación. Inténtalo nuevamente.");
				return;
			}
			setGrants((current) => current.filter(({ id }) => id !== grant.id));
		});
	}

	return (
		<section aria-labelledby="connected-apps-title" className="mt-10">
			<h2 id="connected-apps-title" className="font-display text-2xl font-semibold">
				Aplicaciones conectadas
			</h2>
			<p className="text-ink-muted mt-2 text-sm">
				Estas aplicaciones pueden acceder a tu información según los permisos que aprobaste.
			</p>
			{error ? (
				<p className="text-danger mt-4 text-sm" role="alert">
					{error}
				</p>
			) : null}
			{grants.length === 0 ? (
				<p className="border-line bg-paper text-ink-muted mt-5 rounded-2xl border p-5 text-sm">
					No tienes aplicaciones conectadas.
				</p>
			) : (
				<ul className="mt-5 space-y-4">
					{grants.map((grant) => (
						<li className="border-line bg-paper rounded-2xl border p-5" key={grant.id}>
							<div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
								<div>
									<h3 className="font-bold">{grant.clientName}</h3>
									<p className="text-ink-muted mt-1 text-xs">
										Conectada el {new Date(grant.createdAt).toLocaleString("es-CL")}
									</p>
									<p className="text-ink-muted mt-1 text-xs">
										Último uso:{" "}
										{grant.lastUsedAt
											? new Date(grant.lastUsedAt).toLocaleString("es-CL")
											: "Aún no utilizada"}
									</p>
									<ul aria-label="Permisos concedidos" className="mt-3 flex flex-wrap gap-2">
										{grant.scopes.map((scope) => (
											<li
												className="bg-accent/10 text-accent-strong rounded-full px-3 py-1 text-xs"
												key={scope}
											>
												{scopeLabels[scope] ?? scope}
											</li>
										))}
									</ul>
								</div>
								<Button
									disabled={pending}
									onClick={() => disconnect(grant)}
									type="button"
									variant="secondary"
								>
									Desconectar
								</Button>
							</div>
						</li>
					))}
				</ul>
			)}
		</section>
	);
}
