import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, errorMessage } from '../lib/api';
import type { BookingRequest, RequestStatus } from '../lib/types';
import { useToast } from '../context/ToastContext';
import { STATUSES_KEY, useStatuses } from './useStatuses';

export function useRequestActions() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const { get } = useStatuses();

  const refresh = (id?: number) => {
    queryClient.invalidateQueries({ queryKey: ['requests'] });
    queryClient.invalidateQueries({ queryKey: ['calendar'] });
    queryClient.invalidateQueries({ queryKey: ['stats'] });
    queryClient.invalidateQueries({ queryKey: ['offerings'] });
    queryClient.invalidateQueries({ queryKey: STATUSES_KEY });
    if (id) queryClient.invalidateQueries({ queryKey: ['request', id] });
  };

  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: number; status: RequestStatus }) =>
      api.patch<BookingRequest>(`/requests/${id}/status`, { status }),
    onSuccess: (r) => {
      refresh(r.id);
      toast(`Moved to ${get(r.status).label}`);
    },
    onError: (err) => toast(errorMessage(err), 'error'),
  });

  const remove = useMutation({
    mutationFn: (id: number) => api.delete(`/requests/${id}`),
    onSuccess: () => {
      refresh();
      toast('Booking deleted');
    },
    onError: (err) => toast(errorMessage(err), 'error'),
  });

  return { setStatus, remove };
}
