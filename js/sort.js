'use strict';
const table = document.querySelector('table'); // markdown doesn't add ids but we know we want the first table
table.classList.add('streamer-table');

const initialOrder = Array.from(table.rows);
let currentSort = 'initial';

function restoreInitialSort() {
  initialOrder.forEach(e => e.parentNode.appendChild(e));
  currentSort = 'initial';
}

function toggleOnlineSort(headerElement) {
  document.querySelectorAll('th[data-sort]').forEach(e => e.removeAttribute('data-sort'));
  switch (currentSort) {
    default:
    case 'initial':
      Array.from(table.rows)
        .map(r => [r, r.querySelector('td:nth-child(1)')?.innerText])
        .filter(r => r[1] !== undefined)
        .sort((a, b) => a[1].includes('🟢') ? -1 : 1)
        .forEach(r => r[0].parentNode.appendChild(r[0]));
      currentSort = 'online';
      headerElement.setAttribute('data-sort', 'forward');
      break;
    case 'online':
      Array.from(table.rows)
        .map(r => [r, r.querySelector('td:nth-child(1)')?.innerText])
        .filter(r => r[1] !== undefined)
        .sort((a, b) => a[1].includes('🟢') ? 1 : -1)
        .forEach(r => r[0].parentNode.appendChild(r[0]));
      currentSort = 'offline';
      headerElement.setAttribute('data-sort', 'backward');
      break;
    case 'offline':
      restoreInitialSort();
      headerElement.removeAttribute('data-sort');
      break;
  }
}

// Online/Offline sort
const onlineHeader = table.querySelector('th:nth-child(1)');
onlineHeader.addEventListener('click', function(e) {
  toggleOnlineSort(e.target);
});
onlineHeader.setAttribute('title', 'Sort by online status');
onlineHeader.setAttribute('role', 'button');

// Name sort
const nameHeader = table.querySelector('th:nth-child(2)');
nameHeader.addEventListener('click', function(e) {
  document.querySelectorAll('th[data-sort]').forEach(e => e.removeAttribute('data-sort'));
  switch (currentSort) {
    default:
    case 'initial':
      Array.from(table.rows)
        .map(r => [r, r.querySelector('td:nth-child(2)')?.innerText?.toLowerCase()])
        .filter(r => r[1] !== undefined)
        .sort((a, b) => a[1].localeCompare(b[1]))
        .forEach(r => r[0].parentNode.appendChild(r[0]));
      currentSort = 'nameForward';
      e.target.setAttribute('data-sort', 'forward');
      break;
    case 'nameForward':
      Array.from(table.rows)
        .map(r => [r, r.querySelector('td:nth-child(2)')?.innerText?.toLowerCase()])
        .filter(r => r[1] !== undefined)
        .sort((a, b) => b[1].localeCompare(a[1]))
        .forEach(r => r[0].parentNode.appendChild(r[0]));
      currentSort = 'nameBackward';
      e.target.setAttribute('data-sort', 'backward');
      break;
    case 'nameBackward':
      restoreInitialSort();
      e.target.removeAttribute('data-sort');
      break;
  }
});
nameHeader.setAttribute('title', 'Sort by streamer name');
nameHeader.setAttribute('role', 'button');

// Initially start in a sort by online state
toggleOnlineSort(onlineHeader);
