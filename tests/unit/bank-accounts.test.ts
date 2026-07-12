import { describe, expect, it } from "vitest";
import { ParticipantBankAccountInputSchema } from "@/lib/types/bank-account";
import { formatBankTransferDetails } from "@/lib/util/bank-accounts";

describe("participant bank accounts", () => {
	it("validates and formats Chilean RUT values", () => {
		const parsed = ParticipantBankAccountInputSchema.safeParse({
			accountNumber: " 001234567 ",
			accountType: "Cuenta Corriente",
			bankName: " Banco de Chile ",
			rut: "189726317",
		});

		expect(parsed.success && parsed.data).toEqual({
			accountNumber: "001234567",
			accountType: "Cuenta Corriente",
			bankName: "Banco de Chile",
			rut: "18.972.631-7",
		});
	});

	it("rejects invalid check digits and unsupported account types", () => {
		expect(
			ParticipantBankAccountInputSchema.safeParse({
				accountNumber: "123",
				accountType: "Cuenta RUT",
				bankName: "Banco",
				rut: "18.972.631-0",
			}).success,
		).toBe(false);
	});

	it("formats the exact six-line clipboard payload", () => {
		expect(
			formatBankTransferDetails({
				accountNumber: "001234567",
				accountType: "Cuenta Vista",
				bankName: "Banco Estado",
				email: "camila@example.com",
				name: "Camila",
				participantId: "participant_camila",
				rut: "18.972.631-7",
			}),
		).toBe("Camila\n18.972.631-7\nCuenta Vista\n001234567\nBanco Estado\ncamila@example.com");
	});
});
