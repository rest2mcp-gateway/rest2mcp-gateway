export const serializeAuthUser = (user: Record<string, unknown>) => ({
  id: user.id,
  organizationId: user.organizationId,
  email: user.email,
  name: user.name,
  role: user.role,
  authMode: user.authMode,
  isActive: user.isActive
});
