const SIDEBAR_DEFAULT_WIDTH = 260;

export function deriveSidebarLayout(currentState = {}) {
  const showSidebar = Boolean(currentState.showSidebar);
  const isMobile = Boolean(currentState.isMobile);
  const sidebarCollapsed = Boolean(currentState.sidebarCollapsed);
  const sidebarWidth = Number(currentState.sidebarWidth || SIDEBAR_DEFAULT_WIDTH);

  if (!showSidebar) {
    return {
      hidden: true,
      slim: false,
      width: '0px',
      minWidth: '0px',
      showHandle: false,
    };
  }

  if (isMobile) {
    return {
      hidden: false,
      slim: false,
      width: '260px',
      minWidth: '260px',
      showHandle: false,
    };
  }

  if (sidebarCollapsed) {
    return {
      hidden: false,
      slim: true,
      width: '68px',
      minWidth: '68px',
      showHandle: false,
    };
  }

  return {
    hidden: false,
    slim: false,
    width: `${sidebarWidth}px`,
    minWidth: `${sidebarWidth}px`,
    showHandle: true,
  };
}
