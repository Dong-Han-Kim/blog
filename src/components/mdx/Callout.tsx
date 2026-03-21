import { ReactNode } from 'react';

const variants = {
  info: {
    border: 'border-blue-500',
    bg: 'bg-blue-50 dark:bg-blue-950/30',
    icon: 'ℹ️',
  },
  warning: {
    border: 'border-yellow-500',
    bg: 'bg-yellow-50 dark:bg-yellow-950/30',
    icon: '⚠️',
  },
  tip: {
    border: 'border-green-500',
    bg: 'bg-green-50 dark:bg-green-950/30',
    icon: '💡',
  },
  danger: {
    border: 'border-red-500',
    bg: 'bg-red-50 dark:bg-red-950/30',
    icon: '🚨',
  },
} as const;

interface CalloutProps {
  type?: keyof typeof variants;
  title?: string;
  children: ReactNode;
}

export function Callout({ type = 'info', title, children }: CalloutProps) {
  const variant = variants[type];

  return (
    <div
      className={`my-24 border-l-4 ${variant.border} ${variant.bg} rounded-r-lg p-16`}
    >
      {title && (
        <p className="font-bold mb-8">
          {variant.icon} {title}
        </p>
      )}
      <div className="text-sm leading-relaxed">{children}</div>
    </div>
  );
}
