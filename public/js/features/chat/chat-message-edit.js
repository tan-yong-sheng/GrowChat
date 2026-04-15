/**
 * Message Edit Controller
 * Handles edit mode for chat messages
 */

import { setupEditTextarea } from './edit-textarea.js';

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/**
 * Message Edit Controller class
 * Manages edit mode lifecycle for a single message
 */
export class MessageEditController {
  /**
   * @param {HTMLElement} messageEl - Message element
   * @param {Object} options - Configuration options
   * @param {string} options.messageId - Message ID
   * @param {string} options.originalContent - Original message content
   * @param {Function} options.onSave - Called when saving edit (messageId, newContent) => Promise<void>
   * @param {Function} [options.onCancel] - Called when canceling edit
   * @param {Function} [options.showToast] - Show toast notification
   */
  constructor(messageEl, { messageId, originalContent, onSave, onCancel, showToast }) {
    this.messageEl = messageEl;
    this.messageId = messageId;
    this.originalContent = originalContent;
    this.onSave = onSave;
    this.onCancel = onCancel;
    this.showToast = showToast || (() => {});
    this.isEditing = false;
    this.contentEl = messageEl.querySelector('.message-content');
    this.originalHtml = null;
  }

  /**
   * Show the edit button (called on hover)
   */
  showEditButton() {
    const btn = this.messageEl.querySelector('.edit-btn');
    if (btn) {
      btn.style.display = '';
      btn.removeAttribute('aria-hidden');
    }
  }

  /**
   * Hide the edit button (called when not hovering)
   */
  hideEditButton() {
    const btn = this.messageEl.querySelector('.edit-btn');
    if (btn && !this.isEditing) {
      btn.style.display = 'none';
      btn.setAttribute('aria-hidden', 'true');
    }
  }

  /**
   * Enter edit mode
   */
  enterEditMode() {
    if (this.isEditing) return;
    this.isEditing = true;

    // Store original HTML for cancel
    this.originalHtml = this.contentEl.innerHTML;
    const currentText = this.contentEl.textContent || this.originalContent;

    // Replace content with edit UI
    this.contentEl.innerHTML = `
      <div class="edit-mode-container" role="group" aria-label="Edit message">
        <textarea 
          class="edit-textarea w-full p-2 border border-gray-300 rounded-lg resize-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          aria-label="Edit message content"
          rows="3"
        >${escapeHtml(currentText)}</textarea>
        <div class="edit-actions mt-2 flex gap-2 justify-end">
          <button class="cancel-edit-btn btn-secondary btn-sm" type="button">
            Cancel
          </button>
          <button class="save-edit-btn btn-primary btn-sm" type="button">
            Save
          </button>
        </div>
        <p class="text-xs text-gray-400 mt-1">
          <kbd class="px-1 py-0.5 bg-gray-100 rounded">Esc</kbd> to cancel · 
          <kbd class="px-1 py-0.5 bg-gray-100 rounded">⌘</kbd>+<kbd class="px-1 py-0.5 bg-gray-100 rounded">Enter</kbd> to save
        </p>
      </div>
    `;

    const textarea = this.contentEl.querySelector('.edit-textarea');
    setupEditTextarea(textarea, { maxHeight: 200 });

    // Focus the textarea
    textarea.focus();

    // Bind event handlers
    this.contentEl.querySelector('.save-edit-btn').addEventListener('click', () => this.save());
    this.contentEl.querySelector('.cancel-edit-btn').addEventListener('click', () => this.cancel());

    textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        this.cancel();
      }
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        this.save();
      }
    });

    // Hide edit button while in edit mode
    this.hideEditButton();

    // Hide other action buttons while editing
    this.messageEl.querySelectorAll('.message-actions button:not(.cancel-edit-btn):not(.save-edit-btn)').forEach(btn => {
      btn.style.display = 'none';
    });
  }

  /**
   * Save the edited message
   */
  async save() {
    const textarea = this.contentEl.querySelector('.edit-textarea');
    const newContent = textarea.value.trim();

    // Don't save empty content
    if (!newContent) {
      this.showToast('Message cannot be empty', 'error');
      return;
    }

    // Don't save if unchanged
    if (newContent === this.originalContent.trim()) {
      this.cancel();
      return;
    }

    const saveBtn = this.contentEl.querySelector('.save-edit-btn');
    const cancelBtn = this.contentEl.querySelector('.cancel-edit-btn');
    
    saveBtn.disabled = true;
    cancelBtn.disabled = true;
    saveBtn.innerHTML = '<span class="animate-spin inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full"></span> Saving...';

    try {
      await this.onSave(this.messageId, newContent);
      
      // Exit edit mode and show edited badge
      this.exitEditMode(true);
      this.showEditedBadge();
      this.showToast('Message updated', 'success');
    } catch (err) {
      saveBtn.disabled = false;
      cancelBtn.disabled = false;
      saveBtn.textContent = 'Save';
      
      const message = err?.message || 'Failed to save. Please try again.';
      this.showToast(message, 'error');
    }
  }

  /**
   * Cancel edit mode
   */
  cancel() {
    this.exitEditMode(false);
    this.onCancel?.();
  }

  /**
   * Exit edit mode
   * @param {boolean} saved - Whether the edit was saved
   */
  exitEditMode(saved) {
    this.isEditing = false;

    if (saved) {
      // Keep the new content (already updated by save)
      const textarea = this.contentEl.querySelector('.edit-textarea');
      if (textarea) {
        this.contentEl.innerHTML = escapeHtml(textarea.value);
      }
    } else {
      // Restore original HTML
      if (this.originalHtml) {
        this.contentEl.innerHTML = this.originalHtml;
      }
    }

    // Restore action buttons
    this.messageEl.querySelectorAll('.message-actions button').forEach(btn => {
      btn.style.display = '';
      btn.removeAttribute('aria-hidden');
    });
  }

  /**
   * Show the "(edited)" badge
   */
  showEditedBadge() {
    // Check if badge already exists
    if (this.contentEl.querySelector('.edited-badge')) return;

    const badge = document.createElement('span');
    badge.className = 'edited-badge text-xs text-gray-400 ml-2 cursor-help';
    badge.textContent = '(edited)';
    badge.title = `Edited ${new Date().toLocaleString()}`;
    badge.setAttribute('aria-label', `Edited at ${new Date().toLocaleString()}`);
    
    this.contentEl.appendChild(badge);
  }
}

/**
 * Factory function to create a message edit controller
 * @param {HTMLElement} messageEl - Message element
 * @param {Object} options - Configuration options
 * @returns {MessageEditController} Controller instance
 */
export function createMessageEditController(messageEl, options) {
  return new MessageEditController(messageEl, options);
}

/**
 * Bind edit actions to message elements
 * @param {Object} params - Parameters
 * @param {HTMLElement} params.messagesList - Messages list container
 * @param {Array} params.messages - Messages array
 * @param {Function} params.apiFetch - Fetch wrapper
 * @param {Function} params.showToast - Toast notification helper
 * @param {Function} params.onMessageEdited - Callback after successful edit
 */
export function bindChatMessageEditActions({ messagesList, messages, apiFetch, showToast, onMessageEdited }) {
  if (!messagesList) return;

  const controllers = new Map();

  messagesList.querySelectorAll('[data-edit-message]').forEach((btn) => {
    const messageIdx = Number(btn.getAttribute('data-edit-message'));
    const message = messages[messageIdx];
    if (!message) return;

    const messageEl = btn.closest('[data-message-idx]');
    if (!messageEl) return;

    // Create controller if not exists
    if (!controllers.has(message.id)) {
      controllers.set(message.id, createMessageEditController(messageEl, {
        messageId: message.id,
        originalContent: message.content,
        onSave: async (messageId, newContent) => {
          const res = await apiFetch(`/api/chats/${message.chat_id}/messages/${messageId}`, {
            method: 'PUT',
            body: JSON.stringify({ content: newContent }),
          });

          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(data.error || 'Failed to update message');
          }

          // Update local message
          message.content = newContent;
          message.edited_at = Date.now() / 1000;

          // Notify parent
          if (onMessageEdited) {
            onMessageEdited(message);
          }
        },
        onCancel: () => {
          // No-op, just exit edit mode
        },
        showToast,
      }));
    }

    // Click handler for edit button
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const controller = controllers.get(message.id);
      if (controller) {
        controller.enterEditMode();
      }
    });
  });

  // Hover handlers for showing/hiding edit button
  messagesList.querySelectorAll('[data-message-idx]').forEach((messageEl) => {
    messageEl.addEventListener('mouseenter', () => {
      const controller = Array.from(controllers.values()).find(c => c.messageEl === messageEl);
      if (controller) {
        controller.showEditButton();
      }
    });

    messageEl.addEventListener('mouseleave', () => {
      const controller = Array.from(controllers.values()).find(c => c.messageEl === messageEl);
      if (controller) {
        controller.hideEditButton();
      }
    });
  });

  return controllers;
}
