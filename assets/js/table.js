import { escapeHtml } from './html.js';

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

export function createRow(row, index, currentPage, canDelete = false, approvedOnly = false, isApproved = false) {
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

  const entity = { clientes: 'cliente', categorias: 'categoria', itens: 'produto', orcamentos: 'orçamento' }[currentPage] ?? 'registro';
  const reference = escapeHtml(`${entity} de código ${row[0]}`);

  if (currentPage === 'orcamentos' && approvedOnly) {
    return `<tr>${cells}<td><button type="button" class="primary" data-action="print" data-index="${index}" aria-label="Baixar PDF do ${reference}">Baixar PDF</button></td></tr>`;
  }

  const budgetStatus = currentPage === 'orcamentos'
    ? `<td><span class="status${isApproved ? '' : ' pending'}">${isApproved ? 'Aprovado pelo cliente' : 'Pendente'}</span></td>`
    : '';

  return `
    <tr>
      ${cells}
      ${budgetStatus}
      <td>
        ${currentPage === 'orcamentos' ? `<button type="button" class="action" aria-label="Imprimir ${reference}" title="Imprimir / Salvar PDF" data-action="print" data-index="${index}"><span aria-hidden="true">⎙</span></button>` : ''}
        <button type="button" class="action" aria-label="Editar ${reference}" title="Editar ${reference}" data-action="edit" data-index="${index}"><span aria-hidden="true">✎</span></button>
        ${canDelete ? `<button type="button" class="action" aria-label="Excluir ${reference}" title="Excluir ${reference}" data-action="delete" data-index="${index}"><span aria-hidden="true">⌫</span></button>` : ''}
      </td>
    </tr>
  `;
}
