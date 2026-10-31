import { useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Checkbox, Label, Modal, Select, Textarea, TextInput } from 'flowbite-react';
import { api, ApiError, errorMessage } from '../lib/api';
import { OFFERING_TYPE_LABELS, todayIso } from '../lib/format';
import type { BookingRequest, BookingRequestInput, Offering, RequestStatus } from '../lib/types';
import { useToast } from '../context/ToastContext';
import { STATUSES_KEY, useStatuses } from '../hooks/useStatuses';
import FormField from './FormField';

interface FormValues {
  full_name: string;
  email: string;
  phone: string;
  offering_id: string;
  start_date: string;
  end_date: string;
  guests: string;
  event_type: string;
  message: string;
  status: RequestStatus;
  admin_notes: string;
  amenity_ids: string[];
}

function emptyForm(startDate: string | undefined, status: RequestStatus): FormValues {
  const date = startDate ?? todayIso();
  return {
    full_name: '',
    email: '',
    phone: '',
    offering_id: '',
    start_date: date,
    end_date: date,
    guests: '',
    event_type: '',
    message: '',
    status,
    admin_notes: '',
    amenity_ids: [],
  };
}

function toForm(r: BookingRequest): FormValues {
  return {
    full_name: r.full_name,
    email: r.email,
    phone: r.phone ?? '',
    offering_id: r.offering_id?.toString() ?? '',
    start_date: r.start_date,
    end_date: r.end_date,
    guests: r.guests?.toString() ?? '',
    event_type: r.event_type ?? '',
    message: r.message ?? '',
    status: r.status,
    admin_notes: r.admin_notes ?? '',
    amenity_ids: r.amenities.map((a) => String(a.id)),
  };
}

export default function RequestFormModal({
  open,
  request,
  defaultDate,
  onClose,
  onSaved,
}: {
  open: boolean;
  request: BookingRequest | null;
  defaultDate?: string;
  onClose: () => void;
  onSaved?: (r: BookingRequest) => void;
}) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const { statuses, firstOf, defaultKey } = useStatuses();
  // Bookings added by an admin are usually already agreed, so start them as booked.
  const newBookingStatus = firstOf('booked')?.key ?? defaultKey ?? '';
  const newBookingStatusRef = useRef(newBookingStatus);
  newBookingStatusRef.current = newBookingStatus;
  const {
    register,
    handleSubmit,
    reset,
    watch,
    setError,
    formState: { errors },
  } = useForm<FormValues>({ defaultValues: emptyForm(undefined, newBookingStatus) });

  const { data: offerings = [] } = useQuery({
    queryKey: ['offerings'],
    queryFn: () => api.get<Offering[]>('/offerings'),
    enabled: open,
  });
  const places = offerings.filter((o) => o.type !== 'amenity');
  const amenities = offerings.filter((o) => o.type === 'amenity');

  useEffect(() => {
    if (open) reset(request ? toForm(request) : emptyForm(defaultDate, newBookingStatusRef.current));
  }, [open, request, defaultDate, reset]);

  const mutation = useMutation({
    mutationFn: (v: FormValues) => {
      const body: BookingRequestInput = {
        full_name: v.full_name,
        email: v.email,
        phone: v.phone || null,
        offering_id: v.offering_id ? Number(v.offering_id) : null,
        start_date: v.start_date,
        end_date: v.end_date,
        guests: v.guests ? Number(v.guests) : null,
        event_type: v.event_type || null,
        message: v.message || null,
        status: v.status,
        admin_notes: v.admin_notes || null,
        amenity_ids: (v.amenity_ids || []).map(Number),
      };
      return request
        ? api.put<BookingRequest>(`/requests/${request.id}`, body)
        : api.post<BookingRequest>('/requests', body);
    },
    onSuccess: (saved) => {
      queryClient.invalidateQueries({ queryKey: ['requests'] });
      queryClient.invalidateQueries({ queryKey: ['request', saved.id] });
      queryClient.invalidateQueries({ queryKey: ['calendar'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
      queryClient.invalidateQueries({ queryKey: ['offerings'] });
      queryClient.invalidateQueries({ queryKey: STATUSES_KEY });
      toast(request ? 'Booking updated' : 'Booking added');
      onSaved?.(saved);
      onClose();
    },
    onError: (err) => {
      if (err instanceof ApiError && err.fieldErrors) {
        for (const [field, msgs] of Object.entries(err.fieldErrors)) {
          setError(field as keyof FormValues, { message: msgs[0] });
        }
      }
    },
  });

  const startDate = watch('start_date');

  return (
    <Modal show={open} onClose={onClose} size="3xl" dismissible>
      <Modal.Header>{request ? `Edit booking #${request.id}` : 'Add booking'}</Modal.Header>
      <form onSubmit={handleSubmit((v) => mutation.mutate(v))} className="flex min-h-0 flex-1 flex-col">
        <Modal.Body className="space-y-6">
          {mutation.isError && <Alert color="failure">{errorMessage(mutation.error)}</Alert>}

          <section>
            <h4 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Guest details</h4>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField id="full_name" label="Full name" error={errors.full_name?.message} className="sm:col-span-2">
                <TextInput id="full_name" {...register('full_name', { required: 'Name is required' })} />
              </FormField>
              <FormField id="email" label="Email" error={errors.email?.message}>
                <TextInput id="email" type="email" {...register('email', { required: 'Email is required' })} />
              </FormField>
              <FormField id="phone" label="Phone" error={errors.phone?.message}>
                <TextInput id="phone" type="tel" {...register('phone')} />
              </FormField>
            </div>
          </section>

          <section>
            <h4 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Booking</h4>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField id="offering_id" label="What are they booking?" className="sm:col-span-2">
                <Select id="offering_id" {...register('offering_id')}>
                  <option value="">- Not specified -</option>
                  {places.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name} ({OFFERING_TYPE_LABELS[o.type]}){o.is_active ? '' : ' - inactive'}
                    </option>
                  ))}
                </Select>
              </FormField>
              <FormField id="start_date" label="Start date" error={errors.start_date?.message}>
                <TextInput id="start_date" type="date" {...register('start_date', { required: 'Required' })} />
              </FormField>
              <FormField id="end_date" label="End date" error={errors.end_date?.message}>
                <TextInput
                  id="end_date"
                  type="date"
                  min={startDate}
                  {...register('end_date', {
                    required: 'Required',
                    validate: (v, all) => v >= all.start_date || 'End date must be on or after start date',
                  })}
                />
              </FormField>
              <FormField id="guests" label="Number of guests" error={errors.guests?.message}>
                <TextInput id="guests" type="number" min={0} inputMode="numeric" {...register('guests')} />
              </FormField>
              <FormField id="event_type" label="Event type" hint="e.g. Wedding, Birthday, Staycation">
                <TextInput id="event_type" {...register('event_type')} />
              </FormField>
            </div>

            {amenities.length > 0 && (
              <div className="mt-4">
                <p className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">Extra amenities</p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {amenities.map((a) => (
                    <div
                      key={a.id}
                      className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 dark:border-gray-600 dark:bg-gray-700"
                    >
                      <Checkbox id={`amenity-${a.id}`} value={String(a.id)} {...register('amenity_ids')} />
                      <Label htmlFor={`amenity-${a.id}`} className="flex-1 cursor-pointer">
                        {a.name}
                        {!a.is_active && <span className="ml-1 text-xs text-gray-400">(inactive)</span>}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <FormField id="message" label="Guest message" className="mt-4">
              <Textarea id="message" rows={3} {...register('message')} />
            </FormField>
          </section>

          <section className="rounded-lg bg-gray-50 p-4 dark:bg-gray-700/50">
            <h4 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Admin</h4>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <FormField id="status" label="Status">
                <Select id="status" {...register('status', { required: 'Choose a status' })}>
                  {statuses.map((s) => (
                    <option key={s.key} value={s.key}>
                      {s.label}
                    </option>
                  ))}
                </Select>
              </FormField>
              <FormField id="admin_notes" label="Internal notes" className="sm:col-span-2">
                <Textarea id="admin_notes" rows={2} placeholder="Only visible to admins" {...register('admin_notes')} />
              </FormField>
            </div>
          </section>
        </Modal.Body>
        <Modal.Footer className="justify-end">
          <Button color="secondary" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button type="submit" color="primary" isProcessing={mutation.isPending} disabled={mutation.isPending}>
            {request ? 'Save changes' : 'Add booking'}
          </Button>
        </Modal.Footer>
      </form>
    </Modal>
  );
}
