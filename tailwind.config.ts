import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-conic': 'conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))',
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      colors: {
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        chart: {
          '1': 'hsl(var(--chart-1))',
          '2': 'hsl(var(--chart-2))',
          '3': 'hsl(var(--chart-3))',
          '4': 'hsl(var(--chart-4))',
          '5': 'hsl(var(--chart-5))',
        },
        sidebar: {
          DEFAULT: 'hsl(var(--sidebar-background))',
          foreground: 'hsl(var(--sidebar-foreground))',
          primary: 'hsl(var(--sidebar-primary))',
          'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
          accent: 'hsl(var(--sidebar-accent))',
          'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
          border: 'hsl(var(--sidebar-border))',
          ring: 'hsl(var(--sidebar-ring))',
        },
        slate: {
          50: 'hsl(var(--color-slate-50))',
          100: 'hsl(var(--color-slate-100))',
          200: 'hsl(var(--color-slate-200))',
          300: 'hsl(var(--color-slate-300))',
          400: 'hsl(var(--color-slate-400))',
          500: 'hsl(var(--color-slate-500))',
          600: 'hsl(var(--color-slate-600))',
          700: 'hsl(var(--color-slate-700))',
          800: 'hsl(var(--color-slate-800))',
          900: 'hsl(var(--color-slate-900))',
        },
        gray: {
          400: 'hsl(var(--color-gray-400))',
          500: 'hsl(var(--color-gray-500))',
          600: 'hsl(var(--color-gray-600))',
          700: 'hsl(var(--color-gray-700))',
          900: 'hsl(var(--color-gray-900))',
        },
        blue: {
          50: 'hsl(var(--color-blue-50))',
          100: 'hsl(var(--color-blue-100))',
          200: 'hsl(var(--color-blue-200))',
          300: 'hsl(var(--color-blue-300))',
          400: 'hsl(var(--color-blue-400))',
          500: 'hsl(var(--color-blue-500))',
          600: 'hsl(var(--color-blue-600))',
          700: 'hsl(var(--color-blue-700))',
        },
        emerald: {
          50: 'hsl(var(--color-emerald-50))',
          100: 'hsl(var(--color-emerald-100))',
          200: 'hsl(var(--color-emerald-200))',
          400: 'hsl(var(--color-emerald-400))',
          500: 'hsl(var(--color-emerald-500))',
          600: 'hsl(var(--color-emerald-600))',
          700: 'hsl(var(--color-emerald-700))',
        },
        red: {
          50: 'hsl(var(--color-red-50))',
          200: 'hsl(var(--color-red-200))',
          300: 'hsl(var(--color-red-300))',
          400: 'hsl(var(--color-red-400))',
          450: 'hsl(var(--color-red-450))',
          500: 'hsl(var(--color-red-500))',
          600: 'hsl(var(--color-red-600))',
          700: 'hsl(var(--color-red-700))',
        },
        rose: {
          50: 'hsl(var(--color-rose-50))',
          100: 'hsl(var(--color-rose-100))',
          200: 'hsl(var(--color-rose-200))',
          400: 'hsl(var(--color-rose-400))',
          500: 'hsl(var(--color-rose-500))',
          600: 'hsl(var(--color-rose-600))',
          700: 'hsl(var(--color-rose-700))',
        },
        sky: {
          100: 'hsl(var(--color-sky-100))',
          500: 'hsl(var(--color-sky-500))',
          600: 'hsl(var(--color-sky-600))',
          700: 'hsl(var(--color-sky-700))',
        },
        amber: {
          200: 'hsl(var(--color-amber-200))',
          300: 'hsl(var(--color-amber-300))',
          500: 'hsl(var(--color-amber-500))',
          600: 'hsl(var(--color-amber-600))',
        },
        orange: {
          500: 'hsl(var(--color-orange-500))',
        },
        purple: {
          300: 'hsl(var(--color-purple-300))',
          400: 'hsl(var(--color-purple-400))',
          500: 'hsl(var(--color-purple-500))',
        },
        pink: {
          500: 'hsl(var(--color-pink-500))',
        },
        'hot-pink': {
          300: 'hsl(var(--color-hot-pink-300))',
          400: 'hsl(var(--color-hot-pink-400))',
          500: 'hsl(var(--color-hot-pink-500))',
          600: 'hsl(var(--color-hot-pink-600))',
        },
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};

export default config;
