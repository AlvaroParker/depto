import { Check, KeyRound, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { BootstrapForm } from "@/components/auth/bootstrap-form";
import { hasRootUser } from "@/lib/db/users";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Configuración inicial" };

export default async function SetupPage() {
	const root = await hasRootUser();
	if (root.err) throw new Error("Could not check bootstrap status.");
	if (root.val) redirect("/login");

	return (
		<div className="grid min-h-screen lg:grid-cols-[minmax(22rem,0.78fr)_minmax(0,1.22fr)]">
			<section className="border-line bg-ink text-paper relative overflow-hidden border-r px-7 py-10 sm:px-12 lg:flex lg:flex-col lg:justify-between lg:py-14">
				<div className="border-paper/10 absolute -top-20 -left-20 size-72 rounded-full border" />
				<div className="border-accent/65 absolute top-24 -left-8 size-36 rounded-full border" />
				<p className="text-paper/60 text-xs font-semibold tracking-[0.24em]">PRIMER ACCESO</p>
				<div className="relative mt-16 max-w-md lg:mt-0">
					<span className="bg-accent text-accent-foreground mb-7 grid size-14 place-items-center rounded-2xl shadow-[0_18px_40px_-18px_var(--shadow-accent)]">
						<KeyRound aria-hidden size={26} strokeWidth={1.8} />
					</span>
					<h1 className="font-display text-5xl leading-[0.98] font-semibold tracking-[-0.04em]">
						La primera llave de la casa.
					</h1>
					<p className="text-paper/65 mt-6 text-sm leading-7">
						Esta cuenta root custodia los accesos. Solo se crea una vez y no puede ser eliminada.
					</p>
					<ul className="mt-8 grid gap-3 text-sm">
						{[
							"Crear administradores",
							"Crear usuarios regulares",
							"Retirar accesos sin perder el historial",
						].map((item) => (
							<li className="flex items-center gap-3" key={item}>
								<span className="bg-positive/25 text-paper grid size-6 place-items-center rounded-full">
									<Check aria-hidden size={14} />
								</span>
								{item}
							</li>
						))}
					</ul>
				</div>
				<p className="text-paper/65 mt-14 text-xs lg:mt-0">Configuración única y privada.</p>
			</section>

			<section className="flex items-center justify-center px-5 py-12 sm:px-10">
				<div className="animate-rise w-full max-w-2xl">
					<div className="mb-8 flex items-start gap-4">
						<span className="border-accent/20 bg-accent/10 text-accent-strong grid size-11 shrink-0 place-items-center rounded-2xl border">
							<ShieldCheck aria-hidden size={22} />
						</span>
						<div>
							<p className="text-accent-strong text-xs font-bold tracking-[0.18em] uppercase">
								Paso único
							</p>
							<h2 className="font-display mt-1 text-4xl font-semibold tracking-[-0.03em]">
								Crea el usuario root
							</h2>
							<p className="text-ink-muted mt-2 text-sm leading-6">
								Después podrás invitar y administrar al resto desde Ajustes.
							</p>
						</div>
					</div>
					<div className="border-line bg-paper/88 shadow-card rounded-[2rem] border p-6 backdrop-blur sm:p-9">
						<BootstrapForm />
					</div>
				</div>
			</section>
		</div>
	);
}
