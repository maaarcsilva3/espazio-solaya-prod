import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useMutation } from '@tanstack/react-query';
import { Alert, Button, Modal, TextInput } from 'flowbite-react';
import { api, errorMessage } from '../lib/api';
import { useToast } from '../context/ToastContext';
import FormField from './FormField';

interface PasswordChange {
  current_password: string;
  new_password: string;
  confirm: string;
}

export default function ChangePasswordModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const form = useForm<PasswordChange>();

  const change = useMutation({
    mutationFn: (v: PasswordChange) =>
      api.post('/admins/me/password', { current_password: v.current_password, new_password: v.new_password }),
    onSuccess: () => {
      toast('Password changed');
      onClose();
    },
  });

  const { reset: resetForm } = form;
  const { reset: resetMutation } = change;
  useEffect(() => {
    if (open) {
      resetForm();
      resetMutation();
    }
  }, [open, resetForm, resetMutation]);

  return (
    <Modal show={open} onClose={onClose} size="md" dismissible>
      <Modal.Header>Change my password</Modal.Header>
      <form onSubmit={form.handleSubmit((v) => change.mutate(v))} className="flex min-h-0 flex-1 flex-col">
        <Modal.Body className="space-y-4">
          {change.isError && <Alert color="failure">{errorMessage(change.error)}</Alert>}
          <FormField id="current_password" label="Current password">
            <TextInput
              id="current_password"
              type="password"
              autoComplete="current-password"
              {...form.register('current_password', { required: true })}
            />
          </FormField>
          <FormField id="new_password" label="New password" error={form.formState.errors.new_password?.message}>
            <TextInput
              id="new_password"
              type="password"
              autoComplete="new-password"
              {...form.register('new_password', { minLength: { value: 8, message: 'Use at least 8 characters' } })}
            />
          </FormField>
          <FormField id="confirm" label="Confirm new password" error={form.formState.errors.confirm?.message}>
            <TextInput
              id="confirm"
              type="password"
              autoComplete="new-password"
              {...form.register('confirm', {
                validate: (v, all) => v === all.new_password || 'Passwords do not match',
              })}
            />
          </FormField>
        </Modal.Body>
        <Modal.Footer className="justify-end">
          <Button color="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" color="primary" isProcessing={change.isPending} disabled={change.isPending}>
            Save password
          </Button>
        </Modal.Footer>
      </form>
    </Modal>
  );
}
