import { apiRequest, type ApiResult } from "@/lib/api/client";
import type {
	ExpenseKindInput,
	ExpenseKindListResponse,
	ExpenseKindResponse,
} from "@/lib/types/expense-kind";

export function createExpenseKind(
	input: ExpenseKindInput,
): Promise<ApiResult<ExpenseKindResponse>> {
	return apiRequest<ExpenseKindResponse>("/api/admin/expense-kinds", {
		body: JSON.stringify(input),
		method: "POST",
	});
}

export function getExpenseKinds(): Promise<ApiResult<ExpenseKindListResponse>> {
	return apiRequest<ExpenseKindListResponse>("/api/admin/expense-kinds");
}

export function updateExpenseKind(
	id: string,
	input: ExpenseKindInput,
): Promise<ApiResult<ExpenseKindResponse>> {
	return apiRequest<ExpenseKindResponse>(`/api/admin/expense-kinds/${encodeURIComponent(id)}`, {
		body: JSON.stringify(input),
		method: "PATCH",
	});
}
