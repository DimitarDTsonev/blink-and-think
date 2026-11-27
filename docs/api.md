# Local HTTP API

The ESP32 serves HTTP on port 80. Web assets and API share one origin. The intended client is the bundled browser application on a trusted LAN. This is not an authenticated public API.

## Session and request format

Game/studio requests include `X-Player-Id`, a 32-character hexadecimal identifier generated per browser tab and stored in sessionStorage. POST bodies use `application/x-www-form-urlencoded`. Responses are JSON; errors have an `error` string and an HTTP 4xx/5xx status. The user-visible strings are English.

A new game or studio claim increments the `run` value. Owner mutations include that value. Expired or foreign ownership yields 409; invalid data yields 400. The server validates ranges and unsigned decimal integer fields.

| Method | Path | Input | Purpose |
| --- | --- | --- | --- |
| GET | `/api/state` | Header only | Current public state; renews an active owner's heartbeat |
| POST | `/api/start` | `name`, `interval`, `mode` | Claim the board and start a memory game |
| POST | `/api/press` | `run`, `color`, `length`, `index` | Submit one answer during Input |
| POST | `/api/stop` | `run` | End the owner's game/studio session and extinguish outputs |
| POST | `/api/manual/start` | `name` | Claim an idle board for the light studio |
| POST | `/api/manual/set` | `run`, `mask`, `brightness`, `effect`, `interval` | Atomically change studio output settings; cancels a timed test |
| POST | `/api/manual/test` | `run` | Schedule the four-light identification test |
| GET | `/api/networks` | Setup mode only | Boot-time scan of 2.4 GHz networks and saved SSID; never a password |
| POST | `/api/wifi` | `ssid`, `password`; `X-Setup: 1` | Save Wi-Fi in setup mode and schedule reboot |

`name` must be nonempty after trimming, with at most 48 UTF-8 bytes. The UI additionally limits it to 20 characters. `interval` for a game is 2000, 1000, 500 or 250 ms. `mode` is 0 Classic, 1 Reverse or 2 Shuffle; omitted mode defaults to Classic.

## State fields

- `phase`: `idle`, `countdown`, `showing`, `input`, `roundWon` or `over`.
- `result`: `none`, `mistake`, `timeout`, `abandoned`, `completed` or `cancelled`.
- `busy`: whether a game is in progress. Check **both** this and `manual.active` before claiming the board.
- `mine`, `player`, `run`: ownership as seen by this client, display name and session/run number.
- `length`, `answered`, `score`: current sequence length, accepted answers in the round, completed rounds.
- `pointsHalf`: total points in half-point units. Display `pointsHalf / 2`.
- `lastAwardHalf`: 2 for exact, 1 for the other green, 0 for a wrong color/no award.
- `interval`, `mode`: active/last game settings.
- `remaining`: remaining time for the next answer, in milliseconds, or 0 outside Input.
- `best`: 12 half-point records. Index = `mode * 4 + speedSlot`, with speed order `[2000,1000,500,250]`.
- `manual`: active status, settings, test schedule and four actual requested PWM duty values.
- `now`: device `millis()` timestamp. Client arithmetic must handle uint32 rollover.
- `address`: current LAN URL for the join QR; for example `http://192.0.2.10` in documentation only. Use your board's actual IP.

The real state does **not** contain the game sequence or the active game LED. Do not add these to implement client-side game playback: it would reveal the answers.

## LED identities

| ID / mask bit | LED | GPIO |
| ---: | --- | ---: |
| 0 / 1 | Red | 25 |
| 1 / 2 | Green 1 | 26 |
| 2 / 4 | Green 2 | 33 |
| 3 / 8 | Yellow | 27 |

Physical order is `[0,1,3,2]`. `mask=15` selects all LEDs; `mask=0` selects none. The two green IDs receive partial-credit interchangeability only during game answers.

## Studio settings

`brightness` is 0–100, mapped to 8-bit PWM. `effect` is 0 Manual, 1 Chase, 2 Blink, 3 Christmas, 4 Breathe or 5 Bounce. Manual `interval` accepts 100–2000 ms; the current UI offers 250/500/1000/2000. Breathe uses four step intervals for a full fade-in/fade-out cycle. Other effects determine their own mask.

A timed test sets brightness to 50%, clears the selected mask/effect, starts after 1200 ms, and runs four 1500 ms illuminations separated by 300 ms gaps. `manual.testing`, `testStart`, `testOn`, `testStep` describe the schedule. `manual.outputs` contains values in logical ID order. All outputs are zero afterward, but the studio session remains owned until released or expired.

## Wi-Fi provisioning

Setup routes are disabled in normal game mode. SSID is 1–32 bytes. Password is empty for an open network or 8–63 bytes. The saved credentials are stored in Preferences/NVS and not returned by the API. Scan results are a cached startup scan, not a live refresh.

## Limitations

No CORS allowance, TLS, authentication, rate-limited public gateway, cloud service or OTA firmware update endpoint is supplied. Session identifiers prevent normal accidental turn collisions; they are not a security boundary against hostile peers on the LAN. See [SECURITY.md](../SECURITY.md).
