import "server-only";

import type { Result } from "ts-results";
import { isExpenseKindIconKey } from "@/lib/const/expense-kinds";
import { getDatabase } from "@/lib/db/bindings";
import { type DbError, safeDbCall } from "@/lib/db/safe-db-call";
import type {
	HouseholdInformationField,
	HouseholdInformationInput,
	HouseholdInformationItem,
} from "@/lib/types/household-information";
import { createId } from "@/lib/util/ids";

interface HouseholdInformationItemRow {
	created_at: string;
	created_by_user_id: string;
	customer_reference: string | null;
	icon_key: string;
	id: string;
	notes: string | null;
	payment_url: string | null;
	provider_name: string | null;
	sort_order: number;
	title: string;
	updated_at: string;
	updated_by_name: string;
	updated_by_user_id: string;
}

interface HouseholdInformationFieldRow {
	display_type: "link" | "text";
	id: string;
	item_id: string;
	label: string;
	sort_order: number;
	value: string;
}

export type UpdateHouseholdInformationOutcome =
	{ kind: "not_found" } | { item: HouseholdInformationItem; kind: "updated" };

export type ArchiveHouseholdInformationOutcome = { kind: "archived" } | { kind: "not_found" };

const ITEM_COLUMNS = `
	i.id,
	i.title,
	i.icon_key,
	i.provider_name,
	i.customer_reference,
	i.payment_url,
	i.notes,
	i.sort_order,
	i.created_by_user_id,
	i.updated_by_user_id,
	i.created_at,
	i.updated_at,
	u.display_name AS updated_by_name
`;

function mapFields(rows: HouseholdInformationFieldRow[]): HouseholdInformationField[] {
	return rows.map((row) => ({
		displayType: row.display_type,
		id: row.id,
		label: row.label,
		sortOrder: row.sort_order,
		value: row.value,
	}));
}

function mapItem(
	row: HouseholdInformationItemRow,
	fields: HouseholdInformationField[],
): HouseholdInformationItem {
	if (!isExpenseKindIconKey(row.icon_key)) throw new Error("Unknown household information icon.");
	return {
		createdAt: row.created_at,
		createdByUserId: row.created_by_user_id,
		...(row.customer_reference ? { customerReference: row.customer_reference } : {}),
		fields,
		iconKey: row.icon_key,
		id: row.id,
		...(row.notes ? { notes: row.notes } : {}),
		...(row.payment_url ? { paymentUrl: row.payment_url } : {}),
		...(row.provider_name ? { providerName: row.provider_name } : {}),
		sortOrder: row.sort_order,
		title: row.title,
		updatedAt: row.updated_at,
		updatedByName: row.updated_by_name,
		updatedByUserId: row.updated_by_user_id,
	};
}

async function loadFields(
	database: D1Database,
	itemIds: string[],
): Promise<HouseholdInformationFieldRow[]> {
	if (!itemIds.length) return [];
	const placeholders = itemIds.map(() => "?").join(", ");
	const result = await database
		.prepare(
			`SELECT id, item_id, label, value, display_type, sort_order
			 FROM household_information_fields
			 WHERE item_id IN (${placeholders})
			 ORDER BY item_id, sort_order`,
		)
		.bind(...itemIds)
		.all<HouseholdInformationFieldRow>();
	return result.results;
}

async function loadItem(
	database: D1Database,
	id: string,
): Promise<HouseholdInformationItem | null> {
	const row = await database
		.prepare(
			`SELECT ${ITEM_COLUMNS}
			 FROM household_information_items i
			 JOIN app_users u ON u.id = i.updated_by_user_id
			 WHERE i.id = ? AND i.archived_at IS NULL`,
		)
		.bind(id)
		.first<HouseholdInformationItemRow>();
	if (!row) return null;
	const fields = await loadFields(database, [id]);
	return mapItem(row, mapFields(fields));
}

function fieldStatements(
	database: D1Database,
	itemId: string,
	input: HouseholdInformationInput,
): D1PreparedStatement[] {
	return input.fields.map((field, index) =>
		database
			.prepare(
				`INSERT INTO household_information_fields
				 (id, item_id, label, value, display_type, sort_order)
				 VALUES (?, ?, ?, ?, ?, ?)`,
			)
			.bind(createId(), itemId, field.label, field.value, field.displayType, index + 1),
	);
}

export async function listHouseholdInformation(
	database: D1Database = getDatabase(),
): Promise<Result<HouseholdInformationItem[], DbError>> {
	return safeDbCall(async () => {
		const result = await database
			.prepare(
				`SELECT ${ITEM_COLUMNS}
				 FROM household_information_items i
				 JOIN app_users u ON u.id = i.updated_by_user_id
				 WHERE i.archived_at IS NULL
				 ORDER BY i.sort_order`,
			)
			.all<HouseholdInformationItemRow>();
		const fields = await loadFields(
			database,
			result.results.map(({ id }) => id),
		);
		const fieldsByItem = new Map<string, HouseholdInformationField[]>();
		for (const field of fields) {
			const current = fieldsByItem.get(field.item_id) ?? [];
			current.push(mapFields([field])[0]);
			fieldsByItem.set(field.item_id, current);
		}
		return result.results.map((row) => mapItem(row, fieldsByItem.get(row.id) ?? []));
	});
}

export async function createHouseholdInformation(
	input: HouseholdInformationInput,
	userId: string,
	database: D1Database = getDatabase(),
	now: Date = new Date(),
): Promise<Result<HouseholdInformationItem, DbError>> {
	return safeDbCall(async () => {
		const id = createId();
		const timestamp = now.toISOString();
		await database.batch([
			database
				.prepare(
					`INSERT INTO household_information_items
					 (id, title, icon_key, provider_name, customer_reference, payment_url, notes,
					  sort_order, created_by_user_id, updated_by_user_id, created_at, updated_at)
					 SELECT ?, ?, ?, ?, ?, ?, ?, COALESCE(MAX(sort_order), 0) + 1, ?, ?, ?, ?
					 FROM household_information_items`,
				)
				.bind(
					id,
					input.title,
					input.iconKey,
					input.providerName ?? null,
					input.customerReference ?? null,
					input.paymentUrl ?? null,
					input.notes ?? null,
					userId,
					userId,
					timestamp,
					timestamp,
				),
			...fieldStatements(database, id, input),
		]);
		const item = await loadItem(database, id);
		if (!item) throw new Error("Created household information could not be read.");
		return item;
	});
}

export async function updateHouseholdInformation(
	id: string,
	input: HouseholdInformationInput,
	userId: string,
	database: D1Database = getDatabase(),
	now: Date = new Date(),
): Promise<Result<UpdateHouseholdInformationOutcome, DbError>> {
	return safeDbCall(async () => {
		const current = await database
			.prepare("SELECT id FROM household_information_items WHERE id = ? AND archived_at IS NULL")
			.bind(id)
			.first<{ id: string }>();
		if (!current) return { kind: "not_found" };
		await database.batch([
			database
				.prepare(
					`UPDATE household_information_items
					 SET title = ?, icon_key = ?, provider_name = ?, customer_reference = ?,
					     payment_url = ?, notes = ?, updated_by_user_id = ?, updated_at = ?
					 WHERE id = ? AND archived_at IS NULL`,
				)
				.bind(
					input.title,
					input.iconKey,
					input.providerName ?? null,
					input.customerReference ?? null,
					input.paymentUrl ?? null,
					input.notes ?? null,
					userId,
					now.toISOString(),
					id,
				),
			database.prepare("DELETE FROM household_information_fields WHERE item_id = ?").bind(id),
			...fieldStatements(database, id, input),
		]);
		const item = await loadItem(database, id);
		if (!item) return { kind: "not_found" };
		return { item, kind: "updated" };
	});
}

export async function archiveHouseholdInformation(
	id: string,
	userId: string,
	database: D1Database = getDatabase(),
	now: Date = new Date(),
): Promise<Result<ArchiveHouseholdInformationOutcome, DbError>> {
	return safeDbCall(async () => {
		const result = await database
			.prepare(
				`UPDATE household_information_items
				 SET archived_at = ?, updated_at = ?, updated_by_user_id = ?
				 WHERE id = ? AND archived_at IS NULL`,
			)
			.bind(now.toISOString(), now.toISOString(), userId, id)
			.run();
		return result.meta.changes ? { kind: "archived" } : { kind: "not_found" };
	});
}
