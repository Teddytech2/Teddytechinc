(() => {
  const $ = (s) => document.querySelector(s);
  const form = $('#donation-form'), amount = $('#amount'), status = $('#form-status'), button = $('#donate-submit');
  let currency = 'KES';
  const formatMoney = value => `${currency === 'KES' ? 'KSh' : currency} ${Number(value || 0).toLocaleString('en-KE',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
  function updateAmount() { $('#amount-preview').textContent = formatMoney(amount.value || 0); $('#currency-prefix').textContent = currency === 'KES' ? 'KSh' : currency; }
  amount.addEventListener('input', updateAmount);
  $('#year').textContent = new Date().getFullYear();
  const toggle = $('.menu-toggle'), nav = $('#navlinks');
  toggle.addEventListener('click', () => { const open = nav.classList.toggle('open'); toggle.setAttribute('aria-expanded', String(open)); });
  nav.querySelectorAll('a').forEach(a => a.addEventListener('click', () => nav.classList.remove('open')));
  async function loadConfig() {
    try {
      const r = await fetch('/api/config'); const c = await r.json();
      currency = c.currency || 'KES'; updateAmount();
      document.title = c.title || document.title;
      const links = [
        ['Email', c.contactEmail ? `mailto:${c.contactEmail}` : ''],
        ['Telegram', c.telegramUrl], ['WhatsApp', c.whatsappUrl], ['GitHub', c.githubUrl], ['Website', c.websiteUrl]
      ].filter(x => x[1]);
      $('#contact-links').innerHTML = links.length ? links.map(([name, href]) => `<a href="${String(href).replace(/&/g,'&amp;').replace(/"/g,'&quot;')}" target="_blank" rel="noopener noreferrer">${name} ↗</a>`).join('') : '<p>Official contact links can be configured in your backend environment.</p>';
    } catch (_) {}
  }
  form.addEventListener('submit', async e => {
    e.preventDefault(); status.textContent = '';
    const data = { amount: amount.value, email: $('#email').value.trim(), donorName: $('#donorName').value.trim(), message: $('#message').value.trim(), anonymous: $('#anonymous').checked };
    if (!Number.isFinite(Number(data.amount)) || Number(data.amount) <= 0) { status.textContent = 'Please enter a valid positive amount.'; amount.focus(); return; }
    button.classList.add('loading'); button.disabled = true; button.textContent = 'Preparing secure checkout…';
    try {
      const r = await fetch('/api/donations/initialize', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(data) });
      const result = await r.json();
      if (!r.ok) throw new Error(result.error || 'Could not start checkout.');
      sessionStorage.setItem('ttinc_last_reference', result.reference);
      window.location.assign(result.authorizationUrl);
    } catch (err) {
      status.textContent = err.message || 'Unable to connect. Please try again.';
      button.classList.remove('loading'); button.disabled = false; button.innerHTML = 'Continue to secure checkout <span>↗</span>';
    }
  });
  loadConfig(); updateAmount();
})();