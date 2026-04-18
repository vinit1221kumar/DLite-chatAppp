/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: ['./src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'Segoe UI', 'sans-serif']
      },
      colors: {
        /** Semantic app surfaces — values from src/styles/globals.css */
        ui: {
          canvas: 'var(--ui-canvas)',
          shell: 'var(--ui-shell)',
          sidebar: 'var(--ui-sidebar)',
          panel: 'var(--ui-panel)',
          border: 'var(--ui-border)',
          muted: 'var(--ui-muted)',
          fg: 'var(--ui-fg)',
          'fg-muted': 'var(--ui-fg-muted)',
          'grad-from': 'var(--ui-grad-from)',
          'grad-to': 'var(--ui-grad-to)',
          'chat-active': 'var(--ui-chat-active-bg)',
          'chat-active-fg': 'var(--ui-chat-active-fg)',
          accent: 'var(--ui-accent)',
          'accent-hover': 'var(--ui-accent-hover)',
          'on-accent': 'var(--ui-on-accent)',
          'accent-subtle': 'var(--ui-accent-subtle)',
          'accent-text': 'var(--ui-accent-text)',
          'bubble-mine': 'var(--ui-bubble-mine)',
          'bubble-mine-border': 'var(--ui-bubble-mine-border)',
          'bubble-other': 'var(--ui-bubble-other)',
          'bubble-other-border': 'var(--ui-bubble-other-border)',
          thread: 'var(--ui-thread-bg)',
          composer: 'var(--ui-composer-bg)',
          'composer-pill': 'var(--ui-composer-pill)',
          rail: 'var(--ui-rail-bg)',
          'rail-active': 'var(--ui-rail-active)',
          'rail-fg': 'var(--ui-rail-fg)',
          'rail-fg-muted': 'var(--ui-rail-fg-muted)',
          row: 'var(--ui-row-selected)',
          'row-border': 'var(--ui-row-selected-border)',
          link: 'var(--ui-link)',
          poll: 'var(--ui-poll-bg)',
          'poll-bar': 'var(--ui-poll-bar)',
          'poll-muted': 'var(--ui-poll-muted)',
          pinned: 'var(--ui-pinned-bg)',
          'menu-hover': 'var(--ui-menu-hover)'
        },
        brand: {
          50: '#fffbeb',
          100: '#fef3c7',
          200: '#fde68a',
          300: '#fcd34d',
          400: '#fbbf24',
          500: '#f59e0b',
          600: '#d97706',
          700: '#b45309',
          800: '#92400e',
          900: '#78350f'
        },
        /** Dark theme: deep navy (easier on eyes at night than brown-amber) */
        navy: {
          50: '#e8eef9',
          100: '#d1dcf0',
          200: '#a3b8e0',
          300: '#7591d0',
          400: '#4a6bb8',
          500: '#3d5a96',
          600: '#2f4673',
          700: '#26395c',
          800: '#1c2d47',
          900: '#132238',
          950: '#0a1628'
        }
      }
    }
  },
  plugins: [require('tailwindcss-animate')]
};

