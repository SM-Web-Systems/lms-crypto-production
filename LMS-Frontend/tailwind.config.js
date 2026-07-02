/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // All custom colors reference CSS variables so dark-mode overrides work automatically.
        // Variables are defined as space-separated R G B so Tailwind opacity modifiers work
        // (e.g. bg-neutral-50/90 → rgb(var(--c-neutral-50) / 0.9)).
        primary: {
          DEFAULT: 'rgb(var(--c-primary) / <alpha-value>)',
          dark:    'rgb(var(--c-primary-dark) / <alpha-value>)',
          medium:  'rgb(var(--c-primary-medium) / <alpha-value>)',
          light:   'rgb(var(--c-primary-light) / <alpha-value>)',
          50:  'rgb(var(--c-primary-50)  / <alpha-value>)',
          100: 'rgb(var(--c-primary-100) / <alpha-value>)',
          200: 'rgb(var(--c-primary-200) / <alpha-value>)',
          300: 'rgb(var(--c-primary-300) / <alpha-value>)',
          400: 'rgb(var(--c-primary-400) / <alpha-value>)',
          500: 'rgb(var(--c-primary-500) / <alpha-value>)',
          600: 'rgb(var(--c-primary-600) / <alpha-value>)',
          700: 'rgb(var(--c-primary-700) / <alpha-value>)',
          800: 'rgb(var(--c-primary-800) / <alpha-value>)',
          900: 'rgb(var(--c-primary-900) / <alpha-value>)',
        },
        accent: {
          teal:       'rgb(var(--c-accent-teal) / <alpha-value>)',
          'teal-hover': 'rgb(var(--c-accent-teal-hover) / <alpha-value>)',
        },
        neutral: {
          50:  'rgb(var(--c-neutral-50)  / <alpha-value>)',
          100: 'rgb(var(--c-neutral-100) / <alpha-value>)',
          200: 'rgb(var(--c-neutral-200) / <alpha-value>)',
          300: 'rgb(var(--c-neutral-300) / <alpha-value>)',
          400: 'rgb(var(--c-neutral-400) / <alpha-value>)',
          500: 'rgb(var(--c-neutral-500) / <alpha-value>)',
          600: 'rgb(var(--c-neutral-600) / <alpha-value>)',
          700: 'rgb(var(--c-neutral-700) / <alpha-value>)',
          800: 'rgb(var(--c-neutral-800) / <alpha-value>)',
          900: 'rgb(var(--c-neutral-900) / <alpha-value>)',
        },
        // gray aliases neutral for brand consistency
        gray: {
          50:  'rgb(var(--c-neutral-50)  / <alpha-value>)',
          100: 'rgb(var(--c-neutral-100) / <alpha-value>)',
          200: 'rgb(var(--c-neutral-200) / <alpha-value>)',
          300: 'rgb(var(--c-neutral-300) / <alpha-value>)',
          400: 'rgb(var(--c-neutral-400) / <alpha-value>)',
          500: 'rgb(var(--c-neutral-500) / <alpha-value>)',
          600: 'rgb(var(--c-neutral-600) / <alpha-value>)',
          700: 'rgb(var(--c-neutral-700) / <alpha-value>)',
          800: 'rgb(var(--c-neutral-800) / <alpha-value>)',
          900: 'rgb(var(--c-neutral-900) / <alpha-value>)',
        },
      },
      fontFamily: {
        sans: ['var(--font-geist-sans)', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['var(--font-geist-mono)', 'monospace'],
      },
      boxShadow: {
        'sm':    '0 1px 2px 0 rgb(0 0 0 / 0.05)',
        'card':  '0 1px 3px rgb(0 0 0 / 0.08), 0 1px 2px rgb(0 0 0 / 0.06)',
        'updraft':       '0 4px 24px rgb(15 26 31 / 0.06), 0 1px 3px rgb(15 26 31 / 0.04)',
        'updraft-hover': '0 12px 40px rgb(15 26 31 / 0.1), 0 4px 12px rgb(15 26 31 / 0.06)',
      },
      maxWidth: {
        '8xl': '88rem',
      },
      backgroundImage: {
        'grid-faint':
          'linear-gradient(to right, rgb(15 26 31 / 0.04) 1px, transparent 1px), linear-gradient(to bottom, rgb(15 26 31 / 0.04) 1px, transparent 1px)',
      },
      backgroundSize: {
        grid: '48px 48px',
      },
    },
  },
  plugins: [],
}
