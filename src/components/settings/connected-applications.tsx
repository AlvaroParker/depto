"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import type { OAuthGrantSummary } from "@/lib/types/oauth";

const scopeLabels: Record<string, string> = {
	"expenses:read": "Lectura de gastos",
	"expenses:write": "Cambios en gastos",
	"reimbursements:write": "Cambios en reembolsos",
	offline_access: "Conexión persistente",
};

const connectionStatusLabels: Record<OAuthGrantSummary["status"], string> = {
	active: "Conexión activa",
	refreshable: "Conexión disponible: la aplicación puede renovar el acceso",
	awaiting_exchange: "Esperando que la aplicación complete la conexión",
	expired: "Conexión vencida: vuelve a conectar desde la aplicación",
};

export function ConnectedApplications({ initialGrants }: { initialGrants: OAuthGrantSummary[] }) {
	const [grants, setGrants] = useState(initialGrants);
	const [disconnectingGrant, setDisconnectingGrant] = useState<OAuthGrantSummary | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [notice, setNotice] = useState<string | null>(null);
	const [pending, startTransition] = useTransition();

	function disconnect() {
		if (!disconnectingGrant) return;
		const grant = disconnectingGrant;
		setError(null);
		startTransition(async () => {
			try {
				const response = await fetch(`/api/oauth/grants/${encodeURIComponent(grant.id)}`, {
					method: "DELETE",
				});
				if (!response.ok) {
					setError(`No pudimos desconectar ${grant.clientName}. Inténtalo nuevamente.`);
					return;
				}
				setGrants((current) => current.filter(({ id }) => id !== grant.id));
				setDisconnectingGrant(null);
				setNotice(`La aplicación ${grant.clientName} fue desconectada.`);
			} catch {
				setError(
					`No pudimos desconectar ${grant.clientName}. Revisa tu conexión e inténtalo nuevamente.`,
				);
			}
		});
	}

	function closeDialog() {
		if (pending) return;
		setDisconnectingGrant(null);
		setError(null);
	}

	return (
		<section aria-labelledby="connected-apps-title" className="mt-10">
			<h2 id="connected-apps-title" className="font-display text-2xl font-semibold">
				Aplicaciones conectadas
			</h2>
			<p className="text-ink-muted mt-2 text-sm">
				Estas aplicaciones pueden acceder a tu información según los permisos que aprobaste.
			</p>
			{notice ? (
				<p className="text-positive-strong mt-4 text-sm" role="status">
					{notice}
				</p>
			) : null}
			{grants.length === 0 ? (
				<p className="border-line bg-paper text-ink-muted mt-5 rounded-2xl border p-5 text-sm">
					No hay aplicaciones conectadas. Las aplicaciones que autorices aparecerán aquí.
				</p>
			) : (
				<ul className="mt-5 space-y-4">
					{grants.map((grant) => (
						<li className="border-line bg-paper rounded-2xl border p-5" key={grant.id}>
							<div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
								<div className="min-w-0 flex-1">
									<h3 className="font-bold break-words">{grant.clientName}</h3>
									<p className="mt-2 text-sm">{connectionStatusLabels[grant.status]}</p>
									{grant.refreshReuseDetected ? (
										<p className="text-ink-muted mt-1 text-sm">
											La aplicación reutilizó una credencial anterior. Por seguridad, debes volver a
											conectarla.
										</p>
									) : null}
									{grant.refreshExpiresAt ? (
										<p className="text-ink-muted mt-1 text-xs">
											Puede renovar el acceso hasta el{" "}
											{new Date(grant.refreshExpiresAt).toLocaleString("es-CL")}.
										</p>
									) : grant.status === "active" && grant.accessExpiresAt ? (
										<p className="text-ink-muted mt-1 text-xs">
											Acceso hasta el {new Date(grant.accessExpiresAt).toLocaleString("es-CL")}.
											Esta conexión no tiene renovación automática.
										</p>
									) : null}
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
									onClick={() => {
										setError(null);
										setNotice(null);
										setDisconnectingGrant(grant);
									}}
									type="button"
									variant="secondary"
								>
									Desconectar aplicación
								</Button>
							</div>
						</li>
					))}
				</ul>
			)}
			<Dialog
				description={
					disconnectingGrant
						? `${disconnectingGrant.clientName} dejará de acceder a tu información y de actuar en tu nombre.`
						: undefined
				}
				onClose={closeDialog}
				open={Boolean(disconnectingGrant)}
				title="Desconectar aplicación"
			>
				{error ? (
					<p className="text-danger mb-4 text-sm" role="alert">
						{error}
					</p>
				) : null}
				<div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
					<Button disabled={pending} onClick={closeDialog} variant="secondary">
						Cancelar
					</Button>
					<Button disabled={pending} onClick={disconnect} variant="danger">
						{pending ? "Desconectando aplicación…" : "Desconectar aplicación"}
					</Button>
				</div>
			</Dialog>
		</section>
	);
}
