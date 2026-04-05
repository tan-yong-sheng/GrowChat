function cloneItems(items) {
  return items.map((item) => ({ ...item }));
}

const SETTINGS_SUBNAV_ITEMS = Object.freeze([
  Object.freeze({
    key: 'connections',
    label: 'Connections',
    icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="size-4"><path d="M4 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2H4Zm0 1.5h8a.5.5 0 0 1 .5.5v2.5h-9V5a.5.5 0 0 1 .5-.5Zm8 7H4a.5.5 0 0 1-.5-.5v-2h9v2a.5.5 0 0 1-.5.5Z"/></svg>',
  }),
  Object.freeze({
    key: 'models',
    label: 'Models',
    icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="size-4"><path fill-rule="evenodd" d="M2 4.25A2.25 2.25 0 0 1 4.25 2h7.5A2.25 2.25 0 0 1 14 4.25v7.5A2.25 2.25 0 0 1 11.75 14h-7.5A2.25 2.25 0 0 1 2 11.75v-7.5Zm2.25-.75a.75.75 0 0 0-.75.75v7.5c0 .414.336.75.75.75h7.5a.75.75 0 0 0 .75-.75v-7.5a.75.75 0 0 0-.75-.75h-7.5Z" clip-rule="evenodd" /><path d="M4.75 5.5a.75.75 0 0 1 .75-.75h5a.75.75 0 0 1 0 1.5h-5a.75.75 0 0 1-.75-.75ZM4.75 8a.75.75 0 0 1 .75-.75h5a.75.75 0 0 1 0 1.5h-5A.75.75 0 0 1 4.75 8ZM5.5 9.75a.75.75 0 0 0 0 1.5h3a.75.75 0 0 0 0-1.5h-3Z" /></svg>',
  }),
  Object.freeze({
    key: 'integrations',
    label: 'Integrations',
    icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="size-4"><path fill-rule="evenodd" d="M3.75 3A1.75 1.75 0 0 0 2 4.75v6.5c0 .966.784 1.75 1.75 1.75h8.5A1.75 1.75 0 0 0 14 11.25v-6.5A1.75 1.75 0 0 0 12.25 3h-8.5ZM12.5 4.75a.25.25 0 0 0-.25-.25h-8.5a.25.25 0 0 0-.25.25v6.5c0 .138.112.25.25.25h8.5a.25.25 0 0 0 .25-.25v-6.5Z" clip-rule="evenodd" /><path fill-rule="evenodd" d="M6 7a1 1 0 1 1 2 0 1 1 0 0 1-2 0ZM10 7a1 1 0 1 1 2 0 1 1 0 0 1-2 0ZM6 9a1 1 0 1 1 2 0 1 1 0 0 1-2 0ZM10 9a1 1 0 1 1 2 0 1 1 0 0 1-2 0Z" clip-rule="evenodd" /></svg>',
  }),
  Object.freeze({
    key: 'email',
    label: 'Email',
    icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="size-4"><path d="M2.5 2A1.5 1.5 0 0 0 1 3.5v9A1.5 1.5 0 0 0 2.5 14h11a1.5 1.5 0 0 0 1.5-1.5v-9A1.5 1.5 0 0 0 13.5 2h-11ZM2 3.5a.5.5 0 0 1 .5-.5h11a.5.5 0 0 1 .5.5v.213l-8 4.8-8-4.8V3.5Z" /><path d="M2 4.5 10 9.3l8-4.8v7.5a.5.5 0 0 1-.5.5h-11a.5.5 0 0 1-.5-.5v-7.5Z" /></svg>',
  }),
]);

export function buildWorkspaceSettingsSubnavItems({
  basePath = '/admin/settings',
  currentKey = '',
} = {}) {
  return cloneItems(SETTINGS_SUBNAV_ITEMS).map((item) => ({
    ...item,
    href: `${basePath}/${item.key}`,
    active: item.key === currentKey,
  }));
}
