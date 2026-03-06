import { state, setState, subscribe } from '../store.js';

export function renderSidebar(aside, container) {
  let isResizing = false;
  let unsubscribe;
  let cleanupFn;

  function init() {
    // Create resize handle
    const handle = document.createElement('div');
    handle.id = 'sidebar-resize-handle';
    handle.className = 'absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-gray-300 transition-colors z-50 hidden md:block';
    aside.appendChild(handle);

    cleanupFn = wire(handle);
  }

  function wire(handle) {
    const onMouseDown = () => {
      isResizing = true;
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      handle.classList.add('bg-gray-400');
    };

    const onMouseMove = (e) => {
      if (!isResizing) return;
      const newWidth = Math.max(200, Math.min(window.innerWidth / 2, e.clientX));
      setState({ sidebarWidth: newWidth });
    };

    const onMouseUp = () => {
      if (!isResizing) return;
      isResizing = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      handle.classList.remove('bg-gray-400');
    };

    handle.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);

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

    return () => {
      handle.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      if (unsubscribe) unsubscribe();
    };
  }

  init();
  return () => {
    if (cleanupFn) cleanupFn();
  };
}
