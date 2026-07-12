import { describe, expect, it } from "vitest";
import { HouseholdInformationInputSchema } from "@/lib/types/household-information";

const validInput = {
	customerReference: "0012345",
	fields: [],
	iconKey: "water",
	notes: "Vence durante la primera semana del mes.",
	paymentUrl: "https://example.com/pagar",
	providerName: "Aguas de ejemplo",
	title: "Agua",
} as const;

describe("household information input", () => {
	it("preserves text references and accepts http payment links", () => {
		const result = HouseholdInformationInputSchema.safeParse(validInput);
		expect(result.success && result.data.customerReference).toBe("0012345");
	});

	it("requires useful content beyond the title", () => {
		const result = HouseholdInformationInputSchema.safeParse({
			fields: [],
			iconKey: "other",
			title: "Dato vacío",
		});
		expect(result.success).toBe(false);
		expect(result.error?.issues[0].message).toMatch(/al menos un dato útil/i);
	});

	it("rejects unsafe URL protocols in common and custom links", () => {
		const payment = HouseholdInformationInputSchema.safeParse({
			...validInput,
			paymentUrl: "javascript:alert(1)",
		});
		const custom = HouseholdInformationInputSchema.safeParse({
			...validInput,
			fields: [{ displayType: "link", label: "Portal", value: "ftp://example.com" }],
		});
		expect(payment.success).toBe(false);
		expect(custom.success).toBe(false);
	});

	it("rejects repeated custom labels case-insensitively", () => {
		const result = HouseholdInformationInputSchema.safeParse({
			...validInput,
			fields: [
				{ displayType: "text", label: "Medidor", value: "A-1" },
				{ displayType: "text", label: "medidor", value: "A-2" },
			],
		});
		expect(result.success).toBe(false);
		expect(result.error?.issues.some(({ message }) => /etiqueta distinta/i.test(message))).toBe(
			true,
		);
	});
});
