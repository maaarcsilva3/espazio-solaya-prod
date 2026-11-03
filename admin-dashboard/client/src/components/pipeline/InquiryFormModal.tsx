import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Checkbox, Modal, Select, Textarea, TextInput } from 'flowbite-react';
import { api, ApiError, errorMessage } from '../../lib/api';
import {
  EVENT_TYPE_LABELS,
  EVENT_TYPES,
  LEAD_SOURCE_LABELS,
  LEAD_SOURCES,
  formatMoney,
  toDatetimeLocal,
} from '../../lib/format';
import type { Agent, Inquiry, InquiryInput, LeadSource, Offering, Pipeline, PipelineStage } from '../../lib/types';
import { useToast } from '../../context/ToastContext';
import FormField from '../FormField';

interface FormValues {
  stage_id: string;
  customer_name: string;
  phone: string;
  email: string;
  lead_source: LeadSource;
  lead_source_detail: string;
  offering_id: string;
  event_type: string;
  guests: string;
  start_date: string;
  start_time: string;
  end_date: string;
  end_time: string;
  cocktail_time: string;
  accommodation_date: string;
  special_requests: string;
  internal_notes: string;
  package_price: string;
  additional_charges: string;
  discount_percent: string;
  other_fees: string;
  final_agreed_price: string;
  deposit_amount: string;
  deposit_note: string;
  agent_ids: number[];
}

const ROOM_DEFAULT_CHECK_IN = '14:00';

function splitDateTime(value: string | null | undefined): { date: string; time: string } {
  if (!value) return { date: '', time: '' };
  const local = toDatetimeLocal(value);
  const [date = '', time = ''] = local.split('T');
  return { date, time };
}

function joinDateTime(date: string, time: string): string | null {
  if (!date) return null;
  if (!time) return `${date}T00:00`;
  return `${date}T${time}`;
}

function blank(stageId = ''): FormValues {
  return {
    stage_id: stageId,
    customer_name: '',
    phone: '',
    email: '',
    lead_source: 'website',
    lead_source_detail: '',
    offering_id: '',
    event_type: '',
    guests: '',
    start_date: '',
    start_time: '',
    end_date: '',
    end_time: '',
    cocktail_time: '',
    accommodation_date: '',
    special_requests: '',
    internal_notes: '',
    package_price: '',
    additional_charges: '',
    discount_percent: '',
    other_fees: '',
    final_agreed_price: '',
    deposit_amount: '',
    deposit_note: '',
    agent_ids: [],
  };
}

function fromInquiry(inquiry: Inquiry): FormValues {
  const start = splitDateTime(inquiry.start_at);
  const end = splitDateTime(inquiry.end_at);
  return {
    ...blank(String(inquiry.stage_id)),
    customer_name: inquiry.customer_name,
    phone: inquiry.phone ?? '',
    email: inquiry.email,
    lead_source: inquiry.lead_source,
    lead_source_detail: inquiry.lead_source_detail ?? '',
    offering_id: inquiry.offering_id ? String(inquiry.offering_id) : '',
    event_type: inquiry.event_type ?? '',
    guests: inquiry.guests?.toString() ?? '',
    start_date: start.date,
    start_time: start.time,
    end_date: end.date,
    end_time: end.time,
    cocktail_time: inquiry.cocktail_time?.slice(0, 5) ?? '',
    accommodation_date: inquiry.accommodation_date ?? '',
    special_requests: inquiry.special_requests ?? '',
    internal_notes: inquiry.internal_notes ?? '',
    package_price: String(inquiry.package_price ?? 0),
    additional_charges: String(inquiry.additional_charges ?? 0),
    discount_percent: inquiry.discount_percent != null ? String(inquiry.discount_percent) : '',
    other_fees: String(inquiry.other_fees ?? 0),
    final_agreed_price: inquiry.final_agreed_price?.toString() ?? '',
    deposit_amount: inquiry.deposit_amount?.toString() ?? '',
    deposit_note: inquiry.deposit_note ?? '',
    agent_ids: inquiry.agents.map((agent) => agent.id),
  };
}

function money(value: string): number | null {
  if (value.trim() === '') return null;
  return Number(value);
}

function vatBreakdown(packagePrice: number, charges: number, fees: number, discountPercent: number) {
  const actual = packagePrice + charges + fees;
  const discountAmount = Math.round(actual * discountPercent) / 100;
  const gross = actual - discountAmount;
  const vat = Math.round(gross * (12 / 112) * 100) / 100;
  const net = Math.round((gross - vat) * 100) / 100;
  return { actual, discountAmount, gross, vat, net };
}

export default function InquiryFormModal({
  open,
  pipeline,
  inquiry,
  onClose,
}: {
  open: boolean;
  pipeline: Pipeline;
  inquiry: Inquiry | null;
  onClose: () => void;
}) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const event = pipeline === 'event_venue';
  const { data: stages = [] } = useQuery({
    queryKey: ['pipeline-stages', pipeline],
    queryFn: () => api.get<PipelineStage[]>('/pipeline-stages', { pipeline }),
    enabled: open,
  });
  const { data: offerings = [] } = useQuery({
    queryKey: ['offerings'],
    queryFn: () => api.get<Offering[]>('/offerings'),
    enabled: open,
  });
  const { data: agents = [] } = useQuery({
    queryKey: ['agents'],
    queryFn: () => api.get<Agent[]>('/agents'),
    enabled: open,
  });
  const [agentName, setAgentName] = useState('');
  const [agentEmail, setAgentEmail] = useState('');
  const packages = offerings.filter((offering) => {
    if (inquiry?.offering_id === offering.id) return true;
    if (!offering.is_active) return false;
    return event ? offering.type !== 'room_only' && offering.type !== 'amenity' : offering.type === 'room_only';
  });

  const { register, handleSubmit, reset, watch, setValue, getValues, setError, formState: { errors } } = useForm<FormValues>({
    defaultValues: blank(),
  });
  const addAgent = useMutation({
    mutationFn: () => api.post<Agent>('/agents', { name: agentName, email: agentEmail || null, phone: null }),
    onSuccess: (agent) => {
      queryClient.invalidateQueries({ queryKey: ['agents'] });
      const current = getValues('agent_ids');
      if (!current.includes(agent.id)) setValue('agent_ids', [...current, agent.id]);
      setAgentName('');
      setAgentEmail('');
      toast('Agent added');
    },
  });

  useEffect(() => {
    if (!open) return;
    reset(inquiry ? fromInquiry(inquiry) : blank());
  }, [open, inquiry, reset]);

  useEffect(() => {
    if (!open || inquiry || getValues('stage_id') || !stages.length) return;
    const first = stages.find((stage) => stage.outcome === 'open') ?? stages[0];
    setValue('stage_id', String(first.id));
  }, [open, inquiry, stages, getValues, setValue]);

  const mutation = useMutation({
    mutationFn: (values: FormValues) => {
      const start_at = joinDateTime(values.start_date, values.start_time);
      const end_at = event ? null : joinDateTime(values.end_date, values.end_time);
      const discountPercent = money(values.discount_percent);
      const body: InquiryInput = {
        pipeline,
        stage_id: Number(values.stage_id),
        customer_name: values.customer_name,
        phone: values.phone || null,
        email: values.email,
        lead_source: values.lead_source,
        lead_source_detail: values.lead_source_detail || null,
        offering_id: values.offering_id ? Number(values.offering_id) : null,
        event_type: event ? values.event_type || null : null,
        guests: values.guests === '' ? null : Number(values.guests),
        start_at,
        end_at,
        cocktail_time: event ? values.cocktail_time || null : null,
        accommodation_date: event ? values.accommodation_date || null : null,
        special_requests: values.special_requests || null,
        additional_services: null,
        custom_arrangements: null,
        internal_notes: values.internal_notes || null,
        package_price: money(values.package_price) ?? 0,
        additional_charges: money(values.additional_charges) ?? 0,
        discounts: 0,
        discount_percent: discountPercent,
        other_fees: money(values.other_fees) ?? 0,
        final_agreed_price: money(values.final_agreed_price),
        deposit_amount: money(values.deposit_amount),
        deposit_note: values.deposit_note || null,
        agent_ids: values.agent_ids,
        updated_at: inquiry?.updated_at,
      };
      return inquiry ? api.put<Inquiry>(`/inquiries/${inquiry.id}`, body) : api.post<Inquiry>('/inquiries', body);
    },
    onSuccess: (saved) => {
      queryClient.invalidateQueries({ queryKey: ['inquiries'] });
      queryClient.invalidateQueries({ queryKey: ['inquiry', saved.id] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
      queryClient.invalidateQueries({ queryKey: ['calendar'] });
      toast(inquiry ? 'Inquiry updated' : 'Inquiry added');
      onClose();
    },
    onError: (err) => {
      if (err instanceof ApiError && err.fieldErrors) {
        for (const [field, messages] of Object.entries(err.fieldErrors)) {
          if (field in blank()) setError(field as keyof FormValues, { message: messages[0] });
        }
      }
    },
  });

  const agentIds = watch('agent_ids');
  const packagePrice = money(watch('package_price')) ?? 0;
  const charges = money(watch('additional_charges')) ?? 0;
  const fees = money(watch('other_fees')) ?? 0;
  const discountPercent = money(watch('discount_percent')) ?? 0;
  const breakdown = vatBreakdown(packagePrice, charges, fees, discountPercent);

  const pickPackage = (id: string) => {
    const next = packages.find((offering) => String(offering.id) === id);
    setValue('offering_id', id);
    if (next) {
      setValue('package_price', next.price != null ? String(next.price) : '');
    }
  };

  const onStartDateChange = (date: string) => {
    setValue('start_date', date);
    if (!event && date && !getValues('start_time')) {
      setValue('start_time', ROOM_DEFAULT_CHECK_IN);
    }
  };

  return (
    <Modal show={open} onClose={onClose} size="3xl" dismissible>
      <Modal.Header>{inquiry ? 'Edit inquiry' : 'New inquiry'}</Modal.Header>
      <form onSubmit={handleSubmit((values) => mutation.mutate(values))} className="flex min-h-0 flex-1 flex-col">
        <Modal.Body className="space-y-6">
          {mutation.isError && <Alert color="failure">{errorMessage(mutation.error)}</Alert>}

          <section className="space-y-4">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Client</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField id="customer_name" label="Customer name" error={errors.customer_name?.message}>
                <TextInput id="customer_name" {...register('customer_name', { required: 'Name is required' })} />
              </FormField>
              <FormField id="phone" label="Contact number" error={errors.phone?.message}>
                <TextInput id="phone" {...register('phone')} />
              </FormField>
              <FormField id="email" label="Email" error={errors.email?.message}>
                <TextInput id="email" type="email" {...register('email', { required: 'Email is required' })} />
              </FormField>
              <FormField id="lead_source" label="Lead source" error={errors.lead_source?.message}>
                <Select id="lead_source" {...register('lead_source')}>
                  {LEAD_SOURCES.map((source) => (
                    <option key={source} value={source}>
                      {LEAD_SOURCE_LABELS[source]}
                    </option>
                  ))}
                </Select>
              </FormField>
            </div>
            <FormField id="lead_source_detail" label="Lead source details" hint="Optional. Use this for a referrer or campaign.">
              <TextInput id="lead_source_detail" {...register('lead_source_detail')} />
            </FormField>
            <FormField id="agents" label="Assigned agents">
              {agents.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">No agents yet. Add one below, then select them.</p>
              ) : (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {agents.map((agent) => (
                    <label key={agent.id} className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
                      <Checkbox
                        checked={agentIds.includes(agent.id)}
                        onChange={() => {
                          const current = getValues('agent_ids');
                          setValue(
                            'agent_ids',
                            current.includes(agent.id) ? current.filter((id) => id !== agent.id) : [...current, agent.id],
                          );
                        }}
                      />
                      {agent.name}
                    </label>
                  ))}
                </div>
              )}
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <TextInput
                  placeholder="New agent name"
                  value={agentName}
                  onChange={(e) => setAgentName(e.target.value)}
                />
                <TextInput
                  type="email"
                  placeholder="Email, optional"
                  value={agentEmail}
                  onChange={(e) => setAgentEmail(e.target.value)}
                />
                <Button
                  color="secondary"
                  type="button"
                  className="shrink-0"
                  disabled={!agentName.trim() || addAgent.isPending}
                  isProcessing={addAgent.isPending}
                  onClick={() => addAgent.mutate()}
                >
                  Add agent
                </Button>
              </div>
              {addAgent.isError && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{errorMessage(addAgent.error)}</p>}
            </FormField>
            <FormField id="internal_notes" label="Internal notes">
              <Textarea id="internal_notes" rows={3} {...register('internal_notes')} />
            </FormField>
          </section>

          <section className="space-y-4">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Package and booking</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField id="stage_id" label="Pipeline stage" error={errors.stage_id?.message}>
                <Select id="stage_id" {...register('stage_id', { required: 'Choose a stage' })}>
                  {stages.map((stage) => (
                    <option key={stage.id} value={stage.id}>
                      {stage.label}
                    </option>
                  ))}
                </Select>
              </FormField>
              <FormField id="offering_id" label="Package">
                <Select id="offering_id" {...register('offering_id')} onChange={(e) => pickPackage(e.target.value)}>
                  <option value="">No package yet</option>
                  {packages.map((offering) => (
                    <option key={offering.id} value={offering.id}>
                      {offering.name}
                      {offering.quantity > 1 ? ` (${offering.quantity} available)` : ''}
                      {offering.price != null ? ` — ${formatMoney(offering.price)}` : ''}
                    </option>
                  ))}
                </Select>
              </FormField>
              {event && (
                <FormField id="event_type" label="Event type" error={errors.event_type?.message}>
                  <Select id="event_type" {...register('event_type')}>
                    <option value="">Select event type</option>
                    {EVENT_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {EVENT_TYPE_LABELS[type]}
                      </option>
                    ))}
                  </Select>
                </FormField>
              )}
              <FormField id="guests" label="Guests" error={errors.guests?.message}>
                <TextInput id="guests" type="number" min={0} {...register('guests')} />
              </FormField>
              <FormField id="start_date" label={event ? 'Event date' : 'Check-in date'}>
                <TextInput
                  id="start_date"
                  type="date"
                  value={watch('start_date')}
                  onChange={(e) => onStartDateChange(e.target.value)}
                />
              </FormField>
              <FormField
                id="start_time"
                label={event ? 'Event start time' : 'Check-in time'}
                hint={event ? 'Times in 5-minute steps. End of day is held when confirmed without a checkout.' : 'Defaults to 02:00 PM when the date is selected.'}
                error={errors.start_time?.message}
              >
                <TextInput id="start_time" type="time" step={300} {...register('start_time')} />
              </FormField>
              {!event && (
                <>
                  <FormField id="end_date" label="Check-out date">
                    <TextInput id="end_date" type="date" {...register('end_date')} />
                  </FormField>
                  <FormField id="end_time" label="Check-out time" error={errors.end_time?.message}>
                    <TextInput
                      id="end_time"
                      type="time"
                      step={300}
                      {...register('end_time', {
                        validate: (_value, all) => {
                          const start = joinDateTime(all.start_date, all.start_time);
                          const end = joinDateTime(all.end_date, all.end_time);
                          if (!start || !end) return true;
                          return end > start || 'Check-out must be after check-in';
                        },
                      })}
                    />
                  </FormField>
                </>
              )}
              {event && (
                <>
                  <FormField id="cocktail_time" label="Cocktail time" hint="Optional. 5-minute steps.">
                    <TextInput id="cocktail_time" type="time" step={300} {...register('cocktail_time')} />
                  </FormField>
                  <FormField id="accommodation_date" label="Accommodation date">
                    <TextInput id="accommodation_date" type="date" {...register('accommodation_date')} />
                  </FormField>
                </>
              )}
            </div>
          </section>

          <section className="space-y-4">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Notes</h3>
            <FormField id="special_requests" label="Notes">
              <Textarea id="special_requests" rows={3} {...register('special_requests')} />
            </FormField>
          </section>

          <section className="space-y-4">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Pricing</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField id="package_price" label="Package price (actual rate)">
                <TextInput id="package_price" type="number" min={0} step="0.01" {...register('package_price')} />
              </FormField>
              <FormField id="additional_charges" label="Additional charges">
                <TextInput id="additional_charges" type="number" min={0} step="0.01" {...register('additional_charges')} />
              </FormField>
              <FormField id="discount_percent" label="Discount %" hint="Applied to the gross actual rate.">
                <TextInput
                  id="discount_percent"
                  type="number"
                  min={0}
                  max={100}
                  step="0.01"
                  {...register('discount_percent')}
                />
              </FormField>
              <FormField id="other_fees" label="Other fees">
                <TextInput id="other_fees" type="number" min={0} step="0.01" {...register('other_fees')} />
              </FormField>
              <FormField id="final_agreed_price" label="Final agreed price">
                <TextInput id="final_agreed_price" type="number" min={0} step="0.01" {...register('final_agreed_price')} />
              </FormField>
              <FormField id="deposit_amount" label="Deposit amount" hint="Recorded on the inquiry. No payment is collected here.">
                <TextInput id="deposit_amount" type="number" min={0} step="0.01" {...register('deposit_amount')} />
              </FormField>
            </div>
            <FormField id="deposit_note" label="Deposit note">
              <TextInput id="deposit_note" {...register('deposit_note')} />
            </FormField>
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200">
              <p>
                Actual rate: <span className="font-semibold">{formatMoney(breakdown.actual)}</span>
              </p>
              <p>
                Discount ({discountPercent}%): <span className="font-semibold">-{formatMoney(breakdown.discountAmount)}</span>
              </p>
              <p>
                Gross after discount: <span className="font-semibold">{formatMoney(breakdown.gross)}</span>
              </p>
              <p>
                Less VAT (12%): <span className="font-semibold">{formatMoney(breakdown.vat)}</span>
              </p>
              <p>
                Rate without VAT:{' '}
                <span className="font-semibold text-gray-900 dark:text-white">{formatMoney(breakdown.net)}</span>
              </p>
            </div>
          </section>
        </Modal.Body>
        <Modal.Footer className="justify-end">
          <Button color="secondary" type="button" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button type="submit" color="primary" isProcessing={mutation.isPending} disabled={mutation.isPending}>
            {inquiry ? 'Save changes' : 'Add inquiry'}
          </Button>
        </Modal.Footer>
      </form>
    </Modal>
  );
}
