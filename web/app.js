'use strict';

const $ = (id) => document.getElementById(id);
const pads = [...document.querySelectorAll('[data-color]')];
const manualPads = [...document.querySelectorAll('[data-led]')];
const speeds = [2000, 1000, 500, 250];
const physicalOrder = [0, 1, 3, 2];
const names = ['Red', 'Green 1', 'Green 2', 'Yellow'];
const modeDescriptions = [
  'Repeat the pattern. Every round adds one light.',
  'Play it backwards, from the last light to the first.',
  'A fresh pattern every round. One light longer each time.'
];
const preview = !!window.BLINK_PREVIEW;
let current = null,
  connected = false,
  actionPending = false,
  networkError = false;
let queue = Promise.resolve(),
  clockSample = null,
  lastResponseAt = 0;
let sound = false,
  audio = null,
  lastCue = '',
  sharedAddress = '',
  currentView = '';

function readStored(kind, key, fallback = '') {
  try {
    return window[kind].getItem(key) || fallback;
  } catch {
    return fallback;
  }
}
function writeStored(kind, key, value) {
  try {
    window[kind].setItem(key, value);
  } catch {
    /* Private browsing can deny storage. */
  }
}
let playerId = readStored('sessionStorage', 'blink-player');
if (!/^[a-f0-9]{32}$/.test(playerId)) {
  playerId = [...crypto.getRandomValues(new Uint8Array(16))]
    .map((n) => n.toString(16).padStart(2, '0'))
    .join('');
  writeStored('sessionStorage', 'blink-player', playerId);
}
$('name').value = readStored('localStorage', 'blink-name', 'Player');
$('speed').value = readStored('localStorage', 'blink-speed', '1000');
$('mode').value = readStored('localStorage', 'blink-mode', '0');
if (!speeds.includes(Number($('speed').value))) $('speed').value = '1000';
if (!['0', '1', '2'].includes($('mode').value)) $('mode').value = '0';
$('demoBanner').hidden = !preview;
$('demoBoard').hidden = !preview;
const points = (half) => ((half || 0) / 2).toLocaleString('en', { maximumFractionDigits: 1 });

function route() {
  const requested = location.hash.slice(1);
  const view = ['home', 'play', 'studio', 'connect'].includes(requested) ? requested : 'home';
  document.querySelectorAll('.view').forEach((panel) => {
    panel.hidden = panel.id !== `${view}-view`;
  });
  document.querySelectorAll('[data-nav]').forEach((link) => {
    if (link.dataset.nav === view) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  $('pageLabel').textContent = {
    home: 'Blink & Think',
    play: 'Time to play',
    studio: 'Light studio',
    connect: 'Connect & help'
  }[view];
  if (currentView && currentView !== view) {
    $('main').focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }
  currentView = view;
}
window.addEventListener('hashchange', route);
route();

function unlockAudio() {
  if (!sound) return;
  try {
    audio ||= new (window.AudioContext || window.webkitAudioContext)();
    audio.resume().catch(() => {});
  } catch {
    sound = false;
  }
}
function beep(frequency, duration = 0.12, offset = 0) {
  if (!sound || !audio || audio.state !== 'running') return;
  const oscillator = audio.createOscillator(),
    gain = audio.createGain(),
    start = audio.currentTime + offset;
  oscillator.frequency.value = frequency;
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(0.1, start + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(gain);
  gain.connect(audio.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.02);
  oscillator.onended = () => {
    oscillator.disconnect();
    gain.disconnect();
  };
}
function playerName() {
  const name = $('name').value.trim();
  if (!name || new TextEncoder().encode(name).length > 48)
    throw new Error('Enter a short player name (up to 20 characters).');
  writeStored('localStorage', 'blink-name', name);
  return name;
}
function manualState() {
  return (
    current?.manual || {
      active: false,
      mask: 0,
      brightness: 35,
      effect: 0,
      interval: 500,
      testing: false,
      outputs: [0, 0, 0, 0]
    }
  );
}
function shareBoard(address) {
  if (preview) {
    $('qrCode').textContent = 'Preview mode. A real board shows a scannable game link here.';
    $('deviceAddress').textContent = 'No physical board connected';
    $('copyLink').disabled = true;
    return;
  }
  if (!address || address === sharedAddress) return;
  let url;
  try {
    url = new URL(address);
  } catch {
    return;
  }
  // Never render arbitrary schemes received over the local network as links.
  if (url.protocol !== 'http:' || !/^\d{1,3}(\.\d{1,3}){3}$/.test(url.hostname)) return;
  sharedAddress = url.origin;
  $('deviceAddress').textContent = sharedAddress;
  $('deviceAddress').href = sharedAddress;
  $('copyLink').disabled = false;
  try {
    const qr = qrcode(0, 'M');
    qr.addData(sharedAddress);
    qr.make();
    // The only markup comes from the vendored QR library, encoding the validated IP URL.
    $('qrCode').innerHTML = qr.createSvgTag({ cellSize: 5, margin: 20, scalable: true });
  } catch {
    $('qrCode').textContent = 'Use the address below to open the game.';
  }
}
function render() {
  const s = current,
    m = manualState(),
    playing = !!s?.busy,
    mine = !!s?.mine;
  const occupied = playing || m.active;
  const studioAllowed = connected && !playing && (!m.active || mine) && !actionPending;
  $('connection').textContent = connected
    ? preview
      ? 'Preview ready'
      : 'Board connected'
    : 'Not connected';
  $('connection').classList.toggle('online', connected);
  $('networkNotice').hidden = connected || !networkError;
  $('name').disabled = occupied || actionPending;
  $('sessionBar').hidden = !occupied;
  $('sessionText').textContent = occupied
    ? `${mine ? 'Your' : `${s.player}'s`} ${playing ? 'game' : 'light studio'} session${mine ? '' : ' · please wait for your turn'}`
    : '';
  $('stop').hidden = !(mine && occupied);
  $('stop').disabled = !connected || actionPending;
  $('releaseStudio').hidden = !(mine && m.active);
  $('releaseStudio').disabled = !connected || actionPending;
  if (playing) {
    $('speed').value = String(s.interval);
    $('mode').value = String(s.mode);
  }
  $('speed').disabled = $('mode').disabled = occupied || actionPending;
  $('modeDescription').textContent = modeDescriptions[Number($('mode').value)];
  $('start').disabled = !connected || occupied || actionPending;
  $('start').textContent = playing
    ? 'Game in progress'
    : m.active
      ? 'End the light session first'
      : s?.phase === 'over'
        ? 'Play again'
        : 'Start game';
  pads.forEach((pad) => {
    pad.disabled = !connected || !mine || s?.phase !== 'input' || actionPending;
  });
  manualPads.forEach((pad) => {
    pad.disabled = !studioAllowed || m.testing;
    pad.setAttribute(
      'aria-pressed',
      String(
        m.active && !m.testing && m.effect === 0 && !!(m.mask & (1 << Number(pad.dataset.led)))
      )
    );
  });
  for (const id of ['brightness', 'effect', 'effectSpeed', 'allOn', 'testLeds'])
    $(id).disabled = !studioAllowed || m.testing;
  $('allOff').disabled = !studioAllowed;
  $('testLeds').textContent = m.testing ? 'Testing the lights…' : 'Test all lights · 1.5s each';
  $('studioStatus').textContent = playing
    ? 'Game in progress'
    : m.active
      ? mine
        ? 'You have control'
        : `${s.player} has control`
      : 'Ready to explore';
  if (document.activeElement !== $('brightness')) $('brightness').value = m.brightness;
  $('brightnessValue').textContent = `${$('brightness').value}%`;
  $('effect').value = String(m.effect);
  $('effectSpeed').value = String(m.interval);
  shareBoard(s?.address);
  if (!s) return;
  $('level').textContent = s.length ? Math.min(s.score + 1, 30) : '—';
  $('score').textContent = points(s.pointsHalf);
  $('best').textContent = points(
    s.best[Number($('mode').value) * 4 + speeds.indexOf(Number($('speed').value))]
  );
  $('sequenceInfo').textContent = s.length
    ? `${s.length} lights in the pattern`
    : 'Starts with 3 lights';
  const progress = document.querySelector('[role="progressbar"]');
  progress.setAttribute('aria-valuemax', s.length || 3);
  progress.setAttribute('aria-valuenow', s.answered);
  $('progress').style.width = `${s.length ? (100 * s.answered) / s.length : 0}%`;
  $('caption').textContent =
    s.phase === 'input'
      ? `${s.answered} of ${s.length} answered · ${Math.ceil(s.remaining / 1000)}s left`
      : 'Watch the board. Answer on your screen.';
  $('award').textContent =
    mine && ['input', 'roundWon'].includes(s.phase) && s.answered > 0
      ? s.lastAwardHalf === 1
        ? '+0.5 · other green'
        : '+1 · exact light'
      : '';
  let title = 'Your next personal best?',
    hint = 'Choose your challenge, then watch the lights on your board.',
    phase = 'Ready when you are',
    glyph = '✳';
  if (s.phase === 'countdown') {
    title = 'Here we go.';
    hint = `Look at ${preview ? 'the virtual board above' : 'your physical LEDs'}. ${s.length} lights are coming.`;
    phase = 'Get ready';
  }
  if (s.phase === 'showing') {
    title = 'Watch the pattern.';
    hint = 'Remember each light, including its number. Your buttons unlock next.';
    phase = 'Watch & remember';
    glyph = '◎';
  }
  if (s.phase === 'input') {
    title = mine ? 'Your turn.' : `${s.player} is thinking…`;
    hint = mine
      ? s.mode === 1
        ? 'Go backwards. Last light first.'
        : 'Repeat the lights in the same order.'
      : 'You can start when this turn finishes.';
    phase = 'Repeat the pattern';
    glyph = '↺';
  }
  if (s.phase === 'roundWon') {
    title = 'Nicely remembered.';
    hint =
      s.mode === 2
        ? 'A new pattern, one light longer. Get ready.'
        : 'One more light joins the pattern. Get ready.';
    phase = 'Round complete';
    glyph = '✦';
  }
  if (s.phase === 'over') {
    title =
      {
        mistake: 'A good run. Go again?',
        timeout: 'Time slipped away.',
        abandoned: 'The board is free again.',
        completed: 'All 32. What a memory!',
        cancelled: 'See you next round.'
      }[s.result] || 'Round finished.';
    hint = `${s.player} earned ${points(s.pointsHalf)} points across ${s.score} completed rounds.`;
    phase = 'Turn complete';
    glyph = s.result === 'completed' ? '✦' : '↺';
  }
  $('title').textContent = title;
  $('hint').textContent = hint;
  $('phaseLabel').textContent = phase;
  $('gameGlyph').textContent = glyph;
  const cue = `${s.run}:${s.phase}:${s.score}`;
  if (cue !== lastCue && mine) {
    if (s.phase === 'roundWon' || s.result === 'completed') {
      beep(523, 0.15);
      beep(659, 0.15, 0.15);
      beep(784, 0.22, 0.3);
    } else if (s.phase === 'over' && ['mistake', 'timeout'].includes(s.result)) beep(165, 0.3);
  }
  lastCue = cue;
}

function request(path, data) {
  const task = async () => {
    const sentAt = performance.now(),
      controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4500);
    try {
      let body, ok;
      if (preview) {
        const result = window.previewDevice.request(path, playerId, data);
        body = result.body;
        ok = result.status < 400;
      } else {
        const options = {
          method: data ? 'POST' : 'GET',
          headers: { 'X-Player-Id': playerId },
          cache: 'no-store',
          signal: controller.signal
        };
        if (data) {
          options.body = new URLSearchParams(data);
          options.headers['Content-Type'] = 'application/x-www-form-urlencoded';
        }
        const response = await fetch(path, options);
        body = await response.json();
        ok = response.ok;
      }
      connected = true;
      if (networkError) {
        networkError = false;
        $('error').textContent = '';
      }
      if (!ok) throw new Error(body.error || 'That request could not be completed.');
      const receivedAt = performance.now(),
        rtt = receivedAt - sentAt;
      const key = `${body.run}:${body.manual?.testStart}`;
      if (
        Number.isFinite(body.now) &&
        (!clockSample || clockSample.key !== key || rtt < clockSample.rtt)
      )
        clockSample = { server: body.now + rtt / 2, local: receivedAt, rtt, key };
      lastResponseAt = receivedAt;
      current = body;
      render();
      return body;
    } catch (error) {
      if (
        error.name === 'AbortError' ||
        error instanceof TypeError ||
        error instanceof SyntaxError
      ) {
        connected = false;
        networkError = true;
        render();
        throw new Error('Connection lost. Keep the board powered and stay on the same Wi-Fi.');
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  };
  const result = queue.then(task);
  queue = result.catch(() => {});
  return result;
}
async function perform(work) {
  if (actionPending) return;
  actionPending = true;
  $('error').textContent = '';
  render();
  try {
    await work();
  } catch (error) {
    $('error').textContent = error.message;
    try {
      await request('/api/state');
    } catch {
      /* Polling will retry. */
    }
  } finally {
    actionPending = false;
    render();
  }
}
function manualAction(changes, test = false) {
  if (!connected || current?.busy || (manualState().active && !current?.mine)) return;
  perform(async () => {
    if (!manualState().active) await request('/api/manual/start', { name: playerName() });
    if (test) return request('/api/manual/test', { run: current.run });
    const m = manualState();
    return request('/api/manual/set', {
      run: current.run,
      mask: m.mask,
      brightness: m.brightness,
      effect: m.effect,
      interval: m.interval,
      ...changes
    });
  });
}
$('startForm').addEventListener('submit', (event) => {
  event.preventDefault();
  if (!connected || current?.busy || manualState().active) return;
  const mode = $('mode').value,
    interval = $('speed').value;
  unlockAudio();
  perform(async () => {
    writeStored('localStorage', 'blink-mode', mode);
    writeStored('localStorage', 'blink-speed', interval);
    await request('/api/start', { name: playerName(), mode, interval });
    if (matchMedia('(max-width:620px)').matches)
      document.querySelector('.game-surface').scrollIntoView({ block: 'start', behavior: 'auto' });
  });
});
pads.forEach((pad) =>
  pad.addEventListener('click', () => {
    if (pad.disabled || !current) return;
    unlockAudio();
    beep([262, 330, 392, 523][Number(pad.dataset.color)]);
    pad.classList.add('pressed');
    setTimeout(() => pad.classList.remove('pressed'), 120);
    const data = {
      color: pad.dataset.color,
      run: current.run,
      length: current.length,
      index: current.answered
    };
    perform(() => request('/api/press', data));
  })
);
document.addEventListener('keydown', (event) => {
  if (
    currentView !== 'play' ||
    event.repeat ||
    event.altKey ||
    event.ctrlKey ||
    event.metaKey ||
    /INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName)
  )
    return;
  const index = ['1', '2', '3', '4'].indexOf(event.key);
  if (index >= 0) {
    event.preventDefault();
    document.querySelector(`[data-color="${physicalOrder[index]}"]`).click();
  }
});
const endSession = () => {
  if (current) perform(() => request('/api/stop', { run: current.run }));
};
$('stop').addEventListener('click', endSession);
$('releaseStudio').addEventListener('click', endSession);
$('mode').addEventListener('change', render);
$('speed').addEventListener('change', render);
$('name').addEventListener('change', () =>
  writeStored('localStorage', 'blink-name', $('name').value.trim())
);
manualPads.forEach((pad) =>
  pad.addEventListener('click', () =>
    manualAction({ mask: manualState().mask ^ (1 << Number(pad.dataset.led)), effect: 0 })
  )
);
$('testLeds').addEventListener('click', () => manualAction({}, true));
$('allOn').addEventListener('click', () => manualAction({ mask: 15, effect: 0 }));
$('allOff').addEventListener('click', () => manualAction({ mask: 0, effect: 0 }));
$('brightness').addEventListener('input', () => {
  $('brightnessValue').textContent = `${$('brightness').value}%`;
});
$('brightness').addEventListener('change', () =>
  manualAction({ brightness: $('brightness').value })
);
$('effect').addEventListener('change', () => manualAction({ effect: $('effect').value }));
$('effectSpeed').addEventListener('change', () =>
  manualAction({ interval: $('effectSpeed').value })
);
$('sound').addEventListener('click', () => {
  sound = !sound;
  unlockAudio();
  $('sound').textContent = sound ? 'Sound on' : 'Sound off';
  $('sound').setAttribute('aria-pressed', String(sound));
  beep(523);
});
$('copyLink').addEventListener('click', async () => {
  if (!sharedAddress) return;
  try {
    if (navigator.clipboard && window.isSecureContext)
      await navigator.clipboard.writeText(sharedAddress);
    else {
      const input = document.createElement('textarea');
      input.value = sharedAddress;
      input.style.position = 'fixed';
      input.style.opacity = '0';
      document.body.append(input);
      input.select();
      input.setSelectionRange(0, input.value.length);
      const copied = document.execCommand('copy');
      input.remove();
      if (!copied) throw new Error('Copy unavailable');
    }
    $('copyStatus').textContent = 'Copied. Share it with someone on the same Wi-Fi.';
  } catch {
    $('copyStatus').textContent = 'Press and hold the address above to copy it.';
  }
});

function animate() {
  const m = manualState(),
    now = performance.now();
  const fresh = connected && !document.hidden && now - lastResponseAt < 1800;
  let testLed = -1,
    status = 'Tap any light to begin a session. Test mode checks each light at 50% brightness.';
  if (fresh && m.testing && clockSample) {
    const serverNow = (clockSample.server + now - clockSample.local) >>> 0;
    const elapsed = (serverNow - m.testStart) | 0,
      step = m.testStep || 1800;
    if (elapsed < 0) status = 'Get ready. Watch the real LEDs and these buttons together.';
    else if (elapsed < 4 * step) {
      const index = Math.floor(elapsed / step),
        color = physicalOrder[index];
      testLed = elapsed % step < (m.testOn || 1500) ? color : -1;
      status = `${index + 1} of 4 · ${names[color]}${testLed < 0 ? ' · short pause' : ' · on for 1.5 seconds'}`;
    } else status = 'Test complete. All lights are off.';
  } else if (m.testing) status = 'Waiting for the board. Check your connection.';
  else if (m.active)
    status =
      'Your studio session is active. All off keeps your turn; End session releases the board.';
  manualPads.forEach((pad) => {
    const color = Number(pad.dataset.led);
    pad.classList.toggle(
      'lit',
      !!(fresh && m.active && (m.testing ? testLed === color : (m.outputs?.[color] || 0) > 0))
    );
  });
  if ($('testStatus').textContent !== status) $('testStatus').textContent = status;
  if (preview) {
    const color = window.previewDevice.virtualLed();
    document
      .querySelectorAll('[data-virtual]')
      .forEach((led) =>
        led.classList.toggle('lit', Number(led.dataset.virtual) === color && !document.hidden)
      );
  }
  requestAnimationFrame(animate);
}
async function poll() {
  if (!document.hidden && !actionPending) {
    try {
      await request('/api/state');
    } catch (error) {
      $('error').textContent = error.message;
    }
  }
  setTimeout(poll, manualState().active ? 200 : 700);
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    connected = false;
    render();
  }
});
render();
poll();
requestAnimationFrame(animate);
