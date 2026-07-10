interface AuthRuntimeEnvironment {
	nextjsEnv?: string;
	nodeEnv?: string;
}

export function getSecureCookieOverride({
	nextjsEnv,
	nodeEnv,
}: AuthRuntimeEnvironment): false | undefined {
	if (nextjsEnv === "development" || nextjsEnv === "test") return false;
	if (nodeEnv === "development" || nodeEnv === "test") return false;
	return undefined;
}
