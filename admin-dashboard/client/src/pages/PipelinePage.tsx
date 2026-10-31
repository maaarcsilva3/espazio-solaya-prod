import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Select, TextInput } from 'flowbite-react';
import { HiPlus, HiSearch, HiViewBoards } from 'react-icons/hi';
import { api, errorMessage } from '../lib/api';
import { LEAD_SOURCE_LABELS, LEAD_SOURCES } from '../lib/format';
import type { Agent, Inquiry, Offering, Pipeline, PipelineStage } from '../lib/types';
import { useToast } from '../context/ToastContext';
import PageHeader from '../components/PageHeader';
import EmptyState from '../components/ui/EmptyState';
import { SkeletonRows } from '../components/ui/Skeleton';
import PipelineBoard from '../components/pipeline/PipelineBoard';
import { InquiryCardView } from '../components/pipeline/InquiryCard';
import InquiryFormModal from '../components/pipeline/InquiryFormModal';
import InquirySheet from '../components/pipeline/InquirySheet';
import StageSettings from '../components/pipeline/StageSettings';

const SORTS = [
  { value: 'created_at', label: 'Newest' },
  { value: 'start_at', label: 'Event or stay date' },
  { value: 'days_in_stage', label: 'Longest in stage' },
  { value: 'customer_name', label: 'Name' },
];

function useIsMobile() {
  const [mobile, setMobile] = useState(() => window.matchMedia('(max-width: 767px)').matches);
  useEffect(() => {
    const query = window.matchMedia('(max-width: 767px)');
    const onChange = () => setMobile(query.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);
  return mobile;
}

export default function PipelinePage({ pipeline }: { pipeline: Pipeline }) {
  const toast = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const event = pipeline === 'event_venue';
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [stageId, setStageId] = useState('');
  const [agentId, setAgentId] = useState('');
  const [offeringId, setOfferingId] = useState('');
  const [leadSource, setLeadSource] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [sort, setSort] = useState('created_at');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Inquiry | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const selectedId = params.get('inquiry') ? Number(params.get('inquiry')) : null;

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const filters = { pipeline, search: debounced, stageId, agentId, offeringId, leadSource, from, to, sort };

  const { data: stages = [], isLoading: stagesLoading } = useQuery({
    queryKey: ['pipeline-stages', pipeline],
    queryFn: () => api.get<PipelineStage[]>('/pipeline-stages', { pipeline }),
  });
  const { data: inquiries = [], isLoading } = useQuery({
    queryKey: ['inquiries', filters],
    queryFn: () =>
      api.get<Inquiry[]>('/inquiries', {
        pipeline,
        search: debounced,
        stage_id: stageId,
        agent_id: agentId,
        offering_id: offeringId,
        lead_source: leadSource,
        from,
        to,
        sort,
      }),
  });
  const { data: offerings = [] } = useQuery({
    queryKey: ['offerings'],
    queryFn: () => api.get<Offering[]>('/offerings'),
  });
  const { data: agents = [] } = useQuery({
    queryKey: ['agents'],
    queryFn: () => api.get<Agent[]>('/agents'),
  });

  const packages = useMemo(
    () =>
      offerings.filter((offering) =>
        event ? offering.type !== 'room_only' && offering.type !== 'amenity' : offering.type === 'room_only',
      ),
    [offerings, event],
  );
  const visibleStages = stageId ? stages.filter((stage) => String(stage.id) === stageId) : stages;

  const move = useMutation({
    mutationFn: ({ inquiry, stageId: nextStage }: { inquiry: Inquiry; stageId: number }) =>
      api.patch(`/inquiries/${inquiry.id}/stage`, { stage_id: nextStage, updated_at: inquiry.updated_at }),
    onMutate: async ({ inquiry, stageId: nextStage }) => {
      await queryClient.cancelQueries({ queryKey: ['inquiries', filters] });
      const previous = queryClient.getQueryData<Inquiry[]>(['inquiries', filters]);
      queryClient.setQueryData<Inquiry[]>(['inquiries', filters], (current) =>
        current?.map((row) =>
          row.id === inquiry.id ? { ...row, stage_id: nextStage, seconds_in_stage: 0 } : row,
        ),
      );
      return { previous };
    },
    onError: (err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(['inquiries', filters], context.previous);
      toast(errorMessage(err), 'error');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['inquiries'] });
      queryClient.invalidateQueries({ queryKey: ['inquiry'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
      queryClient.invalidateQueries({ queryKey: ['calendar'] });
    },
  });

  const openInquiry = (id: number) => {
    const inquiry = inquiries.find((row) => row.id === id);
    if (inquiry?.booking_request_id) {
      navigate(`/requests?request=${inquiry.booking_request_id}`);
      return;
    }
    const next = new URLSearchParams(params);
    next.set('inquiry', String(id));
    setParams(next);
  };
  const closeInquiry = () => {
    const next = new URLSearchParams(params);
    next.delete('inquiry');
    setParams(next);
  };

  return (
    <>
      <PageHeader
        title={event ? 'Event venue pipeline' : 'Room booking pipeline'}
        description={event ? 'Inquiries for the event hall, from first contact to a confirmed lead.' : 'Villa and room inquiries, tracked separately from events.'}
        actions={
          <>
            <Button color="secondary" onClick={() => navigate('/agents')}>
              Agents
            </Button>
            <Button color="secondary" onClick={() => setSettingsOpen(true)}>
              Stages
            </Button>
            <Button
              color="primary"
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              <HiPlus className="mr-2 h-4 w-4" /> New inquiry
            </Button>
          </>
        }
      />

      <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <TextInput icon={HiSearch} placeholder="Name, phone, or email" value={search} onChange={(event) => setSearch(event.target.value)} />
        <Select value={agentId} onChange={(event) => setAgentId(event.target.value)}>
          <option value="">All agents</option>
          {agents.map((agent) => (
            <option key={agent.id} value={agent.id}>
              {agent.name}
            </option>
          ))}
        </Select>
        <Select value={offeringId} onChange={(event) => setOfferingId(event.target.value)}>
          <option value="">All packages</option>
          {packages.map((offering) => (
            <option key={offering.id} value={offering.id}>
              {offering.name}
            </option>
          ))}
        </Select>
        <Select value={leadSource} onChange={(event) => setLeadSource(event.target.value)}>
          <option value="">All lead sources</option>
          {LEAD_SOURCES.map((source) => (
            <option key={source} value={source}>
              {LEAD_SOURCE_LABELS[source]}
            </option>
          ))}
        </Select>
        <TextInput type="date" value={from} onChange={(event) => setFrom(event.target.value)} aria-label="From date" />
        <TextInput type="date" value={to} onChange={(event) => setTo(event.target.value)} aria-label="To date" />
        <Select value={sort} onChange={(event) => setSort(event.target.value)}>
          {SORTS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
        <Select value={stageId} onChange={(event) => setStageId(event.target.value)}>
          <option value="">All stages</option>
          {stages.map((stage) => (
            <option key={stage.id} value={stage.id}>
              {stage.label}
            </option>
          ))}
        </Select>
      </div>

      {isLoading || stagesLoading ? (
        <SkeletonRows count={4} />
      ) : stages.length === 0 ? (
        <EmptyState icon={HiViewBoards} title="No stages yet" description="Add a stage to start this pipeline." />
      ) : (
        <>
          <div className="hidden md:block">
            <PipelineBoard
              stages={visibleStages}
              inquiries={inquiries}
              disabled={settingsOpen}
              onOpen={openInquiry}
              onMove={(inquiry, nextStage) => move.mutate({ inquiry, stageId: nextStage })}
            />
          </div>
          <div className="space-y-4 md:hidden">
            {visibleStages.map((stage) => {
              const cards = inquiries.filter((inquiry) => inquiry.stage_id === stage.id);
              if (!cards.length && stageId) return null;
              return (
                <section key={stage.id}>
                  <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-gray-800 dark:text-gray-100">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: stage.bg.trim() }} />
                    {stage.label}
                    <span className="text-xs font-normal text-gray-400">{cards.length}</span>
                  </h3>
                  <div className="space-y-2">
                    {cards.map((inquiry) => (
                      <InquiryCardView
                        key={inquiry.id}
                        inquiry={inquiry}
                        onOpen={() => openInquiry(inquiry.id)}
                        extra={
                          inquiry.booking_request_id ? undefined : (
                            <Select
                              sizing="sm"
                              className="mt-2"
                              value={inquiry.stage_id}
                              onChange={(event) => move.mutate({ inquiry, stageId: Number(event.target.value) })}
                            >
                              {stages.map((option) => (
                                <option key={option.id} value={option.id}>
                                  Move to {option.label}
                                </option>
                              ))}
                            </Select>
                          )
                        }
                      />
                    ))}
                  </div>
                </section>
              );
            })}
            {inquiries.length === 0 && (
              <EmptyState icon={HiViewBoards} title="No inquiries match" description="Try another search or add an inquiry." />
            )}
          </div>
          {!isMobile && inquiries.length === 0 && (
            <p className="mt-2 text-sm text-gray-500">No inquiries match these filters.</p>
          )}
        </>
      )}

      <InquirySheet
        inquiryId={selectedId}
        stages={stages}
        onClose={closeInquiry}
        onEdit={(inquiry) => {
          setEditing(inquiry);
          setFormOpen(true);
        }}
      />
      <InquiryFormModal
        open={formOpen}
        pipeline={pipeline}
        inquiry={editing}
        onClose={() => setFormOpen(false)}
      />
      <StageSettings open={settingsOpen} pipeline={pipeline} stages={stages} onClose={() => setSettingsOpen(false)} />
    </>
  );
}
