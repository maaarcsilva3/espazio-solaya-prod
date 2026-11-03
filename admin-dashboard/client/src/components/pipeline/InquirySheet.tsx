import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Select, Textarea, TextInput } from 'flowbite-react';
import { api, errorMessage } from '../../lib/api';
import {
  formatDate,
  formatDuration,
  formatMoney,
  formatTimestamp,
  LEAD_SOURCE_LABELS,
  PIPELINE_LABELS,
  VISIT_STATUS_LABELS,
  VISIT_STATUSES,
} from '../../lib/format';
import type {
  AttachmentKind,
  Inquiry,
  InquiryAttachment,
  PipelineStage,
  SiteVisit,
  StageEvent,
  VisitStatus,
} from '../../lib/types';
import { useToast } from '../../context/ToastContext';
import Sheet from '../ui/Sheet';
import ConfirmDialog from '../ConfirmDialog';

type Tab = 'details' | 'pricing' | 'visits' | 'activity';

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 py-2 sm:flex-row sm:gap-4">
      <dt className="w-40 shrink-0 text-sm text-gray-500 dark:text-gray-400">{label}</dt>
      <dd className="text-sm text-gray-900 dark:text-white">{value || '—'}</dd>
    </div>
  );
}

function stageTimeline(events: StageEvent[]) {
  return events.map((event, index) => {
    const next = events[index + 1];
    const end = next ? Date.parse(next.entered_at) : Date.now();
    const seconds = Math.max(0, (end - Date.parse(event.entered_at)) / 1000);
    return { ...event, seconds };
  });
}

function formatBytes(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function AttachmentList({
  inquiryId,
  kind,
  title,
  hint,
  attachments,
  onChanged,
}: {
  inquiryId: number;
  kind: AttachmentKind;
  title: string;
  hint: string;
  attachments: InquiryAttachment[];
  onChanged: () => void;
}) {
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const items = attachments.filter((item) => item.kind === kind);

  const upload = useMutation({
    mutationFn: async (file: File) => {
      const body = new FormData();
      body.append('kind', kind);
      body.append('file', file);
      return api.upload<Inquiry>(`/inquiries/${inquiryId}/attachments`, body);
    },
    onSuccess: () => {
      onChanged();
      toast(kind === 'qualify' ? 'Quotation uploaded' : 'Proof of payment uploaded');
      if (inputRef.current) inputRef.current.value = '';
    },
    onError: (err) => toast(errorMessage(err), 'error'),
  });

  const remove = useMutation({
    mutationFn: (attachmentId: number) => api.delete(`/inquiries/${inquiryId}/attachments/${attachmentId}`),
    onSuccess: () => {
      onChanged();
      toast('Attachment removed');
    },
    onError: (err) => toast(errorMessage(err), 'error'),
  });

  return (
    <div className="space-y-3">
      <div>
        <h4 className="text-sm font-semibold text-gray-900 dark:text-white">{title}</h4>
        <p className="text-xs text-gray-500 dark:text-gray-400">{hint}</p>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-gray-500">No files yet.</p>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm dark:border-gray-700"
            >
              <div>
                <a
                  className="font-medium text-primary-700 hover:underline dark:text-primary-300"
                  href={api.downloadUrl(`/inquiries/${inquiryId}/attachments/${item.id}`)}
                  target="_blank"
                  rel="noreferrer"
                >
                  {item.original_name}
                </a>
                <p className="text-xs text-gray-500">
                  {formatBytes(item.size_bytes)} · {formatTimestamp(item.created_at)}
                  {item.created_by_name ? ` · ${item.created_by_name}` : ''}
                </p>
              </div>
              <Button size="xs" color="light" disabled={remove.isPending} onClick={() => remove.mutate(item.id)}>
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/png,image/jpeg,image/webp"
          className="block w-full max-w-xs text-sm text-gray-600 file:mr-3 file:rounded-lg file:border-0 file:bg-primary-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-primary-700 dark:text-gray-300 dark:file:bg-gray-800 dark:file:text-primary-300"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) upload.mutate(file);
          }}
        />
        {upload.isPending && <span className="text-xs text-gray-500">Uploading…</span>}
      </div>
    </div>
  );
}

export default function InquirySheet({
  inquiryId,
  stages,
  onClose,
  onEdit,
}: {
  inquiryId: number | null;
  stages: PipelineStage[];
  onClose: () => void;
  onEdit: (inquiry: Inquiry) => void;
}) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>('details');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [visit, setVisit] = useState({ scheduled_at: '', status: 'scheduled' as VisitStatus, notes: '', outcome: '' });
  const [editingVisit, setEditingVisit] = useState<SiteVisit | null>(null);

  useEffect(() => {
    setTab('details');
  }, [inquiryId]);

  const { data: inquiry } = useQuery({
    queryKey: ['inquiry', inquiryId],
    queryFn: () => api.get<Inquiry>(`/inquiries/${inquiryId}`),
    enabled: inquiryId != null,
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['inquiry', inquiryId] });
    queryClient.invalidateQueries({ queryKey: ['inquiries'] });
    queryClient.invalidateQueries({ queryKey: ['stats'] });
    queryClient.invalidateQueries({ queryKey: ['calendar'] });
    queryClient.invalidateQueries({ queryKey: ['pipeline-stages'] });
  };

  const move = useMutation({
    mutationFn: (stageId: number) =>
      api.patch(`/inquiries/${inquiry!.id}/stage`, { stage_id: stageId, updated_at: inquiry!.updated_at }),
    onSuccess: () => {
      refresh();
      toast('Stage updated');
    },
    onError: (err) => {
      refresh();
      toast(errorMessage(err), 'error');
    },
  });

  const markWon = useMutation({
    mutationFn: () => {
      const won = stages.find((stage) => stage.outcome === 'won');
      if (!won) throw new Error('This pipeline has no confirmed stage.');
      return api.patch(`/inquiries/${inquiry!.id}/stage`, { stage_id: won.id, updated_at: inquiry!.updated_at });
    },
    onSuccess: () => {
      refresh();
      toast('Moved to Won Leads');
    },
    onError: (err) => {
      refresh();
      toast(errorMessage(err), 'error');
    },
  });

  const remove = useMutation({
    mutationFn: () => api.delete(`/inquiries/${inquiry!.id}`),
    onSuccess: () => {
      refresh();
      toast('Inquiry deleted');
      setConfirmDelete(false);
      onClose();
    },
    onError: (err) => toast(errorMessage(err), 'error'),
  });

  const saveVisit = useMutation({
    mutationFn: () => {
      const body = {
        scheduled_at: visit.scheduled_at,
        status: visit.status,
        notes: visit.notes || null,
        outcome: visit.outcome || null,
      };
      return editingVisit
        ? api.put(`/inquiries/${inquiry!.id}/visits/${editingVisit.id}`, body)
        : api.post(`/inquiries/${inquiry!.id}/visits`, body);
    },
    onSuccess: () => {
      refresh();
      setEditingVisit(null);
      setVisit({ scheduled_at: '', status: 'scheduled', notes: '', outcome: '' });
      toast('Site visit saved');
    },
    onError: (err) => toast(errorMessage(err), 'error'),
  });

  const removeVisit = useMutation({
    mutationFn: (visitId: number) => api.delete(`/inquiries/${inquiry!.id}/visits/${visitId}`),
    onSuccess: () => {
      refresh();
      toast('Site visit removed');
    },
    onError: (err) => toast(errorMessage(err), 'error'),
  });

  const tabs: { id: Tab; label: string }[] = [
    { id: 'details', label: 'Details' },
    { id: 'pricing', label: 'Pricing' },
    ...(inquiry?.pipeline === 'event_venue' ? [{ id: 'visits' as const, label: 'Site visits' }] : []),
    { id: 'activity', label: 'Activity' },
  ];

  const isWon = inquiry?.stage_outcome === 'won';
  const attachments = inquiry?.attachments ?? [];

  return (
    <>
      <Sheet
        open={inquiryId != null}
        onClose={onClose}
        title={inquiry?.customer_name ?? 'Inquiry'}
        footer={
          inquiry && (
            <div className="flex flex-wrap justify-end gap-2">
              {!isWon && (
                <Button color="success" disabled={markWon.isPending} isProcessing={markWon.isPending} onClick={() => markWon.mutate()}>
                  Won
                </Button>
              )}
              <Button color="secondary" onClick={() => onEdit(inquiry)}>
                Edit
              </Button>
              <Button color="failure" onClick={() => setConfirmDelete(true)}>
                Delete
              </Button>
            </div>
          )
        }
      >
        {inquiry && (
          <div className="space-y-4 px-5 py-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {PIPELINE_LABELS[inquiry.pipeline]} · {formatDuration(inquiry.seconds_since_created)} since created
                {inquiry.converted_at ? ` · Confirmed ${formatTimestamp(inquiry.converted_at)}` : ''}
              </p>
              <Select
                sizing="sm"
                value={inquiry.stage_id}
                disabled={move.isPending}
                onChange={(event) => move.mutate(Number(event.target.value))}
              >
                {stages.map((stage) => (
                  <option key={stage.id} value={stage.id}>
                    {stage.label}
                  </option>
                ))}
              </Select>
            </div>

            <div className="flex gap-1 overflow-x-auto border-b border-gray-100 dark:border-gray-700">
              {tabs.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setTab(item.id)}
                  className={`shrink-0 border-b-2 px-3 py-2 text-sm font-medium ${
                    tab === item.id
                      ? 'border-primary-600 text-primary-700 dark:text-primary-300'
                      : 'border-transparent text-gray-500 hover:text-gray-800 dark:text-gray-400'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>

            {tab === 'details' && (
              <div className="space-y-6">
                <dl className="divide-y divide-gray-100 dark:divide-gray-700">
                  <Row label="Phone" value={inquiry.phone ?? ''} />
                  <Row label="Email" value={inquiry.email} />
                  <Row
                    label="Lead source"
                    value={
                      inquiry.lead_source_detail
                        ? `${LEAD_SOURCE_LABELS[inquiry.lead_source]} · ${inquiry.lead_source_detail}`
                        : LEAD_SOURCE_LABELS[inquiry.lead_source]
                    }
                  />
                  <Row label="Agents" value={inquiry.agents.map((agent) => agent.name).join(', ') || 'Unassigned'} />
                  <Row label="Package" value={inquiry.offering_name ?? ''} />
                  <Row label="Event type" value={inquiry.event_type ?? ''} />
                  <Row label="Guests" value={inquiry.guests != null ? String(inquiry.guests) : ''} />
                  <Row label="Starts" value={formatTimestamp(inquiry.start_at)} />
                  {inquiry.pipeline === 'room_booking' && <Row label="Ends" value={formatTimestamp(inquiry.end_at)} />}
                  {inquiry.pipeline === 'event_venue' && (
                    <>
                      <Row label="Cocktail time" value={inquiry.cocktail_time ?? ''} />
                      <Row label="Accommodation date" value={formatDate(inquiry.accommodation_date)} />
                    </>
                  )}
                  <Row label="In this stage" value={formatDuration(inquiry.seconds_in_stage)} />
                  <Row label="Notes" value={inquiry.special_requests ?? ''} />
                  <Row label="Internal notes" value={inquiry.internal_notes ?? ''} />
                  <Row
                    label="Created"
                    value={`${formatTimestamp(inquiry.created_at)}${inquiry.created_by_name ? ` · ${inquiry.created_by_name}` : ''}`}
                  />
                </dl>
                {inquiry.pipeline === 'event_venue' && (
                  <AttachmentList
                    inquiryId={inquiry.id}
                    kind="qualify"
                    title="Qualify files"
                    hint="Attach quotations and related client files."
                    attachments={attachments}
                    onChanged={refresh}
                  />
                )}
              </div>
            )}

            {tab === 'pricing' && (
              <div className="space-y-6">
                <dl className="divide-y divide-gray-100 dark:divide-gray-700">
                  <Row label="Actual rate" value={formatMoney(inquiry.package_price + inquiry.additional_charges + inquiry.other_fees)} />
                  <Row
                    label="Discount"
                    value={
                      inquiry.discount_percent != null
                        ? `${inquiry.discount_percent}% (${formatMoney(inquiry.discounts)})`
                        : formatMoney(inquiry.discounts)
                    }
                  />
                  <Row label="Gross after discount" value={formatMoney(inquiry.total_quoted)} />
                  <Row label="Less VAT (12%)" value={formatMoney(inquiry.vat_amount)} />
                  <Row label="Rate without VAT" value={formatMoney(inquiry.rate_without_vat)} />
                  <Row label="Final agreed price" value={formatMoney(inquiry.final_agreed_price)} />
                  <Row
                    label="Deposit"
                    value={
                      inquiry.deposit_amount != null
                        ? `${formatMoney(inquiry.deposit_amount)}${inquiry.deposit_note ? ` · ${inquiry.deposit_note}` : ''}`
                        : ''
                    }
                  />
                </dl>
                <AttachmentList
                  inquiryId={inquiry.id}
                  kind="payment"
                  title="Proof of payment"
                  hint="Upload deposit slips, bank transfer receipts, or POP screenshots."
                  attachments={attachments}
                  onChanged={refresh}
                />
                <div>
                  <h4 className="mb-2 text-sm font-semibold text-gray-900 dark:text-white">Price history</h4>
                  {(inquiry.price_events ?? []).length === 0 ? (
                    <p className="text-sm text-gray-500">No price changes yet.</p>
                  ) : (
                    <ul className="space-y-2 text-sm">
                      {inquiry.price_events!.map((event) => (
                        <li key={event.id} className="text-gray-600 dark:text-gray-300">
                          {formatTimestamp(event.created_at)} · quoted {formatMoney(event.total_quoted)}
                          {event.final_agreed_price != null ? ` · agreed ${formatMoney(event.final_agreed_price)}` : ''}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}

            {tab === 'visits' && inquiry.pipeline === 'event_venue' && (
              <div className="space-y-4">
                <ul className="space-y-3">
                  {(inquiry.visits ?? []).map((item) => (
                    <li key={item.id} className="rounded-lg border border-gray-200 p-3 dark:border-gray-700">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-medium text-gray-900 dark:text-white">{formatTimestamp(item.scheduled_at)}</p>
                          <p className="text-sm text-gray-500">{VISIT_STATUS_LABELS[item.status]}</p>
                          {item.notes && <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">{item.notes}</p>}
                          {item.outcome && <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">Outcome: {item.outcome}</p>}
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="xs"
                            color="secondary"
                            onClick={() => {
                              setEditingVisit(item);
                              setVisit({
                                scheduled_at: item.scheduled_at.slice(0, 16),
                                status: item.status,
                                notes: item.notes ?? '',
                                outcome: item.outcome ?? '',
                              });
                            }}
                          >
                            Edit
                          </Button>
                          <Button size="xs" color="light" onClick={() => removeVisit.mutate(item.id)}>
                            Remove
                          </Button>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
                <div className="space-y-3 rounded-lg bg-gray-50 p-3 dark:bg-gray-900/40">
                  <h4 className="text-sm font-semibold text-gray-900 dark:text-white">
                    {editingVisit ? 'Update site visit' : 'Schedule a site visit'}
                  </h4>
                  <TextInput
                    type="datetime-local"
                    value={visit.scheduled_at}
                    onChange={(event) => setVisit((current) => ({ ...current, scheduled_at: event.target.value }))}
                  />
                  <Select
                    value={visit.status}
                    onChange={(event) => setVisit((current) => ({ ...current, status: event.target.value as VisitStatus }))}
                  >
                    {VISIT_STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {VISIT_STATUS_LABELS[status]}
                      </option>
                    ))}
                  </Select>
                  <Textarea
                    rows={2}
                    placeholder="Notes"
                    value={visit.notes}
                    onChange={(event) => setVisit((current) => ({ ...current, notes: event.target.value }))}
                  />
                  <Textarea
                    rows={2}
                    placeholder="Outcome"
                    value={visit.outcome}
                    onChange={(event) => setVisit((current) => ({ ...current, outcome: event.target.value }))}
                  />
                  <div className="flex gap-2">
                    <Button
                      color="primary"
                      size="sm"
                      disabled={!visit.scheduled_at || saveVisit.isPending}
                      onClick={() => saveVisit.mutate()}
                    >
                      {editingVisit ? 'Save visit' : 'Add visit'}
                    </Button>
                    {editingVisit && (
                      <Button
                        color="secondary"
                        size="sm"
                        onClick={() => {
                          setEditingVisit(null);
                          setVisit({ scheduled_at: '', status: 'scheduled', notes: '', outcome: '' });
                        }}
                      >
                        Cancel
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {tab === 'activity' && (
              <div className="space-y-5">
                <div>
                  <h4 className="mb-2 text-sm font-semibold text-gray-900 dark:text-white">Time in each stage</h4>
                  <ul className="space-y-2 text-sm">
                    {stageTimeline(inquiry.stage_events ?? []).map((event) => (
                      <li key={event.id} className="flex justify-between gap-3 text-gray-600 dark:text-gray-300">
                        <span>
                          {event.stage_label}
                          <span className="text-gray-400"> · {formatTimestamp(event.entered_at)}</span>
                        </span>
                        <span>{formatDuration(event.seconds)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h4 className="mb-2 text-sm font-semibold text-gray-900 dark:text-white">History</h4>
                  <ul className="space-y-3">
                    {(inquiry.activities ?? []).map((activity) => (
                      <li key={activity.id}>
                        <p className="text-sm text-gray-900 dark:text-white">{activity.summary}</p>
                        <p className="text-xs text-gray-500">
                          {formatTimestamp(activity.created_at)}
                          {activity.admin_name ? ` · ${activity.admin_name}` : ''}
                        </p>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </div>
        )}
      </Sheet>
      <ConfirmDialog
        open={confirmDelete}
        title="Delete inquiry?"
        message="This permanently removes the inquiry and its history."
        loading={remove.isPending}
        onConfirm={() => remove.mutate()}
        onClose={() => setConfirmDelete(false)}
      />
    </>
  );
}
