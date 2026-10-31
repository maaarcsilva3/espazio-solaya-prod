import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Checkbox, Modal, Select, Textarea, TextInput } from 'flowbite-react';
import { api, ApiError, errorMessage } from '../../lib/api';
import { LEAD_SOURCE_LABELS, LEAD_SOURCES, toDatetimeLocal } from '../../lib/format';
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
  start_at: string;
  end_at: string;
  special_requests: string;
  additional_services: string;
  custom_arrangements: string;
  internal_notes: string;
  package_price: string;
  additional_charges: string;
  discounts: string;
  other_fees: string;
  final_agreed_price: string;
  deposit_amount: string;
  deposit_note: string;
  agent_ids: number[];
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
    start_at: '',
    end_at: '',
    special_requests: '',
    additional_services: '',
    custom_arrangements: '',
    internal_notes: '',
    package_price: '',
    additional_charges: '',
    discounts: '',
    other_fees: '',
    final_agreed_price: '',
    deposit_amount: '',
    deposit_note: '',
    agent_ids: [],
  };
}

function fromInquiry(inquiry: Inquiry): FormValues {
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
    start_at: toDatetimeLocal(inquiry.start_at),
    end_at: toDatetimeLocal(inquiry.end_at),
    special_requests: inquiry.special_requests ?? '',
    additional_services: inquiry.additional_services ?? '',
    custom_arrangements: inquiry.custom_arrangements ?? '',
    internal_notes: inquiry.internal_notes ?? '',
    package_price: String(inquiry.package_price ?? 0),
    additional_charges: String(inquiry.additional_charges ?? 0),
    discounts: String(inquiry.discounts ?? 0),
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
        start_at: values.start_at || null,
        end_at: values.end_at || null,
        special_requests: values.special_requests || null,
        additional_services: values.additional_services || null,
        custom_arrangements: values.custom_arrangements || null,
        internal_notes: values.internal_notes || null,
        package_price: money(values.package_price) ?? 0,
        additional_charges: money(values.additional_charges) ?? 0,
        discounts: money(values.discounts) ?? 0,
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
  const quoted =
    (money(watch('package_price')) ?? 0) +
    (money(watch('additional_charges')) ?? 0) +
    (money(watch('other_fees')) ?? 0) -
    (money(watch('discounts')) ?? 0);

  const pickPackage = (id: string) => {
    const next = packages.find((offering) => String(offering.id) === id);
    const previous = packages.find((offering) => String(offering.id) === getValues('offering_id'));
    setValue('offering_id', id);
    const price = getValues('package_price');
    if (next && (price === '' || price === String(previous?.price ?? ''))) {
      setValue('package_price', next.price != null ? String(next.price) : '');
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
                  onChange={(event) => setAgentName(event.target.value)}
                />
                <TextInput
                  type="email"
                  placeholder="Email, optional"
                  value={agentEmail}
                  onChange={(event) => setAgentEmail(event.target.value)}
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
                <Select id="offering_id" {...register('offering_id')} onChange={(event) => pickPackage(event.target.value)}>
                  <option value="">No package yet</option>
                  {packages.map((offering) => (
                    <option key={offering.id} value={offering.id}>
                      {offering.name}
                      {offering.quantity > 1 ? ` (${offering.quantity} available)` : ''}
                    </option>
                  ))}
                </Select>
              </FormField>
              {event && (
                <FormField id="event_type" label="Event type">
                  <TextInput id="event_type" placeholder="Wedding, birthday..." {...register('event_type')} />
                </FormField>
              )}
              <FormField id="guests" label="Guests" error={errors.guests?.message}>
                <TextInput id="guests" type="number" min={0} {...register('guests')} />
              </FormField>
              <FormField
                id="start_at"
                label={event ? 'Event start' : 'Check-in'}
                hint={event ? 'Leave the end empty to hold the rest of that day once confirmed.' : 'Check-out can match the next arrival.'}
              >
                <TextInput id="start_at" type="datetime-local" {...register('start_at')} />
              </FormField>
              <FormField id="end_at" label={event ? 'Event end' : 'Check-out'} error={errors.end_at?.message}>
                <TextInput
                  id="end_at"
                  type="datetime-local"
                  {...register('end_at', {
                    validate: (value, all) => !value || !all.start_at || value > all.start_at || 'End must be after the start',
                  })}
                />
              </FormField>
            </div>
          </section>

          <section className="space-y-4">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Special requests</h3>
            <FormField id="special_requests" label="Special requests">
              <Textarea id="special_requests" rows={2} {...register('special_requests')} />
            </FormField>
            <FormField id="additional_services" label="Additional services">
              <Textarea id="additional_services" rows={2} {...register('additional_services')} />
            </FormField>
            <FormField id="custom_arrangements" label="Custom arrangements">
              <Textarea id="custom_arrangements" rows={2} {...register('custom_arrangements')} />
            </FormField>
          </section>

          <section className="space-y-4">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Pricing</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField id="package_price" label="Package price">
                <TextInput id="package_price" type="number" min={0} step="0.01" {...register('package_price')} />
              </FormField>
              <FormField id="additional_charges" label="Additional charges">
                <TextInput id="additional_charges" type="number" min={0} step="0.01" {...register('additional_charges')} />
              </FormField>
              <FormField id="discounts" label="Discounts">
                <TextInput id="discounts" type="number" min={0} step="0.01" {...register('discounts')} />
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
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Quoted total:{' '}
              <span className="font-semibold text-gray-900 dark:text-white">
                {Number.isFinite(quoted) ? quoted.toLocaleString() : '—'}
              </span>
            </p>
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
