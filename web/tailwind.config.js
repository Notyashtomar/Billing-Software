/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class', // This is important - 'class' based dark mode
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './src/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      /**
       * Additive responsive breakpoints. Tailwind's defaults (sm 640, md 768,
       * lg 1024, xl 1280, 2xl 1536) are preserved so the existing app does not
       * shift; we only add `xs` (small phones) and `3xl` (ultra-wide / 4K).
       */
      screens: {
        xs: '320px',
        '3xl': '1920px',
      },
      fontFamily: {
        sans: ['ui-sans-serif', 'system-ui', '-apple-system', '"Segoe UI"', 'Roboto', '"Helvetica Neue"', 'Arial', '"Noto Sans"', 'sans-serif'],
      },
      minHeight: {
        touch: '44px',
      },
      minWidth: {
        touch: '44px',
      },
      animation: {
        'bounce-slow': 'bounce 3s ease-in-out infinite',
        'ping-slow': 'ping 3s cubic-bezier(0, 0, 0.2, 1) infinite',
        'flap': 'flap 2s ease-in-out infinite',
        /** Dashboard cards: ambient emerald/amber glow pulses low → high. */
        'dash-card-glow': 'dash-card-glow 4s cubic-bezier(0.4, 0, 0.2, 1) infinite',
      },
      keyframes: {
        flap: {
          '0%, 100%': { transform: 'translateY(0px) translateX(-50%)' },
          '50%': { transform: 'translateY(-5px) translateX(-50%)' },
        },
        'dash-card-glow': {
          '0%, 100%': {
            boxShadow:
              '0 10px 22px -18px rgba(5, 150, 105, 0.28), 0 0 16px -12px rgba(16, 185, 129, 0.12), 0 0 24px -16px rgba(255, 184, 8, 0.06)',
          },
          '50%': {
            boxShadow:
              '0 12px 34px -12px rgba(5, 150, 105, 0.55), 0 0 44px -6px rgba(16, 185, 129, 0.36), 0 0 68px -10px rgba(255, 184, 8, 0.22), 0 0 88px -22px rgba(16, 185, 129, 0.1)',
          },
        },
      }
    },
  },
  plugins: [],
}