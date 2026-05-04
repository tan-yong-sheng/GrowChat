function clsxLike(...inputs) {
  return inputs.flat(Infinity).filter(Boolean).join(' ');
}

function twMergeLike(value) {
  return value;
}

/**
 * Merge Tailwind classes safely.
 * @param {...any} inputs
 * @returns {string}
 */
export function cn(...inputs) {
  return twMergeLike(clsxLike(...inputs));
}
