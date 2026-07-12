import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	archiveHouseholdInformation,
	createHouseholdInformation,
	listHouseholdInformation,
	updateHouseholdInformation,
} from "@/lib/db/household-information";
import type { HouseholdInformationInput } from "@/lib/types/household-information";
import { createTestBindings, type TestBindings } from "../fixtures/miniflare";

const NOW = new Date("2026-07-12T12:00:00.000Z");
const ROOT_ID = "household-root";

const waterInput: HouseholdInformationInput = {
	customerReference: "0012345",
	fields: [{ displayType: "text", label: "Medidor", value: "M-42" }],
	iconKey: "water",
	notes: "Pagar antes del día 5.",
	paymentUrl: "https://example.com/water",
	providerName: "Aguas de ejemplo",
	title: "Agua",
};

describe("household information", () => {
	let bindings: TestBindings;

	beforeEach(async () => {
		bindings = await createTestBindings();
		await bindings.database
			.prepare(
				`INSERT INTO app_users
				 (id, username, password_hash, display_name, participant_id, role, created_at, updated_at)
				 VALUES (?, 'household-root', 'hash', 'Administradora', NULL, 'root', ?, ?)`,
			)
			.bind(ROOT_ID, NOW.toISOString(), NOW.toISOString())
			.run();
	});

	afterEach(async () => bindings.dispose());

	it("creates, nests, updates, and archives open household fields", async () => {
		const created = await createHouseholdInformation(waterInput, ROOT_ID, bindings.database, NOW);
		expect(created.ok && created.val).toMatchObject({
			customerReference: "0012345",
			fields: [{ displayType: "text", label: "Medidor", sortOrder: 1, value: "M-42" }],
			sortOrder: 1,
			updatedByName: "Administradora",
		});
		if (created.err) return;

		const updated = await updateHouseholdInformation(
			created.val.id,
			{
				...waterInput,
				fields: [
					{ displayType: "link", label: "Emergencias", value: "https://example.com/help" },
					{ displayType: "text", label: "Medidor", value: "M-99" },
				],
				providerName: "Nueva empresa de agua",
			},
			ROOT_ID,
			bindings.database,
			new Date("2026-07-12T13:00:00.000Z"),
		);
		expect(updated.ok && updated.val.kind).toBe("updated");
		if (updated.err || updated.val.kind !== "updated") return;
		expect(updated.val.item.fields).toMatchObject([
			{ displayType: "link", label: "Emergencias", sortOrder: 1 },
			{ displayType: "text", label: "Medidor", sortOrder: 2, value: "M-99" },
		]);

		const archived = await archiveHouseholdInformation(
			created.val.id,
			ROOT_ID,
			bindings.database,
			NOW,
		);
		expect(archived.ok && archived.val.kind).toBe("archived");
		expect((await listHouseholdInformation(bindings.database)).val).toEqual([]);
	});

	it("allows multiple cards with the same service icon in stable order", async () => {
		await createHouseholdInformation(waterInput, ROOT_ID, bindings.database, NOW);
		await createHouseholdInformation(
			{ ...waterInput, customerReference: "00999", title: "Agua del jardín" },
			ROOT_ID,
			bindings.database,
			NOW,
		);
		const items = await listHouseholdInformation(bindings.database);
		expect(
			items.ok && items.val.map(({ iconKey, sortOrder, title }) => ({ iconKey, sortOrder, title })),
		).toEqual([
			{ iconKey: "water", sortOrder: 1, title: "Agua" },
			{ iconKey: "water", sortOrder: 2, title: "Agua del jardín" },
		]);
	});

	it("rolls back the whole D1 batch when a custom field violates a constraint", async () => {
		const invalidInput: HouseholdInformationInput = {
			...waterInput,
			fields: [
				{ displayType: "text", label: "Medidor", value: "M-1" },
				{ displayType: "text", label: "medidor", value: "M-2" },
			],
		};
		const result = await createHouseholdInformation(invalidInput, ROOT_ID, bindings.database, NOW);
		expect(result.err).toBe(true);
		const count = await bindings.database
			.prepare("SELECT COUNT(*) AS count FROM household_information_items")
			.first<{ count: number }>();
		expect(count?.count).toBe(0);
	});
});
