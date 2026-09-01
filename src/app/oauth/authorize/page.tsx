import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { ConsentForm } from "@/components/oauth/consent-form";
import { findOAuthClient } from "@/lib/db/oauth";
import { getOAuthOrigin } from "@/lib/oauth/metadata";
import { parseOAuthScopes } from "@/lib/oauth/validation";

interface AuthorizePageProps {
	searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function one(value: string | string[] | undefined): string {
	return typeof value === "string" ? value : "";
}

export default async function AuthorizePage({ searchParams }: AuthorizePageProps) {
	const raw = await searchParams;
	const fields = {
		client_id: one(raw.client_id),
		code_challenge: one(raw.code_challenge),
		code_challenge_method: one(raw.code_challenge_method),
		redirect_uri: one(raw.redirect_uri),
		resource: one(raw.resource),
		response_type: one(raw.response_type),
		scope: one(raw.scope) || "expenses:read",
		state: one(raw.state),
	};
	const currentUrl = `/oauth/authorize?${new URLSearchParams(fields).toString()}`;
	const session = await auth();
	if (!session?.user) redirect(`/login?callbackUrl=${encodeURIComponent(currentUrl)}`);
	if (session.user.role !== "user" || !session.user.participantId) {
		return (
			<p className="text-ink-muted mx-auto max-w-xl p-8 text-sm leading-6">
				Esta cuenta no puede conectar aplicaciones. Ingresa con una cuenta vinculada a una persona
				de la casa.
			</p>
		);
	}
	const client = await findOAuthClient(fields.client_id);
	const scopes = parseOAuthScopes(fields.scope);
	let origin: string;
	try {
		origin = getOAuthOrigin();
	} catch {
		return (
			<p className="text-ink-muted mx-auto max-w-xl p-8 text-sm leading-6">
				No pudimos iniciar la conexión. Vuelve a la aplicación e inténtalo nuevamente.
			</p>
		);
	}
	const valid =
		client.ok &&
		client.val &&
		!client.val.revokedAt &&
		client.val.redirectUris.includes(fields.redirect_uri) &&
		fields.response_type === "code" &&
		fields.state.length > 0 &&
		fields.resource === origin &&
		fields.code_challenge_method === "S256" &&
		/^[A-Za-z0-9_-]{43}$/.test(fields.code_challenge) &&
		scopes;
	if (!valid || !scopes || !client.ok || !client.val) {
		return (
			<p className="text-ink-muted mx-auto max-w-xl p-8 text-sm leading-6">
				Esta solicitud de conexión no es válida o ya venció. Vuelve a la aplicación e inicia la
				conexión nuevamente.
			</p>
		);
	}
	return <ConsentForm clientName={client.val.name} fields={fields} scopes={scopes} />;
}
