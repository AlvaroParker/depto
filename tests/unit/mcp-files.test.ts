import { describe, expect, it, vi } from "vitest";
import { acquireMcpFile, isPrivateOrReservedAddress } from "@/lib/mcp/files";

const imageTypes = new Set(["image/png"]);

describe("MCP file acquisition", () => {
	it("rejects private, loopback, link-local, documentation, and reserved addresses", () => {
		for (const address of [
			"127.0.0.1",
			"10.0.0.1",
			"172.16.2.3",
			"192.168.1.1",
			"169.254.1.1",
			"203.0.113.10",
			"::1",
			"fd00::1",
			"fe80::1",
			"2001:db8::1",
		]) {
			expect(isPrivateOrReservedAddress(address), address).toBe(true);
		}
		expect(isPrivateOrReservedAddress("1.1.1.1")).toBe(false);
		expect(isPrivateOrReservedAddress("2606:4700:4700::1111")).toBe(false);
	});

	it("accepts bounded base64 with an allowed MIME type", async () => {
		const result = await acquireMcpFile(
			{ base64: btoa("png"), filename: "proof.png", mimeType: "image/png" },
			imageTypes,
		);
		expect(new TextDecoder().decode(result.bytes)).toBe("png");
		expect(result).toMatchObject({ contentType: "image/png", filename: "proof.png" });
	});

	it("rejects unsupported and oversized inline files before decoding", async () => {
		await expect(
			acquireMcpFile(
				{ base64: btoa("pdf"), filename: "proof.pdf", mimeType: "application/pdf" },
				imageTypes,
			),
		).rejects.toThrow(/tipo/i);
		await expect(
			acquireMcpFile(
				{
					base64: "A".repeat(Math.ceil((10_485_761 * 4) / 3 / 4) * 4),
					filename: "huge.png",
					mimeType: "image/png",
				},
				imageTypes,
			),
		).rejects.toThrow(/10 MB/i);
	});

	it("validates DNS and every manual redirect without forwarding credentials", async () => {
		const fetcher = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(
				new Response(null, { headers: { location: "https://cdn.example/proof.png" }, status: 302 }),
			)
			.mockResolvedValueOnce(
				new Response(new Uint8Array([1, 2, 3]), {
					headers: { "content-length": "3", "content-type": "image/png" },
				}),
			);
		const resolveHost = vi.fn(async () => ["1.1.1.1"]);
		const result = await acquireMcpFile(
			{
				download_url: "https://files.example/temporary",
				file_id: "file-1",
				filename: "proof.png",
				mime_type: "image/png",
			},
			imageTypes,
			{ fetcher, resolveHost },
		);
		expect(result.bytes).toEqual(new Uint8Array([1, 2, 3]));
		expect(resolveHost).toHaveBeenCalledTimes(2);
		expect(fetcher.mock.calls[0]?.[1]).not.toHaveProperty("headers.authorization");
	});

	it("rejects redirects that resolve to a private target", async () => {
		const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
			new Response(null, {
				headers: { location: "https://internal.example/proof" },
				status: 302,
			}),
		);
		const resolveHost = vi
			.fn<(hostname: string) => Promise<string[]>>()
			.mockResolvedValueOnce(["1.1.1.1"])
			.mockResolvedValueOnce(["10.0.0.1"]);
		await expect(
			acquireMcpFile(
				{
					download_url: "https://files.example/temporary",
					file_id: "file-1",
					filename: "proof.png",
				},
				imageTypes,
				{ fetcher, resolveHost },
			),
		).rejects.toThrow(/destino/i);
	});
});
