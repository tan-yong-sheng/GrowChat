import { state, setState, subscribe } from '../store.js';
import { deriveSidebarLayout } from './sidebar-helpers.js';

export function renderSidebar(aside) {
  let isResizing = false;
  let unsubscribe;
  let cleanupFn;

  function init() {
    // Create resize handle
    const handle = document.createElement('div');
    handle.id = 'sidebar-resize-handle';
    handle.className =
      'absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-gray-300 transition-colors z-50 hidden md:block';
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
      if (!isResizing || state.sidebarCollapsed) return;
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
      const layout = deriveSidebarLayout(currentState);
      if (layout.hidden) {
        aside.style.width = layout.width;
        aside.style.minWidth = layout.minWidth;
        aside.classList.add('-ml-[260px]');
        handle.classList.add('hidden');
      } else {
        aside.classList.remove('-ml-[260px]');
        aside.style.width = layout.width;
        aside.style.minWidth = layout.minWidth;
        handle.classList.toggle('hidden', !layout.showHandle);
        aside.classList.toggle('sidebar-slim', layout.slim);
      }

      // Toggle visibility of specific elements based on slim state
      const fullOnly = aside.querySelectorAll('.sidebar-full-only');
      const slimOnly = aside.querySelectorAll('.sidebar-collapsed-only');
      const footer = aside.querySelector('.user-profile-footer');

      const isSlim = layout.slim;

      if (footer) {
        if (isSlim) {
          footer.classList.add('flex', 'justify-center');
          footer.classList.remove('p-4');
          footer.classList.add('p-2');
        } else {
          footer.classList.remove('flex', 'justify-center');
          footer.classList.remove('p-2');
          footer.classList.add('p-4');
        }
      }

      fullOnly.forEach((el) => {
        if (isSlim) el.classList.add('hidden');
        else el.classList.remove('hidden');
      });

      slimOnly.forEach((el) => {
        if (isSlim) el.classList.remove('hidden');
        else el.classList.add('hidden');
      });

      // Scale icons in slim mode
      const icons = aside.querySelectorAll('.sidebar-collapsed-scale');
      icons.forEach((icon) => {
        if (isSlim) icon.classList.add('scale-110');
        else icon.classList.remove('scale-110');
      });

      // Center chat list items in slim mode
      const chatList = aside.querySelector('#chat-list');
      if (chatList) {
        if (isSlim) chatList.classList.add('flex', 'flex-col', 'items-center');
        else chatList.classList.remove('flex', 'flex-col', 'items-center');
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
