for (const menu of document.querySelectorAll('.ak-st-menu')) {
  const button = menu.querySelector('summary');
  const links = [...menu.querySelectorAll('nav a')];
  const current = links.find(link => link.hasAttribute('aria-current')) ?? links[0];
  const open = () => {
    menu.open = true;
    current?.focus();
  };
  const close = () => {
    menu.open = false;
    button.focus();
  };
  menu.addEventListener('toggle', () => button.setAttribute('aria-expanded', String(menu.open)));
  button.addEventListener('click', event => {
    event.preventDefault();
    if (menu.open) close();
    else open();
  });
  menu.addEventListener('keydown', event => {
    if (event.key === 'ArrowDown' && event.target === button && !menu.open) {
      event.preventDefault();
      open();
      return;
    }
    if (!menu.open) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      return;
    }
    const index = links.indexOf(document.activeElement);
    const last = links.length - 1;
    const next = {ArrowDown:(index + 1) % links.length, ArrowUp:(index <= 0 ? last : index - 1), Home:0, End:last};
    if (event.key in next) {
      event.preventDefault();
      links[next[event.key]]?.focus();
    }
    if (event.key === 'Tab' && (event.shiftKey ? index === 0 : index === last)) {
      event.preventDefault();
      close();
    }
  });
  document.addEventListener('pointerdown', event => {
    if (menu.open && !menu.contains(event.target)) close();
  });
}

for (const link of document.querySelectorAll('[data-staff-select]')) {
  link.addEventListener('click', event => {
    if (!matchMedia('(min-width:1240px)').matches || event.button || event.ctrlKey
      || event.metaKey || event.altKey || event.shiftKey) return;
    event.preventDefault();
    location.assign(link.dataset.staffSelect);
  });
}

const detailTabs = document.querySelector('[data-detail-tabs]');
if (detailTabs) {
  const tabs = [...detailTabs.querySelectorAll('a')];
  const panels = tabs.map(tab => document.getElementById(tab.hash.slice(1)));
  if (panels.every(Boolean)) {
    detailTabs.setAttribute('role','tablist');
    function showTab(index, focus = false) {
      for (const [position, tab] of tabs.entries()) {
        const panel = panels[position];
        const active = position === index;
        tab.id = 'detail-tab-' + panel.id;
        tab.setAttribute('role','tab');
        tab.setAttribute('aria-controls',panel.id);
        tab.setAttribute('aria-selected',String(active));
        tab.tabIndex = active ? 0 : -1;
        panel.setAttribute('role','tabpanel');
        panel.setAttribute('aria-labelledby',tab.id);
        panel.tabIndex = 0;
        panel.hidden = !active;
      }
      if (focus) tabs[index].focus();
    }
    const locationIndex = () => Math.max(0,tabs.findIndex(tab => tab.hash === location.hash));
    const navigate = index => {
      history.replaceState(history.state,'',tabs[index].hash);
      showTab(index,true);
    };
    showTab(locationIndex());
    window.addEventListener('hashchange',()=>showTab(locationIndex()));
    for (const [index, tab] of tabs.entries()) {
      tab.addEventListener('click',event=>{
        if (event.ctrlKey||event.metaKey||event.shiftKey||event.altKey) return;
        event.preventDefault();
        navigate(index);
      });
      tab.addEventListener('keydown',event=>{
        const next = {ArrowLeft:(index+tabs.length-1)%tabs.length,ArrowRight:(index+1)%tabs.length,Home:0,End:tabs.length-1};
        if (!Object.hasOwn(next,event.key)) return;
        event.preventDefault();
        navigate(next[event.key]);
      });
    }
  }
}
