/**
 * Normalizes Google Sheet tab names for configuration comparisons.
 *
 * @param value - Sheet tab name from configuration, metadata, or webhook payload.
 * @returns A comparison-safe sheet name.
 */
export function normalizeSheetName(value: string): string {
  return value
    .normalize('NFC')
    .replace(/[\u200B-\u200D\uFEFF]/gu, '')
    .replace(/\s+/gu, ' ')
    .trim();
}

/**
 * Compares Google Sheet tab names while ignoring invisible whitespace drift.
 *
 * @param left - First sheet tab name.
 * @param right - Second sheet tab name.
 * @returns Whether the names refer to the same normalized tab.
 */
export function sheetNamesMatch(left: string, right: string): boolean {
  return normalizeSheetName(left) === normalizeSheetName(right);
}

/**
 * Quotes a Google Sheet tab name for A1 notation.
 *
 * @param sheetName - Actual Google Sheet tab name.
 * @returns A quoted A1 sheet prefix.
 */
export function quoteSheetName(sheetName: string): string {
  return `'${sheetName.replaceAll("'", "''")}'`;
}
