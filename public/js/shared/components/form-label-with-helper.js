/**
 * Renders a form label with optional helper text
 * Used consistently across admin and account settings pages
 */
export function renderFormLabelWithHelper({
  label = '',
  helper = '',
  required = false,
  htmlFor = '',
} = {}) {
  return `
    <div class="block">
      <label ${htmlFor ? `for="${htmlFor}"` : ''} class="block">
        <div class="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">
          ${label}${required ? ' <span class="text-red-500">*</span>' : ''}
        </div>
        ${helper ? `<div class="text-[11px] text-gray-500 mb-2">${helper}</div>` : ''}
      </label>
    </div>
  `;
}

/**
 * Renders a form input field with label and helper text
 */
export function renderFormInput({
  name = '',
  label = '',
  helper = '',
  value = '',
  placeholder = '',
  type = 'text',
  required = false,
  disabled = false,
  className = '',
} = {}) {
  const inputClass = `w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm outline-none focus:ring-1 focus:ring-gray-300 ${disabled ? 'bg-gray-50 text-gray-500 cursor-not-allowed' : ''} ${className}`;

  return `
    <label class="block">
      <div class="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">
        ${label}${required ? ' <span class="text-red-500">*</span>' : ''}
      </div>
      ${helper ? `<div class="text-[11px] text-gray-500 mb-2">${helper}</div>` : ''}
      <input
        type="${type}"
        name="${name}"
        value="${value}"
        placeholder="${placeholder}"
        class="${inputClass}"
        ${required ? 'required' : ''}
        ${disabled ? 'disabled' : ''}
        autocomplete="off"
      />
    </label>
  `;
}

/**
 * Renders a form select field with label and helper text
 */
export function renderFormSelect({
  name = '',
  label = '',
  helper = '',
  value = '',
  options = [],
  required = false,
  disabled = false,
  className = '',
} = {}) {
  const selectClass = `w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm outline-none focus:ring-1 focus:ring-gray-300 ${disabled ? 'bg-gray-50 text-gray-500 cursor-not-allowed' : ''} ${className}`;

  return `
    <label class="block">
      <div class="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">
        ${label}${required ? ' <span class="text-red-500">*</span>' : ''}
      </div>
      ${helper ? `<div class="text-[11px] text-gray-500 mb-2">${helper}</div>` : ''}
      <select
        name="${name}"
        class="${selectClass}"
        ${required ? 'required' : ''}
        ${disabled ? 'disabled' : ''}
      >
        ${options.map(opt => `<option value="${opt.value}" ${value === opt.value ? 'selected' : ''}>${opt.label}</option>`).join('')}
      </select>
    </label>
  `;
}

/**
 * Renders a form textarea field with label and helper text
 */
export function renderFormTextarea({
  name = '',
  label = '',
  helper = '',
  value = '',
  placeholder = '',
  rows = 4,
  required = false,
  disabled = false,
  className = '',
} = {}) {
  const textareaClass = `w-full rounded-xl border border-gray-200 px-4 py-2.5 font-mono text-xs outline-none focus:ring-1 focus:ring-gray-300 ${disabled ? 'bg-gray-50 text-gray-500 cursor-not-allowed' : ''} ${className}`;

  return `
    <label class="block">
      <div class="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">
        ${label}${required ? ' <span class="text-red-500">*</span>' : ''}
      </div>
      ${helper ? `<div class="text-[11px] text-gray-500 mb-2">${helper}</div>` : ''}
      <textarea
        name="${name}"
        rows="${rows}"
        placeholder="${placeholder}"
        class="${textareaClass}"
        ${required ? 'required' : ''}
        ${disabled ? 'disabled' : ''}
      >${value}</textarea>
    </label>
  `;
}

/**
 * Renders a form checkbox field with label
 */
export function renderFormCheckbox({
  name = '',
  label = '',
  helper = '',
  checked = false,
  disabled = false,
} = {}) {
  return `
    <label class="flex items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
      <input
        type="checkbox"
        name="${name}"
        class="h-4 w-4 rounded border-gray-300 text-gray-900 focus:ring-gray-300"
        ${checked ? 'checked' : ''}
        ${disabled ? 'disabled' : ''}
      />
      <div class="flex-1">
        <span class="text-sm text-gray-700">${label}</span>
        ${helper ? `<div class="text-[11px] text-gray-500 mt-1">${helper}</div>` : ''}
      </div>
    </label>
  `;
}
