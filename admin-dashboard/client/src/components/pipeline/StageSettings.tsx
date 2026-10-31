import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Button, Modal, Select, TextInput } from 'flowbite-react';
import { HiDotsVertical, HiPencil, HiPlus, HiTrash } from 'react-icons/hi';
import { api, errorMessage } from '../../lib/api';
import { readableTextColor, STAGE_OUTCOME_LABELS } from '../../lib/format';
import type { Pipeline, PipelineStage, StageOutcome } from '../../lib/types';
import { useToast } from '../../context/ToastContext';
import Sheet from '../ui/Sheet';
import ConfirmDialog from '../ConfirmDialog';
import FormField from '../FormField';
import SegmentedControl from '../ui/SegmentedControl';

const SWATCHES = ['#f59e0b', '#3b82f6', '#8b5cf6', '#f97316', '#10b981', '#ef4444', '#64748b', '#6366f1'];

function SortableRow({
  stage,
  onEdit,
  onDelete,
}: {
  stage: PipelineStage;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: stage.id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-2 py-2 dark:border-gray-700 dark:bg-gray-800"
    >
      <button type="button" className="cursor-grab p-1 text-gray-400" aria-label="Drag to reorder" {...attributes} {...listeners}>
        <HiDotsVertical className="h-4 w-4" />
      </button>
      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: stage.bg.trim() }} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-gray-900 dark:text-white">{stage.label}</p>
        <p className="text-xs text-gray-500">
          {STAGE_OUTCOME_LABELS[stage.outcome]}
          {stage.usage_count ? ` · ${stage.usage_count} inquiries` : ''}
        </p>
      </div>
      <Button size="xs" color="secondary" onClick={onEdit}>
        <HiPencil className="h-3.5 w-3.5" />
      </Button>
      <Button size="xs" color="light" onClick={onDelete} disabled={stage.outcome === 'won'} title={stage.outcome === 'won' ? 'Rename the confirmed stage instead of deleting it' : 'Delete'}>
        <HiTrash className="h-3.5 w-3.5 text-red-600" />
      </Button>
    </div>
  );
}

export default function StageSettings({
  open,
  pipeline,
  stages,
  onClose,
}: {
  open: boolean;
  pipeline: Pipeline;
  stages: PipelineStage[];
  onClose: () => void;
}) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [ordered, setOrdered] = useState(stages);
  const [editing, setEditing] = useState<PipelineStage | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [label, setLabel] = useState('');
  const [bg, setBg] = useState(SWATCHES[0]);
  const [outcome, setOutcome] = useState<StageOutcome>('open');
  const [deleting, setDeleting] = useState<PipelineStage | null>(null);
  const [moveTo, setMoveTo] = useState('');
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  useEffect(() => setOrdered(stages), [stages]);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['pipeline-stages', pipeline] });
    queryClient.invalidateQueries({ queryKey: ['inquiries'] });
    queryClient.invalidateQueries({ queryKey: ['stats'] });
  };

  const reorder = useMutation({
    mutationFn: (ids: number[]) => api.put<PipelineStage[]>('/pipeline-stages/order', { pipeline, ids }),
    onSuccess: () => refresh(),
    onError: (err) => {
      setOrdered(stages);
      toast(errorMessage(err), 'error');
    },
  });

  const save = useMutation({
    mutationFn: () => {
      const body = { pipeline, label: label.trim(), bg, text_color: readableTextColor(bg), outcome };
      return editing ? api.put(`/pipeline-stages/${editing.id}`, body) : api.post('/pipeline-stages', body);
    },
    onSuccess: () => {
      refresh();
      toast(editing ? 'Stage updated' : 'Stage added');
      setFormOpen(false);
    },
    onError: (err) => toast(errorMessage(err), 'error'),
  });

  const remove = useMutation({
    mutationFn: () =>
      api.delete<{ moved: number }>(`/pipeline-stages/${deleting!.id}`, {
        moveTo: moveTo || undefined,
      }),
    onSuccess: (result) => {
      refresh();
      toast(result.moved ? `Stage deleted. ${result.moved} inquiry(s) moved.` : 'Stage deleted');
      setDeleting(null);
      setMoveTo('');
    },
    onError: (err) => toast(errorMessage(err), 'error'),
  });

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = ordered.findIndex((stage) => stage.id === active.id);
    const newIndex = ordered.findIndex((stage) => stage.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const next = arrayMove(ordered, oldIndex, newIndex);
    setOrdered(next);
    reorder.mutate(next.map((stage) => stage.id));
  };

  const openForm = (stage: PipelineStage | null) => {
    setEditing(stage);
    setLabel(stage?.label ?? '');
    setBg(stage?.bg.trim() ?? SWATCHES[0]);
    setOutcome(stage?.outcome ?? 'open');
    setFormOpen(true);
  };

  return (
    <>
      <Sheet
        open={open}
        onClose={onClose}
        title="Pipeline stages"
        footer={
          <Button color="primary" onClick={() => openForm(null)}>
            <HiPlus className="mr-2 h-4 w-4" /> Add stage
          </Button>
        }
      >
        <div className="space-y-3 px-5 py-4">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Drag a stage to change its order. Deleting a stage that still has inquiries asks you where to move them.
            The confirmed stage can be renamed, and it is the only stage that holds inventory.
          </p>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={ordered.map((stage) => stage.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-2">
                {ordered.map((stage) => (
                  <SortableRow key={stage.id} stage={stage} onEdit={() => openForm(stage)} onDelete={() => setDeleting(stage)} />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </div>
      </Sheet>

      <Modal show={formOpen} onClose={() => setFormOpen(false)} dismissible>
        <Modal.Header>{editing ? 'Edit stage' : 'Add stage'}</Modal.Header>
        <Modal.Body className="space-y-4">
          <FormField id="stage-label" label="Name">
            <TextInput id="stage-label" value={label} maxLength={60} onChange={(event) => setLabel(event.target.value)} />
          </FormField>
          <div className="flex flex-wrap gap-2">
            {SWATCHES.map((swatch) => (
              <button
                key={swatch}
                type="button"
                aria-label={swatch}
                onClick={() => setBg(swatch)}
                className={`h-8 w-8 rounded-full ring-2 ring-offset-2 dark:ring-offset-gray-800 ${bg === swatch ? 'ring-gray-900 dark:ring-white' : 'ring-transparent'}`}
                style={{ backgroundColor: swatch }}
              />
            ))}
          </div>
          <FormField id="stage-outcome" label="What this stage means">
            <SegmentedControl
              ariaLabel="Stage outcome"
              value={outcome}
              onChange={setOutcome}
              options={[
                { value: 'open', label: 'Open' },
                { value: 'won', label: 'Confirmed' },
                { value: 'lost', label: 'Lost' },
              ]}
            />
          </FormField>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {outcome === 'won'
              ? 'This becomes the confirmed stage. Inquiries here hold inventory, and the first time they enter it is their conversion time. The previous confirmed stage becomes open.'
              : outcome === 'lost'
                ? 'Lost inquiries stay on the board but are left out of the conversion rate.'
                : 'Open stages do not hold a room or the event hall.'}
          </p>
        </Modal.Body>
        <Modal.Footer className="justify-end">
          <Button color="secondary" onClick={() => setFormOpen(false)}>
            Cancel
          </Button>
          <Button color="primary" disabled={!label.trim() || save.isPending} onClick={() => save.mutate()}>
            Save
          </Button>
        </Modal.Footer>
      </Modal>

      <ConfirmDialog
        open={!!deleting}
        title="Delete stage?"
        message={
          deleting?.usage_count
            ? `${deleting.usage_count} inquiry(s) are in "${deleting.label}". Choose where to move them.`
            : `"${deleting?.label}" will be removed. Inquiries are not deleted.`
        }
        confirmDisabled={!!deleting?.usage_count && !moveTo}
        loading={remove.isPending}
        onConfirm={() => remove.mutate()}
        onClose={() => {
          setDeleting(null);
          setMoveTo('');
        }}
      >
        {!!deleting?.usage_count && (
          <Select className="mt-3" value={moveTo} onChange={(event) => setMoveTo(event.target.value)}>
            <option value="">Move inquiries to...</option>
            {stages
              .filter((stage) => stage.id !== deleting.id)
              .map((stage) => (
                <option key={stage.id} value={stage.id}>
                  {stage.label}
                </option>
              ))}
          </Select>
        )}
      </ConfirmDialog>
    </>
  );
}
