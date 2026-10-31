import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { StatusCategory, StatusDef } from '../lib/types';

export const STATUSES_KEY = ['statuses'];

const UNKNOWN: Omit<StatusDef, 'key' | 'label'> = {
  bg: '#94a3b8',
  text_color: '#ffffff',
  category: 'closed',
  sort_order: 999,
  is_default: false,
};

export function useStatuses() {
  const { data, isLoading } = useQuery({
    queryKey: STATUSES_KEY,
    queryFn: () => api.get<StatusDef[]>('/statuses'),
    staleTime: 60_000,
  });

  return useMemo(() => {
    const statuses = data ?? [];
    const byKey = new Map(statuses.map((s) => [s.key, s]));
    const byCategory = (c: StatusCategory) => statuses.filter((s) => s.category === c);
    return {
      statuses,
      isLoading,
      /** Always returns something renderable, even for a status that was just deleted. */
      get: (key: string): StatusDef => byKey.get(key) ?? { ...UNKNOWN, key, label: key },
      byCategory,
      firstOf: (c: StatusCategory) => byCategory(c)[0],
      defaultKey: statuses.find((s) => s.is_default)?.key ?? byCategory('new')[0]?.key,
    };
  }, [data, isLoading]);
}
