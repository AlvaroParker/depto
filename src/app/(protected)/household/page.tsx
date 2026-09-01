import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { HouseholdInformationDirectory } from "@/components/household/household-information-directory";
import { canManageUsers } from "@/lib/const/roles";
import { listHouseholdInformation } from "@/lib/db/household-information";

export const metadata: Metadata = { title: "Casa" };

export default async function HouseholdPage() {
	const session = await auth();
	if (!session?.user) redirect("/login");
	const result = await listHouseholdInformation();
	if (result.err) throw new Error("Could not load household information.");

	return (
		<main className="px-4 py-7 sm:px-7 lg:px-12 lg:py-11">
			<div className="mx-auto max-w-6xl">
				<p className="text-accent-strong text-xs font-bold tracking-[0.18em] uppercase">
					Libreta del hogar
				</p>
				<h1 className="font-display mt-2 max-w-3xl text-4xl font-semibold tracking-[-0.035em] sm:text-5xl">
					Lo importante de la casa, siempre a mano.
				</h1>
				<p className="text-ink-muted mt-3 max-w-2xl text-sm leading-6">
					Números de cliente, proveedores, enlaces de pago y otras referencias útiles para el día a
					día.
				</p>
				<HouseholdInformationDirectory
					canManage={canManageUsers(session.user.role)}
					initialItems={result.val}
				/>
			</div>
		</main>
	);
}
