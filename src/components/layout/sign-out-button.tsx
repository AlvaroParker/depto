"use client";

import { LogOut } from "lucide-react";
import { signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";

export function SignOutButton() {
	return (
		<Button
			aria-label="Cerrar sesión"
			className="size-11 p-0"
			onClick={() => signOut({ redirectTo: "/login" })}
			variant="ghost"
		>
			<LogOut aria-hidden size={19} />
		</Button>
	);
}
