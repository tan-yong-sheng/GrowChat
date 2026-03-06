import { escapeHtml } from '../utils.js';

const TOKENS = [
  { label: 'tag:', description: 'Filter by tags' },
  { label: 'folder:', description: 'Filter by folder' },
  { label: 'pinned:', description: 'Filter pinned chats' },
  { label: 'shared:', description: 'Filter shared chats' },
  { label: 'archived:', description: 'Filter archived chats' }
];

export function renderSearchInput(inputEl, onSearch) {
  const container = inputEl.parentElement;
  
  // Create suggestion dropdown container
  const dropdown = document.createElement('div');
  dropdown.id = 'search-token-suggestions';
  dropdown.className = 'absolute top-full left-0 mt-2 w-64 bg-white border border-gray-100 rounded-xl shadow-xl z-50 hidden flex flex-col p-1.5';
  container.appendChild(dropdown);
  container.classList.add('relative');

  let selectedIndex = -1;
  let activeTokens = [];
  let isDropdownOpen = false;

  function renderDropdown(tokens) {
    if (tokens.length === 0) {
      dropdown.classList.add('hidden');
      isDropdownOpen = false;
      return;
    }
    
    dropdown.innerHTML = tokens.map((t, i) => `
      <button class="w-full text-left px-3 py-2 rounded-lg transition flex items-center justify-between text-sm group ${selectedIndex === i ? 'bg-gray-100 text-gray-900 font-medium' : 'hover:bg-gray-50 text-gray-700'}" data-index="${i}" tabindex="-1">
        <span class="font-mono text-xs bg-gray-100 px-1 rounded">${escapeHtml(t.label)}</span>
        <span class="text-[10px] text-gray-400 group-hover:text-gray-500">${escapeHtml(t.description)}</span>
      </button>
    `).join('');
    
    dropdown.classList.remove('hidden');
    isDropdownOpen = true;

    dropdown.querySelectorAll('button').forEach(btn => {
       btn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          insertToken(tokens[parseInt(btn.getAttribute('data-index'))].label);
       });
       btn.addEventListener('mouseover', () => {
          selectedIndex = parseInt(btn.getAttribute('data-index'));
          updateDropdownSelection();
       });
    });
  }

  function updateDropdownSelection() {
    dropdown.querySelectorAll('button').forEach(btn => {
      const idx = parseInt(btn.getAttribute('data-index'));
      btn.className = `w-full text-left px-3 py-2 rounded-lg transition flex items-center justify-between text-sm group ${selectedIndex === idx ? 'bg-gray-100 text-gray-900 font-medium' : 'hover:bg-gray-50 text-gray-700'}`;
    });
  }

  function insertToken(tokenLabel) {
    const val = inputEl.value;
    const cursor = inputEl.selectionStart;
    const before = val.slice(0, cursor);
    const after = val.slice(cursor);
    
    // Find the word being typed
    const words = before.split(' ');
    words.pop(); // remove partial token
    
    const newVal = [...words, tokenLabel].join(' ') + ' ' + after;
    inputEl.value = newVal;
    
    dropdown.classList.add('hidden');
    isDropdownOpen = false;
    selectedIndex = -1;
    
    inputEl.focus();
    inputEl.dispatchEvent(new Event('input', { bubbles: true }));
  }

  const onInput = (e) => {
    const val = e.target.value;
    const cursor = e.target.selectionStart;
    const currentWord = val.slice(0, cursor).split(' ').pop();
    
    if (currentWord.length > 0 && !currentWord.includes(':')) {
      activeTokens = TOKENS.filter(t => t.label.startsWith(currentWord));
      selectedIndex = activeTokens.length > 0 ? 0 : -1;
      renderDropdown(activeTokens);
    } else {
      dropdown.classList.add('hidden');
      isDropdownOpen = false;
      selectedIndex = -1;
    }
  };

  const onKeyDown = (e) => {
    if (!isDropdownOpen) return;
    
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      e.stopPropagation(); // prevent modal from scrolling
      if (selectedIndex < activeTokens.length - 1) {
        selectedIndex++;
        updateDropdownSelection();
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      e.stopPropagation();
      if (selectedIndex > 0) {
        selectedIndex--;
        updateDropdownSelection();
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      if (selectedIndex >= 0 && activeTokens[selectedIndex]) {
        insertToken(activeTokens[selectedIndex].label);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      dropdown.classList.add('hidden');
      isDropdownOpen = false;
    }
  };

  // Close dropdown on outside click
  const onOutsideClick = (e) => {
    if (isDropdownOpen && !container.contains(e.target)) {
      dropdown.classList.add('hidden');
      isDropdownOpen = false;
    }
  };

  inputEl.addEventListener('input', onInput);
  inputEl.addEventListener('keydown', onKeyDown, true); // Capture phase to intercept before modal
  document.addEventListener('click', onOutsideClick);

  return () => {
    inputEl.removeEventListener('input', onInput);
    inputEl.removeEventListener('keydown', onKeyDown, true);
    document.removeEventListener('click', onOutsideClick);
    dropdown.remove();
  };
}