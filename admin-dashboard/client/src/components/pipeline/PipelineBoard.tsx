import { useState } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { InquiryCardView } from './InquiryCard';
import InquiryCard from './InquiryCard';
import type { Inquiry, PipelineStage } from '../../lib/types';

function Column({
  stage,
  inquiries,
  onOpen,
}: {
  stage: PipelineStage;
  inquiries: Inquiry[];
  onOpen: (id: number) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `stage-${stage.id}` });
  return (
    <section className="flex w-72 shrink-0 flex-col">
      <header className="mb-2 flex items-center gap-2 px-1">
        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: stage.bg.trim() }} />
        <h3 className="truncate text-sm font-semibold text-gray-800 dark:text-gray-100">{stage.label}</h3>
        <span className="text-xs text-gray-400">{inquiries.length}</span>
      </header>
      <div
        ref={setNodeRef}
        className={`flex min-h-48 flex-1 flex-col gap-2 rounded-xl p-2 ${
          isOver ? 'bg-primary-50 dark:bg-primary-500/10' : 'bg-gray-100/80 dark:bg-gray-900/60'
        }`}
      >
        {inquiries.map((inquiry) => (
          <InquiryCard key={inquiry.id} inquiry={inquiry} onOpen={() => onOpen(inquiry.id)} />
        ))}
      </div>
    </section>
  );
}

export default function PipelineBoard({
  stages,
  inquiries,
  disabled,
  onOpen,
  onMove,
}: {
  stages: PipelineStage[];
  inquiries: Inquiry[];
  disabled?: boolean;
  onOpen: (id: number) => void;
  onMove: (inquiry: Inquiry, stageId: number) => void;
}) {
  const [active, setActive] = useState<Inquiry | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
  const byStage = new Map(stages.map((stage) => [stage.id, inquiries.filter((inquiry) => inquiry.stage_id === stage.id)]));

  const onDragStart = (event: DragStartEvent) => {
    setActive((event.active.data.current?.inquiry as Inquiry | undefined) ?? null);
  };
  const onDragEnd = (event: DragEndEvent) => {
    setActive(null);
    const inquiry = event.active.data.current?.inquiry as Inquiry | undefined;
    const overId = event.over ? String(event.over.id) : '';
    const stageId = Number(overId.replace('stage-', ''));
    if (!inquiry || inquiry.booking_request_id || !stageId || stageId === inquiry.stage_id) return;
    onMove(inquiry, stageId);
  };

  return (
    <DndContext sensors={disabled ? [] : sensors} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setActive(null)}>
      <div className="flex gap-3 overflow-x-auto pb-4">
        {stages.map((stage) => (
          <Column key={stage.id} stage={stage} inquiries={byStage.get(stage.id) ?? []} onOpen={onOpen} />
        ))}
      </div>
      <DragOverlay>{active ? <InquiryCardView inquiry={active} dragging /> : null}</DragOverlay>
    </DndContext>
  );
}
