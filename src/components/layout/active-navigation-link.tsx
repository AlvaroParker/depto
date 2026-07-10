"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentProps } from "react";
import { cn } from "@/lib/util/cn";

interface ActiveNavigationLinkProps extends ComponentProps<typeof Link> {
	activeClassName: string;
	navigationHrefs: readonly string[];
}

export function getActiveNavigationHref(
	pathname: string,
	navigationHrefs: readonly string[],
): string | undefined {
	return navigationHrefs
		.filter((href) => pathname === href || (href !== "/" && pathname.startsWith(`${href}/`)))
		.sort((first, second) => second.length - first.length)[0];
}

export function ActiveNavigationLink({
	activeClassName,
	className,
	href,
	navigationHrefs,
	...props
}: ActiveNavigationLinkProps) {
	const pathname = usePathname();
	const isActive = getActiveNavigationHref(pathname, navigationHrefs) === href;

	return (
		<Link
			aria-current={isActive ? "page" : undefined}
			className={cn(className, isActive && activeClassName)}
			href={href}
			{...props}
		/>
	);
}
