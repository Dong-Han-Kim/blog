import { Skeleton } from '@/components/ui/skeleton';

export default function PostLoading() {
  return (
    <div className="w-full px-10 md:px-20 lg:px-50" aria-label="로딩 중">
      <div className="flex justify-center">
        <article className="w-full max-w-[800px]">
          <header className="mb-32">
            <div className="flex items-center gap-8 mb-12">
              <Skeleton className="h-16 w-60" />
              <Skeleton className="h-16 w-80" />
            </div>
            <Skeleton className="h-40 w-full mb-16" />
            <Skeleton className="h-20 w-2/3 mb-16" />
            <div className="flex gap-6 mt-16">
              <Skeleton className="h-24 w-50 rounded-full" />
              <Skeleton className="h-24 w-60 rounded-full" />
              <Skeleton className="h-24 w-45 rounded-full" />
            </div>
          </header>
          <div className="space-y-16">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-5/6" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-160 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-4/5" />
          </div>
        </article>
      </div>
    </div>
  );
}
