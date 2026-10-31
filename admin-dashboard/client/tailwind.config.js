import colors from 'tailwindcss/colors';
import defaultTheme from 'tailwindcss/defaultTheme';
import flowbite from 'flowbite-react/tailwind';

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}', flowbite.content({ base: '../' })],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        gray: colors.slate,
        primary: colors.indigo,
      },
      fontFamily: {
        sans: ['"Inter Variable"', ...defaultTheme.fontFamily.sans],
      },
    },
  },
  plugins: [flowbite.plugin()],
};
