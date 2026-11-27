# Troubleshooting

| Symptom | Check |
| --- | --- |
| No serial device appears | Use a USB data cable; check the driver for your actual USB bridge; try a direct USB port. |
| Upload cannot open the port | Close Serial Monitor, select the actual port, and check Linux permissions or WSL USB attachment. |
| Upload stays at `Connecting` | Hold BOOT during the connection attempt, release once flashing starts. |
| Board starts in download mode | Release BOOT and tap EN. BOOT must not be held across normal reset. |
| `pio` is not found | Open a PlatformIO terminal or use the extension's controls; generic VS Code tasks require pio on PATH. |
| Home Wi-Fi is not found | Enable 2.4 GHz. Select the exact SSID; a hyphen is different from an underscore. Setup's list is scanned at boot. |
| Wi-Fi password rejected | Re-enter it locally; verify network security and exact SSID. Enterprise 802.1X and captive-portal networks are not supported. |
| Browser cannot reach the board | Confirm power and the same LAN. Try the current serial-reported IP. Check guest-network isolation or VPN routing. |
| `color-game.local` does not open | mDNS is unavailable on some clients/networks; use the current IP instead. |
| Old bookmark stopped working | DHCP may have changed the IP. Use the hostname, current QR, or a router DHCP reservation. |
| Page looks like an older version | Reload after uploading matching firmware; embedded web assets require rebuilding and flashing. |
| One LED never lights | Unplug USB; check polarity, resistor ends, jumper insertion and correct breadboard groups. |
| Screen color differs from the physical LED | Run the 1.5-second test; compare GPIO25/26/27/33 with the wiring table. Fix wiring or `hardware.h`, not both blindly. |
| Both greens are confusing | Green 1 is next to red; Green 2 is after yellow. Their numbers matter in scoring. |
| Buttons are disabled | Wait for playback to finish or for another player's session to end. Studio and game cannot own the board together. |
| Lights turn off after locking the phone | Expected: a 15-second owner heartbeat timeout extinguishes studio outputs. Keep the page visible. |
| No sound on iPhone | Tap Sound on and check device volume/output. Audio must be unlocked by a user gesture. |
| Screenshot preview differs from physical behavior | Preview uses a separate simulator. Confirm actual GPIO, latency and Safari behavior after flashing an approved build. |

Always disconnect power before correcting wiring. Do not erase flash merely to restart the board: EN or a USB power cycle is sufficient, and erased flash loses saved credentials and records.

When reporting a bug, include board family, firmware version, browser, steps and sanitized logs. Serial startup logs can include nearby SSIDs and the setup password; remove those before sharing.
