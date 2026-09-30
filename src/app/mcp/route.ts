import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { authenticateRequestActor } from "@/lib/auth/actor";
import { actorAuthenticationErrorResponse } from "@/lib/api/server";
import { createExpenseMcpServer } from "@/lib/mcp/server";
import { getOAuthOrigin } from "@/lib/oauth/metadata";

function methodNotAllowed() {
	return new Response(null, { headers: { Allow: "POST" }, status: 405 });
}

export function GET() {
	return methodNotAllowed();
}

export function DELETE() {
	return methodNotAllowed();
}

export async function POST(request: Request) {
	const origin = getOAuthOrigin(request);
	const expectedHost = new URL(origin).host;
	if (request.headers.get("host") !== expectedHost) {
		return Response.json({ error: "invalid_host" }, { status: 400 });
	}
	const suppliedOrigin = request.headers.get("origin");
	if (suppliedOrigin && suppliedOrigin !== origin) {
		return Response.json({ error: "invalid_origin" }, { status: 403 });
	}
	const authenticated = await authenticateRequestActor(request);
	if (authenticated.kind !== "authenticated")
		return actorAuthenticationErrorResponse(authenticated, request);
	if (authenticated.actor.source !== "oauth") {
		return actorAuthenticationErrorResponse({ kind: "unauthenticated" }, request);
	}
	const transport = new WebStandardStreamableHTTPServerTransport({
		enableJsonResponse: true,
		sessionIdGenerator: undefined,
	});
	const server = createExpenseMcpServer(authenticated.actor);
	try {
		await server.connect(transport);
		const response = await transport.handleRequest(request, {
			authInfo: {
				clientId: authenticated.actor.clientId,
				scopes: [...authenticated.actor.scopes],
				token: "validated",
			},
		});
		response.headers.set("Cache-Control", "no-store");
		return response;
	} finally {
		await server.close();
	}
}
