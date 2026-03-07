export async function createUserProfileFooter() {
  const footer = document.createElement('div');
  footer.className = 'p-3 text-xs text-gray-400';
  footer.textContent = 'GrowChat';
  return footer;
}
