export function formatDateForInput(value) {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value ?? '');
  return match ? `${match[3]}-${match[2]}-${match[1]}` : value ?? '';
}

export function formatDateForDisplay(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? '');
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value ?? '';
}

export function filterBudgetClients(clients, search = '') {
  const normalizedSearch = search.trim().toLocaleLowerCase('pt-BR');

  return clients.filter((client) =>
    client[3].toLocaleLowerCase('pt-BR').includes(normalizedSearch)
  );
}

export function filterBudgetProducts(
  products,
  { search = '', category = '' } = {}
) {
  const normalizedSearch = search.trim().toLocaleLowerCase('pt-BR');

  return products.filter((product) => {
    const searchableText = `${product[2]} ${product[3]}`.toLocaleLowerCase('pt-BR');
    const matchesSearch = searchableText.includes(normalizedSearch);
    const matchesCategory = !category || product[1] === category;
    return matchesSearch && matchesCategory;
  });
}

function formatCurrentDate(currentDate) {
  const day = String(currentDate.getDate()).padStart(2, '0');
  const month = String(currentDate.getMonth() + 1).padStart(2, '0');
  return `${day}/${month}/${currentDate.getFullYear()}`;
}

export function createBudgetRecord({
  code,
  client,
  clientCode,
  validity,
  total,
  existingRecord,
  currentDate = new Date()
}) {
  return [
    code,
    client,
    clientCode,
    existingRecord?.[3] ?? formatCurrentDate(currentDate),
    formatDateForDisplay(validity),
    total ?? existingRecord?.[5] ?? 0
  ];
}

export function createBudgetItemRecords({ budgetCode, products, quantities }) {
  return products.flatMap((product) => {
    const quantity = Number(quantities[product[0]] ?? 0);

    if (!Number.isInteger(quantity) || quantity <= 0) {
      return [];
    }

    const unitValue = Number(product[4]);
    return [[
      budgetCode,
      product[0],
      product[2],
      quantity,
      unitValue,
      quantity * unitValue
    ]];
  });
}

export function calculateBudgetTotal(items) {
  return items.reduce((total, item) => total + item[5], 0);
}
