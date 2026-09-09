import { escapeHtml } from './html.js';
import { formatCurrency } from './table.js';

export function createBudgetDocument(budget, client, items, company = {}, approved = false) {
  company = budget[6]?.company || company;
  client = client ? [...client.slice(0, 4), budget[6]?.client || client[4] || {}] : client;
  const escape = escapeHtml;
  const companyName = company.nome || 'Atlas Máquinas & Obras';
  const rows = items.filter((item) => item[0] === budget[0]).map((item) => `
    <tr><td><strong>${escape(item[2])}</strong>${item[6] ? `<br><small>${escape(item[6])}</small>` : ''}</td><td class="number">${escape(item[3])}</td>
    <td class="number">${escape(formatCurrency(item[4]))}</td>
    <td class="number">${escape(formatCurrency(item[5]))}</td></tr>`).join('');
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Orçamento ${escape(budget[0])} - ${escape(companyName)}</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; padding: 32px; color: #20252b; background: white; font: 14px Arial, sans-serif; }
  main { max-width: 900px; margin: auto; }
  header { border-bottom: 3px solid #ff7a2f; padding-bottom: 18px; }
  h1 { font-size: 24px; } h2 { font-size: 20px; }
  p, td { overflow-wrap: anywhere; }
  .details { display: flex; flex-wrap: wrap; gap: 12px 40px; }
  table { width: 100%; border-collapse: collapse; margin-top: 24px; table-layout: fixed; }
  th, td { text-align: left; padding: 12px 8px; border-bottom: 1px solid #ccc; }
  th:first-child { width: 46%; } thead { display: table-header-group; }
  .number { text-align: right; }
  .total { text-align: right; font-size: 20px; font-weight: bold; }
  tr, .total, header { break-inside: avoid; }
  .print-controls { max-width: 900px; margin: 0 auto 28px; }
  button { padding: 12px 18px; cursor: pointer; }
  @page { size: A4; margin: 16mm; }
  @media print { body { padding: 0; } .print-controls { display: none !important; } }
</style></head><body>
<div class="print-controls"><button id="print-budget" type="button">Imprimir / Salvar PDF</button>
<p>Para gerar o PDF, escolha “Salvar como PDF” no destino da impressão. Desative cabeçalhos e rodapés do navegador se não quiser incluir URL e data de impressão.</p></div>
<main><header><h1>${escape(companyName)}</h1><p>${[company.cnpj, company.endereco, company.telefone, company.email].filter(Boolean).map(escape).join(' • ')}</p></header>
<h2>Orçamento nº ${escape(budget[0])}</h2>
<p><strong>Situação:</strong> ${approved ? 'Aprovado pelo cliente' : 'Pendente'}</p>
<p><strong>Cliente:</strong> ${escape(client?.[3] ?? budget[2])}</p>
${client ? `<p><strong>CPF/CNPJ:</strong> ${escape(client[2])}</p><p>${[client[4]?.contato, client[4]?.telefone, client[4]?.email, client[4]?.endereco].filter(Boolean).map(escape).join(' • ')}</p>` : ''}
<div class="details"><p><strong>Emissão:</strong> ${escape(budget[3])}</p>
<p><strong>Validade:</strong> ${escape(budget[4])}</p></div>
<table><thead><tr><th scope="col">Produto</th><th scope="col" class="number">Quantidade</th>
<th scope="col" class="number">Valor unitário</th><th scope="col" class="number">Subtotal</th></tr></thead>
<tbody>${rows}</tbody></table>
<p class="total">Total: ${escape(formatCurrency(budget[5]))}</p>
${budget[6] ? `<section><h2>Condições comerciais</h2>${[['Pagamento',budget[6].pagamento],['Entrega',budget[6].entrega],['Local de entrega',budget[6].localEntrega],['Observações',budget[6].observacoes]].filter(([,value])=>value).map(([label,value])=>`<p><strong>${label}:</strong> ${escape(value)}</p>`).join('')}</section>` : ''}
</main></body></html>`;
}

export function printBudget(data, index, approved = false) {
  const budget = data.orcamentos[index];
  if (!budget) return;
  const preview = window.open('', '_blank');
  if (!preview) {
    alert('Permita abrir uma nova janela para imprimir o orçamento.');
    return;
  }
  const sourceClient = data.clientes.find((row) => row[0] === budget[1]);
  const contact = data.contatosClientes?.find((row) => row[0] === budget[1]) || [];
  const phone = data.telefonesClientes?.find((row) => row[1] === budget[1] && row[3]) || data.telefonesClientes?.find((row) => row[1] === budget[1]);
  const address = data.enderecosClientes?.find((row) => row[1] === budget[1] && row[10]) || data.enderecosClientes?.find((row) => row[1] === budget[1]);
  const client = sourceClient ? [...sourceClient, { email: contact[1] || '', contato: sourceClient[1] === 'Pessoa Jurídica' ? contact[2] || '' : '', telefone: phone?.[2] || '', endereco: address ? (address[9] || [address[3],address[4],address[5],address[6],address[7],address[8],address[2]].filter(Boolean).join(', ')) : '' }] : sourceClient;
  const documentHtml = createBudgetDocument(budget, client, data.itensOrcamento, data.empresa || {}, approved);
  setTimeout(() => {
    if (preview.closed) return;
    preview.document.open();
    preview.document.write(documentHtml);
    preview.document.close();
    preview.document.getElementById('print-budget').addEventListener('click', () => preview.print());
  }, 0);
}
