"use client";

import { KeyRound } from "lucide-react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";

interface LoginFormProps {
	callbackUrl: string;
}

export function LoginForm({ callbackUrl }: LoginFormProps) {
	const router = useRouter();
	const [error, setError] = useState("");
	const [pending, startTransition] = useTransition();

	function submit(formData: FormData) {
		setError("");
		startTransition(async () => {
			const result = await signIn("credentials", {
				password: formData.get("password"),
				redirect: false,
				username: formData.get("username"),
			});
			if (result?.error) {
				setError("El usuario o contraseña no son válidos.");
				return;
			}
			router.replace(callbackUrl);
			router.refresh();
		});
	}

	return (
		<form action={submit} className="grid gap-5">
			<Field autoComplete="username" id="username" label="Usuario" name="username" required />
			<Field
				autoComplete="current-password"
				id="password"
				label="Contraseña"
				minLength={8}
				name="password"
				required
				type="password"
			/>
			{error ? (
				<p
					className="border-danger/20 bg-danger/8 text-danger rounded-xl border px-4 py-3 text-sm"
					role="alert"
				>
					{error}
				</p>
			) : null}
			<Button className="w-full" disabled={pending} type="submit">
				<KeyRound aria-hidden size={18} />
				{pending ? "Ingresando…" : "Ingresar"}
			</Button>
		</form>
	);
}
