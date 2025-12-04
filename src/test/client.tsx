// =============================================================================
// 파일 3: components/excel-upload.tsx (클라이언트 컴포넌트)
// =============================================================================

'use client';

import { useState } from 'react';
import { importExcelToDatabase } from '@/actions/import-excel';
import { Uint8Array } from 'buffer';

export default function ExcelUpload() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string>('');

  const handleFileUpload = async (file: File) => {
    const arrayBuffer = await file.arrayBuffer();
    const fileData = Array.from(new Uint8Array(arrayBuffer));

    // 서버 액션 호출
    const result = await uploadExcelAction(fileData, file.name);
    console.log('처리완료:', result);

    // const file = e.target.files?.[0];
    // if (!file) return;

    // setLoading(true);
    // setResult("");

    // try {
    //   const response = await importExcelToDatabase(
    //     file,
    //     "PROJECT_001",
    //     "Week 1"
    //   );

    //   if (response.success) {
    //     setResult(`✅ ${response.message}`);
    //     if (response.errors && response.errors.length > 0) {
    //       setResult(
    //         (prev) =>
    //           prev + `\n⚠️ ${response.errors!.length}개의 경고가 있습니다.`
    //       );
    //     }
    //   } else {
    //     setResult(`❌ ${response.message}`);
    //   }
    // } catch (error) {
    //   setResult(`❌ 업로드 실패: ${(error as Error).message}`);
    // } finally {
    //   setLoading(false);
    // }
  };

  return (
    <div className="p-4">
      <input
        type="file"
        accept=".xlsx,.xls"
        onChange={handleFileUpload}
        disabled={loading}
        className="border p-2 rounded"
      />
      {loading && <p className="mt-2">업로드 중...</p>}
      {result && (
        <pre className="mt-4 p-4 bg-gray-100 rounded whitespace-pre-wrap">
          {result}
        </pre>
      )}
    </div>
  );
}
