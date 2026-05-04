export async function mountSidebarFooter(root, footerLike, { selector = '#sidebar-footer' } = {}) {
  const footer = await footerLike;
  if (!footer || !root) return footer;

  const footerMount = root.querySelector(selector);
  if (footerMount) {
    footerMount.replaceChildren(footer);
  } else {
    const sidebar = root.querySelector('#sidebar');
    if (sidebar) sidebar.appendChild(footer);
  }

  return footer;
}
