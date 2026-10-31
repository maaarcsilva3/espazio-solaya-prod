import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Checkbox, Label, Modal, TextInput } from 'flowbite-react';
import { api, ApiError, errorMessage } from '../lib/api';
import { CATEGORY_HINTS, CATEGORY_LABELS, readableTextColor, STATUS_CATEGORIES } from '../lib/format';
import type { StatusCategory, StatusDef, StatusInput } from '../lib/types';
import { useToast } from '../context/ToastContext';
import { STATUSES_KEY } from '../hooks/useStatuses';
import FormField from './FormField';
import SegmentedControl from './ui/SegmentedControl';
import { StatusPill } from './StatusBadge';

type TextMode = 'auto' | 'light' | 'dark';

const LIGHT_TEXT = '#ffffff';
const DARK_TEXT = '#111827';
const HEX = /^#[0-9a-fA-F]{6}$/;
const SWATCHES = ['#f59e0b', '#10b981', '#6366f1', '#0ea5e9', '#8b5cf6', '#ec4899', '#ef4444', '#64748b'];

function textFor(bg: string, mode: TextMode) {
  if (mode === 'light') return LIGHT_TEXT;
  if (mode === 'dark') return DARK_TEXT;
  return readableTextColor(bg);
}

function modeFor(bg: string, text: string): TextMode {
  const t = text.toLowerCase();
  if (t === readableTextColor(bg)) return 'auto';
  return t === LIGHT_TEXT ? 'light' : 'dark';
}

export default function StatusFormModal({
  open,
  status,
  onClose,
}: {
  open: boolean;
  status: StatusDef | null;
  onClose: () => void;
}) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [label, setLabel] = useState('');
  const [bg, setBg] = useState(SWATCHES[0]);
  const [hex, setHex] = useState(SWATCHES[0]);
  const [textMode, setTextMode] = useState<TextMode>('auto');
  const [category, setCategory] = useState<StatusCategory>('new');
  const [isDefault, setIsDefault] = useState(false);

  useEffect(() => {
    if (!open) return;
    const startBg = status?.bg ?? SWATCHES[0];
    setLabel(status?.label ?? '');
    setBg(startBg);
    setHex(startBg);
    setTextMode(status ? modeFor(status.bg, status.text_color) : 'auto');
    setCategory(status?.category ?? 'new');
    setIsDefault(status?.is_default ?? false);
  }, [open, status]);

  const save = useMutation({
    mutationFn: (body: StatusInput) =>
      status ? api.put<StatusDef>(`/statuses/${status.key}`, body) : api.post<StatusDef>('/statuses', body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: STATUSES_KEY });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
      queryClient.invalidateQueries({ queryKey: ['calendar'] });
      queryClient.invalidateQueries({ queryKey: ['requests'] });
      toast(status ? 'Status updated' : 'Status added');
      onClose();
    },
  });

  const pickColor = (value: string) => {
    setHex(value);
    if (HEX.test(value)) setBg(value.toLowerCase());
  };

  const text = textFor(bg, textMode);
  const labelError = save.error instanceof ApiError ? save.error.fieldErrors?.label?.[0] : undefined;
  // The current default can't be switched off here; another status has to take over.
  const lockedDefault = !!status?.is_default;

  return (
    <Modal show={open} onClose={onClose} size="lg" dismissible>
      <Modal.Header>{status ? 'Edit status' : 'Add status'}</Modal.Header>
      <form
        className="flex min-h-0 flex-1 flex-col"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate({
            label: label.trim(),
            bg,
            text_color: text,
            category,
            is_default: category === 'new' && isDefault,
          });
        }}
      >
        <Modal.Body className="space-y-5">
          {save.isError && !labelError && <Alert color="failure">{errorMessage(save.error)}</Alert>}

          <div className="flex items-center justify-center rounded-xl bg-gray-50 py-6 dark:bg-gray-900/50">
            <StatusPill label={label.trim() || 'Status name'} bg={bg} text={text} size="md" />
          </div>

          <FormField id="status-label" label="Name" error={labelError}>
            <TextInput
              id="status-label"
              required
              maxLength={60}
              placeholder="e.g. Awaiting deposit"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
          </FormField>

          <div>
            <p className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">Color</p>
            <div className="flex flex-wrap items-center gap-2">
              {SWATCHES.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={`Use ${c}`}
                  onClick={() => pickColor(c)}
                  className={`h-9 w-9 rounded-full ring-offset-2 transition dark:ring-offset-gray-800 ${
                    bg === c ? 'ring-2 ring-gray-900 dark:ring-white' : 'hover:scale-110'
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
              <input
                type="color"
                aria-label="Custom color"
                value={bg}
                onChange={(e) => pickColor(e.target.value)}
                className="h-9 w-11 cursor-pointer rounded-lg border border-gray-300 bg-white p-1 dark:border-gray-600 dark:bg-gray-700"
              />
              <TextInput
                aria-label="Hex color"
                value={hex}
                onChange={(e) => pickColor(e.target.value.trim())}
                color={HEX.test(hex) ? 'gray' : 'failure'}
                className="w-28"
              />
            </div>
          </div>

          <div>
            <p className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">Text color</p>
            <SegmentedControl
              ariaLabel="Text color"
              value={textMode}
              onChange={setTextMode}
              options={[
                { value: 'auto', label: 'Auto' },
                { value: 'light', label: 'White' },
                { value: 'dark', label: 'Black' },
              ]}
            />
          </div>

          <div>
            <p className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">Type</p>
            <SegmentedControl
              ariaLabel="Status type"
              className="w-full"
              value={category}
              onChange={(c) => !lockedDefault && setCategory(c)}
              options={STATUS_CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABELS[c] }))}
            />
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
              {lockedDefault
                ? 'This is the default status for new requests, so it must stay a New status.'
                : CATEGORY_HINTS[category]}
            </p>
          </div>

          {category === 'new' && (
            <div className="flex items-start gap-3 rounded-lg border border-gray-200 p-3 dark:border-gray-700">
              <Checkbox
                id="status-default"
                checked={isDefault}
                disabled={lockedDefault}
                onChange={(e) => setIsDefault(e.target.checked)}
                className="mt-0.5"
              />
              <Label htmlFor="status-default" className="cursor-pointer">
                <span className="block text-sm font-medium">Default for new requests</span>
                <span className="block text-xs font-normal text-gray-500 dark:text-gray-400">
                  Requests from the website form start with this status.
                </span>
              </Label>
            </div>
          )}
        </Modal.Body>
        <Modal.Footer className="justify-end">
          <Button color="secondary" onClick={onClose} disabled={save.isPending}>
            Cancel
          </Button>
          <Button
            type="submit"
            color="primary"
            disabled={save.isPending || !label.trim() || !HEX.test(hex)}
            isProcessing={save.isPending}
          >
            {status ? 'Save changes' : 'Add status'}
          </Button>
        </Modal.Footer>
      </form>
    </Modal>
  );
}
