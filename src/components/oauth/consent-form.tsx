interface ConsentFormProps {
	clientName: string;
	fields: Record<string, string>;
	scopes: string[];
}

const scopeLabels: Record<string, string> = {
	"expenses:read": "Ver gastos, saldos, comprobantes y participantes",
	"expenses:write": "Crear y modificar gastos y comprobantes",
	"reimbursements:write": "Cambiar pagos, montos abiertos y comprobantes",
	offline_access: "Mantener la conexión cuando no estés usando la aplicación",
};

export function ConsentForm({ clientName, fields, scopes }: ConsentFormProps) {
	return (
		<main className="bg-canvas text-ink min-h-screen px-4 py-7 sm:px-5 sm:py-12">
			<section
				aria-labelledby="consent-title"
				className="border-line bg-paper mx-auto max-w-lg rounded-3xl border p-5 shadow-sm sm:p-7"
			>
				<p className="text-accent-strong text-xs font-bold tracking-[0.18em] uppercase">
					Conexión segura
				</p>
				<h1
					id="consent-title"
					className="font-display mt-2 max-w-full text-3xl font-semibold [overflow-wrap:anywhere]"
				>
					¿Conectar {clientName}?
				</h1>
				<p className="text-ink-muted mt-3">
					Esta aplicación solicita permiso para actuar en tu nombre. Puedes desconectarla en
					cualquier momento desde Ajustes.
				</p>
				<h2 className="mt-6 text-sm font-bold">Permisos solicitados</h2>
				<ul className="mt-3 space-y-2 text-sm">
					{scopes.map((scope) => (
						<li className="border-line rounded-xl border px-4 py-3" key={scope}>
							{scopeLabels[scope] ?? scope}
						</li>
					))}
				</ul>
				<form
					action="/oauth/authorize/decision"
					className="mt-7 flex flex-col gap-3 sm:flex-row"
					method="post"
				>
					{Object.entries(fields).map(([name, value]) => (
						<input key={name} name={name} type="hidden" value={value} />
					))}
					<button
						className="bg-accent text-accent-foreground focus-visible:ring-accent max-w-full rounded-xl px-5 py-3 font-bold [overflow-wrap:anywhere] focus-visible:ring-2 focus-visible:ring-offset-2"
						name="decision"
						type="submit"
						value="approve"
					>
						Permitir conexión
					</button>
					<button
						className="border-line focus-visible:ring-accent max-w-full rounded-xl border px-5 py-3 font-bold [overflow-wrap:anywhere] focus-visible:ring-2 focus-visible:ring-offset-2"
						name="decision"
						type="submit"
						value="deny"
					>
						Cancelar
					</button>
				</form>
			</section>
		</main>
	);
}
