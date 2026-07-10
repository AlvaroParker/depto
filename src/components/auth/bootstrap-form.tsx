"use client";

import { ShieldCheck } from "lucide-react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { bootstrapRoot } from "@/lib/api/users";

export function BootstrapForm() {
	const router = useRouter();
	const [formError, setFormError] = useState("");
	const [fieldErrors, setFieldErrors] = useState<Record<string, string[] | undefined>>({});
	const [pending, startTransition] = useTransition();

	function submit(formData: FormData) {
		setFormError("");
		setFieldErrors({});
		const username = String(formData.get("username") ?? "");
		const password = String(formData.get("password") ?? "");
		startTransition(async () => {
			const result = await bootstrapRoot({
				displayName: String(formData.get("displayName") ?? ""),
				password,
				passwordConfirmation: String(formData.get("passwordConfirmation") ?? ""),
				username,
			});
			if (result.err) {
				setFormError(result.val.message);
				setFieldErrors(result.val.errors ?? {});
				return;
			}

			const signInResult = await signIn("credentials", {
				password,
				redirect: false,
				username,
			});
			if (signInResult?.error) {
				router.replace("/login");
				return;
			}
			router.replace("/");
			router.refresh();
		});
	}

	return (
		<form action={submit} className="grid gap-5">
			<Field
				autoComplete="name"
				error={fieldErrors.displayName?.[0]}
				id="displayName"
				label="Tu nombre"
				name="displayName"
				required
			/>
			<Field
				autoCapitalize="none"
				autoComplete="username"
				error={fieldErrors.username?.[0]}
				hint="Entre 3 y 32 caracteres. Este será tu acceso root."
				id="username"
				label="Usuario root"
				name="username"
				required
			/>
			<div className="grid gap-5 sm:grid-cols-2">
				<Field
					autoComplete="new-password"
					error={fieldErrors.password?.[0]}
					hint="Mínimo 12 caracteres."
					id="password"
					label="Contraseña"
					minLength={12}
					name="password"
					required
					type="password"
				/>
				<Field
					autoComplete="new-password"
					error={fieldErrors.passwordConfirmation?.[0]}
					id="passwordConfirmation"
					label="Repetir contraseña"
					minLength={12}
					name="passwordConfirmation"
					required
					type="password"
				/>
			</div>
			{formError ? (
				<p
					className="border-danger/20 bg-danger/8 text-danger rounded-xl border px-4 py-3 text-sm"
					role="alert"
				>
					{formError}
				</p>
			) : null}
			<Button className="mt-1 w-full" disabled={pending} type="submit">
				<ShieldCheck aria-hidden size={18} />
				{pending ? "Creando acceso root…" : "Crear usuario root"}
			</Button>
		</form>
	);
}
