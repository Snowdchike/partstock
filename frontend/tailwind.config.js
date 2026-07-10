/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Warm paper palette — not the default Vercel/Linear blue-grey.
        paper: '#f5f1e8',       // page bg
        card: '#fbf8f1',        // surface
        rule: '#d8d0bf',        // hairlines
        ink: '#1c1a16',         // body text
        muted: '#6b6354',       // secondary
        accent: '#7c4a2a',      // muted terracotta — old-shop feel
        warn: '#a64a2a',
      },
      fontFamily: {
        serif: ['"Iowan Old Style"', '"Palatino Linotype"', 'Georgia', 'serif'],
        sans: ['-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'system-ui', 'sans-serif'],
        mono: ['"SF Mono"', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
};
