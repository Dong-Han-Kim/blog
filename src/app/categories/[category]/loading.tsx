import { Skeleton } from '@/components/ui/skeleton';

export default function CategoryLoading() {
  return (
    <div className="w-full px-10 md:px-20 lg:px-50" aria-label="로딩 중">
      <Skeleton className="h-36 w-120 mb-20" />
      <div className="grid sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-12">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="w-full border border-gray-300 rounded-lg overflow-hidden"
          >
            <div className="px-12 pt-16 pb-8">
              <Skeleton className="h-12 w-50 mb-8" />
              <Skeleton className="h-24 w-3/4 mb-8" />
              <Skeleton className="h-16 w-full mb-20" />
            </div>
            <div className="px-12 py-12 border-t border-t-gray-300">
              <Skeleton className="h-14 w-80" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
