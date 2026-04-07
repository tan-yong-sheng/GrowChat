export async function parseApiError(res, fallbackMessage) {
  let message = fallbackMessage;
  try {
    const payload = await res.json();
    message = payload?.details?.message || payload?.message || payload?.error || message;
  } catch {
    // Ignore parse failures and fall back to the provided message.
  }

  const err = new Error(message);
  err.status = res.status;
  throw err;
}

export async function readJsonResponse(res, fallbackMessage) {
  if (!res.ok) {
    return parseApiError(res, fallbackMessage);
  }
  return res.json();
}
