import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { ZodError } from "zod";

export function mcpSuccess<T extends Record<string, unknown>>(
	text: string,
	structuredContent: T,
): CallToolResult {
	return { content: [{ text, type: "text" }], structuredContent };
}

export function mcpBusinessError(
	message: string,
	code = "BUSINESS_ERROR",
	details?: Record<string, unknown>,
): CallToolResult {
	return {
		content: [{ text: message, type: "text" }],
		isError: true,
		structuredContent: { code, message, ...details },
	};
}

export function mcpValidationError(error: ZodError): CallToolResult {
	return mcpBusinessError(
		"Revisa los campos indicados y vuelve a intentarlo.",
		"VALIDATION_ERROR",
		{
			issues: error.issues.map((issue) => ({
				path: issue.path.map(String).join("."),
				message: issue.message,
			})),
		},
	);
}
