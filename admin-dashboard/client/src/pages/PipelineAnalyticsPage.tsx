import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { TextInput } from 'flowbite-react';
import { api } from '../lib/api';
import { formatDuration, formatRate, LEAD_SOURCE_LABELS, PIPELINE_LABELS } from '../lib/format';
import type { ConversionGroup, LeadSource, Pipeline, PipelineAnalytics } from '../lib/types';
import PageHeader from '../components/PageHeader';
import Card from '../components/ui/Card';
import SegmentedControl from '../components/ui/SegmentedControl';
import { SkeletonRows } from '../components/ui/Skeleton';

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <p className="text-2xl font-semibold text-gray-900 dark:text-white">{value}</p>
      <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{label}</p>
      {hint && <p className="text-xs text-gray-500 dark:text-gray-400">{hint}</p>}
    </div>
  );
}

function GroupTable({ title, rows, labelFor }: { title: string; rows: ConversionGroup[]; labelFor?: (key: string) => string }) {
  return (
    <Card title={title}>
      {rows.length === 0 ? (
        <p className="text-sm text-gray-500">Nothing in this period.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase text-gray-500">
              <tr>
                <th className="py-2 pr-3 font-medium">Name</th>
                <th className="py-2 pr-3 font-medium">Eligible</th>
                <th className="py-2 pr-3 font-medium">Confirmed</th>
                <th className="py-2 pr-3 font-medium">Rate</th>
                <th className="py-2 font-medium">Avg time</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key} className="border-t border-gray-100 dark:border-gray-700">
                  <td className="py-2 pr-3 text-gray-900 dark:text-white">{labelFor ? labelFor(row.key) : row.label}</td>
                  <td className="py-2 pr-3">{row.eligible}</td>
                  <td className="py-2 pr-3">{row.converted}</td>
                  <td className="py-2 pr-3">{formatRate(row.conversion_rate)}</td>
                  <td className="py-2">{formatDuration(row.average_seconds)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

export default function PipelineAnalyticsPage() {
  const [pipeline, setPipeline] = useState<'all' | Pipeline>('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const { data, isLoading } = useQuery({
    queryKey: ['inquiry-analytics', pipeline, from, to],
    queryFn: () =>
      api.get<PipelineAnalytics>('/inquiries/analytics', {
        pipeline: pipeline === 'all' ? undefined : pipeline,
        from,
        to,
      }),
  });
  const maxStage = Math.max(1, ...(data?.by_stage.map((stage) => stage.total) ?? [1]));

  return (
    <>
      <PageHeader
        title="Pipeline performance"
        description="Conversion uses the date the inquiry was created. Lost inquiries are excluded from the rate."
        actions={
          <div className="flex gap-3 text-sm">
            <Link to="/pipeline/events" className="font-medium text-primary-600 hover:underline dark:text-primary-400">
              Event venue
            </Link>
            <Link to="/pipeline/rooms" className="font-medium text-primary-600 hover:underline dark:text-primary-400">
              Room bookings
            </Link>
          </div>
        }
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <SegmentedControl
          ariaLabel="Pipeline"
          value={pipeline}
          onChange={setPipeline}
          options={[
            { value: 'all', label: 'Both' },
            { value: 'event_venue', label: 'Events' },
            { value: 'room_booking', label: 'Rooms' },
          ]}
        />
        <TextInput type="date" value={from} onChange={(event) => setFrom(event.target.value)} aria-label="From" />
        <TextInput type="date" value={to} onChange={(event) => setTo(event.target.value)} aria-label="To" />
      </div>

      {isLoading || !data ? (
        <SkeletonRows count={4} />
      ) : (
        <div className="space-y-6">
          <Card title="This period" description={from || to ? `${from || 'Start'} to ${to || 'today'}` : 'All inquiries'}>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <Metric label="Inquiries" value={String(data.summary.total)} hint="Including lost" />
              <Metric label="Eligible" value={String(data.summary.eligible)} hint="Not currently lost" />
              <Metric label="Conversion rate" value={formatRate(data.summary.conversion_rate)} hint={`${data.summary.converted} confirmed`} />
              <Metric label="Avg time to confirm" value={formatDuration(data.summary.average_seconds)} hint="From creation to first confirmation" />
            </div>
          </Card>

          <Card title="By stage" description="Inquiries created in the period, counted in the stage they are in now.">
            <div className="space-y-3">
              {data.by_stage.map((stage) => (
                <div key={stage.id}>
                  <div className="mb-1 flex justify-between text-sm">
                    <span className="text-gray-800 dark:text-gray-100">{stage.label}</span>
                    <span className="text-gray-500">{stage.total}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-700">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${(stage.total / maxStage) * 100}%`, backgroundColor: stage.bg.trim() }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card title="Average time in stage" description="From the moment an inquiry enters a stage until it leaves, or until now if it is still there.">
            {data.stage_time.length === 0 ? (
              <p className="text-sm text-gray-500">No stage history in this period.</p>
            ) : (
              <ul className="divide-y divide-gray-100 dark:divide-gray-700">
                {data.stage_time.map((stage) => (
                  <li key={stage.key} className="flex justify-between py-2 text-sm">
                    <span className="text-gray-800 dark:text-gray-100">{stage.label}</span>
                    <span className="text-gray-500">{formatDuration(stage.average_seconds)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <GroupTable title="By agent" rows={data.by_agent} />
            <GroupTable
              title="By lead source"
              rows={data.by_source}
              labelFor={(key) => LEAD_SOURCE_LABELS[key as LeadSource] ?? key}
            />
          </div>

          <GroupTable
            title="Event venue vs room booking"
            rows={data.by_pipeline}
            labelFor={(key) => PIPELINE_LABELS[key as Pipeline] ?? key}
          />

          <p className="text-xs leading-relaxed text-gray-500 dark:text-gray-400">{data.definition}</p>
        </div>
      )}
    </>
  );
}
