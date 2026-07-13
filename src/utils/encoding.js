/**
 * Convert an ArrayBuffer or ArrayBufferView into a lowercase hex string.
 *
 * @param {ArrayBuffer|ArrayBufferView} buffer
 * @returns {string}
 */
export function bufferToHex(buffer) {
  const view = ArrayBuffer.isView(buffer) ? buffer : new Uint8Array(buffer);
  return Array.from(view, (byte) => byte.toString(16).padStart(2, '0')).join('');
}
