import { format, validate } from "rut.js";
import { z } from "zod";

export const BANK_ACCOUNT_TYPES = ["Cuenta Corriente", "Cuenta Vista", "Cuenta de Ahorro"] as const;

export type BankAccountType = (typeof BANK_ACCOUNT_TYPES)[number];

const rutSchema = z
	.string()
	.trim()
	.min(1, "Ingresa un RUT.")
	.max(16, "El RUT no puede superar los 16 caracteres.")
	.refine(validate, "Ingresa un RUT válido.")
	.transform((rut) => format(rut));

export const ParticipantBankAccountInputSchema = z.object({
	accountNumber: z
		.string()
		.trim()
		.min(1, "Ingresa un número de cuenta.")
		.max(64, "El número de cuenta no puede superar los 64 caracteres."),
	accountType: z.enum(BANK_ACCOUNT_TYPES, { message: "Selecciona un tipo de cuenta válido." }),
	bankName: z
		.string()
		.trim()
		.min(1, "Ingresa un banco.")
		.max(80, "El banco no puede superar los 80 caracteres."),
	rut: rutSchema,
});

export type ParticipantBankAccountInput = z.infer<typeof ParticipantBankAccountInputSchema>;

export interface ParticipantBankAccount extends ParticipantBankAccountInput {
	createdAt: string;
	participantId: string;
	updatedAt: string;
}

export interface ParticipantBankAccountResponse {
	bankAccount: ParticipantBankAccount;
}

export interface BankTransferDetails {
	accountNumber: string;
	accountType: BankAccountType;
	bankName: string;
	email: string;
	name: string;
	participantId: string;
	rut: string;
}
