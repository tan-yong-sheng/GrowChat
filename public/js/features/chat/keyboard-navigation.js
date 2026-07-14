/**
 * Keyboard Navigation Handler for Chat Interface
 * Provides keyboard accessibility for chat list items and interactive elements
 * WCAG 2.1 AA Compliant
 */
import { setupDropdownKeyboard } from '../../shared/utils/dropdown-keyboard.js';

export function initializeChatKeyboardNavigation(chatListElement) {
  if (!chatListElement) return;

  const chatRows = chatListElement.querySelectorAll('.chat-row');

  chatRows.forEach((row, index) => {
    // Add keyboard accessibility attributes
    row.setAttribute('tabindex', '0');
    row.setAttribute('role', 'button');

    // Add focus ring classes for visible keyboard focus
    if (!row.className.includes('focus:ring')) {
      row.classList.add('focus:ring-2', 'focus:ring-gray-500', 'focus:ring-offset-2');
    }

    // Handle keyboard events (Enter, Space, Arrow keys)
    row.addEventListener('keydown', (e) => {
      handleChatRowKeydown(e, row, chatRows, index);
    });
  });

  // Set up list container for accessibility
  chatListElement.setAttribute('role', 'list');

  // Update chat rows to have listitem role
  chatRows.forEach((row) => {
    // Find or create wrapper for listitem semantics
    const contentDiv = row.querySelector('.chat-row-content');
    if (contentDiv) {
      row.setAttribute('role', 'listitem');
    }
  });
}

function handleChatRowKeydown(event, currentRow, allRows, currentIndex) {
  switch (event.key) {
    case 'Enter':
    case ' ': {
      // Space
      event.preventDefault();
      // Trigger click handler
      const clickEvent = new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        view: window,
      });
      currentRow.dispatchEvent(clickEvent);
      break;
    }

    case 'ArrowUp': {
      event.preventDefault();
      // Focus previous chat item
      if (currentIndex > 0) {
        const prevRow = allRows[currentIndex - 1];
        prevRow.focus();
      }
      break;
    }

    case 'ArrowDown': {
      event.preventDefault();
      // Focus next chat item
      if (currentIndex < allRows.length - 1) {
        const nextRow = allRows[currentIndex + 1];
        nextRow.focus();
      }
      break;
    }

    case 'Escape':
      event.preventDefault();
      // Close any open menu dropdowns
      closeChatMenus();
      break;

    case 'Home':
      event.preventDefault();
      // Focus first chat item
      allRows[0].focus();
      break;

    case 'End':
      event.preventDefault();
      // Focus last chat item
      allRows[allRows.length - 1].focus();
      break;
  }
}

function closeChatMenus() {
  const openMenus = document.querySelectorAll('.chat-menu-dropdown:not(.hidden)');
  openMenus.forEach((menu) => {
    menu.classList.add('hidden');
  });
}

/**
 * Set up keyboard handlers for chat menu buttons
 */
function handleMenuButtonEscape(event) {
  if (event.key !== 'Escape') return;
  event.preventDefault();
  const menuBtn = event.currentTarget;
  const dropdown = menuBtn.closest('.chat-row')?.querySelector('.chat-menu-dropdown');
  if (dropdown) {
    dropdown.classList.add('hidden');
  }
}

export function initializeChatMenuKeyboardNavigation(menuBtn) {
  if (!menuBtn) return;

  // Ensure button has aria-label
  if (!menuBtn.getAttribute('aria-label')) {
    menuBtn.setAttribute('aria-label', 'Chat options menu');
  }

  menuBtn.addEventListener('keydown', handleMenuButtonEscape);
}

/**
 * Set up keyboard handlers for message input
 */
function isSubmitShortcut(event) {
  return event.key === 'Enter' && (event.ctrlKey || event.metaKey);
}

function clickSubmitButton(input) {
  const submitBtn = input.closest('form')?.querySelector('[type="submit"]');
  if (submitBtn) {
    submitBtn.click();
  }
}

function handleMessageInputSubmit(event) {
  if (!isSubmitShortcut(event)) return;
  event.preventDefault();
  clickSubmitButton(event.currentTarget);
}

export function initializeMessageInputKeyboardNavigation(messageInput) {
  if (!messageInput) return;

  // Ensure input has aria-label if no associated label exists
  const label = document.querySelector(`label[for="${messageInput.id}"]`);
  if (!label && !messageInput.getAttribute('aria-label')) {
    messageInput.setAttribute('aria-label', 'Send message');
  }

  // Handle Ctrl+Enter or Cmd+Enter to submit
  messageInput.addEventListener('keydown', handleMessageInputSubmit);
}

/**
 * Set up menu items for keyboard navigation
 */
export function initializeChatMenuKeyboardItems(dropdown) {
  if (!dropdown) return;

  // Set dropdown role
  setupDropdownKeyboard(dropdown, '[data-action]', {
    getNextItem: (item) => item.nextElementSibling?.closest('[data-action]'),
    getPrevItem: (item) => item.previousElementSibling?.closest('[data-action]'),
  });
}
