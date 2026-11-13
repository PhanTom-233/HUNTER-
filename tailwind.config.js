/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: ['selector', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        bg: 'var(--bg)',
        panel: 'var(--panel)',
        card: 'var(--card)',
        line: 'var(--line)',
        line2: 'var(--line2)',
        txt: 'var(--txt)',
        strong: 'var(--strong)',
        dim: 'var(--dim)',
        blue: 'var(--blue)',
        cyan: 'var(--cyan)',
        amber: 'var(--amber)',
        red: 'var(--red)',
        green: 'var(--green)',
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Cascadia Code', 'Consolas', 'Microsoft YaHei', 'monospace'],
      },
      borderRadius: {
        base: '5px',
      },
    },
  },
  plugins: [],
};
