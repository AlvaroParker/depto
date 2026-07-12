import { NextResponse } from "next/server";
import { createAuthorizationServerMetadata, getOAuthOrigin } from "@/lib/oauth/metadata";

export function GET(request: Request) {
	const response = NextResponse.json(createAuthorizationServerMetadata(getOAuthOrigin(request)));
	response.headers.set("Cache-Control", "public, max-age=3600");
	return response;
}
