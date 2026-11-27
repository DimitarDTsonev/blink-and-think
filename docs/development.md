# Development guide

## Prerequisites

- Python 3.12 and PlatformIO Core 6.2.0 (`python -m pip install -r requirements-dev.txt`).
- A C++17 host compiler: g++ or clang++ for the portable logic tests.
- Node.js 22+ and npm for browser checks; Playwright is pinned in `package-lock.json`.
- A physical ESP32 only for uploading and hardware acceptance tests.

On Windows, the C++ tests can run in WSL or a configured MinGW/Clang environment. `CXX` can select a compiler executable. Browser and preview tools are otherwise OS-independent. Use `python3` if your system does not name Python 3 `python`.

## Fast UI workflow

1. Edit `web/index.html`, `web/style.css` and `web/app.js`. Setup has its own `web/setup.html` and `web/setup.js`.
2. Regenerate the offline review copy:

   ```sh
   python tools/build_preview.py
   ```

3. Open `preview/index.html` directly, or run `python tools/preview.py` and open **http://localhost:8765/preview/**.
4. Test gameplay, studio effects and mobile layout using the virtual board. No API requests go to an ESP32 in this preview.
5. When approved for hardware, build and upload with PlatformIO. A web-only edit still requires a firmware upload because assets are embedded in flash.

The simulator intentionally reveals its virtual sequence in JavaScript. It is a learning/review tool, not a competitive server. It has no persistent scores or shared session across browser tabs. Browser integration tests use one shared simulator instance to exercise ownership across two clients. Only the real firmware is authoritative for hardware behavior.

## Checks

```sh
python tools/test_logic.py
python tools/check_source.py
python tools/build_preview.py
npm ci
npx playwright install chromium
npm test
pio run
```

On a minimal Linux machine, browser system libraries may need installation; Playwright supports `npx playwright install --with-deps chromium`. Do not confuse a mocked browser test with an actual Safari/ESP32 test.

Browser tests use `os.tmpdir()/blink-think-qa` for screenshots by default. Set `SCREENSHOT_DIR` to another directory. For an already installed browser/package, `CHROMIUM_PATH` and `PLAYWRIGHT_MODULE` can point to them. These variables belong to your shell, not to committed machine-specific configuration.

The generated `preview/index.html` is deliberately committed so readers can download and open one file. Regenerate it after changing any embedded UI asset or `preview/demo.js`. CI checks that regeneration leaves no diff.

Use `npm run format` to format first-party HTML, CSS and JavaScript, then regenerate the preview. `npm run format:check` checks style without changing files; CI runs it too. Vendored code is left unchanged.

## Architecture

```text
Browser (HTML / CSS / JS)
    │ same-origin HTTP + X-Player-Id
    ▼
WebServer routes in src/main.cpp
    ├─ MemoryGame       timers, modes, exact/half-point answers
    ├─ ManualControl    brightness, effects, scheduled light test
    ├─ LEDC PWM         GPIO25 / 26 / 33 / 27
    └─ Preferences      Wi-Fi, setup password, point records
```

- `MemoryGame` and `ManualControl` depend only on standard C++, making them testable without hardware.
- The firmware's main loop ticks the controllers, applies PWM outputs and serves requests. The effects use timestamps rather than long blocking delays.
- Game and studio sessions are mutually exclusive. Each request is validated on the board; disabling buttons in the browser is not the only ownership check.
- A game press includes the run ID, sequence length and accepted-answer index. Duplicate, late and out-of-order answers are rejected.
- One point is stored as **two integer half-points**. This avoids floating-point scoring errors. `score` in the API remains the number of completed rounds.
- Point records save on turn completion in keys `pts0`…`pts11`, under the `color-game` NVS namespace. The four speed slots repeat for each of three modes. Old `best*` round records are not reinterpreted as points.
- Real game responses never contain a sequence or active game LED. Manual output levels and the scheduled wiring-test timeline are visible by design.
- The test starts 1.2 seconds in the future. Each light is on 1500 ms, off 300 ms, in order `[0,1,3,2]`. The browser estimates the server clock from request timing and animates the same schedule. Network/UI delays still limit synchronization accuracy.
- The browser polls every 700 ms in normal use, or every 200 ms while a studio session is active. Hidden pages stop polling; sessions expire after 15 seconds without their owner's heartbeat.

## UI behavior

Home links to Play, Studio and Connect. Desktop supports physical-order keys **1,2,3,4**; shortcuts are ignored while typing, holding a modifier or repeating a key. A phone gets persistent bottom navigation. The studio claims a free board on the first meaningful action, then keeps the lease until ended or timed out.

The join QR encodes the board's current IP, not an external redirect or Wi-Fi password. QR generation uses a locally vendored dependency. The app has no service worker or offline hardware mode, and no CDN/font calls. The preview is a separate, explicitly labeled simulator.

## Optional real-device test

Only run this when the board is idle and the hardware has been checked. In Windows PowerShell:

```powershell
.\tests\device_smoke.ps1 -BaseUrl http://color-game.local
```

The default test leaves all LEDs off, claims the board briefly, validates ownership and then checks lease expiry. If your machine restricts script files, inspect the script and run its commands in your permitted development environment; do not change system policy just to run a test.

Add **`-ExerciseLeds`** to deliberately run the visible light sequence and briefly turn all outputs on. That option verifies the board-reported output timing, not the visible color of a physical component. It must not be run while someone else is using the board. Substitute the current board IP if mDNS is unavailable.

## Editing GPIO or colors

Change `include/hardware.h` and follow the mapping in [hardware.md](hardware.md). If changing logical color identities, update game scoring, frontend labels/order, the simulator and tests together. GPIO identifiers are not header position numbers. Keep optional buzzer output disabled unless its hardware has been checked.

## Source packaging

```sh
python tools/package_source.py
```

This creates `dist/blink-and-think-source.zip` from an explicit source allowlist. It includes documentation, preview and GitHub metadata. It excludes `.pio`, dependency folders, logs, local credentials, Git metadata and unrelated parent projects. It does not initialize Git, contact GitHub or publish anything.
