import { escapeHtml } from '../utils/dom-escape.js';
import { getModelAccessPresentation } from '../utils/model-access-presentation.js';

export function renderModelAccessBadge({
  label = '',
  className = 'border-gray-200 bg-gray-50 text-gray-600',
  modelId = '',
} = {}) {
  const modelAccessAttr = modelId ? ` data-model-access="${escapeHtml(modelId)}"` : '';
  return `
    <span${modelAccessAttr} class="inline-flex items-center rounded-full border px-2 py-0.5 text-label-sm font-semibold uppercase tracking-wide ${className}">
      ${escapeHtml(label)}
    </span>
  `;
}

export function renderModelAccessBadgeForModel(model = {}, options = {}) {
  const access = getModelAccessPresentation(model, options);
  return renderModelAccessBadge({
    label: access.label,
    className: access.className,
    modelId: model?.id,
  });
}
