export interface ApiError {
	message: string;
	code?: string;
	errors?: Record<string, string[] | undefined>;
}

export interface ApiSuccess<T> {
	data: T;
}
