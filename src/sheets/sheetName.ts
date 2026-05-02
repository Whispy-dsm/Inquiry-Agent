/**
 * Google Sheet 탭 이름을 설정값과 비교하기 좋은 형태로 정규화합니다.
 *
 * @remarks
 * 폭이 없는 문자와 중복 공백처럼 운영 중 복사/붙여넣기로 섞일 수 있는 보이지 않는 차이를 제거합니다.
 *
 * @param value - 환경변수, Sheet 메타데이터, 웹훅 payload에서 받은 탭 이름
 * @returns 비교에 사용할 수 있는 정규화된 탭 이름
 */
export function normalizeSheetName(value: string): string {
  return value
    .normalize('NFC')
    .replace(/[\u200B-\u200D\uFEFF]/gu, '')
    .replace(/\s+/gu, ' ')
    .trim();
}

/**
 * 보이지 않는 공백 차이를 무시하고 Google Sheet 탭 이름이 같은지 비교합니다.
 *
 * @param left - 비교할 첫 번째 탭 이름
 * @param right - 비교할 두 번째 탭 이름
 * @returns 두 값이 같은 정규화된 탭을 가리키면 `true`
 */
export function sheetNamesMatch(left: string, right: string): boolean {
  return normalizeSheetName(left) === normalizeSheetName(right);
}

/**
 * Google Sheets A1 범위 표기에서 사용할 수 있도록 탭 이름을 작은따옴표로 감쌉니다.
 *
 * @remarks
 * 탭 이름 안에 작은따옴표가 있으면 Sheets 규칙에 맞게 두 번 써서 이스케이프합니다.
 *
 * @param sheetName - 실제 Google Sheet 탭 이름
 * @returns A1 범위 앞에 붙일 수 있는 작은따옴표 처리된 탭 이름
 */
export function quoteSheetName(sheetName: string): string {
  return `'${sheetName.replaceAll("'", "''")}'`;
}
