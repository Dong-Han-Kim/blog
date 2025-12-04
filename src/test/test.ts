'use server';

import ExcelJS from 'exceljs';

import { db, productionData, type NewProductionData } from '@/lib/db';
import {
  createScaffoldingInstallation,
  createPreLoadingPainting,
} from '@/lib/services/construction-progress-service';

// =============================================================================
// 유틸: 헤더 정규화 & 매핑 + 날짜 정규화
// =============================================================================

function normalizeHeader(s?: string): string {
  if (!s) return '';
  return String(s)
    .normalize('NFKC') // 전각/반각 정규화
    .replace(/\s+/g, ' ') // 연속 공백을 단일 공백으로
    .trim()
    .toLowerCase();
}

function normalizeCandidate(c: string) {
  return normalizeHeader(c);
}

function mapHeaderIndexes(
  headers: string[],
  map: Record<string, readonly string[]>,
  allowMissing = false,
) {
  // headers: 원본 헤더 배열 (0-based)
  const normHeaders = headers.map((h) => normalizeHeader(h));
  const result: Record<string, number> = {};

  for (const key in map) {
    const candidates = map[key].map(normalizeCandidate);
    let foundIndex = -1;

    // 1) 정확히 일치하는 후보 찾기
    for (let i = 0; i < normHeaders.length; i++) {
      if (candidates.includes(normHeaders[i])) {
        foundIndex = i;
        break;
      }
    }

    // 2) 후보가 일부 포함되는 것도 허용 (ex. "plan actual" vs "plan(actual)")
    if (foundIndex === -1) {
      for (let i = 0; i < normHeaders.length; i++) {
        for (const cand of candidates) {
          if (normHeaders[i].includes(cand) || cand.includes(normHeaders[i])) {
            foundIndex = i;
            break;
          }
        }
        if (foundIndex !== -1) break;
      }
    }

    if (foundIndex === -1) {
      if (allowMissing) {
        result[key] = -1;
        continue;
      }
      throw new Error(
        `필수 컬럼 누락: [${map[key].join(' / ')}] (헤더 목록: ${headers.join(
          ', ',
        )})`,
      );
    }
    result[key] = foundIndex;
  }

  return result;
}

function normalizeDateCell(value: ExcelJS.CellValue): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().split('T')[0];
  const str = String(value).trim();
  if (!str) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  // Excel 숫자 날짜는 ExcelJS가 Date로 주는 경우가 많음; 그래도 시도
  const parsed = new Date(str);
  if (!Number.isNaN(parsed.getTime()))
    return parsed.toISOString().split('T')[0];
  return null;
}

async function loadWorkbookFromFile(file: File) {
  const arrayBuffer = await file.arrayBuffer();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(arrayBuffer as any);
  return workbook;
}

// =============================================================================
// 컬럼 맵 (예시: 한글/영문 후보 다 포함 가능)
// 필요에 따라 여기 값들을 현업 엑셀 컬럼명으로 바꿔주세요.
// =============================================================================

const QUANTITY_COLUMN_MAP = {
  category: ['Category', '구분', '품목', 'CategoryName'],
  weight: ['Weight', '가중치', '중량'],
  planActual: ['PlanActual', 'Plan(Actual)', '계획실적', '계획(실적)'],
  planDiff: ['PlanDiff', 'Plan Diff', '계획차', '계획-실적'],
  planTarget: ['PlanTarget', 'Plan Target', '목표', '목표수량'],
  actual: ['Actual', '실적'],
  variance: ['Variance', '편차'],
} as const;

const SCAFFOLD_COLUMN_MAP = {
  module: ['Module', '모듈'],
  deck: ['Deck', '데크', '갑판'],
  pe1stPlannedEndDate: ['PE1stPlannedEndDate', '1차계획', '1차 계획'],
  pe1stActualEndDate: ['PE1stActualEndDate', '1차실적', '1차 실적'],
  pe3rdPlannedEndDate: ['PE3rdPlannedEndDate', '3차계획', '3차 계획'],
  pe3rdActualEndDate: ['PE3rdActualEndDate', '3차실적', '3차 실적'],
  postLoadingPlannedEndDate: [
    'PostLoadingPlannedEndDate',
    '탑재후계획',
    '탑재후 계획',
  ],
  postLoadingActualEndDate: [
    'PostLoadingActualEndDate',
    '탑재후실적',
    '탑재후 실적',
  ],
} as const;

const PRE_PAINTING_COLUMN_MAP = {
  module: ['Module', '모듈'],
  type: ['Type', 'PaintingType', '도장Type', '도장타입', '도장'],
  totalQuantity: ['TotalQuantity', '전체수량', '총수량'],
  targetQuantity: ['TargetQuantity', '목표수량', '목표'],
} as const;

// =============================================================================
// 보강된 importQuantityExcel (행 단위 에러 집계 및 상세 로깅)
// =============================================================================

export async function importQuantityExcel({
  file,
  projectId,
  week,
}: {
  file: File;
  projectId: string;
  week: string;
}) {
  const rowErrors: { row: number; message: string; rowValues?: any }[] = [];
  try {
    if (!projectId || !week)
      return { success: false, error: 'projectId와 week가 필요합니다.' };
    if (!file) return { success: false, error: '엑셀 파일이 필요합니다.' };

    const workbook = await loadWorkbookFromFile(file);
    const worksheet = workbook.getWorksheet(1);
    if (!worksheet)
      return { success: false, error: '워크시트를 찾을 수 없습니다.' };

    // 헤더 읽기 (원본 텍스트 배열)
    const rawHeaders: string[] = [];
    worksheet.getRow(1).eachCell((cell, col) => {
      rawHeaders[col - 1] = String(cell.value ?? '').trim();
    });

    // 컬럼 인덱스 매핑 (정규화 매칭)
    const columnIndexes = mapHeaderIndexes(rawHeaders, QUANTITY_COLUMN_MAP);

    const rowsForService: {
      rowNumber: number;
      data: Record<string, any>;
    }[] = [];

    for (let i = 2; i <= worksheet.rowCount; i++) {
      try {
        const row = worksheet.getRow(i);
        // 읽어들인 셀값들을 보기 좋게 객체로 만듬 (디버깅용)
        const snapshot: Record<string, any> = {};
        rawHeaders.forEach((h, idx) => {
          const cell = row.getCell(idx + 1);
          snapshot[h || `COL_${idx + 1}`] = cell.value;
        });

        const getCellByKey = (key: keyof typeof QUANTITY_COLUMN_MAP) => {
          const idx = columnIndexes[key];
          return idx >= 0 ? row.getCell(idx + 1).value : null;
        };

        const getNumber = (v: any, fallback = 0) => {
          if (v === null || v === undefined || String(v).trim() === '')
            return fallback;
          const n = Number(String(v).replace(/,/g, ''));
          return Number.isFinite(n) ? n : fallback;
        };

        const category = String(getCellByKey('category') ?? '').trim();

        const rowData = {
          category,
          weight: getNumber(getCellByKey('weight')),
          planActual: getNumber(getCellByKey('planActual')),
          planDiff: getNumber(getCellByKey('planDiff')),
          planTarget: getNumber(getCellByKey('planTarget')),
          actual: getNumber(getCellByKey('actual')),
          variance: getNumber(getCellByKey('variance')),
          status: 'default' as const,
        };

        const isEmpty = Object.values(rowData).every(
          (v) => v === 0 || v === '' || v === null,
        );
        if (isEmpty) continue;

        rowsForService.push({ rowNumber: i, data: rowData });
      } catch (rowErr) {
        rowErrors.push({
          row: i,
          message: `행 파싱 중 에러: ${(rowErr as Error).message}`,
        });
      }
    }

    if (rowsForService.length === 0) {
      return {
        success: false,
        error: '업로드할 유효한 데이터가 없습니다.',
        rowErrors,
      };
    }

    // week 파싱
    const weekNumber = Number(week.match(/\d+/)?.[0]);
    if (!weekNumber)
      return { success: false, error: '유효하지 않은 주차입니다.', rowErrors };

    // DB로 매핑
    const today = new Date().toISOString().split('T')[0];
    const values: NewProductionData[] = rowsForService.map((r) => {
      const d = r.data;
      return {
        projectId,
        category: d.category as NewProductionData['category'],
        periodDate: today,
        weekNumber,
        weight: String(d.weight),
        planActual: String(d.planActual),
        planDiff: String(d.planDiff),
        planTarget: String(d.planTarget),
        actual: String(d.actual),
        variance: String(d.variance),
        planPeriod: String(d.planActual),
        actualPeriod: String(d.actual),
        planCumulative: String(d.planTarget),
        actualCumulative: String(d.actual),
        dataSource: 'manual',
        oracleRecordId: null,
      };
    });

    // DB insert 시도 — 전체 배치 삽입
    try {
      await db.insert(productionData).values(values);
    } catch (dbErr) {
      // db 에러(예: enum mismatch, unique constraint 등)는 치명적이므로 상세 로깅 후 반환
      console.error('DB insert 에러:', dbErr);
      return {
        success: false,
        error: 'DB 저장 중 에러가 발생했습니다.',
        dbError: (dbErr as Error).message,
        rowErrors,
      };
    }

    return {
      success: true,
      count: values.length,
      rowErrors,
    };
  } catch (error) {
    console.error('importQuantityExcel 전체 에러:', error);
    return {
      success: false,
      error: (error as Error).message || '계획물량 업로드 오류',
    };
  }
}

// =============================================================================
// importScaffoldInstallationExcel (비슷한 패턴: 행 단위 에러 집계)
// =============================================================================

export async function importScaffoldInstallationExcel({
  file,
  projectCode,
}: {
  file: File;
  projectCode: string;
}) {
  const rowErrors: { row: number; message: string }[] = [];

  try {
    if (!projectCode) return { success: false, error: 'projectCode 필요' };
    if (!file) return { success: false, error: '엑셀 파일 필요' };

    const workbook = await loadWorkbookFromFile(file);
    const worksheet = workbook.getWorksheet(1);
    if (!worksheet) return { success: false, error: '워크시트 없음' };

    const rawHeaders: string[] = [];
    worksheet.getRow(1).eachCell((cell, col) => {
      rawHeaders[col - 1] = String(cell.value ?? '').trim();
    });

    const columnIndexes = mapHeaderIndexes(rawHeaders, SCAFFOLD_COLUMN_MAP);

    const created: ScaffoldExcelRow[] = [];

    for (let i = 2; i <= worksheet.rowCount; i++) {
      try {
        const row = worksheet.getRow(i);
        const getCell = (key: keyof typeof SCAFFOLD_COLUMN_MAP) => {
          const idx = columnIndexes[key];
          return idx >= 0 ? row.getCell(idx + 1).value : null;
        };

        const module = String(getCell('module') ?? '').trim();
        const deck = String(getCell('deck') ?? '').trim();
        if (!module || !deck) continue;

        const payload: ScaffoldExcelRow = {
          module,
          deck,
          pe1stPlannedEndDate: normalizeDateCell(
            getCell('pe1stPlannedEndDate'),
          ),
          pe1stActualEndDate: normalizeDateCell(getCell('pe1stActualEndDate')),
          pe3rdPlannedEndDate: normalizeDateCell(
            getCell('pe3rdPlannedEndDate'),
          ),
          pe3rdActualEndDate: normalizeDateCell(getCell('pe3rdActualEndDate')),
          postLoadingPlannedEndDate: normalizeDateCell(
            getCell('postLoadingPlannedEndDate'),
          ),
          postLoadingActualEndDate: normalizeDateCell(
            getCell('postLoadingActualEndDate'),
          ),
        };

        const result = await createScaffoldingInstallation(
          projectCode,
          payload,
        );
        if (result.success) created.push(payload);
        else {
          // 도메인 레이어에서 실패 정보를 줄 수 있다면 더 자세히 기록
          rowErrors.push({
            row: i,
            message: `도메인 저장 실패: ${JSON.stringify(result)}`,
          });
        }
      } catch (rowErr) {
        rowErrors.push({
          row: i,
          message: `행 파싱/저장 중 에러: ${(rowErr as Error).message}`,
        });
      }
    }

    return { success: true, count: created.length, rowErrors };
  } catch (error) {
    console.error('importScaffoldInstallationExcel 전체 에러:', error);
    return {
      success: false,
      error: (error as Error).message || '족장설치 업로드 오류',
    };
  }
}

// =============================================================================
// importPreLoadingPaintingExcel (행 단위 방어 적용)
// =============================================================================

export async function importPreLoadingPaintingExcel({
  file,
  projectCode,
}: {
  file: File;
  projectCode: string;
}) {
  const rowErrors: { row: number; message: string }[] = [];

  try {
    if (!projectCode) return { success: false, error: 'projectCode 필요' };
    if (!file) return { success: false, error: '엑셀 파일 필요' };

    const workbook = await loadWorkbookFromFile(file);
    const worksheet = workbook.getWorksheet(1);
    if (!worksheet) return { success: false, error: '워크시트 없음' };

    const rawHeaders: string[] = [];
    worksheet.getRow(1).eachCell((cell, col) => {
      rawHeaders[col - 1] = String(cell.value ?? '').trim();
    });

    const columnIndexes = mapHeaderIndexes(rawHeaders, PRE_PAINTING_COLUMN_MAP);

    const created: PreLoadingPaintingExcelRow[] = [];

    for (let i = 2; i <= worksheet.rowCount; i++) {
      try {
        const row = worksheet.getRow(i);
        const getCell = (key: keyof typeof PRE_PAINTING_COLUMN_MAP) => {
          const idx = columnIndexes[key];
          return idx >= 0 ? row.getCell(idx + 1).value : null;
        };

        const type = String(getCell('type') ?? '').trim();
        if (!type) continue;

        const payload: PreLoadingPaintingExcelRow = {
          module: String(getCell('module') ?? '').trim() || undefined,
          type,
          totalQuantity: Number(getCell('totalQuantity') ?? 0),
          targetQuantity: Number(getCell('targetQuantity') ?? 0),
        };

        const result = await createPreLoadingPainting(projectCode, payload);
        if (result.success) created.push(payload);
        else
          rowErrors.push({
            row: i,
            message: `도메인 저장 실패: ${JSON.stringify(result)}`,
          });
      } catch (rowErr) {
        rowErrors.push({
          row: i,
          message: `행 파싱/저장 중 에러: ${(rowErr as Error).message}`,
        });
      }
    }

    return { success: true, count: created.length, rowErrors };
  } catch (error) {
    console.error('importPreLoadingPaintingExcel 전체 에러:', error);
    return {
      success: false,
      error: (error as Error).message || '탑재전 도장 업로드 오류',
    };
  }
}
