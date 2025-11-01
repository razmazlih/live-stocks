import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './hooks/**/*.{js,ts,jsx,tsx}',
    './lib/**/*.{js,ts,jsx,tsx}',
    './types/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-conic':
          'conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))',
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      colors: {
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        slate: {
          50: 'hsl(var(--color-slate-50-hsl))',
          100: 'hsl(var(--color-slate-100-hsl))',
          200: 'hsl(var(--color-slate-200-hsl))',
          300: 'hsl(var(--color-slate-300-hsl))',
          400: 'hsl(var(--color-slate-400-hsl))',
          500: 'hsl(var(--color-slate-500-hsl))',
          600: 'hsl(var(--color-slate-600-hsl))',
          700: 'hsl(var(--color-slate-700-hsl))',
          800: 'hsl(var(--color-slate-800-hsl))',
          900: 'hsl(var(--color-slate-900-hsl))',
        },
        blue: {
          50: 'hsl(var(--color-blue-50-hsl))',
          100: 'hsl(var(--color-blue-100-hsl))',
          200: 'hsl(var(--color-blue-200-hsl))',
          300: 'hsl(var(--color-blue-300-hsl))',
          400: 'hsl(var(--color-blue-400-hsl))',
          500: 'hsl(var(--color-blue-500-hsl))',
          600: 'hsl(var(--color-blue-600-hsl))',
          700: 'hsl(var(--color-blue-700-hsl))',
        },
        emerald: {
          50: 'hsl(var(--color-emerald-50-hsl))',
          100: 'hsl(var(--color-emerald-100-hsl))',
          200: 'hsl(var(--color-emerald-200-hsl))',
          400: 'hsl(var(--color-emerald-400-hsl))',
          500: 'hsl(var(--color-emerald-500-hsl))',
          600: 'hsl(var(--color-emerald-600-hsl))',
          700: 'hsl(var(--color-emerald-700-hsl))',
        },
        rose: {
          50: 'hsl(var(--color-rose-50-hsl))',
          100: 'hsl(var(--color-rose-100-hsl))',
          200: 'hsl(var(--color-rose-200-hsl))',
          400: 'hsl(var(--color-rose-400-hsl))',
          500: 'hsl(var(--color-rose-500-hsl))',
          600: 'hsl(var(--color-rose-600-hsl))',
          700: 'hsl(var(--color-rose-700-hsl))',
        },
        amber: {
          200: 'hsl(var(--color-amber-200-hsl))',
          300: 'hsl(var(--color-amber-300-hsl))',
          500: 'hsl(var(--color-amber-500-hsl))',
          600: 'hsl(var(--color-amber-600-hsl))',
        },
        red: {
          50: 'hsl(var(--color-red-50-hsl))',
          200: 'hsl(var(--color-red-200-hsl))',
          300: 'hsl(var(--color-red-300-hsl))',
          400: 'hsl(var(--color-red-400-hsl))',
          500: 'hsl(var(--color-red-500-hsl))',
          600: 'hsl(var(--color-red-600-hsl))',
          700: 'hsl(var(--color-red-700-hsl))',
        },
        primaryPalette: {
          500: 'hsl(var(--color-primary-500-hsl))',
          600: 'hsl(var(--color-primary-600-hsl))',
          700: 'hsl(var(--color-primary-700-hsl))',
        },
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
