import { NextResponse } from "next/server";
import { createProtectedResourceMetadata, getOAuthOrigin } from "@/lib/oauth/metadata";

export function GET(request: Request) {
	const response = NextResponse.json(createProtectedResourceMetadata(getOAuthOrigin(request)));
	response.headers.set("Cache-Control", "public, max-age=3600");
	return response;
}
