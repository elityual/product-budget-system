export function setupNavigation() {
  const toggle = document.querySelector('#menu-toggle');
  const menu = document.querySelector('#main-menu');
  const mobile = window.matchMedia('(max-width: 760px)');
  const setOpen = (open, restoreFocus = false) => {
    menu.classList.toggle('menu-open', open);
    toggle.setAttribute('aria-expanded', String(open || !mobile.matches));
    toggle.setAttribute('aria-label', open ? 'Fechar menu' : 'Abrir menu');
    toggle.title = open ? 'Fechar menu' : 'Abrir menu';
    if (restoreFocus) toggle.focus();
  };
  toggle.onclick = () => {
    const open = !menu.classList.contains('menu-open');
    setOpen(open);
    if (open) menu.querySelector('button:not(.hidden)').focus();
  };
  menu.addEventListener('click', (event) => {
    if (mobile.matches && event.target.closest('button')) setOpen(false, true);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && menu.classList.contains('menu-open')) {
      setOpen(false, true);
    }
  });
  document.addEventListener('click', (event) => {
    if (mobile.matches && !menu.contains(event.target) && !toggle.contains(event.target)) {
      setOpen(false);
    }
  });
  document.addEventListener('focusin', (event) => {
    if (mobile.matches && !menu.contains(event.target) && !toggle.contains(event.target)) {
      setOpen(false);
    }
  });
  mobile.addEventListener('change', () => setOpen(false, menu.contains(document.activeElement)));
  setOpen(false);
}
