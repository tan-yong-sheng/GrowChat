/**
 * Form validation utility for auth forms
 * Can be used in tests or in the real app
 */
export function updateSubmitButtonState(form, submitBtn, isSubmitting = false) {
  if (!form || !submitBtn) return;
  const isValid = form.checkValidity();
  submitBtn.disabled = !isValid || isSubmitting;
}

function fieldErrorId(field) {
  return `${field.id || field.name}-error`;
}

function getValidationMessage(field) {
  if (field.validity.valueMissing) {
    return `${field.placeholder || field.name || 'This field'} is required`;
  }
  if (field.validity.typeMismatch) {
    return field.type === 'email'
      ? 'Please enter a valid email address'
      : `Please enter a valid ${field.type}`;
  }
  if (field.validity.tooShort) {
    return `Minimum ${field.minLength} characters required`;
  }
  if (field.validity.tooLong) {
    return `Maximum ${field.maxLength} characters allowed`;
  }
  if (field.validity.patternMismatch) {
    return 'Please enter a valid value';
  }
  return '';
}

function ensureErrorContainer(form, field, errorId) {
  let container = form.querySelector(`#${errorId}`);
  if (!container) {
    container = document.createElement('div');
    container.id = errorId;
    container.className = 'mt-1 text-sm text-red-600';
    field.parentNode.insertBefore(container, field.nextSibling);
  }
  return container;
}

function showFieldError(form, field, message) {
  const errorId = fieldErrorId(field);
  const errorContainer = ensureErrorContainer(form, field, errorId);

  errorContainer.textContent = message;
  errorContainer.style.display = 'block';

  field.setAttribute('aria-invalid', 'true');
  field.setAttribute('aria-describedby', errorId);
  field.classList.add('border-red-500', 'focus:ring-red-500');
}

function hideFieldError(form, field) {
  const errorId = fieldErrorId(field);
  const errorContainer = form.querySelector(`#${errorId}`);

  if (errorContainer) {
    errorContainer.style.display = 'none';
  }
  field.setAttribute('aria-invalid', 'false');
  field.removeAttribute('aria-describedby');
  field.classList.remove('border-red-500', 'focus:ring-red-500');
}

/**
 * Display validation errors for form fields with ARIA attributes
 */
export function displayFieldErrors(form) {
  if (!form) return;

  const fields = form.querySelectorAll('input, textarea, select');
  fields.forEach((field) => {
    const message = getValidationMessage(field);
    if (message) showFieldError(form, field, message);
    else hideFieldError(form, field);
  });
}

/**
 * Clear all validation errors from form
 */
export function clearFormErrors(form) {
  if (!form) return;

  const fields = form.querySelectorAll('input, textarea, select');
  fields.forEach((field) => hideFieldError(form, field));
}
