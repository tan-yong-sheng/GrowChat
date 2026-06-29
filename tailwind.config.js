/** @type {import('tailwindcss').Config} */
export default {
  content: ['./public/**/*.{html,js}'],
  safelist: [
    'bg-emerald-500',
    'border-emerald-500',
    'opacity-50',
    'cursor-not-allowed',
    'pointer-events-none',
    'bg-gray-100',
    'text-gray-400',
    'rounded-lg',
    'border',
    'border-red-200',
    'bg-red-50',
    'px-3',
    'py-2',
    'text-sm',
    'text-red-600',
    'border-green-200',
    'bg-green-50',
    'text-green-600',
    'border-orange-200',
    'bg-orange-50',
    'text-orange-600',
    'border-blue-200',
    'bg-blue-50',
    'text-blue-600',
    'form-error',
    'form-success',
    'form-warning',
    'form-info',
    'btn-disabled',
    'input-disabled',
    'text-status-error',
    'text-status-success',
    'text-status-warning',
    'text-status-info',
    'scrollbar-thin-auto',
    'scrollbar-hidden',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        primary: ['Inter', 'sans-serif'],
        display: ['Archivo', 'sans-serif'],
        mono: [
          'ui-monospace',
          'SFMono-Regular',
          'Menlo',
          'Monaco',
          'Consolas',
          'Liberation Mono',
          'monospace',
        ],
      },
      colors: {
        // Design tokens — sourced from DESIGN.md (run `npx @google/design.md lint DESIGN.md`)
        // NOTE: `neutral` is namespaced as `neutral-bg` to avoid conflict
        //       with Tailwind's built-in `neutral-*` grey scale.
        primary: '#171717',
        'primary-hover': '#262626',
        secondary: '#737373',
        tertiary: '#525252',
        'neutral-bg': '#fafafa',
        surface: '#ffffff',
        'surface-container': '#f5f5f5',
        'on-surface': '#171717',
        'on-surface-variant': '#404040',
        outline: '#e5e5e5',
        'outline-variant': '#f3f4f6',
        error: '#dc2626',
        success: '#16a34a',
        warning: '#ea580c',
        info: '#0284c7',
        // Legacy status aliases (for backward compat during migration)
        status: {
          error: '#dc2626',
          success: '#16a34a',
          warning: '#ea580c',
          info: '#0284c7',
        },
      },
      borderRadius: {
        // Override Tailwind defaults to match DESIGN.md spec
        sm: '6px',
        md: '12px',
        lg: '16px',
        xl: '12px', // alias for md — migration helper
        '2xl': '16px', // alias for lg — migration helper
        '3xl': '16px', // alias for lg — migration helper
      },
      fontSize: {
        'label-sm': ['11px', { lineHeight: '1.4', fontWeight: '500' }],
        'label-xs': ['9px', { lineHeight: '1.4', fontWeight: '500' }],
        'body-lg': ['16px', { lineHeight: '1.5', fontWeight: '400' }],
        'body-md': ['14px', { lineHeight: '1.5', fontWeight: '400' }],
        'body-sm': ['12px', { lineHeight: '1.5', fontWeight: '400' }],
      },
    },
  },
  plugins: [
    function ({ addBase, addComponents, theme }) {
      addBase({
        'button:disabled': {
          opacity: '0.5',
          cursor: 'not-allowed',
          pointerEvents: 'none',
        },
        'input:disabled': {
          backgroundColor: '#f3f4f6',
          color: '#9ca3af',
          cursor: 'not-allowed',
        },
        'select:disabled': {
          backgroundColor: '#f3f4f6',
          color: '#9ca3af',
          cursor: 'not-allowed',
        },
        'textarea:disabled': {
          backgroundColor: '#f3f4f6',
          color: '#9ca3af',
          cursor: 'not-allowed',
        },
      });

      addComponents({
        '.form-error': {
          borderRadius: theme('borderRadius.lg'),
          borderWidth: '1px',
          borderColor: 'rgb(220, 38, 38)',
          backgroundColor: 'rgb(254, 242, 242)',
          paddingLeft: '0.75rem',
          paddingRight: '0.75rem',
          paddingTop: '0.5rem',
          paddingBottom: '0.5rem',
          fontSize: '0.875rem',
          color: 'rgb(220, 38, 38)',
        },
        '.form-success': {
          borderRadius: theme('borderRadius.lg'),
          borderWidth: '1px',
          borderColor: 'rgb(34, 197, 94)',
          backgroundColor: 'rgb(240, 253, 244)',
          paddingLeft: '0.75rem',
          paddingRight: '0.75rem',
          paddingTop: '0.5rem',
          paddingBottom: '0.5rem',
          fontSize: '0.875rem',
          color: 'rgb(34, 197, 94)',
        },
        '.form-warning': {
          borderRadius: theme('borderRadius.lg'),
          borderWidth: '1px',
          borderColor: 'rgb(251, 146, 60)',
          backgroundColor: 'rgb(255, 247, 237)',
          paddingLeft: '0.75rem',
          paddingRight: '0.75rem',
          paddingTop: '0.5rem',
          paddingBottom: '0.5rem',
          fontSize: '0.875rem',
          color: 'rgb(251, 146, 60)',
        },
        '.form-info': {
          borderRadius: theme('borderRadius.lg'),
          borderWidth: '1px',
          borderColor: 'rgb(3, 105, 161)',
          backgroundColor: 'rgb(240, 249, 255)',
          paddingLeft: '0.75rem',
          paddingRight: '0.75rem',
          paddingTop: '0.5rem',
          paddingBottom: '0.5rem',
          fontSize: '0.875rem',
          color: 'rgb(3, 105, 161)',
        },
        '.scrollbar-thin-auto': {
          scrollbarWidth: 'thin',
          scrollbarColor: 'rgba(156, 163, 175, 0.4) transparent',
          '&::-webkit-scrollbar': {
            width: '5px',
            height: '5px',
          },
          '&::-webkit-scrollbar-track': {
            background: 'transparent',
          },
          '&::-webkit-scrollbar-thumb': {
            background: 'rgba(156, 163, 175, 0.3)',
            borderRadius: '9999px',
          },
          '&:hover::-webkit-scrollbar-thumb, &::-webkit-scrollbar-thumb:hover': {
            background: 'rgba(156, 163, 175, 0.5)',
          },
        },
        '.scrollbar-hidden': {
          scrollbarWidth: 'none',
          '&::-webkit-scrollbar': {
            display: 'none',
          },
        },
      });
    },
  ],
};
