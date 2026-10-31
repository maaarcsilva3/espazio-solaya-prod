import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Modal, TextInput } from 'flowbite-react';
import { HiKey, HiPlus, HiTrash } from 'react-icons/hi';
import { api, errorMessage } from '../lib/api';
import { formatDateTime } from '../lib/format';
import type { Admin } from '../lib/types';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import PageHeader from '../components/PageHeader';
import FormField from '../components/FormField';
import ConfirmDialog from '../components/ConfirmDialog';
import ChangePasswordModal from '../components/ChangePasswordModal';
import Card from '../components/ui/Card';
import { SkeletonRows } from '../components/ui/Skeleton';

interface NewAdmin {
  name: string;
  email: string;
  password: string;
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');
}

export default function AdminsPage() {
  const { admin: me } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const [deleting, setDeleting] = useState<Admin | null>(null);

  const { data: admins = [], isLoading } = useQuery({
    queryKey: ['admins'],
    queryFn: () => api.get<Admin[]>('/admins'),
  });

  const addForm = useForm<NewAdmin>();

  const create = useMutation({
    mutationFn: (v: NewAdmin) => api.post<Admin>('/admins', v),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admins'] });
      toast('Admin added');
      setAddOpen(false);
      addForm.reset();
    },
  });

  const remove = useMutation({
    mutationFn: (id: number) => api.delete(`/admins/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admins'] });
      toast('Admin removed');
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
        title="Admins"
        description="People who can log in to this dashboard."
        actions={
          <>
            <Button color="secondary" className="flex-1 sm:flex-none" onClick={() => setPwOpen(true)}>
              <HiKey className="mr-2 h-5 w-5" /> Change my password
            </Button>
            <Button color="primary" className="flex-1 sm:flex-none" onClick={() => setAddOpen(true)}>
              <HiPlus className="mr-2 h-5 w-5" /> Add admin
            </Button>
          </>
        }
      />

      <Card bodyClassName="px-5">
        {isLoading ? (
          <SkeletonRows count={3} />
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-gray-700">
            {admins.map((a) => (
              <li key={a.id} className="flex items-center gap-4 py-4">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-100 text-sm font-semibold text-primary-700 dark:bg-primary-500/20 dark:text-primary-300">
                  {initials(a.name)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 truncate font-medium text-gray-900 dark:text-white">
                    {a.name}
                    {a.id === me?.id && (
                      <span className="rounded-md bg-primary-50 px-1.5 py-0.5 text-[11px] font-medium text-primary-700 dark:bg-primary-500/15 dark:text-primary-300">
                        You
                      </span>
                    )}
                  </p>
                  <p className="truncate text-sm text-gray-500 dark:text-gray-400">{a.email}</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500">Added {formatDateTime(a.created_at)}</p>
                </div>
                {a.id !== me?.id && (
                  <button
                    onClick={() => setDeleting(a)}
                    aria-label={`Remove ${a.name}`}
                    className="flex h-10 w-10 items-center justify-center rounded-lg text-gray-500 hover:bg-red-50 hover:text-red-600 dark:text-gray-400 dark:hover:bg-red-500/10 dark:hover:text-red-400"
                  >
                    <HiTrash className="h-5 w-5" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Modal show={addOpen} onClose={() => setAddOpen(false)} size="md" dismissible>
        <Modal.Header>Add admin</Modal.Header>
        <form onSubmit={addForm.handleSubmit((v) => create.mutate(v))} className="flex min-h-0 flex-1 flex-col">
          <Modal.Body className="space-y-4">
            {create.isError && <Alert color="failure">{errorMessage(create.error)}</Alert>}
            <FormField id="admin-name" label="Name" error={addForm.formState.errors.name?.message}>
              <TextInput id="admin-name" {...addForm.register('name', { required: 'Name is required' })} />
            </FormField>
            <FormField id="admin-email" label="Email" error={addForm.formState.errors.email?.message}>
              <TextInput id="admin-email" type="email" {...addForm.register('email', { required: 'Email is required' })} />
            </FormField>
            <FormField
              id="admin-password"
              label="Temporary password"
              hint="At least 8 characters. Ask them to change it after logging in."
              error={addForm.formState.errors.password?.message}
            >
              <TextInput
                id="admin-password"
                type="password"
                autoComplete="new-password"
                {...addForm.register('password', { minLength: { value: 8, message: 'Use at least 8 characters' } })}
              />
            </FormField>
          </Modal.Body>
          <Modal.Footer className="justify-end">
            <Button color="secondary" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" color="primary" isProcessing={create.isPending} disabled={create.isPending}>
              Add admin
            </Button>
          </Modal.Footer>
        </form>
      </Modal>

      <ChangePasswordModal open={pwOpen} onClose={() => setPwOpen(false)} />

      <ConfirmDialog
        open={!!deleting}
        title="Remove admin?"
        message={`${deleting?.name} will no longer be able to log in.`}
        confirmLabel="Remove"
        loading={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
        onClose={() => setDeleting(null)}
      />
    </>
  );
}
