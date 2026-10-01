/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['Cinzel', 'serif'],
        body: ['Outfit', 'sans-serif'],
      },
      colors: {
        ink: {
          900: '#070710',
          800: '#0d0d1a',
          700: '#141425',
          600: '#1c1c35',
          500: '#252545',
          400: '#33335a',
          300: '#4a4a70',
        },
        gold: {
          100: '#fff8e1',
          200: '#ffe9a8',
          300: '#f7d77a',
          400: '#e6b94e',
          500: '#c99a2e',
          600: '#a67d1e',
          700: '#7a5c14',
        },
        crimson: {
          400: '#ff5a6a',
          500: '#e63946',
          600: '#c1121f',
          700: '#9d0208',
          800: '#7a0206',
        },
        emerald: {
          400: '#34d399',
          500: '#10b981',
          600: '#059669',
          700: '#047857',
        },
        azure: {
          400: '#38bdf8',
          500: '#0ea5e9',
          600: '#0284c7',
        },
        violet: {
          400: '#a78bfa',
          500: '#8b5cf6',
          600: '#7c3aed',
        },
      },
      boxShadow: {
        card: '0 4px 20px rgba(0,0,0,0.6), 0 1px 3px rgba(0,0,0,0.4)',
        'card-hover': '0 8px 30px rgba(0,0,0,0.7), 0 2px 8px rgba(0,0,0,0.5)',
        glow: '0 0 24px rgba(230,185,78,0.35)',
        'glow-crimson': '0 0 24px rgba(230,57,70,0.45)',
        'glow-emerald': '0 0 24px rgba(16,185,129,0.45)',
        'glow-azure': '0 0 24px rgba(14,165,233,0.45)',
        'glow-violet': '0 0 24px rgba(139,92,246,0.45)',
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'slide-up': {
          '0%': { opacity: '0', transform: 'translateY(24px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'flip-in': {
          '0%': { transform: 'rotateY(90deg)', opacity: '0' },
          '100%': { transform: 'rotateY(0deg)', opacity: '1' },
        },
        'shake': {
          '0%,100%': { transform: 'translateX(0)' },
          '25%': { transform: 'translateX(-6px)' },
          '75%': { transform: 'translateX(6px)' },
        },
        'pulse-glow': {
          '0%,100%': { boxShadow: '0 0 16px rgba(230,185,78,0.3)' },
          '50%': { boxShadow: '0 0 28px rgba(230,185,78,0.6)' },
        },
        'burst': {
          '0%': { transform: 'scale(0.8)', opacity: '0' },
          '50%': { transform: 'scale(1.1)', opacity: '1' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.4s ease-out',
        'slide-up': 'slide-up 0.4s ease-out',
        'flip-in': 'flip-in 0.3s ease-out',
        'shake': 'shake 0.4s ease-in-out',
        'pulse-glow': 'pulse-glow 1.6s ease-in-out infinite',
        'burst': 'burst 0.35s ease-out',
      },
    },
  },
  plugins: [],
};
