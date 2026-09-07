import { data, state, get } from './data.js';
import { saveData } from './backend.js';
import { setupNavigation } from './navigation.js';
import { createListing } from './listing.js';
import { createRecords } from './records.js';
import { createBudgetFlow } from './budget-flow.js';
import { setupSession } from './session.js';
let saving = false;
async function persist(previous) {
  saving = true;
  get('#application').inert = true;
  get('#overlay').inert = true;
  try {
    await saveData(data);
    return true;
  } catch (error) {
    Object.assign(data, previous);
    render();
    alert(error.message);
    return false;
  } finally {
    saving = false;
    get('#application').inert = false;
    get('#overlay').inert = false;
  }
}

function updateHeaderDate() {
  const currentDate = new Date();
  const dateElement = get('#current-date');
  const year = currentDate.getFullYear();
  const month = String(currentDate.getMonth() + 1).padStart(2, '0');
  const day = String(currentDate.getDate()).padStart(2, '0');

  dateElement.dateTime = `${year}-${month}-${day}`;
  dateElement.textContent = new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'long'
  }).format(currentDate);
}


const listing = createListing({
  openModal: (...args) => records.openModal(...args),
  openBudgetClientSelection: () => budgetFlow.openBudgetClientSelection()
});
function render() { listing.render(); }
const common = { render, resetFilters: listing.resetFilters, persist };
const records = createRecords({ ...common,
  isSaving: () => saving, setSaving: (value) => { saving = value; },
  editBudget: (index) => budgetFlow.editBudget(index),
  submitBudget: (...args) => budgetFlow.submit(...args)
});
const budgetFlow = createBudgetFlow({ ...common, closeModal: records.closeModal });
updateHeaderDate();
setupNavigation();
setupSession({ ...common, closeModal: records.closeModal });
