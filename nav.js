(() => {
  const initNav = () => {
    const nav = document.querySelector('.nav');
    if (!nav) return;

    const toggle = nav.querySelector('.nav-toggle');
    const links = nav.querySelector('.nav-links');
    if (!toggle || !links) return;

    let backdrop = document.querySelector('.nav-backdrop');
    if (!backdrop) {
      backdrop = document.createElement('div');
      backdrop.className = 'nav-backdrop';
      document.body.appendChild(backdrop);
    }

    const close = () => {
      nav.classList.remove('is-open');
      backdrop.classList.remove('is-open');
      toggle.setAttribute('aria-expanded', 'false');
      document.body.classList.remove('nav-lock');
    };

    const open = () => {
      nav.classList.add('is-open');
      backdrop.classList.add('is-open');
      toggle.setAttribute('aria-expanded', 'true');
      document.body.classList.add('nav-lock');
    };

    const syncDesktop = () => {
      if (window.matchMedia('(min-width: 1000px)').matches) close();
    };

    toggle.addEventListener('click', () => {
      const isOpen = nav.classList.contains('is-open');
      if (isOpen) close();
      else open();
    });

    backdrop.addEventListener('click', close);
    links.addEventListener(
      'click',
      (event) => {
        if (event.target && event.target.closest && event.target.closest('a')) close();
      },
      true
    );

    window.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') close();
    });
    window.addEventListener('resize', syncDesktop);

    syncDesktop();
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initNav);
  else initNav();
})();

