/**
 * Best-effort read of a queue payload that failed parsing or validation, so the
 * rejection can still be audited with whatever string fields survived. Never
 * throws: anything that is not a JSON object yields no fields.
 */
export const readStringFields = (body: string): Record<string, string> => {
  let parsed: unknown;

  try {
    parsed = JSON.parse(body);
  } catch {
    return {};
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(parsed).filter(
      (entry): entry is [string, string] =>
        typeof entry[1] === 'string' && entry[1].trim() !== '',
    ),
  );
};
