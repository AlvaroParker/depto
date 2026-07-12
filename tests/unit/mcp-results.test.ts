import { describe, expect, it } from "vitest";
import { mcpBusinessError, mcpSuccess } from "@/lib/mcp/results";

describe("MCP results", () => {
	it("returns concise text and structured content", () => {
		expect(mcpSuccess("Listo.", { count: 2 })).toEqual({
			content: [{ text: "Listo.", type: "text" }],
			structuredContent: { count: 2 },
		});
	});

	it("makes expected business failures visible to tools", () => {
		expect(mcpBusinessError("No encontramos ese gasto.", "NOT_FOUND")).toMatchObject({
			isError: true,
			structuredContent: { code: "NOT_FOUND", message: "No encontramos ese gasto." },
		});
	});
});
