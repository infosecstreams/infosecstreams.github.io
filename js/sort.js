'use strict';
(function () {
  // Only the index pages (which have the Settings button) get sorting and
  // filtering; the inactive pages have no status column.
  const settingsButton = document.getElementById('settings-button');
  const table = document.querySelector('table'); // markdown doesn't add ids but we know we want the first table
  if (!settingsButton || !table) return;
  table.classList.add('streamer-table');

  // localStorage can be disabled, blocked or full; settings are a convenience.
  const storage = {
    get(key) {
      try { return localStorage.getItem(key); } catch (e) { return null; }
    },
    set(key, value) {
      try { localStorage.setItem(key, value); } catch (e) { /* ignore */ }
    },
  };

  /****************************************************************************
   **** Sorting
   ***************************************************************************/

  // The initial order is 30-day activity, as written by the bot.
  const initialOrder = Array.from(table.rows);
  let currentSort = 'initial';

  const onlineHeader = table.querySelector('th:nth-child(1)');
  const nameHeader = table.querySelector('th:nth-child(2)');
  const headers = [onlineHeader, nameHeader];

  function setSortIndicator(header, direction) {
    headers.forEach(h => {
      h.removeAttribute('data-sort');
      h.setAttribute('aria-sort', 'none');
    });
    if (header && direction) {
      header.setAttribute('data-sort', direction);
      header.setAttribute('aria-sort', direction === 'forward' ? 'ascending' : 'descending');
    }
  }

  function restoreInitialSort() {
    initialOrder.forEach(e => e.parentNode.appendChild(e));
    currentSort = 'initial';
  }

  // Status column order: 🟢 live, then 🟡 getting ready, then offline.
  function statusRank(text) {
    if (text.includes('🟢')) return 0;
    if (text.includes('🟡')) return 1;
    return 2;
  }

  function sortRows(column, compare) {
    Array.from(table.rows)
      .map(r => [r, r.querySelector(`td:nth-child(${column})`)?.innerText])
      .filter(r => r[1] !== undefined)
      .sort(compare)
      .forEach(r => r[0].parentNode.appendChild(r[0]));
  }

  // Sort rows by status (direction 1: live first, -1: offline first), keeping
  // the bot's 30-day activity order within each status.
  function sortByStatus(direction) {
    sortRows(1, (a, b) => {
      const byStatus = (statusRank(a[1]) - statusRank(b[1])) * direction;
      if (byStatus !== 0) return byStatus;
      return initialOrder.indexOf(a[0]) - initialOrder.indexOf(b[0]);
    });
  }

  function sortByName(direction) {
    sortRows(2, (a, b) => a[1].toLowerCase().localeCompare(b[1].toLowerCase()) * direction);
  }

  function toggleOnlineSort() {
    switch (currentSort) {
      default:
      case 'initial':
        sortByStatus(1);
        currentSort = 'online';
        setSortIndicator(onlineHeader, 'forward');
        break;
      case 'online':
        sortByStatus(-1);
        currentSort = 'offline';
        setSortIndicator(onlineHeader, 'backward');
        break;
      case 'offline':
        restoreInitialSort();
        setSortIndicator(null);
        break;
    }
  }

  function toggleNameSort() {
    switch (currentSort) {
      default:
      case 'initial':
        sortByName(1);
        currentSort = 'nameForward';
        setSortIndicator(nameHeader, 'forward');
        break;
      case 'nameForward':
        sortByName(-1);
        currentSort = 'nameBackward';
        setSortIndicator(nameHeader, 'backward');
        break;
      case 'nameBackward':
        restoreInitialSort();
        setSortIndicator(null);
        break;
    }
  }

  // Sortable headers: clickable and keyboard-operable (Enter/Space).
  function makeSortable(header, label, toggle) {
    header.setAttribute('tabindex', '0');
    header.setAttribute('title', label);
    header.setAttribute('aria-label', label);
    header.addEventListener('click', toggle);
    header.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggle();
      }
    });
  }
  makeSortable(onlineHeader, 'Sort by online status', toggleOnlineSort);
  makeSortable(nameHeader, 'Sort by streamer name', toggleNameSort);

  // Initially start in a sort by online state
  toggleOnlineSort();

  /****************************************************************************
   *** Filtering
   ***************************************************************************/

  for (const td of table.querySelectorAll('td:nth-child(1)')) {
    td.parentElement.setAttribute('data-offline', td.innerText.trim().length === 0);
  }

  function getLanguages() {
    const langs = new Set();
    for (const td of table.querySelectorAll('td:nth-child(4)')) {
      const content = td.innerText.trim();
      if (content.length > 0) {
        langs.add(content);
        td.parentElement.setAttribute('data-language', content);
      }
    }
    return langs;
  }

  const filters = new Map();
  let offlineFiltered = false;
  getLanguages().forEach(l => filters.set(l, true));

  const filterStyles = document.head.appendChild(document.createElement('link'));
  filterStyles.rel = 'stylesheet';

  function updateStyles(filters, hideOffline) {
    // Hidden languages and offline rows are hidden with a generated stylesheet.
    const rules = Array.from(filters.entries())
      .filter(l => l[1] === false)
      .map(l => `.streamer-table tr[data-language="${CSS.escape(l[0])}"]`);
    URL.revokeObjectURL(filterStyles.href);
    const parts = [];
    if (rules.length > 0) {
      parts.push(rules.join(',') + ' { display: none } ');
    }
    if (hideOffline) {
      parts.push('tr[data-offline=true] { display: none } ');
    }
    if (parts.length > 0) {
      const blob = new Blob(parts, { type: 'text/css' });
      filterStyles.href = URL.createObjectURL(blob);
    } else {
      filterStyles.removeAttribute('href');
    }
    storage.set('saved-filters', JSON.stringify({ rules: Object.fromEntries(filters), hideOffline }));
  }

  // Restore saved settings; ignore anything malformed.
  try {
    const saved = JSON.parse(storage.get('saved-filters') || 'null');
    if (saved && typeof saved === 'object') {
      if (saved.rules && typeof saved.rules === 'object') {
        for (const [language, shown] of Object.entries(saved.rules)) {
          if (typeof shown === 'boolean') filters.set(language, shown);
        }
      }
      offlineFiltered = saved.hideOffline === true;
      updateStyles(filters, offlineFiltered);
    }
  } catch (e) { /* corrupt settings: start fresh */ }

  function generateLanguageModal() {
    const modal = document.createElement('div');
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-label', 'Settings');
    const fields = modal.appendChild(document.createElement('fieldset'));
    const legend = fields.appendChild(document.createElement('legend'));
    legend.innerText = 'Language filter';

    const inputs = [];
    for (const [language, filtered] of filters.entries()) {
      const ID = `filter-checkbox-${language}`;
      const input = fields.appendChild(document.createElement('input'));
      input.type = 'checkbox';
      input.name = language;
      input.checked = filtered;
      input.id = ID;
      const label = fields.appendChild(document.createElement('label'));
      label.setAttribute('for', ID);
      label.innerText = language;
      fields.appendChild(document.createElement('br'));

      inputs.push({ input, language });
    }

    fields.append(document.createElement('hr'));
    const hideOffline = fields.appendChild(document.createElement('input'));
    hideOffline.type = 'checkbox';
    hideOffline.checked = offlineFiltered;
    hideOffline.id = 'checkbox-hide-offline';
    const hideOfflineLabel = fields.appendChild(document.createElement('label'));
    hideOfflineLabel.innerText = 'Hide offline';
    hideOfflineLabel.setAttribute('for', 'checkbox-hide-offline');

    fields.appendChild(document.createElement('br'));

    const done = fields.appendChild(document.createElement('input'));
    done.type = 'submit';
    done.value = 'Done';
    done.style.width = '100%';

    function close() {
      for (const input of inputs) {
        filters.set(input.language, input.input.checked);
      }
      modal.remove();
      document.removeEventListener('keydown', onKey);
      updateStyles(filters, hideOffline.checked);
      offlineFiltered = hideOffline.checked;
      settingsButton.focus();
    }
    function onKey(e) {
      if (e.key === 'Escape') close();
    }

    done.addEventListener('click', close, { once: true });
    // Clicking the backdrop (not the panel) closes the dialog.
    modal.addEventListener('click', function (e) {
      if (e.target === modal) close();
    });
    document.addEventListener('keydown', onKey);

    return { modal, focus: () => (inputs[0]?.input || done).focus() };
  }

  settingsButton.addEventListener('click', function (e) {
    e.preventDefault(); // href="#" would jump to the top
    const dialog = generateLanguageModal();
    document.body.appendChild(dialog.modal);
    dialog.focus();
  });
})();
