/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: [
    './pages/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './app/**/*.{ts,tsx}',
    './src/**/*.{ts,tsx}',
  ],
  safelist: ['w-6', 'w-7', 'w-8', 'w-9', 'w-10', 'w-11', 'w-12'],
  theme: {
    extend: {
      screens: {
        desktop: '936px',
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif', 'system-ui'],
        mono: ['JetBrains Mono', 'monospace'],
        'dm-sans': ['DM Sans', 'sans-serif'],
        'kumbh-sans': ['Kumbh Sans', 'sans-serif'],
      },
      colors: {
        'pierre-bg-dark': '#191A1A',
        // Pierre's signature dark theme colors
        'pierre-background-light': '#F1F1F1',
        'pierre-bg-secondary-dark': '#212121',
        'pierre-bg-light': '#E5E5E3',
        'pierre-bg-secondary-light': '#ECECEB',
        'pierre-blue': '#00A6FF',
        'pierre-text-primary': '#E5E5E5',
        'pierre-text-secondary': '#949494',
        'pierre-text-tertiary': '#676767',
        'secondary-tan': '#E5E5E3',
        'background-color': '#191A1A',
        'pierre-neutral-100': '#D7D7D7',
        'pierre-neutral-200': '#ADADAD',
        'pierre-neutral-700': '#3B3B3B',
        'pierre-neutral-900': '#171818',
        'white-16%': 'rgba(255,255,255,0.16)',
        'white-700': '#D7D7D7',
        'white-500': '#949494',
        'pierre-background-1': '#212121',
        'pierre-background-2': '#191A1A',
        'pierre-neutral-950': '#111111',
        'pierre-neutral-900': '#171818',
        'pierre-neutral-800': '#2D2D2D',
        'pierre-neutral-700': '#3B3B3B',
        'pierre-neutral-500': '#5A5A5A',
        'pierre-neutral-400': '#676767',
        'pierre-neutral-300': '#949494',
        'pierre-neutral-200': '#ADADAD',
        'pierre-neutral-100': '#D7D7D7',
        'pierre-neutral-50': '#E5E5E5',
        'pierre-neutral-10': '#F2F2F2',
        'pierre-neutral-0': '#F6F6F6',
        pink: '#00A6FF',
        'sidebar-color': '#212121',
        'bg-gray': 'rgba(29, 29, 29)',
        background: 'oklch(var(--background))',
        foreground: 'oklch(var(--foreground))',
        card: {
          DEFAULT: 'oklch(var(--card))',
          foreground: 'oklch(var(--card-foreground))',
        },
        popover: {
          DEFAULT: 'oklch(var(--popover))',
          foreground: 'oklch(var(--popover-foreground))',
        },
        primary: {
          DEFAULT: 'oklch(var(--primary))',
          foreground: 'oklch(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'oklch(var(--secondary))',
          foreground: 'oklch(var(--secondary-foreground))',
        },
        muted: {
          DEFAULT: 'oklch(var(--muted))',
          foreground: 'oklch(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'oklch(var(--accent))',
          foreground: 'oklch(var(--accent-foreground))',
        },
        destructive: {
          DEFAULT: 'oklch(var(--destructive))',
          foreground: 'oklch(var(--destructive-foreground))',
        },
        border: 'oklch(var(--border))',
        input: 'oklch(var(--input))',
        ring: 'oklch(var(--ring))',
        chart: {
          1: 'oklch(var(--chart-1))',
          2: 'oklch(var(--chart-2))',
          3: 'oklch(var(--chart-3))',
          4: 'oklch(var(--chart-4))',
          5: 'oklch(var(--chart-5))',
        },
      },
      keyframes: {
        'accordion-down': {
          from: {
            height: '0',
          },
          to: {
            height: 'var(--radix-accordion-content-height)',
          },
        },
        'accordion-up': {
          from: {
            height: 'var(--radix-accordion-content-height)',
          },
          to: {
            height: '0',
          },
        },
        'dot-bounce-1': {
          '0%, 80%, 100%': { transform: 'translateY(0)' },
          '40%': { transform: 'translateY(-8px)' },
        },
        'dot-bounce-2': {
          '0%, 20%, 100%': { transform: 'translateY(0)' },
          '60%': { transform: 'translateY(-8px)' },
        },
        'dot-bounce-3': {
          '0%, 40%, 100%': { transform: 'translateY(0)' },
          '80%': { transform: 'translateY(-8px)' },
        },
        'pulse-slow': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.6' },
        },
        shake: {
          '0%, 100%': { transform: 'translateX(0)' },
          '10%, 30%, 50%, 70%, 90%': { transform: 'translateX(-4px)' },
          '20%, 40%, 60%, 80%': { transform: 'translateX(4px)' },
        },
        breathing: {
          '0%, 100%': { transform: 'scale(1)', opacity: '0.8' },
          '50%': { transform: 'scale(1.05)', opacity: '1' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        'dot-bounce-1': 'dot-bounce-1 1.0s infinite ease-in-out',
        'dot-bounce-2': 'dot-bounce-2 1.0s infinite ease-in-out',
        'dot-bounce-3': 'dot-bounce-3 1.0s infinite ease-in-out',
        'pulse-slow': 'pulse-slow 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        shake: 'shake 0.5s ease-in-out',
        breathing: 'breathing 4s ease-in-out infinite',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};
