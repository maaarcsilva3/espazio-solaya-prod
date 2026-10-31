import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Modal, Select, Textarea, TextInput, ToggleSwitch } from 'flowbite-react';
import { api, ApiError, errorMessage } from '../lib/api';
import { OFFERING_TYPE_LABELS, OFFERING_TYPES } from '../lib/format';
import type { Offering, OfferingType } from '../lib/types';
import { useToast } from '../context/ToastContext';
import FormField from './FormField';

interface FormValues {
  name: string;
  type: OfferingType;
  description: string;
  capacity: string;
  quantity: string;
  price: string;
  price_unit: string;
  is_active: boolean;
}

const EMPTY: FormValues = {
  name: '',
  type: 'room_only',
  description: '',
  capacity: '',
  quantity: '1',
  price: '',
  price_unit: '',
  is_active: true,
};

function toForm(o: Offering): FormValues {
  return {
    name: o.name,
    type: o.type,
    description: o.description ?? '',
    capacity: o.capacity?.toString() ?? '',
    quantity: o.quantity?.toString() ?? '1',
    price: o.price?.toString() ?? '',
    price_unit: o.price_unit ?? '',
    is_active: o.is_active,
  };
}

const UNIT_SUGGESTIONS = ['per night', 'per event', 'per day', 'per hour', 'per head'];

export default function OfferingFormModal({
  open,
  offering,
  onClose,
}: {
  open: boolean;
  offering: Offering | null;
  onClose: () => void;
}) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    setError,
    formState: { errors },
  } = useForm<FormValues>({ defaultValues: EMPTY });

  useEffect(() => {
    if (open) reset(offering ? toForm(offering) : EMPTY);
  }, [open, offering, reset]);

  const mutation = useMutation({
    mutationFn: (values: FormValues) => {
      const body = {
        ...values,
        capacity: values.capacity === '' ? null : Number(values.capacity),
        quantity: values.quantity === '' ? 1 : Number(values.quantity),
        price: values.price === '' ? null : Number(values.price),
      };
      return offering
        ? api.put<Offering>(`/offerings/${offering.id}`, body)
        : api.post<Offering>('/offerings', body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['offerings'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
      toast(offering ? 'Offering updated' : 'Offering added');
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

  const isActive = watch('is_active');

  return (
    <Modal show={open} onClose={onClose} size="xl" dismissible>
      <Modal.Header>{offering ? 'Edit offering' : 'Add offering'}</Modal.Header>
      <form onSubmit={handleSubmit((v) => mutation.mutate(v))} className="flex min-h-0 flex-1 flex-col">
        <Modal.Body className="space-y-4">
          {mutation.isError && <Alert color="failure">{errorMessage(mutation.error)}</Alert>}

          <FormField id="name" label="Name" error={errors.name?.message}>
            <TextInput id="name" placeholder="e.g. Deluxe Room" {...register('name', { required: 'Name is required' })} />
          </FormField>

          <FormField id="type" label="Type">
            <Select id="type" {...register('type')}>
              {OFFERING_TYPES.map((t) => (
                <option key={t} value={t}>
                  {OFFERING_TYPE_LABELS[t]}
                </option>
              ))}
            </Select>
          </FormField>

          <FormField id="description" label="Description (optional)" error={errors.description?.message}>
            <Textarea id="description" rows={3} {...register('description')} />
          </FormField>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <FormField id="capacity" label="Capacity" hint="Max guests" error={errors.capacity?.message}>
              <TextInput id="capacity" type="number" min={0} inputMode="numeric" {...register('capacity')} />
            </FormField>
            <FormField id="quantity" label="Quantity" hint="How many can be booked at once" error={errors.quantity?.message}>
              <TextInput id="quantity" type="number" min={1} inputMode="numeric" {...register('quantity', { required: 'Quantity is required', min: { value: 1, message: 'At least 1' } })} />
            </FormField>
            <FormField id="price" label="Price" error={errors.price?.message}>
              <TextInput id="price" type="number" min={0} step="0.01" inputMode="decimal" {...register('price')} />
            </FormField>
            <FormField id="price_unit" label="Price unit" error={errors.price_unit?.message}>
              <TextInput id="price_unit" list="unit-suggestions" placeholder="per night" {...register('price_unit')} />
              <datalist id="unit-suggestions">
                {UNIT_SUGGESTIONS.map((u) => (
                  <option key={u} value={u} />
                ))}
              </datalist>
            </FormField>
          </div>

          <div className="rounded-lg bg-gray-50 p-3 dark:bg-gray-700/50">
            <ToggleSwitch
              checked={isActive}
              color="primary"
              label={isActive ? 'Active - shown on the website form' : 'Inactive - hidden from the website form'}
              onChange={(v) => setValue('is_active', v)}
            />
          </div>
        </Modal.Body>
        <Modal.Footer className="justify-end">
          <Button color="secondary" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button type="submit" color="primary" isProcessing={mutation.isPending} disabled={mutation.isPending}>
            {offering ? 'Save changes' : 'Add offering'}
          </Button>
        </Modal.Footer>
      </form>
    </Modal>
  );
}
