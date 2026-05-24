/**
 * Shared dropdown keyboard navigation handler.
 *
 * Adds ARIA menu attributes and keyboard event handlers
 * (ArrowUp/Down, Escape, Tab) to dropdown menu items.
 */

/**
 * Set up keyboard navigation on dropdown menu items.
 * @param {HTMLElement} dropdown - The dropdown container element
 * @param {string} selector - CSS selector for menu items (default: '[data-action]')
 * @param {Object} [options]
 * @param {Function} [options.getNextItem] - Custom function to get next sibling (item, items, index) => HTMLElement|null
 * @param {Function} [options.getPrevItem] - Custom function to get prev sibling (item, items, index) => HTMLElement|null
 */
export function setupDropdownKeyboard(dropdown, selector = '[data-action]', options = {}) {
  dropdown.setAttribute('role', 'menu');
  const items = Array.from(dropdown.querySelectorAll(selector));

  items.forEach((item, index) => {
    item.setAttribute('role', 'menuitem');
    item.setAttribute('tabindex', '-1');
    item.addEventListener('keydown', (e) => {
      switch (e.key) {
        case 'ArrowDown': {
          e.preventDefault();
          const nextItem = options.getNextItem
            ? options.getNextItem(item, items, index)
            : items[index + 1];
          if (nextItem) nextItem.focus();
          break;
        }
        case 'ArrowUp': {
          e.preventDefault();
          const prevItem = options.getPrevItem
            ? options.getPrevItem(item, items, index)
            : items[index - 1];
          if (prevItem) prevItem.focus();
          break;
        }
        case 'Escape':
          e.preventDefault();
          dropdown.classList.add('hidden');
          break;
        case 'Tab':
          e.preventDefault();
          dropdown.classList.add('hidden');
          break;
      }
    });
  });
}
