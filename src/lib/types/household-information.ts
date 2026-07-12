import { z } from "zod";
import { ExpenseKindIconKeySchema } from "@/lib/types/expense-kind";

function isHttpUrl(value: string): boolean {
	try {
		const url = new URL(value);
		return url.protocol === "http:" || url.protocol === "https:";
	} catch {
		return false;
	}
}

const optionalText = (maximum: number, message: string) =>
	z
		.string()
		.trim()
		.max(maximum, message)
		.optional()
		.transform((value) => value || undefined);

const optionalPaymentUrl = z
	.string()
	.trim()
	.max(2048, "El enlace no puede superar los 2.048 caracteres.")
	.optional()
	.transform((value) => value || undefined)
	.refine(
		(value) => !value || isHttpUrl(value),
		"Ingresa un enlace que comience con http:// o https://.",
	);

const householdInformationFieldInputSchema = z.object({
	displayType: z.enum(["text", "link"]),
	label: z
		.string()
		.trim()
		.min(1, "Ingresa una etiqueta.")
		.max(60, "La etiqueta no puede superar los 60 caracteres."),
	value: z
		.string()
		.trim()
		.min(1, "Ingresa un valor.")
		.max(500, "El valor no puede superar los 500 caracteres."),
});

export type HouseholdInformationFieldInput = z.infer<typeof householdInformationFieldInputSchema>;

export const HouseholdInformationInputSchema = z
	.object({
		customerReference: optionalText(
			120,
			"La referencia de cliente no puede superar los 120 caracteres.",
		),
		fields: z
			.array(householdInformationFieldInputSchema)
			.max(12, "Puedes agregar hasta 12 campos."),
		iconKey: ExpenseKindIconKeySchema,
		notes: optionalText(2000, "Las notas no pueden superar los 2.000 caracteres."),
		paymentUrl: optionalPaymentUrl,
		providerName: optionalText(120, "El proveedor no puede superar los 120 caracteres."),
		title: z
			.string()
			.trim()
			.min(1, "Ingresa un nombre.")
			.max(80, "El nombre no puede superar los 80 caracteres."),
	})
	.superRefine((input, context) => {
		const labels = new Set<string>();
		input.fields.forEach((field, index) => {
			const normalizedLabel = field.label.toLocaleLowerCase("es-CL");
			if (labels.has(normalizedLabel)) {
				context.addIssue({
					code: "custom",
					message: "Cada campo adicional debe tener una etiqueta distinta.",
					path: ["fields", index, "label"],
				});
			}
			labels.add(normalizedLabel);
			if (field.displayType === "link" && !isHttpUrl(field.value)) {
				context.addIssue({
					code: "custom",
					message: "Ingresa un enlace que comience con http:// o https://.",
					path: ["fields", index, "value"],
				});
			}
		});
		if (
			!input.providerName &&
			!input.customerReference &&
			!input.paymentUrl &&
			!input.notes &&
			input.fields.length === 0
		) {
			context.addIssue({
				code: "custom",
				message: "Agrega al menos un dato útil además del nombre.",
				path: ["title"],
			});
		}
	});

export type HouseholdInformationInput = z.infer<typeof HouseholdInformationInputSchema>;

export interface HouseholdInformationField extends HouseholdInformationFieldInput {
	id: string;
	sortOrder: number;
}

export interface HouseholdInformationItem {
	createdAt: string;
	createdByUserId: string;
	customerReference?: string;
	fields: HouseholdInformationField[];
	iconKey: z.infer<typeof ExpenseKindIconKeySchema>;
	id: string;
	notes?: string;
	paymentUrl?: string;
	providerName?: string;
	sortOrder: number;
	title: string;
	updatedAt: string;
	updatedByName: string;
	updatedByUserId: string;
}

export interface HouseholdInformationListResponse {
	items: HouseholdInformationItem[];
}

export interface HouseholdInformationResponse {
	item: HouseholdInformationItem;
}
