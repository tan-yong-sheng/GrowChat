const SIDEBAR_MIN_WIDTH = 200;

import { state, setState, subscribe } from '../store.js';
import { deriveSidebarLayout } from './sidebar-helpers.js';

function applySidebarVisuals(aside, handle, layout) {
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
}

function toggleSlimElements(aside, isSlim) {
  const fullOnly = aside.querySelectorAll('.sidebar-full-only');
  const slimOnly = aside.querySelectorAll('.sidebar-collapsed-only');
  const footer = aside.querySelector('.user-profile-footer');
  const icons = aside.querySelectorAll('.sidebar-collapsed-scale');
  const chatList = aside.querySelector('#chat-list');

  fullOnly.forEach((el) => el.classList.toggle('hidden', isSlim));
  slimOnly.forEach((el) => el.classList.toggle('hidden', !isSlim));
  icons.forEach((icon) => icon.classList.toggle('scale-110', isSlim));

  if (footer) {
    footer.classList.toggle('flex', isSlim);
    footer.classList.toggle('justify-center', isSlim);
    footer.classList.toggle('p-2', isSlim);
    footer.classList.toggle('p-4', !isSlim);
  }

  if (chatList) {
    chatList.classList.toggle('flex', isSlim);
    chatList.classList.toggle('flex-col', isSlim);
    chatList.classList.toggle('items-center', isSlim);
  }
}

function applySidebarLayout(aside, handle, currentState) {
  const layout = deriveSidebarLayout(currentState);
  applySidebarVisuals(aside, handle, layout);
  toggleSlimElements(aside, layout.slim);
}

function attachResizeListeners(handle, isResizingRef) {
  const onMouseDown = () => {
    isResizingRef.value = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    handle.classList.add('bg-gray-400');
  };

  const onMouseMove = (e) => {
    if (!isResizingRef.value || state.sidebarCollapsed) return;
    const newWidth = Math.max(SIDEBAR_MIN_WIDTH, Math.min(window.innerWidth / 2, e.clientX));
    setState({ sidebarWidth: newWidth });
  };

  const onMouseUp = () => {
    if (!isResizingRef.value) return;
    isResizingRef.value = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    handle.classList.remove('bg-gray-400');
  };

  handle.addEventListener('mousedown', onMouseDown);
  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mouseup', onMouseUp);

  return () => {
    handle.removeEventListener('mousedown', onMouseDown);
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
  };
}

export function renderSidebar(aside) {
  const handle = document.createElement('div');
  handle.id = 'sidebar-resize-handle';
  handle.className =
    'absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-gray-300 transition-colors z-50 hidden md:block';
  aside.appendChild(handle);

  const isResizingRef = { value: false };
  const removeResizeListeners = attachResizeListeners(handle, isResizingRef);
  const unsubscribe = subscribe((currentState) => applySidebarLayout(aside, handle, currentState));

  return () => {
    removeResizeListeners();
    unsubscribe?.();
  };
}
