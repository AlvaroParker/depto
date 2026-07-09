const MAX_ADDRESS_LENGTH = 120;

export function getClientAddress(request: Request): string {
	const cloudflareAddress = request.headers.get("cf-connecting-ip")?.trim();
	if (cloudflareAddress) return cloudflareAddress.slice(0, MAX_ADDRESS_LENGTH);

	const forwardedAddress = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
	if (forwardedAddress) return forwardedAddress.slice(0, MAX_ADDRESS_LENGTH);

	return "unknown";
}
