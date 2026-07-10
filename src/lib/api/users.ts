import { apiRequest, type ApiResult } from "@/lib/api/client";
import type {
	BootstrapRootInput,
	CreateManagedUserInput,
	ManagedUser,
	UserListResponse,
} from "@/lib/types/user";

interface CreatedUserResponse {
	user: ManagedUser;
}

export function bootstrapRoot(input: BootstrapRootInput): Promise<ApiResult<CreatedUserResponse>> {
	return apiRequest<CreatedUserResponse>("/api/bootstrap", {
		body: JSON.stringify(input),
		method: "POST",
	});
}

export function createUser(input: CreateManagedUserInput): Promise<ApiResult<CreatedUserResponse>> {
	return apiRequest<CreatedUserResponse>("/api/admin/users", {
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
