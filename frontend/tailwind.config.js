/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#0f1115',
        surface: '#161a22',
        border: '#262b36',
        accent: '#5b9dff',
      },
    },
  },
  plugins: [],
};
