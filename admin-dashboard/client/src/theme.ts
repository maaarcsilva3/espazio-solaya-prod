import type { CustomFlowbiteTheme } from 'flowbite-react';

const field =
  'border-gray-300 bg-white text-gray-900 focus:border-primary-500 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder-gray-400 dark:focus:border-primary-500 dark:focus:ring-primary-500';

export const theme: CustomFlowbiteTheme = {
  button: {
    color: {
      primary:
        'border border-transparent bg-primary-600 text-white enabled:hover:bg-primary-700 focus:ring-4 focus:ring-primary-300 dark:bg-primary-600 dark:enabled:hover:bg-primary-700 dark:focus:ring-primary-800',
      secondary:
        'border border-gray-300 bg-white text-gray-700 enabled:hover:bg-gray-100 focus:ring-4 focus:ring-gray-200 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:enabled:hover:bg-gray-700 dark:focus:ring-gray-700',
      danger:
        'border border-transparent bg-red-600 text-white enabled:hover:bg-red-700 focus:ring-4 focus:ring-red-200 dark:focus:ring-red-900',
    },
  },
  textInput: {
    field: {
      input: {
        colors: { gray: field },
      },
    },
  },
  select: {
    field: {
      select: {
        colors: { gray: field },
      },
    },
  },
  textarea: {
    colors: { gray: field },
  },
  checkbox: {
    root: {
      color: {
        default: 'text-primary-600 focus:ring-primary-500 dark:ring-offset-gray-800 dark:focus:ring-primary-600',
      },
    },
  },
  toggleSwitch: {
    toggle: {
      checked: {
        color: {
          primary: 'border-primary-600 bg-primary-600',
        },
      },
    },
  },
  // Full screen on phones, centered dialog from the sm breakpoint up.
  modal: {
    content: {
      base: 'relative h-full w-full sm:h-auto sm:p-4',
      inner:
        'relative flex h-[100dvh] flex-col bg-white shadow-xl dark:bg-gray-800 sm:h-auto sm:max-h-[90dvh] sm:rounded-xl',
    },
    header: {
      base: 'flex items-start justify-between border-b border-gray-100 px-5 py-4 dark:border-gray-700',
      title: 'text-lg font-semibold text-gray-900 dark:text-white',
    },
    body: {
      base: 'flex-1 overflow-auto px-5 py-5',
    },
    footer: {
      base: 'flex items-center gap-2 border-t border-gray-100 px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] dark:border-gray-700',
    },
  },
  dropdown: {
    floating: {
      base: 'z-50 w-fit divide-y divide-gray-100 rounded-lg shadow-lg focus:outline-none dark:divide-gray-700',
      item: {
        base: 'flex w-full cursor-pointer items-center justify-start px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-100 focus:bg-gray-100 focus:outline-none dark:text-gray-200 dark:hover:bg-gray-600 dark:hover:text-white dark:focus:bg-gray-600 dark:focus:text-white',
      },
    },
  },
  spinner: {
    color: {
      info: 'fill-primary-600',
    },
  },
};
