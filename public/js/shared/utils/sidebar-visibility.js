import { snapshotSidebarState, restoreSidebarState, state, setState } from '../store.js';

let suspensionDepth = 0;
let sidebarSnapshot = null;
let currentRouteScope = 'chat';

function applySuspendedSidebarState() {
  if (state.isMobile) {
    setState({ showSidebar: false });
    return;
  }

  setState({
    showSidebar: true,
    sidebarCollapsed: true,
  });
}

function isSuspendingScope(scope) {
  return scope === 'account' || scope === 'admin-settings';
}

export function suspendSidebarVisibility() {
  if (suspensionDepth === 0) {
    sidebarSnapshot = snapshotSidebarState();
  }
  suspensionDepth += 1;
  applySuspendedSidebarState();
}

export function restoreSidebarVisibility() {
  if (suspensionDepth === 0) return;
  suspensionDepth -= 1;
  if (suspensionDepth > 0) {
    applySuspendedSidebarState();
    return;
  }
  const snapshot = sidebarSnapshot;
  sidebarSnapshot = null;
  if (!snapshot) return;
  restoreSidebarState(snapshot);
}

export function setSidebarRouteScope(nextScope = 'chat') {
  const normalized = String(nextScope || 'chat');
  if (normalized === currentRouteScope) {
    if (isSuspendingScope(normalized)) {
      applySuspendedSidebarState();
    }
    return;
  }

  const leavingSettings = isSuspendingScope(currentRouteScope);
  const enteringSettings = isSuspendingScope(normalized);

  if (leavingSettings && !enteringSettings) {
    restoreSidebarVisibility();
  }

  if (enteringSettings && !leavingSettings) {
    suspendSidebarVisibility();
  }

  currentRouteScope = normalized;
}

export function clearSidebarVisibilitySuspension() {
  suspensionDepth = 0;
  sidebarSnapshot = null;
  currentRouteScope = 'chat';
}
