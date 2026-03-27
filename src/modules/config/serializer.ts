export const serializeValidationResult = (issues: string[]) => ({
  valid: issues.length === 0,
  issues
});
