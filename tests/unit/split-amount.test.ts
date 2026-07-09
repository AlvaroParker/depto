import { describe, expect, it } from "vitest";
import { splitAmount } from "@/lib/util/split-amount";

describe("splitAmount", () => {
	it("splits divisible amounts equally", () => {
		expect(splitAmount(30_000, 3)).toEqual([10_000, 10_000, 10_000]);
	});

	it("assigns remainder units in participant order", () => {
		expect(splitAmount(10_000, 3)).toEqual([3_334, 3_333, 3_333]);
		expect(splitAmount(10_001, 3)).toEqual([3_334, 3_334, 3_333]);
	});

	it("keeps one- and two-unit boundaries exact and non-negative", () => {
		expect(splitAmount(1, 3)).toEqual([1, 0, 0]);
		expect(splitAmount(2, 3)).toEqual([1, 1, 0]);
	});

	it("is exact for a broad range of safe positive integers", () => {
		for (let amount = 1; amount <= 10_000; amount += 1) {
			const shares = splitAmount(amount, 3);
			expect(shares).toHaveLength(3);
			expect(shares.every((share) => Number.isInteger(share) && share >= 0)).toBe(true);
			expect(shares.reduce((sum, share) => sum + share, 0)).toBe(amount);
			expect(shares[0] - shares[2]).toBeLessThanOrEqual(1);
		}
	});

	it("rejects unsafe amounts and participant counts", () => {
		expect(() => splitAmount(0, 3)).toThrow();
		expect(() => splitAmount(1.5, 3)).toThrow();
		expect(() => splitAmount(Number.MAX_SAFE_INTEGER + 1, 3)).toThrow();
		expect(() => splitAmount(10, 0)).toThrow();
	});
});
