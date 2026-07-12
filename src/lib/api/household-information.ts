import { apiRequest, type ApiResult } from "@/lib/api/client";
import type {
	HouseholdInformationInput,
	HouseholdInformationListResponse,
	HouseholdInformationResponse,
} from "@/lib/types/household-information";

const BASE_PATH = "/api/household-information";

export function getHouseholdInformation(): Promise<ApiResult<HouseholdInformationListResponse>> {
	return apiRequest<HouseholdInformationListResponse>(BASE_PATH);
}

export function createHouseholdInformation(
	input: HouseholdInformationInput,
): Promise<ApiResult<HouseholdInformationResponse>> {
	return apiRequest<HouseholdInformationResponse>(BASE_PATH, {
		body: JSON.stringify(input),
		method: "POST",
	});
}

export function updateHouseholdInformation(
	id: string,
	input: HouseholdInformationInput,
): Promise<ApiResult<HouseholdInformationResponse>> {
	return apiRequest<HouseholdInformationResponse>(`${BASE_PATH}/${encodeURIComponent(id)}`, {
		body: JSON.stringify(input),
		method: "PATCH",
	});
}

export function archiveHouseholdInformation(id: string): Promise<ApiResult<null>> {
	return apiRequest<null>(`${BASE_PATH}/${encodeURIComponent(id)}`, { method: "DELETE" });
}
