export const recordsPerPage = 10;

export function filterRows(
  rows,
  { search = '', clientType = '', category = '', status = '', statusIndex = 6 } = {}
) {
  const normalizedSearch = search.toLowerCase();

  return rows
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => {
      const matchesSearch = row.join(' ').toLowerCase().includes(normalizedSearch);
      const matchesClientType = !clientType || row[1] === clientType;
      const matchesCategory = !category || row[1] === category;
      const matchesStatus = !status || row[statusIndex] === status;
      return matchesSearch && matchesClientType && matchesCategory && matchesStatus;
    });
}

export function paginateRows(rows, requestedPage, pageSize = recordsPerPage) {
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const currentPage = Math.max(1, Math.min(requestedPage, totalPages));
  const firstRecord = (currentPage - 1) * pageSize;

  return {
    currentPage,
    totalPages,
    visibleRows: rows.slice(firstRecord, firstRecord + pageSize)
  };
}

export function formatCurrency(value) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(Number(value));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export function createRow(row, index, currentPage) {
  const cells = row
    .map((value, column) => {
      const isItem = currentPage === 'itens';
      const isBudgetItem = currentPage === 'itensOrcamento';
      const isBudget = currentPage === 'orcamentos';
      const isInactiveItem = isItem && column === 6 && value === 'Inativo';

      if (
        (isItem && column === 4) ||
        (isBudgetItem && [4, 5].includes(column)) ||
        (isBudget && column === 5)
      ) {
        return `<td>${formatCurrency(value)}</td>`;
      }

      if (isItem && column === 6) {
        const inactiveClass = isInactiveItem ? 'inactive' : '';
        return `<td><span class="status ${inactiveClass}">${escapeHtml(value)}</span></td>`;
      }

      return `<td>${escapeHtml(value)}</td>`;
    })
    .join('');

  if (currentPage === 'itensOrcamento') {
    return `
      <tr>
        ${cells}
      </tr>
    `;
  }

  return `
    <tr>
      ${cells}
      <td>
        <button class="action" onclick="edit(${index})">✎</button>
        <button class="action" onclick="removeRecord(${index})">⌫</button>
      </td>
    </tr>
  `;
}
