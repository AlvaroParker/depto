import { NextResponse } from "next/server";
import { auth } from "@/auth";

// OpenNext Cloudflare requires Edge middleware; Next.js `proxy.ts` always uses the unsupported
// Node.js middleware runtime. Keep this convention until OpenNext supports Node.js middleware.
export default auth((request) => {
	if (request.auth) return NextResponse.next();
	const loginUrl = new URL("/login", request.url);
	loginUrl.searchParams.set("callbackUrl", `${request.nextUrl.pathname}${request.nextUrl.search}`);
	return NextResponse.redirect(loginUrl);
});

export const config = {
	matcher: ["/", "/expenses/:path*", "/settings/:path*"],
};
