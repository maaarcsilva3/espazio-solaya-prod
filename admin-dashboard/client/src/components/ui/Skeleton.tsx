export default function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-gray-200 dark:bg-gray-700 ${className}`} />;
}

/** Placeholder rows shaped like a list of people/bookings. */
export function SkeletonRows({ count = 4 }: { count?: number }) {
  return (
    <div className="divide-y divide-gray-100 dark:divide-gray-700">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex items-center gap-4 py-4">
          <Skeleton className="h-10 w-10 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-3 w-1/2" />
          </div>
          <Skeleton className="hidden h-6 w-20 rounded-full sm:block" />
        </div>
      ))}
    </div>
  );
}
