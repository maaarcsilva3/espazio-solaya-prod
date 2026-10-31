import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Modal, TextInput } from 'flowbite-react';
import { HiPlus, HiTrash, HiUserAdd } from 'react-icons/hi';
import { api, errorMessage } from '../lib/api';
import { formatDateTime } from '../lib/format';
import type { Agent } from '../lib/types';
import { useToast } from '../context/ToastContext';
import PageHeader from '../components/PageHeader';
import FormField from '../components/FormField';
import ConfirmDialog from '../components/ConfirmDialog';
import Card from '../components/ui/Card';
import EmptyState from '../components/ui/EmptyState';
import { SkeletonRows } from '../components/ui/Skeleton';

interface NewAgent {
  name: string;
  email: string;
  phone: string;
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join('');
}

export default function AgentsPage() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [deleting, setDeleting] = useState<Agent | null>(null);
  const addForm = useForm<NewAgent>({ defaultValues: { name: '', email: '', phone: '' } });

  const { data: agents = [], isLoading } = useQuery({
    queryKey: ['agents'],
    queryFn: () => api.get<Agent[]>('/agents'),
  });

  const create = useMutation({
    mutationFn: (values: NewAgent) =>
      api.post<Agent>('/agents', {
        name: values.name,
        email: values.email || null,
        phone: values.phone || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agents'] });
      toast('Agent added');
      setAddOpen(false);
      addForm.reset();
    },
  });

  const remove = useMutation({
    mutationFn: (id: number) => api.delete(`/agents/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agents'] });
      queryClient.invalidateQueries({ queryKey: ['inquiries'] });
      toast('Agent removed');
      setDeleting(null);
    },
    onError: (err) => {
      toast(errorMessage(err), 'error');
      setDeleting(null);
    },
  });

  return (
    <>
      <PageHeader
        title="Agents"
        description="People you can assign to event and room inquiries."
        actions={
          <Button color="primary" onClick={() => setAddOpen(true)}>
            <HiPlus className="mr-2 h-5 w-5" /> Add agent
          </Button>
        }
      />

      <Card bodyClassName="px-5">
        {isLoading ? (
          <SkeletonRows count={3} />
        ) : agents.length === 0 ? (
          <EmptyState
            icon={HiUserAdd}
            title="No agents yet"
            description="Add an agent, then assign them when you create or edit an inquiry."
          />
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-gray-700">
            {agents.map((agent) => (
              <li key={agent.id} className="flex items-center gap-4 py-4">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-100 text-sm font-semibold text-primary-700 dark:bg-primary-500/20 dark:text-primary-300">
                  {initials(agent.name)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-gray-900 dark:text-white">{agent.name}</p>
                  <p className="truncate text-sm text-gray-500 dark:text-gray-400">
                    {[agent.email, agent.phone].filter(Boolean).join(' · ') || 'No contact details'}
                  </p>
                  <p className="text-xs text-gray-400 dark:text-gray-500">Added {formatDateTime(agent.created_at)}</p>
                </div>
                <button
                  onClick={() => setDeleting(agent)}
                  aria-label={`Remove ${agent.name}`}
                  className="flex h-10 w-10 items-center justify-center rounded-lg text-gray-500 hover:bg-red-50 hover:text-red-600 dark:text-gray-400 dark:hover:bg-red-500/10 dark:hover:text-red-400"
                >
                  <HiTrash className="h-5 w-5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Modal show={addOpen} onClose={() => setAddOpen(false)} size="md" dismissible>
        <Modal.Header>Add agent</Modal.Header>
        <form onSubmit={addForm.handleSubmit((values) => create.mutate(values))} className="flex min-h-0 flex-1 flex-col">
          <Modal.Body className="space-y-4">
            {create.isError && <Alert color="failure">{errorMessage(create.error)}</Alert>}
            <FormField id="agent-name" label="Name" error={addForm.formState.errors.name?.message}>
              <TextInput id="agent-name" {...addForm.register('name', { required: 'Name is required' })} />
            </FormField>
            <FormField id="agent-email" label="Email" hint="Optional." error={addForm.formState.errors.email?.message}>
              <TextInput id="agent-email" type="email" {...addForm.register('email')} />
            </FormField>
            <FormField id="agent-phone" label="Phone" hint="Optional.">
              <TextInput id="agent-phone" {...addForm.register('phone')} />
            </FormField>
          </Modal.Body>
          <Modal.Footer className="justify-end">
            <Button color="secondary" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" color="primary" isProcessing={create.isPending} disabled={create.isPending}>
              Add agent
            </Button>
          </Modal.Footer>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!deleting}
        title="Remove agent?"
        message={`${deleting?.name} will be removed from any inquiries they are assigned to.`}
        confirmLabel="Remove"
        loading={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
        onClose={() => setDeleting(null)}
      />
    </>
  );
}
