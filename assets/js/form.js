function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

export function createField(
  [name, label, type, options],
  categories,
  dynamicOptions = {}
) {
  const availableOptions = dynamicOptions[name] ?? (
    options ? options.split(',') : categories.map((category) => category[1])
  );

  if (type === 'combobox') {
    const comboboxOptions = availableOptions
      .map((option) => `
        <button type="button" data-combobox-option="${escapeHtml(option)}">
          ${escapeHtml(option)}
        </button>
      `)
      .join('');

    return `
      <label>${label}
        <div class="combobox" data-combobox>
          <input required name="${name}" type="text" autocomplete="off" placeholder="Digite para pesquisar" role="combobox" aria-autocomplete="list" aria-controls="${name}-options" aria-expanded="false">
          <div class="combo-options hidden" id="${name}-options">${comboboxOptions}</div>
        </div>
      </label>
    `;
  }

  if (type === 'dropdown') {
    const selectedOption = availableOptions[0] ?? '';
    const dropdownOptions = availableOptions
      .map((option, index) => `
        <button type="button" role="option" aria-selected="${index === 0}" data-dropdown-option="${escapeHtml(option)}">
          ${escapeHtml(option)}
        </button>
      `)
      .join('');

    return `
      <div class="form-field">
        <span class="field-label">${label}</span>
        <div class="dropdown" data-dropdown>
          <input class="dropdown-value" name="${name}" type="hidden" value="${escapeHtml(selectedOption)}">
          <button class="dropdown-toggle" type="button" aria-haspopup="listbox" aria-expanded="false" aria-controls="${name}-options">
            <span data-dropdown-label>${escapeHtml(selectedOption)}</span><span class="dropdown-icon" aria-hidden="true">▾</span>
          </button>
          <div class="dropdown-options hidden" id="${name}-options" role="listbox">${dropdownOptions}</div>
        </div>
      </div>
    `;
  }

  if (type === 'select') {
    const selectOptions = availableOptions
      .map((option) => `<option>${escapeHtml(option)}</option>`)
      .join('');

    return `<label>${label}<select name="${name}">${selectOptions}</select></label>`;
  }

  const numberStep = type === 'number' ? ' step="0.01"' : '';
  return `<label>${label}<input required name="${name}" type="${type}"${numberStep}></label>`;
}

export function setupComboboxes(form) {
  form.querySelectorAll('[data-combobox]').forEach((combobox) => {
    const field = combobox.querySelector('input');
    const optionsContainer = combobox.querySelector('.combo-options');
    const optionButtons = [
      ...optionsContainer.querySelectorAll('[data-combobox-option]')
    ];
    const availableOptions = optionButtons.map(
      (button) => button.dataset.comboboxOption
    );

    const updateSelectedOption = () => {
      optionButtons.forEach((button) => {
        const isSelected = button.dataset.comboboxOption === field.value;
        button.classList.toggle('selected', isSelected);
        button.setAttribute('aria-selected', String(isSelected));
      });
    };

    const validateSelection = () => {
      const isValid = !field.value || availableOptions.includes(field.value);
      field.setCustomValidity(isValid ? '' : 'Selecione uma opção da lista.');
    };

    const showMatchingOptions = () => {
      const search = field.value.trim().toLocaleLowerCase('pt-BR');
      let hasVisibleOption = false;

      optionButtons.forEach((button) => {
        const matches = button.dataset.comboboxOption
          .toLocaleLowerCase('pt-BR')
          .includes(search);
        button.classList.toggle('hidden', !matches);
        hasVisibleOption ||= matches;
      });

      updateSelectedOption();
      optionsContainer.classList.toggle('hidden', !hasVisibleOption);
      field.setAttribute('aria-expanded', String(hasVisibleOption));
    };

    field.onfocus = showMatchingOptions;
    field.oninput = () => {
      validateSelection();
      showMatchingOptions();
    };
    field.onblur = () => {
      validateSelection();
      setTimeout(() => {
        optionsContainer.classList.add('hidden');
        field.setAttribute('aria-expanded', 'false');
        field.dispatchEvent(new Event('change', { bubbles: true }));
      }, 100);
    };
    field.onkeydown = (event) => {
      if (event.key === 'Escape') {
        optionsContainer.classList.add('hidden');
        field.setAttribute('aria-expanded', 'false');
      }
    };

    optionButtons.forEach((button) => {
      button.onmousedown = (event) => event.preventDefault();
      button.onclick = () => {
        field.value = button.dataset.comboboxOption;
        field.setCustomValidity('');
        updateSelectedOption();
        optionsContainer.classList.add('hidden');
        field.setAttribute('aria-expanded', 'false');
      };
    });
  });
}

export function setupDropdowns(form) {
  form.querySelectorAll('[data-dropdown]').forEach((dropdown) => {
    const field = dropdown.querySelector('.dropdown-value');
    const toggle = dropdown.querySelector('.dropdown-toggle');
    const label = dropdown.querySelector('[data-dropdown-label]');
    const optionsContainer = dropdown.querySelector('.dropdown-options');
    const optionButtons = [
      ...optionsContainer.querySelectorAll('[data-dropdown-option]')
    ];

    const closeDropdown = () => {
      optionsContainer.classList.add('hidden');
      toggle.setAttribute('aria-expanded', 'false');
    };

    const syncSelection = () => {
      const selectedButton = optionButtons.find(
        (button) => button.dataset.dropdownOption === field.value
      );
      label.textContent = selectedButton?.textContent.trim() ?? field.value;
      optionButtons.forEach((button) => {
        const isSelected = button.dataset.dropdownOption === field.value;
        button.classList.toggle('selected', isSelected);
        button.setAttribute('aria-selected', String(isSelected));
      });
    };

    toggle.onclick = () => {
      const willOpen = optionsContainer.classList.contains('hidden');
      optionsContainer.classList.toggle('hidden', !willOpen);
      toggle.setAttribute('aria-expanded', String(willOpen));
    };
    toggle.onkeydown = (event) => {
      if (event.key === 'Escape') {
        closeDropdown();
      }
    };
    toggle.onblur = () => setTimeout(closeDropdown, 100);

    optionButtons.forEach((button) => {
      button.onmousedown = (event) => event.preventDefault();
      button.onclick = () => {
        field.value = button.dataset.dropdownOption;
        syncSelection();
        closeDropdown();
        field.dispatchEvent(new Event('change', { bubbles: true }));
      };
    });

    syncSelection();
  });
}
