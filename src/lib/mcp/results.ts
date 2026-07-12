import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

export function mcpSuccess<T extends Record<string, unknown>>(
	text: string,
	structuredContent: T,
): CallToolResult {
	return { content: [{ text, type: "text" }], structuredContent };
}

export function mcpBusinessError(message: string, code = "BUSINESS_ERROR"): CallToolResult {
	return {
		content: [{ text: message, type: "text" }],
		isError: true,
		structuredContent: { code, message },
	};
}
