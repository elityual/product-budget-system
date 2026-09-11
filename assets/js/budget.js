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
    const isActive = product[6] === 'Ativo';
    const searchableText = `${product[2]} ${product[3]}`.toLocaleLowerCase('pt-BR');
    const matchesSearch = searchableText.includes(normalizedSearch);
    const matchesCategory = !category || product[1] === category;
    return isActive && matchesSearch && matchesCategory;
  });
}

export function inactiveBudgetItemViolations(products, originalItems, quantities) {
  const productByCode = new Map(products.map((product) => [Number(product[0]), product]));
  const originalQuantityByCode = new Map(originalItems.map((item) => [Number(item[1]), Number(item[3])]));

  return Object.entries(quantities).flatMap(([code, quantity]) => {
    const product = productByCode.get(Number(code));
    const currentQuantity = Number(quantity);
    if (product?.[6] !== 'Inativo' || currentQuantity <= 0) return [];
    const originalQuantity = originalQuantityByCode.get(Number(code)) ?? 0;
    return currentQuantity > originalQuantity ? [Number(code)] : [];
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
  details = {},
  currentDate = new Date()
}) {
  return [
    code,
    clientCode,
    client,
    existingRecord?.[3] ?? formatCurrentDate(currentDate),
    formatDateForDisplay(validity),
    total ?? existingRecord?.[5] ?? 0,
    existingRecord?.[6] ?? details
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
      quantity * unitValue,
      product[3] ?? ''
    ]];
  });
}

export function calculateBudgetTotal(items) {
  return items.reduce((total, item) => total + item[5], 0);
}
