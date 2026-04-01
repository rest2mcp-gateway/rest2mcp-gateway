export const serializeAuthUser = (user: Record<string, unknown>) => ({
  id: user.id,
  organizationId: user.organizationId,
  username: user.username,
  name: user.name,
  role: user.role,
  authMode: user.authMode,
  isActive: user.isActive
});
