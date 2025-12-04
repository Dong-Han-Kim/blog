// =============================================================================
// 파일 2: actions/import-excel.ts (Server Action)
// =============================================================================

'use server';

import { db } from '@/lib/db';
import { productionData } from '@/lib/db/schema';
import { parseExcelFile, type ParsedExcelRow } from '@/lib/excel-parser';
import ExcelJS from 'exceljs';

export interface ImportResult {
  success: boolean;
  message?: string;
  count?: number;
  errors?: Array<{ row: number; message: string }>;
}

export async function importExcelToDatabase(
  file: File,
  projectId: string,
  week: string,
): Promise<ImportResult> {
  try {
    // 입력 검증
    if (!projectId || !week) {
      return {
        success: false,
        message: '프로젝트 ID와 주차 정보가 필요합니다.',
      };
    }

    // 엑셀 파싱 (유틸리티 함수 사용)
    const parseResult = await parseExcelFile(file);

    if (!parseResult.success || !parseResult.data) {
      return {
        success: false,
        message: parseResult.message || '파일 파싱 실패',
        errors: parseResult.errors,
      };
    }

    // DB 레코드 생성
    const weekNumber = parseInt(week.match(/\d+/)?.[0] || '0');
    const today = new Date().toISOString().split('T')[0];

    const records = parseResult.data.map((row: ParsedExcelRow) => ({
      projectId,
      category: row.category,
      periodDate: today,
      weekNumber,
      weight: String(row.weight),
      planActual: String(row.planActual),
      planDiff: String(row.planDiff),
      planTarget: String(row.planTarget),
      actual: String(row.actual),
      variance: String(row.variance),
      planPeriod: String(row.planActual),
      actualPeriod: String(row.actual),
      planCumulative: String(row.planTarget),
      actualCumulative: String(row.actual),
      dataSource: 'excel' as const,
      oracleRecordId: null,
    }));

    // DB 삽입
    await db.insert(productionData).values(records);

    return {
      success: true,
      message: `${records.length}개의 레코드가 저장되었습니다.`,
      count: records.length,
      errors: parseResult.errors,
    };
  } catch (error) {
    console.error('Import error:', error);
    return {
      success: false,
      message: `저장 중 오류: ${(error as Error).message}`,
    };
  }
}

export async function uploadExcelAction(fileData: number[], fileName: string) {
  try {
    // 배열을 ArrayBuffer로 변환
    const uint8Array = new Uint8Array(fileData);
    const arrayBuffer = uint8Array.buffer;

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(arrayBuffer);

    // 워크북 데이터 처리
    const worksheet = workbook.worksheets[0];
    const data: any[] = [];

    worksheet.eachRow((row, rowNumber) => {
      data.push(row.values);
    });

    return {
      success: true,
      fileName,
      rowCount: data.length,
      data,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : '알수 없는 에러',
    };
  }
}
