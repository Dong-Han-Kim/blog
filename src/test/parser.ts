// =============================================================================
// 파일 1: lib/excel-parser.ts (유틸리티 - Server Action 아님)
// =============================================================================

import ExcelJS from 'exceljs';

export interface ParsedExcelRow {
  category: string;
  weight: number;
  planActual: number;
  planDiff: number;
  planTarget: number;
  actual: number;
  variance: number;
}

export interface ParseResult {
  success: boolean;
  data?: ParsedExcelRow[];
  errors?: Array<{ row: number; message: string }>;
  message?: string;
}

/**
 * 헤더 문자열 정규화
 */
function normalizeHeader(header: string | undefined): string {
  if (!header) return '';
  return String(header)
    .normalize('NFKC')
    .replace(/\s+/g, '')
    .toLowerCase()
    .trim();
}

/**
 * 헤더 매핑
 */
function mapHeaderIndexes(
  headers: string[],
  columnMap: Record<string, string[]>,
): Record<string, number> {
  const normalizedHeaders = headers.map(normalizeHeader);
  const result: Record<string, number> = {};

  for (const [key, candidates] of Object.entries(columnMap)) {
    const normalizedCandidates = candidates.map(normalizeHeader);

    const index = normalizedHeaders.findIndex((header) =>
      normalizedCandidates.some(
        (candidate) =>
          header === candidate ||
          header.includes(candidate) ||
          candidate.includes(header),
      ),
    );

    if (index === -1) {
      throw new Error(
        `필수 컬럼을 찾을 수 없습니다: ${candidates.join(' / ')}`,
      );
    }

    result[key] = index;
  }

  return result;
}

/**
 * 셀 값을 숫자로 변환
 */
function parseNumber(value: ExcelJS.CellValue, defaultValue = 0): number {
  if (value === null || value === undefined) return defaultValue;

  const str = String(value).trim().replace(/,/g, '');
  if (str === '') return defaultValue;

  const num = Number(str);
  return isFinite(num) ? num : defaultValue;
}

/**
 * 셀 값을 날짜로 변환
 */
export function parseDate(value: ExcelJS.CellValue): string | null {
  if (!value) return null;

  if (value instanceof Date) {
    return value.toISOString().split('T')[0];
  }

  const str = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return str;
  }

  const date = new Date(str);
  if (!isNaN(date.getTime())) {
    return date.toISOString().split('T')[0];
  }

  return null;
}

/**
 * File을 ExcelJS Workbook으로 변환
 */
async function loadWorkbook(file: File): Promise<ExcelJS.Workbook> {
  const arrayBuffer = await file.arrayBuffer();

  const workbook = new ExcelJS.Workbook();

  await workbook.xlsx.load(arrayBuffer);
  return workbook;
}

/**
 * 엑셀 파일 파싱 (순수 함수 - DB 접근 없음)
 */
export async function parseExcelFile(file: File): Promise<ParseResult> {
  const errors: Array<{ row: number; message: string }> = [];

  try {
    if (!file) {
      return { success: false, message: '파일이 선택되지 않았습니다.' };
    }

    // 워크북 로드
    const workbook = await loadWorkbook(file);
    const worksheet = workbook.getWorksheet(1);

    if (!worksheet) {
      return { success: false, message: '워크시트를 찾을 수 없습니다.' };
    }

    // 헤더 읽기
    const headers: string[] = [];
    const headerRow = worksheet.getRow(1);

    headerRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      headers[colNumber - 1] = String(cell.value || '').trim();
    });

    // 컬럼 매핑
    const columnMap = {
      category: ['Category', '구분', '품목', '카테고리'],
      weight: ['Weight', '가중치', '중량'],
      planActual: ['PlanActual', 'Plan(Actual)', '계획실적', '계획(실적)'],
      planDiff: ['PlanDiff', 'Plan Diff', '계획차이', '계획차'],
      planTarget: ['PlanTarget', 'Plan Target', '목표', '목표수량'],
      actual: ['Actual', '실적'],
      variance: ['Variance', '편차', '차이'],
    };

    const columnIndexes = mapHeaderIndexes(headers, columnMap);

    // 데이터 파싱
    const records: ParsedExcelRow[] = [];

    for (let rowNum = 2; rowNum <= worksheet.rowCount; rowNum++) {
      try {
        const row = worksheet.getRow(rowNum);

        const getCellValue = (key: keyof typeof columnMap) => {
          const index = columnIndexes[key];
          return row.getCell(index + 1).value;
        };

        const category = String(getCellValue('category') || '').trim();
        const weight = parseNumber(getCellValue('weight'));
        const planActual = parseNumber(getCellValue('planActual'));
        const planDiff = parseNumber(getCellValue('planDiff'));
        const planTarget = parseNumber(getCellValue('planTarget'));
        const actual = parseNumber(getCellValue('actual'));
        const variance = parseNumber(getCellValue('variance'));

        // 빈 행 스킵
        if (!category && weight === 0 && planActual === 0 && actual === 0) {
          continue;
        }

        // 필수 값 검증
        if (!category) {
          errors.push({
            row: rowNum,
            message: '카테고리가 비어있습니다.',
          });
          continue;
        }

        records.push({
          category,
          weight,
          planActual,
          planDiff,
          planTarget,
          actual,
          variance,
        });
      } catch (rowError) {
        errors.push({
          row: rowNum,
          message: `행 처리 중 오류: ${(rowError as Error).message}`,
        });
      }
    }

    if (records.length === 0) {
      return {
        success: false,
        message: '업로드할 유효한 데이터가 없습니다.',
        errors,
      };
    }

    return {
      success: true,
      data: records,
      errors: errors.length > 0 ? errors : undefined,
    };
  } catch (error) {
    console.error('Excel parsing error:', error);
    return {
      success: false,
      message: `파싱 중 오류: ${(error as Error).message}`,
      errors,
    };
  }
}
