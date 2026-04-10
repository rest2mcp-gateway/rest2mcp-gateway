const MCP_TEST_TOKEN_PREFIX = "rest-to-mcp.mcp-test-token";

const getStorageKey = (serverId: string) => `${MCP_TEST_TOKEN_PREFIX}.${serverId}`;

export const getStoredMcpTestToken = (serverId: string) => localStorage.getItem(getStorageKey(serverId)) ?? "";

export const setStoredMcpTestToken = (serverId: string, token: string) => {
  const normalizedToken = token.trim();
  const storageKey = getStorageKey(serverId);

  if (normalizedToken.length === 0) {
    localStorage.removeItem(storageKey);
    return;
  }

  localStorage.setItem(storageKey, normalizedToken);
};
