import { PBKDF2_ITERATIONS, PBKDF2_KEY_BYTES, PBKDF2_SALT_BYTES } from "@/lib/const/auth";
import { base64UrlToBytes, bytesToBase64Url } from "@/lib/util/encoding";

const ALGORITHM = "pbkdf2-sha256";
const encoder = new TextEncoder();

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
	const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, [
		"deriveBits",
	]);
	const bits = await crypto.subtle.deriveBits(
		{ hash: "SHA-256", iterations, name: "PBKDF2", salt: new Uint8Array(salt).buffer },
		key,
		PBKDF2_KEY_BYTES * 8,
	);
	return new Uint8Array(bits);
}

function constantTimeEqual(first: Uint8Array, second: Uint8Array): boolean {
	if (first.length !== second.length) return false;
	let difference = 0;
	for (let index = 0; index < first.length; index += 1) {
		difference |= first[index] ^ second[index];
	}
	return difference === 0;
}

export async function hashPassword(password: string): Promise<string> {
	const salt = crypto.getRandomValues(new Uint8Array(PBKDF2_SALT_BYTES));
	const digest = await derive(password, salt, PBKDF2_ITERATIONS);
	return `${ALGORITHM}$${PBKDF2_ITERATIONS}$${bytesToBase64Url(salt)}$${bytesToBase64Url(digest)}`;
}

export async function verifyPassword(password: string, encodedHash: string): Promise<boolean> {
	const [algorithm, iterationValue, saltValue, digestValue, extra] = encodedHash.split("$");
	const iterations = Number(iterationValue);
	const salt = base64UrlToBytes(saltValue ?? "");
	const expected = base64UrlToBytes(digestValue ?? "");
	if (
		extra !== undefined ||
		algorithm !== ALGORITHM ||
		iterations !== PBKDF2_ITERATIONS ||
		salt?.length !== PBKDF2_SALT_BYTES ||
		expected?.length !== PBKDF2_KEY_BYTES
	) {
		return false;
	}
	const actual = await derive(password, salt, iterations);
	return constantTimeEqual(actual, expected);
}
