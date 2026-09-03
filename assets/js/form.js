function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

export function createField([name, label, type, options], categories) {
  if (type === 'combobox') {
    const categoryOptions = categories
      .map((category) => `
        <button type="button" data-category-option="${escapeHtml(category[1])}">
          ${escapeHtml(category[1])}
        </button>
      `)
      .join('');

    return `
      <label>${label}
        <div class="combobox">
          <input required name="${name}" type="text" autocomplete="off" placeholder="Digite para pesquisar" aria-autocomplete="list" aria-controls="category-options">
          <div class="combo-options hidden" id="category-options">${categoryOptions}</div>
        </div>
      </label>
    `;
  }

  if (type === 'select') {
    const selectOptions = options
      .split(',')
      .map((option) => `<option>${option}</option>`)
      .join('');

    return `<label>${label}<select name="${name}">${selectOptions}</select></label>`;
  }

  const numberStep = type === 'number' ? ' step="0.01"' : '';
  return `<label>${label}<input required name="${name}" type="${type}"${numberStep}></label>`;
}

export function setupCategoryCombobox(form) {
  const categoryField = form.elements.categoria;
  const optionsContainer = form.querySelector('#category-options');

  if (!categoryField || !optionsContainer) {
    return;
  }

  const optionButtons = [...optionsContainer.querySelectorAll('[data-category-option]')];

  const showMatchingOptions = () => {
    const search = categoryField.value.trim().toLowerCase();
    let hasVisibleOption = false;

    optionButtons.forEach((button) => {
      const matches = button.dataset.categoryOption.toLowerCase().includes(search);
      button.classList.toggle('hidden', !matches);
      hasVisibleOption ||= matches;
    });

    optionsContainer.classList.toggle('hidden', !hasVisibleOption);
  };

  categoryField.onfocus = showMatchingOptions;
  categoryField.oninput = () => {
    categoryField.setCustomValidity('');
    showMatchingOptions();
  };
  categoryField.onblur = () => {
    setTimeout(() => optionsContainer.classList.add('hidden'), 100);
  };
  categoryField.onkeydown = (event) => {
    if (event.key === 'Escape') {
      optionsContainer.classList.add('hidden');
    }
  };

  optionButtons.forEach((button) => {
    button.onmousedown = (event) => event.preventDefault();
    button.onclick = () => {
      categoryField.value = button.dataset.categoryOption;
      categoryField.setCustomValidity('');
      optionsContainer.classList.add('hidden');
    };
  });
}
