"use client";

import { LogOut } from "lucide-react";
import { signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/util/cn";

interface SignOutButtonProps {
	className?: string;
	showLabel?: boolean;
}

export function SignOutButton({ className, showLabel = false }: SignOutButtonProps) {
	return (
		<Button
			aria-label={showLabel ? undefined : "Cerrar sesión"}
			className={cn(showLabel ? "w-full" : "size-11 p-0", className)}
			onClick={() => signOut({ redirectTo: "/login" })}
			variant="ghost"
		>
			<LogOut aria-hidden size={19} />
			{showLabel ? "Cerrar sesión" : null}
		</Button>
	);
}
