/**
 * Form validation utility for auth forms
 * Can be used in tests or in the real app
 */
export function updateSubmitButtonState(form, submitBtn, isSubmitting = false) {
  if (!form || !submitBtn) return;
  const isValid = form.checkValidity();
  submitBtn.disabled = !isValid || isSubmitting;
}
