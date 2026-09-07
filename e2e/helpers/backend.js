import { expect } from '@playwright/test';
import { data as fixtures } from '../../tests/fixtures/workspace.js';

export async function backend(page, initial = fixtures, isAdmin = true) {
  let payload = structuredClone(initial);
  let revision = payload ? 1 : 0;
  let fail = false;
  const approvedCodes = [];
  let nextClientCode = 500;
  let nextCategoryCode = 600;
  let nextProductCode = 700;
  let nextBudgetCode = 800;
  await page.route('https://dnvfbfjgufgcokjmqsji.supabase.co/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/token')) {
      const { password } = route.request().postDataJSON();
      if (password !== 'test-password') return route.fulfill({ status: 401, json: {} });
      return route.fulfill({ json: {
        access_token: 'test-token', expires_at: Math.floor(Date.now() / 1000) + 3600,
        user: { id: 'test-user', email: 'test@example.com' }
      } });
    }
    if (path.endsWith('/atlas_load_workspace')) return route.fulfill({ json: payload ? [{ payload, revision, is_admin: isAdmin, approved_codes: approvedCodes }] : [] });
    if (path.endsWith('/atlas_approve_budget')) {
      const body = route.request().postDataJSON();
      if (fail) return route.fulfill({status:500,json:{}});
      if (body.expected_revision !== revision) return route.fulfill({json:null});
      approvedCodes.push(body.budget_code);
      return route.fulfill({json:{revision:++revision,payload,approved_codes:approvedCodes}});
    }
    if (path.endsWith('/atlas_save_workspace')) {
      if (fail) return route.fulfill({ status: 500, json: {} });
      const body = route.request().postDataJSON();
      if (body.expected_revision !== revision) return route.fulfill({ json: null });
      payload = body.new_payload;
      payload.clientes = payload.clientes.map((client) =>
        client[0] === null ? [nextClientCode++, ...client.slice(1)] : client
      );
      payload.categorias = payload.categorias.map((row) => row[0] === null ? [nextCategoryCode++, ...row.slice(1)] : row);
      payload.itens = payload.itens.map((row) => row[0] === null ? [nextProductCode++, ...row.slice(1)] : row);
      let newBudgetCode;
      payload.orcamentos = payload.orcamentos.map((row) => {
        if (row[0] !== null) return row;
        newBudgetCode = nextBudgetCode++;
        return [newBudgetCode, ...row.slice(1)];
      });
      payload.itensOrcamento = payload.itensOrcamento.map((row) => row[0] === null ? [newBudgetCode, ...row.slice(1)] : row);
      return route.fulfill({ json: { revision: ++revision, payload } });
    }
    if (path.endsWith('/logout')) return route.fulfill({ status: 204 });
    return route.abort();
  });
  await page.goto('/');
  await page.locator('#auth-form [name=email]').fill('test@example.com');
  await page.locator('#auth-form [name=password]').fill('test-password');
  await page.getByRole('button', { name: 'ENTRAR', exact: true }).click();
  await expect(page.locator('#application')).toBeVisible();
  return { saved: () => payload, fail: () => { fail = true; }, conflict: () => { revision++; } };
}

export async function section(page, name) {
  await page.locator('aside').getByRole('button', { name, exact: true }).click();
}

