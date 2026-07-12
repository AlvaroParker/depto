import { z } from "zod";

const MAX_FILE_BYTES = 10_485_760;
const MAX_REDIRECTS = 3;

export const McpFileInputSchema = z.union([
	z.object({
		base64: z.string().min(1),
		filename: z.string().trim().min(1).max(255),
		mimeType: z.string().min(1),
	}),
	z
		.object({
			download_url: z.string().url(),
			file_id: z.string().min(1),
			file_name: z.string().trim().min(1).max(255).optional(),
			filename: z.string().trim().min(1).max(255).optional(),
			mime_type: z.string().optional(),
		})
		.refine((input) => Boolean(input.file_name || input.filename), {
			message: "A file name is required.",
		}),
]);

export type McpFileInput = z.infer<typeof McpFileInputSchema>;

export interface AcquiredMcpFile {
	bytes: Uint8Array;
	contentType: string;
	filename: string;
}

interface FileAcquisitionDependencies {
	fetcher?: typeof fetch;
	resolveHost?: (hostname: string) => Promise<string[]>;
}

function parseIpv4(value: string): number[] | null {
	const parts = value.split(".");
	if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/.test(part))) return null;
	const numbers = parts.map(Number);
	return numbers.every((part) => part >= 0 && part <= 255) ? numbers : null;
}

export function isPrivateOrReservedAddress(value: string): boolean {
	const normalized = value.toLowerCase().replace(/^\[|\]$/g, "");
	const ipv4 = parseIpv4(normalized);
	if (ipv4) {
		const [a, b, c] = ipv4;
		return (
			a === 0 ||
			a === 10 ||
			a === 127 ||
			(a === 169 && b === 254) ||
			(a === 172 && b >= 16 && b <= 31) ||
			(a === 192 && b === 0) ||
			(a === 192 && b === 168) ||
			(a === 198 && (b === 18 || b === 19)) ||
			(a === 198 && b === 51 && c === 100) ||
			(a === 203 && b === 0 && c === 113) ||
			a >= 224
		);
	}
	if (!normalized.includes(":")) return false;
	return (
		normalized === "::" ||
		normalized === "::1" ||
		normalized.startsWith("fc") ||
		normalized.startsWith("fd") ||
		normalized.startsWith("fe8") ||
		normalized.startsWith("fe9") ||
		normalized.startsWith("fea") ||
		normalized.startsWith("feb") ||
		normalized.startsWith("2001:db8:") ||
		normalized.startsWith("ff") ||
		normalized.startsWith("::ffff:127.") ||
		normalized.startsWith("::ffff:10.") ||
		normalized.startsWith("::ffff:192.168.")
	);
}

async function resolveWithDnsOverHttps(hostname: string): Promise<string[]> {
	const answers = new Set<string>();
	for (const type of ["A", "AAAA"]) {
		const response = await fetch(
			`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(hostname)}&type=${type}`,
			{ headers: { accept: "application/dns-json" } },
		);
		if (!response.ok) throw new Error("No pudimos validar el host del archivo.");
		const body = (await response.json()) as { Answer?: { data: string; type: number }[] };
		for (const answer of body.Answer ?? []) {
			if (answer.type === 1 || answer.type === 28) answers.add(answer.data);
		}
	}
	return [...answers];
}

async function validateRemoteUrl(
	value: string,
	resolveHost: (hostname: string) => Promise<string[]>,
): Promise<URL> {
	const url = new URL(value);
	if (url.protocol !== "https:" || url.username || url.password) {
		throw new Error("La URL temporal debe usar HTTPS y no puede incluir credenciales.");
	}
	if (url.port && url.port !== "443") throw new Error("El puerto de descarga no está permitido.");
	if (url.hostname === "localhost" || isPrivateOrReservedAddress(url.hostname)) {
		throw new Error("El destino de descarga no está permitido.");
	}
	const addresses = await resolveHost(url.hostname);
	if (addresses.length === 0 || addresses.some(isPrivateOrReservedAddress)) {
		throw new Error("El destino de descarga no está permitido.");
	}
	return url;
}

function validateMimeType(value: string, allowedTypes: ReadonlySet<string>): string {
	const contentType = value.split(";")[0]?.trim().toLowerCase() ?? "";
	if (!allowedTypes.has(contentType)) throw new Error("El tipo de archivo no está permitido.");
	return contentType;
}

function decodeBase64(value: string): Uint8Array {
	const compact = value.replace(/\s/g, "");
	if (!/^[A-Za-z0-9+/]*={0,2}$/.test(compact) || compact.length % 4 !== 0) {
		throw new Error("El archivo base64 no es válido.");
	}
	if (Math.floor((compact.length * 3) / 4) > MAX_FILE_BYTES + 2) {
		throw new Error("El archivo supera el límite de 10 MB.");
	}
	let binary: string;
	try {
		binary = atob(compact);
	} catch {
		throw new Error("El archivo base64 no es válido.");
	}
	if (binary.length > MAX_FILE_BYTES) throw new Error("El archivo supera el límite de 10 MB.");
	return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function readBoundedBody(response: Response): Promise<Uint8Array> {
	const declared = Number(response.headers.get("content-length"));
	if (Number.isFinite(declared) && declared > MAX_FILE_BYTES) {
		throw new Error("El archivo supera el límite de 10 MB.");
	}
	if (!response.body) throw new Error("El archivo temporal está vacío.");
	const reader = response.body.getReader();
	const chunks: Uint8Array[] = [];
	let length = 0;
	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		length += value.byteLength;
		if (length > MAX_FILE_BYTES) {
			await reader.cancel();
			throw new Error("El archivo supera el límite de 10 MB.");
		}
		chunks.push(value);
	}
	if (length === 0) throw new Error("El archivo temporal está vacío.");
	const bytes = new Uint8Array(length);
	let offset = 0;
	for (const chunk of chunks) {
		bytes.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return bytes;
}

export async function acquireMcpFile(
	input: McpFileInput,
	allowedTypes: ReadonlySet<string>,
	dependencies: FileAcquisitionDependencies = {},
): Promise<AcquiredMcpFile> {
	if ("base64" in input) {
		return {
			bytes: decodeBase64(input.base64),
			contentType: validateMimeType(input.mimeType, allowedTypes),
			filename: input.filename,
		};
	}
	const fetcher = dependencies.fetcher ?? fetch;
	const resolveHost = dependencies.resolveHost ?? resolveWithDnsOverHttps;
	let url = await validateRemoteUrl(input.download_url, resolveHost);
	for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
		const response = await fetcher(url, {
			headers: { accept: [...allowedTypes].join(", ") },
			redirect: "manual",
		});
		if (response.status >= 300 && response.status < 400) {
			const location = response.headers.get("location");
			if (!location || redirects === MAX_REDIRECTS) throw new Error("La redirección no es segura.");
			url = await validateRemoteUrl(new URL(location, url).toString(), resolveHost);
			continue;
		}
		if (!response.ok) throw new Error("No pudimos descargar el archivo temporal.");
		const headerType = response.headers.get("content-type") ?? input.mime_type ?? "";
		return {
			bytes: await readBoundedBody(response),
			contentType: validateMimeType(headerType, allowedTypes),
			filename: input.file_name ?? input.filename ?? "archivo",
		};
	}
	throw new Error("No pudimos descargar el archivo temporal.");
}
