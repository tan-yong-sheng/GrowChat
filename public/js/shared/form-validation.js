/**
 * Form validation utility for auth forms
 * Can be used in tests or in the real app
 */
export function updateSubmitButtonState(form, submitBtn, isSubmitting = false) {
  if (!form || !submitBtn) return;
  const isValid = form.checkValidity();
  submitBtn.disabled = !isValid || isSubmitting;
}

/**
 * Display validation errors for form fields with ARIA attributes
 */
export function displayFieldErrors(form) {
  if (!form) return;

  const fields = form.querySelectorAll('input, textarea, select');
  fields.forEach((field) => {
    const errorId = `${field.id || field.name}-error`;
    let errorContainer = form.querySelector(`#${errorId}`);

    if (!field.validity.valid) {
      // Create error container if it doesn't exist
      if (!errorContainer) {
        errorContainer = document.createElement('div');
        errorContainer.id = errorId;
        errorContainer.className = 'mt-1 text-sm text-red-600';
        field.parentNode.insertBefore(errorContainer, field.nextSibling);
      }

      // Set error message based on validation state
      let message = '';
      if (field.validity.valueMissing) {
        message = `${field.placeholder || field.name || 'This field'} is required`;
      } else if (field.validity.typeMismatch) {
        if (field.type === 'email') {
          message = 'Please enter a valid email address';
        } else {
          message = `Please enter a valid ${field.type}`;
        }
      } else if (field.validity.tooShort) {
        message = `Minimum ${field.minLength} characters required`;
      } else if (field.validity.tooLong) {
        message = `Maximum ${field.maxLength} characters allowed`;
      } else if (field.validity.patternMismatch) {
        message = 'Please enter a valid value';
      }

      errorContainer.textContent = message;
      errorContainer.style.display = 'block';

      // Set ARIA attributes
      field.setAttribute('aria-invalid', 'true');
      field.setAttribute('aria-describedby', errorId);
      field.classList.add('border-red-500', 'focus:ring-red-500');
    } else {
      // Clear error state
      if (errorContainer) {
        errorContainer.style.display = 'none';
      }
      field.setAttribute('aria-invalid', 'false');
      field.removeAttribute('aria-describedby');
      field.classList.remove('border-red-500', 'focus:ring-red-500');
    }
  });
}

/**
 * Clear all validation errors from form
 */
export function clearFormErrors(form) {
  if (!form) return;

  const fields = form.querySelectorAll('input, textarea, select');
  fields.forEach((field) => {
    const errorId = `${field.id || field.name}-error`;
    const errorContainer = form.querySelector(`#${errorId}`);

    if (errorContainer) {
      errorContainer.style.display = 'none';
    }
    field.setAttribute('aria-invalid', 'false');
    field.removeAttribute('aria-describedby');
    field.classList.remove('border-red-500', 'focus:ring-red-500');
  });
}
