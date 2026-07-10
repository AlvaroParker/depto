import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { LoginForm } from "@/components/auth/login-form";
import { hasRootUser } from "@/lib/db/users";

export const metadata: Metadata = { title: "Ingresar" };
export const dynamic = "force-dynamic";

interface LoginPageProps {
	searchParams: Promise<{ callbackUrl?: string | string[] }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
	const root = await hasRootUser();
	if (root.err) throw new Error("Could not check bootstrap status.");
	if (!root.val) redirect("/setup");
	const session = await auth();
	if (session?.user) redirect("/");
	const requestedCallback = (await searchParams).callbackUrl;
	const callbackUrl =
		typeof requestedCallback === "string" &&
		requestedCallback.startsWith("/") &&
		!requestedCallback.startsWith("//")
			? requestedCallback
			: "/";

	return (
		<div className="grid min-h-screen lg:grid-cols-[minmax(0,1.1fr)_minmax(28rem,0.9fr)]">
			<section className="border-line bg-ink text-paper relative hidden overflow-hidden border-r px-12 py-14 lg:flex lg:flex-col lg:justify-between">
				<div className="border-paper/12 absolute top-28 -right-24 size-80 rounded-full border" />
				<div className="border-accent/60 absolute top-52 -right-2 size-36 rounded-full border" />
				<p className="text-paper/60 text-xs font-semibold tracking-[0.24em]">CUENTAS DE CASA</p>
				<div className="relative max-w-xl">
					<p className="font-display text-accent mb-6 text-lg italic">Alvaro · Camila · Trinidad</p>
					<h1 className="font-display text-6xl leading-[0.98] font-semibold tracking-[-0.04em]">
						Lo compartido, claro para todos.
					</h1>
					<p className="text-paper/65 mt-7 max-w-md text-base leading-7">
						Gastos, comprobantes y reembolsos en un solo cuaderno común.
					</p>
				</div>
				<p className="text-paper/40 text-xs">Un registro privado para la casa.</p>
			</section>

			<section className="flex items-center justify-center px-5 py-12 sm:px-10">
				<div className="animate-rise border-line bg-paper/90 w-full max-w-md rounded-[2rem] border p-7 shadow-[0_30px_80px_-45px_rgba(40,40,34,0.65)] backdrop-blur sm:p-10">
					<p className="text-accent text-xs font-bold tracking-[0.2em] lg:hidden">
						CUENTAS DE CASA
					</p>
					<h2 className="font-display text-ink mt-3 text-4xl font-semibold tracking-[-0.03em]">
						Bienvenidos a casa
					</h2>
					<p className="text-ink-muted mt-3 mb-8 text-sm leading-6">
						Ingresa con tu usuario para revisar los gastos compartidos.
					</p>
					<LoginForm callbackUrl={callbackUrl} />
				</div>
			</section>
		</div>
	);
}
