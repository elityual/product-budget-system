import { test, expect } from '@playwright/test';
import { data as fixtures } from '../tests/fixtures/workspace.js';
import { backend, section } from './helpers/backend.js';

test('modo local abre sem login e apresenta ferramentas de backup', async ({ page }) => {
  await page.goto('/');
  await page.locator('#storage-mode').selectOption('local');
  await page.locator('#company-name').fill('Empresa local de teste');
  await page.getByRole('button', { name: 'ABRIR BANCO LOCAL', exact: true }).click();
  await expect(page.locator('#application')).toBeVisible();
  await expect(page.locator('#storage-actions')).toBeVisible();
  await expect(page.locator('#brand-name')).toHaveText('Empresa local de teste');
});

test('CRUD de categoria persiste, renomeia produtos e bloqueia exclusão em uso', async ({ page }) => {
  const api = await backend(page);
  page.on('dialog', (dialog) => dialog.accept());
  await section(page, 'Produtos');
  await section(page, 'Categorias');
  await page.getByRole('button', { name: 'Editar categoria de código 2', exact: true }).click();
  await page.locator('#form [name=descricao]').fill('Ferramentas novas');
  await page.getByRole('button', { name: 'SALVAR', exact: true }).click();
  await expect(page.locator('#overlay')).toBeHidden();
  expect(api.saved().itens[1][1]).toBe('Ferramentas novas');
  await page.getByRole('button', { name: 'Excluir categoria de código 2', exact: true }).click();
  expect(api.saved().categorias).toHaveLength(2);
  await page.locator('#new').click();
  await page.locator('#form [name=descricao]').fill('Temporária');
  await page.getByRole('button', { name: 'SALVAR', exact: true }).click();
  await expect(page.locator('#tbody')).toContainText('Temporária');
  await page.reload();
  await section(page, 'Produtos');
  await section(page, 'Categorias');
  await page.getByRole('button', { name: 'Excluir categoria de código 600', exact: true }).click();
  await page.locator('#delete-password input').fill('wrong');
  await page.locator('#delete-password button[value=confirm]').click();
  await expect(page.locator('#tbody')).toContainText('Temporária');
  await page.getByRole('button', { name: 'Excluir categoria de código 600', exact: true }).click();
  await page.locator('#delete-password input').fill('test-password');
  await page.locator('#delete-password button[value=confirm]').click();
  await expect(page.locator('#tbody')).not.toContainText('Temporária');
});

test('clientes homônimos preservam referência por código; renomear atualiza orçamento', async ({ page }) => {
  const initial = structuredClone(fixtures);
  initial.clientes[1][3] = initial.clientes[0][3];
  const api = await backend(page, initial);
  page.on('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Editar cliente de código 1', exact: true }).click();
  await page.locator('#form [name=nome]').fill('Empresa atualizada');
  await page.getByRole('button', { name: 'SALVAR', exact: true }).click();
  await expect(page.locator('#overlay')).toBeHidden();
  expect(api.saved().orcamentos[0][2]).toBe('Empresa atualizada');
  await page.getByRole('button', { name: 'Excluir cliente de código 1', exact: true }).click();
  expect(api.saved().clientes).toHaveLength(2);
  await section(page, 'Orçamentos');
  await page.getByRole('button', { name: 'Editar orçamento de código 102', exact: true }).click();
  await expect(page.locator('#form [name=cliente]')).toHaveValue('1');
  await page.locator('#form [name=cliente]').selectOption('2');
  await page.locator('#save-budget').click();
  await expect(page.locator('#overlay')).toBeHidden();
  expect(api.saved().orcamentos[0][1]).toBe(2);
});

test('produto exige confirmação e filtro de categoria é imediato; inclusão limpa filtros', async ({ page }) => {
  await backend(page);
  await section(page, 'Produtos');
  await page.locator('#category-filter').click();
  await page.locator('#category-filter-options').getByRole('button', { name: 'Ferramentas', exact: true }).click();
  await expect(page.locator('#tbody tr')).toHaveCount(1);
  await expect(page.locator('#tbody')).toContainText('Furadeira');
  await page.getByRole('button', { name: 'Editar produto de código 2', exact: true }).click();
  await page.locator('#form [name=produto]').fill('Alterado');
  page.once('dialog', (dialog) => dialog.dismiss());
  await page.getByRole('button', { name: 'SALVAR', exact: true }).click();
  await expect(page.locator('#overlay')).toBeVisible();
  await expect(page.locator('#tbody')).not.toContainText('Alterado');
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'SALVAR', exact: true }).click();
  await expect(page.locator('#tbody')).toContainText('Alterado');
  await page.locator('#new').click();
  await expect(page.locator('#category-filter')).toHaveValue('');
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(page.locator('#tbody tr')).toHaveCount(2);
});

test('falha e conflito de salvamento preservam dados anteriores e formulário', async ({ page }) => {
  const api = await backend(page);
  page.on('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Editar cliente de código 2', exact: true }).click();
  await page.locator('#form [name=nome]').fill('Não salvo');
  api.conflict();
  await page.getByRole('button', { name: 'SALVAR', exact: true }).click();
  await expect(page.locator('#overlay')).toBeVisible();
  await expect(page.locator('#tbody')).not.toContainText('Não salvo');
  api.fail();
  await page.getByRole('button', { name: 'SALVAR', exact: true }).click();
  await expect(page.locator('#tbody')).not.toContainText('Não salvo');
  expect(api.saved().clientes[1][3]).toBe('Mariana Oliveira');
});

test('menu móvel abre com foco, navega e fecha por Escape e clique externo', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await backend(page);
  const toggle = page.locator('#menu-toggle');
  await expect(page.locator('aside')).toBeHidden();
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('aside > button').first()).toBeFocused();
  await section(page, 'Produtos');
  await expect(page.locator('#title')).toHaveText('PRODUTOS');
  await expect(page.locator('aside')).toBeHidden();
  await toggle.click();
  await page.keyboard.press('Escape');
  await expect(toggle).toBeFocused();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await toggle.click();
  await page.locator('.topbar').click();
  await expect(page.locator('aside')).toBeHidden();
});

test('novo orçamento grava itens e totais; exclusão autorizada remove ambos', async ({ page }) => {
  const api = await backend(page);
  page.on('dialog', (dialog) => dialog.accept());
  await section(page, 'Orçamentos');
  await page.locator('#new').click();
  await page.locator('#budget-client-options input').first().check();
  await page.locator('#confirm-budget-client').click();
  await page.locator('#form [name=validade]').fill('2026-12-31');
  await page.locator('[data-product-code="1"]').fill('3');
  await expect(page.locator('#save-budget')).toBeDisabled();
  await page.locator('#add-budget-items').click();
  await expect(page.locator('#selected-budget-items')).toContainText('Cimento');
  expect(api.saved().orcamentos).toHaveLength(1);
  await page.locator('[data-product-code="2"]').fill('1');
  await page.locator('#add-budget-items').click();
  await page.getByRole('button', { name: 'Remover Furadeira profissional', exact: true }).click();
  await expect(page.locator('#selected-budget-items')).not.toContainText('Furadeira');
  await page.getByRole('button', { name: 'SALVAR ORÇAMENTO', exact: true }).click();
  await expect(page.locator('#overlay')).toBeHidden();
  expect(api.saved().orcamentos[1][5]).toBeCloseTo(128.7);
  expect(api.saved().itensOrcamento).toHaveLength(3);
  expect(api.saved().itensOrcamento[2][0]).toBe(800);
  await page.getByRole('button', { name: 'Excluir orçamento de código 800', exact: true }).click();
  await page.locator('#delete-password input').fill('test-password');
  await page.locator('#delete-password button[value=confirm]').click();
  await expect(page.locator('#tbody tr')).toHaveCount(1);
  expect(api.saved().itensOrcamento).toHaveLength(2);
});

test('usuário novo cadastra cliente validado, recarrega e sai sem manter dados visíveis', async ({ page }) => {
  const api = await backend(page, null);
  await expect(page.locator('#tbody')).toContainText('Nenhum registro encontrado.');
  await page.locator('#new').click();
  await page.locator('#form [name=documento]').fill('22222222222');
  await page.locator('#form [name=nome]').fill('Cliente novo');
  await page.getByRole('button', { name: 'SALVAR', exact: true }).click();
  await expect(page.locator('#overlay')).toBeVisible();
  expect(api.saved()).toBeNull();
  await page.locator('#form [name=documento]').fill('52998224725');
  await page.getByRole('button', { name: 'SALVAR', exact: true }).click();
  await expect(page.locator('#overlay')).toBeHidden();
  expect(api.saved().clientes[0]).toEqual([500, 'Pessoa Física', '529.982.247-25', 'Cliente novo']);
  await expect(page.getByRole('button', { name: 'Editar cliente de código 500', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.locator('#tbody')).toContainText('Cliente novo');
  await page.locator('#exit').click();
  await expect(page.locator('#application')).toBeHidden();
  await expect(page.locator('#auth-panel')).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem('atlas.auth'))).toBeNull();
});

test('falha de login mantém aplicação fechada e informa erro', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('atlas.storage.mode', 'supabase');
    localStorage.setItem('atlas.supabase.config', JSON.stringify({ url: 'https://supabase.test.invalid', key: 'test-key' }));
  });
  await page.route('https://supabase.test.invalid/**', (route) =>
    route.fulfill({ status: 401, json: {} })
  );
  await page.goto('/');
  await page.locator('#auth-form [name=email]').fill('test@example.com');
  await page.locator('#auth-form [name=password]').fill('wrong');
  await page.getByRole('button', { name: 'ENTRAR', exact: true }).click();
  await expect(page.locator('#auth-error')).toContainText('credenciais inválidas');
  await expect(page.locator('#application')).toBeHidden();
  await expect(page.locator('#auth-form [name=password]')).toHaveValue('');
});

test('novo produto usa código retornado pelo SQL e produto vinculado não pode ser excluído', async ({ page }) => {
  const api = await backend(page);
  page.on('dialog', (dialog) => dialog.accept());
  await section(page, 'Produtos');
  await page.getByRole('button', { name: 'Excluir produto de código 1', exact: true }).click();
  await expect(page.locator('#delete-password')).not.toBeVisible();
  expect(api.saved().itens).toHaveLength(2);
  await page.locator('#new').click();
  await page.locator('#form [name=categoria]').fill('Ferramentas');
  await page.locator('#form [data-combobox-option="Ferramentas"]').click();
  await page.locator('#form [name=produto]').fill('Produto novo');
  await page.locator('#form [name=descricao]').fill('Descrição exclusiva');
  await page.locator('#form [name=valor]').fill('25.50');
  await page.getByRole('button', { name: 'SALVAR', exact: true }).click();
  await expect(page.locator('#overlay')).toBeHidden();
  await expect(page.getByRole('button', { name: 'Editar produto de código 700', exact: true })).toBeVisible();
  await page.reload();
  await section(page, 'Produtos');
  await expect(page.locator('#tbody')).toContainText('Produto novo');
});

test('budget edit confirms item changes and preserves original date and prices', async ({ page }) => {
  const initial = structuredClone(fixtures);
  initial.itens[0][4] = 100;
  const api = await backend(page, initial);
  await section(page, 'Or\u00e7amentos');
  await page.getByRole('button', { name: 'Editar or\u00e7amento de c\u00f3digo 102', exact: true }).click();
  await expect(page.locator('#selected-budget-items')).toContainText('Furadeira');
  await page.getByRole('button', { name: 'Remover Furadeira profissional', exact: true }).click();
  await page.locator('[data-product-code="1"]').fill('1');
  await page.locator('#add-budget-items').click();
  page.once('dialog', (dialog) => dialog.dismiss());
  await page.locator('#save-budget').click();
  await expect(page.locator('#overlay')).toBeVisible();
  expect(api.saved().itensOrcamento).toHaveLength(2);
  page.once('dialog', (dialog) => dialog.accept());
  await page.locator('#save-budget').click();
  await expect(page.locator('#overlay')).toBeHidden();
  expect(api.saved().orcamentos[0][0]).toBe(102);
  expect(api.saved().orcamentos[0][3]).toBe(fixtures.orcamentos[0][3]);
  expect(api.saved().orcamentos[0][5]).toBeCloseTo(128.7);
  expect(api.saved().itensOrcamento).toHaveLength(1);
  expect(api.saved().itensOrcamento[0][3]).toBe(3);
  expect(api.saved().itensOrcamento[0][4]).toBe(42.9);
});

test('Enter adds quantities without saving the budget and shows historical prices', async ({ page }) => {
  const initial = structuredClone(fixtures);
  initial.itens[0][4] = 100;
  const api = await backend(page, initial);
  await section(page, 'Or\u00e7amentos');
  await page.getByRole('button', { name: 'Editar or\u00e7amento de c\u00f3digo 102', exact: true }).click();
  const quantity = page.locator('[data-product-code="1"]');
  await expect(quantity.locator('xpath=../..')).toContainText('42,90');
  await quantity.fill('1');
  await quantity.press('Enter');
  await expect(page.locator('#overlay')).toBeVisible();
  await expect(page.locator('#selected-budget-items')).toContainText('3 x');
  expect(api.saved().itensOrcamento[0][3]).toBe(2);
});

test('pending logout hides private data and blocks another login', async ({ page }) => {
  await backend(page);
  let finishLogout;
  const pending = new Promise((resolve) => { finishLogout = resolve; });
  await page.route('**/auth/v1/logout', async (route) => {
    await pending;
    await route.fulfill({ status: 500, json: {} });
  });
  try {
    await page.locator('#exit').click();
    await expect(page.locator('#application')).toBeHidden();
    await expect(page.locator('#auth-form button')).toBeDisabled();
    await expect(page.locator('#tbody')).not.toContainText(fixtures.clientes[0][3]);
  } finally {
    finishLogout();
  }
  await expect(page.locator('#auth-form button')).toBeEnabled();
  expect(await page.evaluate(() => sessionStorage.getItem('atlas.auth'))).toBeNull();
});

test('shared editor can edit and delete budgets and items but not catalog records', async ({ page }) => {
  const api = await backend(page, fixtures, false);
  page.on('dialog', (dialog) => dialog.accept());
  await expect(page.locator('#tbody [data-action="delete"]')).toHaveCount(0);
  await page.getByRole('button', { name:'Editar cliente de c\u00f3digo 1', exact:true }).click();
  await page.locator('#form [name=nome]').fill('Shared client');
  await page.getByRole('button', {name:'SALVAR',exact:true}).click();
  await expect(page.locator('#overlay')).toBeHidden();
  expect(api.saved().clientes[0][3]).toBe('Shared client');
  await section(page,'Or\u00e7amentos');
  await page.getByRole('button', {name:'Editar or\u00e7amento de c\u00f3digo 102',exact:true}).click();
  await page.getByRole('button', {name:'Remover Furadeira profissional',exact:true}).click();
  await page.getByRole('spinbutton',{name:'Quantidade de Cimento CP II 50kg',exact:true}).fill('1');
  await page.locator('#form [name=validade]').click();
  await page.locator('#save-budget').click();
  await expect(page.locator('#overlay')).toBeHidden();
  expect(api.saved().itensOrcamento[0][3]).toBe(1);
  expect(api.saved().itensOrcamento).toHaveLength(1);
  await page.locator('#tbody [data-action=delete]').click();
  await page.locator('#delete-password input').fill('test-password');
  await page.locator('#delete-password button[value=confirm]').click();
  await expect(page.locator('#tbody')).toContainText('Nenhum registro encontrado.');
  expect(api.saved().orcamentos).toHaveLength(0);
  expect(api.saved().itensOrcamento).toHaveLength(0);
});

test('budget print preview contains only selected budget and hides controls when printing', async ({ page }) => {
  await backend(page, fixtures, false);
  await section(page, 'Orçamentos');
  const opened = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Imprimir orçamento de código 102', exact: true }).click();
  const preview = await opened;
  await expect(preview.locator('main')).toContainText('Atlas Máquinas & Obras');
  await expect(preview.locator('main')).toContainText(fixtures.clientes[0][3]);
  await expect(preview.locator('main')).toContainText(fixtures.clientes[0][2]);
  await expect(preview.locator('tbody tr')).toHaveCount(2);
  await expect(preview.locator('.total')).toContainText('444,80');
  await preview.emulateMedia({ media: 'print' });
  await expect(preview.locator('.print-controls')).toBeHidden();
  await expect(preview.locator('main')).toBeVisible();
  await preview.close();
});

test('approved menu contains only approved budgets with PDF as its only action', async ({ page }) => {
  await backend(page, fixtures, false);
  const budgetSubmenuLabels = await page.locator('[data-menu="orcamentos"].sub').allTextContents();
  expect(budgetSubmenuLabels.indexOf('Listar orçamentos')).toBeLessThan(
    budgetSubmenuLabels.indexOf('Orçamentos aprovados')
  );
  await section(page,'Orçamentos');
  await expect(page.locator('#thead th').nth(1)).toHaveText('Código do cliente');
  await expect(page.locator('#thead th').nth(2)).toHaveText('Cliente');
  await expect(page.locator('#tbody td').nth(1)).toHaveText('1');
  await expect(page.locator('#tbody td').nth(2)).toHaveText('Construtora Horizonte');
  await page.getByRole('button',{name:'Orçamentos aprovados',exact:true}).click();
  await expect(page.locator('#title')).toHaveText('ORÇAMENTOS APROVADOS');
  await expect(page.locator('#new')).toBeHidden();
  await expect(page.locator('#tbody')).toContainText('Nenhum registro encontrado.');
  await page.getByRole('button',{name:'Listar orçamentos',exact:true}).click();
  const approve = page.locator('#approve-budget');
  await expect(page.locator('#tbody [data-action=approve]')).toHaveCount(0);
  await expect(approve).toHaveClass('primary');
  page.once('dialog',dialog=>dialog.accept());
  await approve.click();
  await expect(page.locator('#approval-options')).toContainText('Criado em: 01/09/2026');
  await expect(page.locator('#approval-options')).toContainText('Validade: 30/09/2026');
  await page.locator('#approval-search').fill('Horizonte');
  await page.locator('#approval-options input[value="102"]').check();
  await page.locator('#approval-dialog button[value=approve]').click();
  await expect(approve).toBeDisabled();
  await page.reload();
  await section(page,'Orçamentos');
  await page.getByRole('button',{name:'Orçamentos aprovados',exact:true}).click();
  await expect(page.locator('#tbody tr')).toHaveCount(1);
  await expect(page.locator('#tbody button')).toHaveCount(1);
  await expect(page.locator('#thead th').nth(1)).toHaveText('Código do cliente');
  await expect(page.locator('#thead th').nth(2)).toHaveText('Cliente');
  await expect(page.locator('#tbody td').nth(1)).toHaveText('1');
  await expect(page.locator('#tbody td').nth(2)).toHaveText('Construtora Horizonte');
  const opened = page.waitForEvent('popup');
  await page.getByRole('button',{name:'Baixar PDF do orçamento de código 102',exact:true}).click();
  const preview = await opened;
  await expect(preview.locator('main')).toContainText('Orçamento nº 102');
  await preview.close();
});
