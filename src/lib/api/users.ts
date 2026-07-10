import { apiRequest, type ApiResult } from "@/lib/api/client";
import type {
	BootstrapRootInput,
	CreateManagedUserInput,
	ManagedUserResponse,
	UpdateManagedUserInput,
	UserListResponse,
} from "@/lib/types/user";

export function bootstrapRoot(input: BootstrapRootInput): Promise<ApiResult<ManagedUserResponse>> {
	return apiRequest<ManagedUserResponse>("/api/bootstrap", {
		body: JSON.stringify(input),
		method: "POST",
	});
}

export function createUser(input: CreateManagedUserInput): Promise<ApiResult<ManagedUserResponse>> {
	return apiRequest<ManagedUserResponse>("/api/admin/users", {
		body: JSON.stringify(input),
		method: "POST",
	});
}

export function deleteUser(id: string): Promise<ApiResult<null>> {
	return apiRequest<null>(`/api/admin/users/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export function getUsers(): Promise<ApiResult<UserListResponse>> {
	return apiRequest<UserListResponse>("/api/admin/users");
}

export function updateUser(
	id: string,
	input: UpdateManagedUserInput,
): Promise<ApiResult<ManagedUserResponse>> {
	return apiRequest<ManagedUserResponse>(`/api/admin/users/${encodeURIComponent(id)}`, {
		body: JSON.stringify(input),
		method: "PATCH",
	});
}
