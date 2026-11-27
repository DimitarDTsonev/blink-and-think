'use strict';
const networks = document.getElementById('networks');
const ssidInput = document.querySelector('[name="ssid"]');
networks.addEventListener('change', () => {
  if (networks.value) ssidInput.value = networks.value;
});
document.getElementById('showPassword').addEventListener('click', (event) => {
  const input = document.getElementById('password'),
    show = input.type === 'password';
  input.type = show ? 'text' : 'password';
  event.target.textContent = show ? 'Hide' : 'Show';
  event.target.setAttribute('aria-pressed', String(show));
});
(async () => {
  const controller = new AbortController(),
    timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch('/api/networks', { cache: 'no-store', signal: controller.signal });
    if (!response.ok) throw new Error('Scan unavailable');
    const data = await response.json();
    networks.replaceChildren(new Option('Choose your network', ''));
    const seen = new Set();
    for (const network of data.networks) {
      if (seen.has(network.ssid)) continue;
      seen.add(network.ssid);
      networks.add(new Option(`${network.ssid} · channel ${network.channel}`, network.ssid));
    }
    networks.disabled = seen.size === 0;
    if (data.saved) {
      ssidInput.value = data.saved;
      if (seen.has(data.saved)) networks.value = data.saved;
    }
    document.getElementById('scanInfo').textContent =
      data.saved && !seen.has(data.saved)
        ? `The saved network “${data.saved}” wasn't found. Choose the exact name; hyphens and underscores are different.`
        : seen.size
          ? 'Choose a network you own or have permission to use.'
          : 'No networks found. Enable 2.4 GHz on your router or enter a hidden network name below.';
  } catch {
    networks.replaceChildren(new Option('Network list unavailable', ''));
    document.getElementById('scanInfo').textContent =
      'You can enter the exact name of your 2.4 GHz network below.';
  } finally {
    clearTimeout(timer);
  }
})();
document.getElementById('wifi').addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = document.getElementById('submit'),
    status = document.getElementById('status');
  button.disabled = true;
  status.textContent = 'Saving your connection…';
  const controller = new AbortController(),
    timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch('/api/wifi', {
      method: 'POST',
      headers: { 'X-Setup': '1' },
      body: new URLSearchParams(new FormData(event.target)),
      signal: controller.signal
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error);
    status.textContent = 'Saved! Your board is restarting.';
    event.target.reset();
    document.getElementById('savedSteps').hidden = false;
  } catch (error) {
    status.textContent =
      error.name === 'AbortError'
        ? 'No confirmation received. Check Serial Monitor; the board may already be restarting.'
        : error.message;
    button.disabled = false;
  } finally {
    clearTimeout(timer);
  }
});
