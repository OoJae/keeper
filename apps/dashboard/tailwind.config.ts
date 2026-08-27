import type { Config } from 'tailwindcss';

export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Warmth ratings come from the Mind, so they get first-class names here rather
        // than being picked at each call site.
        warm: '#f59e0b',
        steady: '#38bdf8',
        cooling: '#a78bfa',
        at_risk: '#f43f5e',
      },
      fontFamily: {
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
    },
  },
  plugins: [],
} satisfies Config;
