"use client";

import { useEffect, useRef, useState } from "react";

const POLL_INTERVAL_MS = 5000;

export interface UsePollWhilePendingOptions<T> {
  initialData: T;
  isPending: (data: T) => boolean;
  fetchNext: () => Promise<T>;
}

/**
 * Re-schedules a single timer after every data change instead of using
 * setInterval, so a slow fetchNext can never overlap itself and polling
 * stops the instant `isPending` turns false rather than on the next tick.
 */
export function usePollWhilePending<T>({
  initialData,
  isPending,
  fetchNext,
}: UsePollWhilePendingOptions<T>): T {
  const [data, setData] = useState<T>(initialData);
  const fetchNextRef = useRef(fetchNext);
  const isPendingRef = useRef(isPending);

  useEffect(() => {
    fetchNextRef.current = fetchNext;
    isPendingRef.current = isPending;
  });

  useEffect(() => {
    if (!isPendingRef.current(data)) {
      return;
    }

    let cancelled = false;
    const timer = setTimeout(() => {
      void fetchNextRef.current().then((next) => {
        if (!cancelled) {
          setData(next);
        }
      });
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [data]);

  return data;
}
