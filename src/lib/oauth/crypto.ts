import { bytesToBase64Url } from "@/lib/util/encoding";
import { OAUTH_CREDENTIAL_BYTES } from "./constants";

const encoder = new TextEncoder();

export function createOAuthCredential(bytes = OAUTH_CREDENTIAL_BYTES): string {
	const value = new Uint8Array(bytes);
	crypto.getRandomValues(value);
	return bytesToBase64Url(value);
}

export async function sha256Base64Url(value: string): Promise<string> {
	const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
	return bytesToBase64Url(new Uint8Array(digest));
}

export async function verifyPkceS256(verifier: string, challenge: string): Promise<boolean> {
	if (!/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)) return false;
	const actual = await sha256Base64Url(verifier);
	if (actual.length !== challenge.length) return false;
	let difference = 0;
	for (let index = 0; index < actual.length; index += 1) {
		difference |= actual.charCodeAt(index) ^ challenge.charCodeAt(index);
	}
	return difference === 0;
}
