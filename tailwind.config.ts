import type { Config } from 'tailwindcss';

const withOpacityValue = (variable: string) =>
  ({ opacityValue }: { opacityValue?: string }) =>
    opacityValue === undefined
      ? `rgb(var(${variable}))`
      : `rgb(var(${variable}) / ${opacityValue})`;

const config: Config = {
  darkMode: ['class'],
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
        extend: {
                fontFamily: {
                        sans: ['Inter', 'system-ui', 'sans-serif'],
                },
                backgroundImage: {
                        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
                        'gradient-conic': 'conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))'
                },
  		borderRadius: {
  			lg: 'var(--radius)',
  			md: 'calc(var(--radius) - 2px)',
  			sm: 'calc(var(--radius) - 4px)'
  		},
                colors: {
                        background: 'hsl(var(--background))',
                        foreground: 'hsl(var(--foreground))',
  			card: {
  				DEFAULT: 'hsl(var(--card))',
  				foreground: 'hsl(var(--card-foreground))'
  			},
  			popover: {
  				DEFAULT: 'hsl(var(--popover))',
  				foreground: 'hsl(var(--popover-foreground))'
  			},
  			primary: {
  				DEFAULT: 'hsl(var(--primary))',
  				foreground: 'hsl(var(--primary-foreground))'
  			},
  			secondary: {
  				DEFAULT: 'hsl(var(--secondary))',
  				foreground: 'hsl(var(--secondary-foreground))'
  			},
  			muted: {
  				DEFAULT: 'hsl(var(--muted))',
  				foreground: 'hsl(var(--muted-foreground))'
  			},
  			accent: {
  				DEFAULT: 'hsl(var(--accent))',
  				foreground: 'hsl(var(--accent-foreground))'
  			},
  			destructive: {
  				DEFAULT: 'hsl(var(--destructive))',
  				foreground: 'hsl(var(--destructive-foreground))'
  			},
  			border: 'hsl(var(--border))',
  			input: 'hsl(var(--input))',
  			ring: 'hsl(var(--ring))',
  			chart: {
  				'1': 'hsl(var(--chart-1))',
  				'2': 'hsl(var(--chart-2))',
  				'3': 'hsl(var(--chart-3))',
  				'4': 'hsl(var(--chart-4))',
  				'5': 'hsl(var(--chart-5))'
  			},
                        sidebar: {
                                DEFAULT: 'hsl(var(--sidebar-background))',
                                foreground: 'hsl(var(--sidebar-foreground))',
                                primary: 'hsl(var(--sidebar-primary))',
                                'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
                                accent: 'hsl(var(--sidebar-accent))',
                                'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
                                border: 'hsl(var(--sidebar-border))',
                                ring: 'hsl(var(--sidebar-ring))'
                        },
                        slate: {
                                50: withOpacityValue('--color-slate-50-rgb'),
                                100: withOpacityValue('--color-slate-100-rgb'),
                                200: withOpacityValue('--color-slate-200-rgb'),
                                300: withOpacityValue('--color-slate-300-rgb'),
                                400: withOpacityValue('--color-slate-400-rgb'),
                                500: withOpacityValue('--color-slate-500-rgb'),
                                600: withOpacityValue('--color-slate-600-rgb'),
                                700: withOpacityValue('--color-slate-700-rgb'),
                                800: withOpacityValue('--color-slate-800-rgb'),
                                900: withOpacityValue('--color-slate-900-rgb')
                        },
                        blue: {
                                50: withOpacityValue('--color-blue-50-rgb'),
                                100: withOpacityValue('--color-blue-100-rgb'),
                                200: withOpacityValue('--color-blue-200-rgb'),
                                400: withOpacityValue('--color-blue-400-rgb'),
                                500: withOpacityValue('--color-blue-500-rgb'),
                                600: withOpacityValue('--color-blue-600-rgb'),
                                700: withOpacityValue('--color-blue-700-rgb')
                        },
                        emerald: {
                                50: withOpacityValue('--color-emerald-50-rgb'),
                                100: withOpacityValue('--color-emerald-100-rgb'),
                                400: withOpacityValue('--color-emerald-400-rgb'),
                                500: withOpacityValue('--color-emerald-500-rgb'),
                                600: withOpacityValue('--color-emerald-600-rgb'),
                                700: withOpacityValue('--color-emerald-700-rgb')
                        },
                        rose: {
                                50: withOpacityValue('--color-rose-50-rgb'),
                                400: withOpacityValue('--color-rose-400-rgb'),
                                500: withOpacityValue('--color-rose-500-rgb'),
                                600: withOpacityValue('--color-rose-600-rgb'),
                                700: withOpacityValue('--color-rose-700-rgb')
                        },
                        red: {
                                50: withOpacityValue('--color-red-50-rgb'),
                                300: withOpacityValue('--color-red-300-rgb'),
                                500: withOpacityValue('--color-red-500-rgb'),
                                600: withOpacityValue('--color-red-600-rgb'),
                                700: withOpacityValue('--color-red-700-rgb')
                        },
                        gray: {
                                400: withOpacityValue('--color-gray-400-rgb'),
                                500: withOpacityValue('--color-gray-500-rgb'),
                                600: withOpacityValue('--color-gray-600-rgb'),
                                700: withOpacityValue('--color-gray-700-rgb'),
                                900: withOpacityValue('--color-gray-900-rgb')
                        },
                        amber: {
                                500: withOpacityValue('--color-amber-500-rgb'),
                                600: withOpacityValue('--color-amber-600-rgb')
                        },
                        sky: {
                                600: withOpacityValue('--color-sky-600-rgb'),
                                700: withOpacityValue('--color-sky-700-rgb')
                        },
                        indigo: {
                                500: withOpacityValue('--color-indigo-500-rgb'),
                                600: withOpacityValue('--color-indigo-600-rgb'),
                                700: withOpacityValue('--color-indigo-700-rgb')
                        },
                        white: withOpacityValue('--color-white-rgb'),
                        black: withOpacityValue('--color-black-rgb')
                },
  		keyframes: {
  			'accordion-down': {
  				from: {
  					height: '0'
  				},
  				to: {
  					height: 'var(--radix-accordion-content-height)'
  				}
  			},
  			'accordion-up': {
  				from: {
  					height: 'var(--radix-accordion-content-height)'
  				},
  				to: {
  					height: '0'
  				}
  			}
  		},
  		animation: {
  			'accordion-down': 'accordion-down 0.2s ease-out',
  			'accordion-up': 'accordion-up 0.2s ease-out'
  		}
  	}
  },
  plugins: [require('tailwindcss-animate')],
};
export default config;
