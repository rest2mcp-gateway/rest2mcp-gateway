type JsonObject = Record<string, unknown>;

const asObject = (value: unknown): JsonObject =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as JsonObject) : {};

const hasSecretValue = (config: JsonObject, encryptedKey: string, legacyKey: string) =>
  typeof config[encryptedKey] === "string" || typeof config[legacyKey] === "string";

export const serializeBackendApi = (row: Record<string, unknown>) => {
  const authType = row.authType;
  const authConfig = asObject(row.authConfig);

  if (authType === "api_key") {
    const hasValue = hasSecretValue(authConfig, "encryptedValue", "value");
    return {
      ...row,
      authConfig: {
        in: authConfig.in === "query" ? "query" : "header",
        name: typeof authConfig.name === "string" ? authConfig.name : "x-api-key",
        hasValue,
        maskedValue: hasValue ? "••••" : null
      },
      apiKeyLocation: authConfig.in === "query" ? "query" : "header",
      apiKeyName: typeof authConfig.name === "string" ? authConfig.name : "x-api-key",
      hasApiKeyValue: hasValue,
      apiKeyMaskedValue: hasValue ? "••••" : null,
      bearerToken: null,
      hasBearerToken: false,
      basicUsername: null,
      hasBasicPassword: false,
      oauth2AccessToken: null,
      hasOauth2AccessToken: false
    };
  }

  if (authType === "basic") {
    const hasPassword = hasSecretValue(authConfig, "encryptedPassword", "password");
    return {
      ...row,
      authConfig: {
        username: typeof authConfig.username === "string" ? authConfig.username : "",
        hasPassword
      },
      apiKeyLocation: null,
      apiKeyName: null,
      hasApiKeyValue: false,
      apiKeyMaskedValue: null,
      bearerToken: null,
      hasBearerToken: false,
      basicUsername: typeof authConfig.username === "string" ? authConfig.username : "",
      hasBasicPassword: hasPassword,
      oauth2AccessToken: null,
      hasOauth2AccessToken: false
    };
  }

  if (authType === "bearer") {
    const hasToken = hasSecretValue(authConfig, "encryptedToken", "token") || hasSecretValue(authConfig, "encryptedToken", "accessToken");
    return {
      ...row,
      authConfig: { hasToken },
      apiKeyLocation: null,
      apiKeyName: null,
      hasApiKeyValue: false,
      apiKeyMaskedValue: null,
      bearerToken: null,
      hasBearerToken: hasToken,
      basicUsername: null,
      hasBasicPassword: false,
      oauth2AccessToken: null,
      hasOauth2AccessToken: false
    };
  }

  if (authType === "oauth2") {
    const hasAccessToken = hasSecretValue(authConfig, "encryptedAccessToken", "accessToken") || hasSecretValue(authConfig, "encryptedAccessToken", "token");
    return {
      ...row,
      authConfig: { hasAccessToken },
      apiKeyLocation: null,
      apiKeyName: null,
      hasApiKeyValue: false,
      apiKeyMaskedValue: null,
      bearerToken: null,
      hasBearerToken: false,
      basicUsername: null,
      hasBasicPassword: false,
      oauth2AccessToken: null,
      hasOauth2AccessToken: hasAccessToken
    };
  }

  return {
    ...row,
    authConfig: {},
    apiKeyLocation: null,
    apiKeyName: null,
    hasApiKeyValue: false,
    apiKeyMaskedValue: null,
    bearerToken: null,
    hasBearerToken: false,
    basicUsername: null,
    hasBasicPassword: false,
    oauth2AccessToken: null,
    hasOauth2AccessToken: false
  };
};
