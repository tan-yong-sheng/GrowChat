import { state, setState, subscribe } from '../store.js';

export function renderSidebar(aside, container) {
  let isResizing = false;
  let unsubscribe;

  function init() {
    // Create resize handle
    const handle = document.createElement('div');
    handle.id = 'sidebar-resize-handle';
    handle.className = 'absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-gray-300 transition-colors z-50 hidden md:block';
    aside.appendChild(handle);

    wire(handle);
  }

  function wire(handle) {
    handle.addEventListener('mousedown', (e) => {
      isResizing = true;
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    });

    document.addEventListener('mousemove', (e) => {
      if (!isResizing) return;
      const newWidth = Math.max(200, Math.min(window.innerWidth / 2, e.clientX));
      setState({ sidebarWidth: newWidth });
    });

    document.addEventListener('mouseup', () => {
      if (!isResizing) return;
      isResizing = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    });

    unsubscribe = subscribe((currentState) => {
      if (currentState.showSidebar && !currentState.isMobile) {
        aside.style.width = `${currentState.sidebarWidth}px`;
        aside.style.minWidth = `${currentState.sidebarWidth}px`;
      } else if (!currentState.showSidebar) {
        aside.style.width = '0px';
        aside.style.minWidth = '0px';
      } else if (currentState.isMobile) {
        aside.style.width = '260px';
        aside.style.minWidth = '260px';
      }
    });
  }

  init();
  return () => {
    if (unsubscribe) unsubscribe();
  };
}
