import { cn } from '../utils/cn.js';

function escapeHtml(value = '') {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function renderButton({
  label = '',
  type = 'button',
  variant = 'primary',
  className = '',
  disabled = false,
  ariaLabel = '',
  id = '',
  dataAttrs = {},
} = {}) {
  const baseClasses =
    'inline-flex items-center justify-center rounded-full border px-4 py-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed';

  const variants = {
    primary: 'bg-neutral-900 text-white border-neutral-900 hover:bg-black active:scale-95',
    secondary: 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50',
    ghost: 'border-transparent bg-transparent text-gray-600 hover:bg-gray-100',
  };

  const variantClass =
    variant === 'secondary'
      ? variants.secondary
      : variant === 'ghost'
        ? variants.ghost
        : variants.primary;
  const finalClass = cn(baseClasses, variantClass, className);
  const dataAttrEntries = Object.entries(dataAttrs || {})
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) =>
      value === '' ? `data-${key}` : `data-${key}="${escapeHtml(String(value))}"`
    );

  const attrs = [
    `type="${escapeHtml(type)}"`,
    id ? `id="${escapeHtml(id)}"` : '',
    disabled ? 'disabled aria-disabled="true"' : '',
    ariaLabel ? `aria-label="${escapeHtml(ariaLabel)}"` : '',
    ...dataAttrEntries,
  ]
    .filter(Boolean)
    .join(' ');

  return `
    <button ${attrs} class="${escapeHtml(finalClass)}">
      ${escapeHtml(label)}
    </button>
  `;
}
