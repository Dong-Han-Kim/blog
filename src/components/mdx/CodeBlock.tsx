'use client';

import { ReactNode, useRef, useState } from 'react';

interface CodeBlockProps {
  children: ReactNode;
  filename?: string;
}

export function CodeBlock({ children, filename }: CodeBlockProps) {
  const preRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const code = preRef.current?.querySelector('code')?.textContent ?? '';
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative my-24 group">
      {filename && (
        <div className="bg-gray-800 text-gray-300 text-xs px-16 py-6 rounded-t-lg border-b border-gray-700">
          {filename}
        </div>
      )}
      <div ref={preRef} className={filename ? '' : 'rounded-t-lg'}>
        {children}
      </div>
      <button
        onClick={handleCopy}
        className="absolute top-8 right-8 px-8 py-4 text-xs rounded bg-gray-700 text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
        aria-label="코드 복사"
      >
        {copied ? '복사됨!' : '복사'}
      </button>
    </div>
  );
}
