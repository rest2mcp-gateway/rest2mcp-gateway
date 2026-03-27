export const serializeSecret = (row: Record<string, unknown>) => ({
  ...row,
  encryptedValue: undefined,
  hasValue: Boolean(row.encryptedValue),
  plaintextValue: undefined
});
