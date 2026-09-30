import { z } from "zod";
import { validateReceiptMetadata, validateReceiptSignature } from "@/lib/util/receipts";
import { RECEIPT_EXTENSION_BY_TYPE } from "@/lib/const/receipts";

const MAX_FILE_BYTES = 10_485_760;
const MAX_REDIRECTS = 3;

export const McpInlineFileSchema = z.object({
	base64: z.string().min(1).max(14_000_000),
	filename: z.string().trim().min(1).max(255),
	mimeType: z.string().min(1),
});
export const McpRemoteFileSchema = z.object({
	download_url: z.string().url(),
	file_id: z.string().min(1),
	file_name: z.string().trim().min(1).max(255).optional(),
	filename: z.string().trim().min(1).max(255).optional(),
	mime_type: z.string().optional(),
});
export const McpFileInputSchema = z.union([McpInlineFileSchema, McpRemoteFileSchema]);

export type McpFileInput = z.infer<typeof McpFileInputSchema>;

export interface AcquiredMcpFile {
	bytes: Uint8Array;
	contentType: string;
	filename: string;
}

interface FileAcquisitionDependencies {
	/** Trusted DNS zones; prevents attacker-controlled DNS rebinding between validation and fetch. */
	allowedHosts?: readonly string[];
	fetcher?: typeof fetch;
	resolveHost?: (hostname: string) => Promise<string[]>;
	timeoutMs?: number;
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
			(a === 100 && b >= 64 && b <= 127) ||
			(a === 169 && b === 254) ||
			(a === 172 && b >= 16 && b <= 31) ||
			(a === 192 && b === 0) ||
			(a === 192 && b === 168) ||
			(a === 192 && b === 88 && c === 99) ||
			(a === 198 && (b === 18 || b === 19)) ||
			(a === 198 && b === 51 && c === 100) ||
			(a === 203 && b === 0 && c === 113) ||
			a >= 224
		);
	}
	if (!normalized.includes(":")) return false;
	try {
		const canonical = new URL(`https://[${normalized}]`).hostname.slice(1, -1);
		const [first, second] = canonical.split(":").map((part) => Number.parseInt(part || "0", 16));
		// Only global unicast, excluding transition, documentation and special-purpose ranges.
		return (
			first < 0x2000 ||
			first > 0x3fff ||
			first === 0x2002 ||
			(first === 0x2001 && (second <= 0x1ff || second === 0xdb8)) ||
			(first === 0x3fff && second <= 0xfff)
		);
	} catch {
		return true;
	}
}

async function resolveWithDnsOverHttps(hostname: string, signal: AbortSignal): Promise<string[]> {
	const answers = new Set<string>();
	for (const type of ["A", "AAAA"]) {
		const response = await fetch(
			`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(hostname)}&type=${type}`,
			{ headers: { accept: "application/dns-json" }, signal },
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
	allowedHosts: readonly string[],
): Promise<URL> {
	const url = new URL(value);
	if (url.protocol !== "https:" || url.username || url.password) {
		throw new Error("La URL temporal debe usar HTTPS y no puede incluir credenciales.");
	}
	if (url.port && url.port !== "443") throw new Error("El puerto de descarga no está permitido.");
	if (url.hostname === "localhost" || isPrivateOrReservedAddress(url.hostname)) {
		throw new Error("El destino de descarga no está permitido.");
	}
	if (!allowedHosts.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`))) {
		throw new Error(
			"El destino de descarga no está permitido. Adjunta el archivo en ChatGPT o usa base64.",
		);
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
		await response.body?.cancel();
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
		return validateFile({
			bytes: decodeBase64(input.base64),
			contentType: validateMimeType(input.mimeType, allowedTypes),
			filename: input.filename,
		});
	}
	const controller = new AbortController();
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		return await Promise.race([
			downloadFile(input, allowedTypes, dependencies, controller.signal),
			new Promise<never>((_, reject) => {
				timer = setTimeout(() => {
					controller.abort();
					reject(new Error("La descarga del archivo tardó demasiado. Inténtalo nuevamente."));
				}, dependencies.timeoutMs ?? 20_000);
			}),
		]);
	} finally {
		clearTimeout(timer);
		controller.abort();
	}
}

function validateFile(file: AcquiredMcpFile): AcquiredMcpFile {
	const metadata = validateReceiptMetadata({ ...file, sizeBytes: file.bytes.byteLength });
	validateReceiptSignature(file.bytes, metadata.contentType);
	return { bytes: file.bytes, contentType: metadata.contentType, filename: metadata.filename };
}

async function downloadFile(
	input: z.infer<typeof McpRemoteFileSchema>,
	allowedTypes: ReadonlySet<string>,
	dependencies: FileAcquisitionDependencies,
	signal: AbortSignal,
): Promise<AcquiredMcpFile> {
	const fetcher = dependencies.fetcher ?? fetch;
	const resolveHost =
		dependencies.resolveHost ?? ((host: string) => resolveWithDnsOverHttps(host, signal));
	const allowedHosts = dependencies.allowedHosts ?? ["oaiusercontent.com"];
	let url = await validateRemoteUrl(input.download_url, resolveHost, allowedHosts);
	for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
		signal.throwIfAborted();
		const response = await fetcher(url, {
			headers: { accept: [...allowedTypes].join(", ") },
			redirect: "manual",
			signal,
		});
		if (response.status >= 300 && response.status < 400) {
			const location = response.headers.get("location");
			await response.body?.cancel();
			if (!location || redirects === MAX_REDIRECTS) throw new Error("La redirección no es segura.");
			url = await validateRemoteUrl(new URL(location, url).toString(), resolveHost, allowedHosts);
			continue;
		}
		if (!response.ok) {
			await response.body?.cancel();
			throw new Error("No pudimos descargar el archivo temporal.");
		}
		const headerType = response.headers.get("content-type") ?? input.mime_type ?? "";
		let contentType: string;
		try {
			contentType = validateMimeType(headerType, allowedTypes);
		} catch (error) {
			await response.body?.cancel();
			throw error;
		}
		const extension =
			RECEIPT_EXTENSION_BY_TYPE[contentType as keyof typeof RECEIPT_EXTENSION_BY_TYPE];
		return validateFile({
			bytes: await readBoundedBody(response),
			contentType,
			filename: input.file_name ?? input.filename ?? `archivo.${extension}`,
		});
	}
	throw new Error("No pudimos descargar el archivo temporal.");
}
