export function getModelAccessPresentation(model = {}, options = {}) {
  const accessVariant = String(model?.access_variant || '')
    .trim()
    .toLowerCase();
  const accessLabelRaw = String(model?.access_label || '').trim();
  const accessLabel = accessLabelRaw.toLowerCase();

  if (accessVariant === 'personal' || accessLabel === 'personal') {
    return {
      label: 'Personal',
      className: 'border-emerald-100 bg-emerald-50 text-emerald-700',
    };
  }

  const sharedLabel = String(options?.sharedLabel || 'Shared').trim() || 'Shared';
  const sharedClassName =
    String(options?.sharedClassName || 'border-gray-200 bg-gray-50 text-gray-600').trim() ||
    'border-gray-200 bg-gray-50 text-gray-600';

  if (accessVariant === 'shared' || accessLabel === 'shared') {
    return {
      label: sharedLabel,
      className: sharedClassName,
    };
  }

  if (accessVariant === 'admin' || accessLabel === 'admin') {
    return {
      label: 'Admin',
      className: 'border-sky-100 bg-sky-50 text-sky-700',
    };
  }

  return {
    label: accessLabelRaw || 'Admin',
    className: 'border-sky-100 bg-sky-50 text-sky-700',
  };
}
