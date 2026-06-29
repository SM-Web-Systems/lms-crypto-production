/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        // SM Web Systems brand palette (mirrors LMS-Frontend index.css tokens).
        primary: {
          DEFAULT: '#2d5a6b',
          dark: '#1b3a4b',
          medium: '#2d5a6b',
          light: '#4a7c8c',
          50: '#f0f9fb',
          100: '#e0f2f6',
          200: '#c8e6ee',
          300: '#a0d2dc',
          400: '#78b4c3',
          500: '#5a96aa',
          600: '#3d7a8c',
          700: '#2d5a6b',
          800: '#234655',
          900: '#1b3a4b',
        },
        accent: {
          teal: '#3d7a8c',
          'teal-hover': '#2d6a7c',
        },
        neutral: {
          50: '#f8fafb',
          100: '#f1f5f7',
          200: '#e5eaed',
          300: '#d1d9dd',
          400: '#9ba8ae',
          500: '#6b7b82',
          600: '#4a5a62',
          700: '#374952',
          800: '#1f2e35',
          900: '#0f1a1f',
        },
      },
    },
  },
  plugins: [],
};
