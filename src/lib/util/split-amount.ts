export function splitAmount(amountMinor: number, participantCount: number): number[] {
	if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) {
		throw new RangeError("Amount must be a positive safe integer.");
	}
	if (!Number.isSafeInteger(participantCount) || participantCount <= 0) {
		throw new RangeError("Participant count must be a positive safe integer.");
	}
	const base = Math.floor(amountMinor / participantCount);
	const remainder = amountMinor % participantCount;
	return Array.from({ length: participantCount }, (_, index) => base + (index < remainder ? 1 : 0));
}
