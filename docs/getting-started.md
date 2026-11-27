# From a fresh checkout to your first game

The repository root is the folder containing `platformio.ini`, `src/` and `web/`. Open that folder directly in VS Code. A GitHub checkout should contain this project's files at its root, not the author's unrelated parent workspace.

Download the source using **Code → Download ZIP** on [GitHub](https://github.com/DimitarDTsonev/blink-and-think), or clone it:

```sh
git clone https://github.com/DimitarDTsonev/blink-and-think.git
cd blink-and-think
```

## Install the tools

1. Install [Visual Studio Code](https://code.visualstudio.com/).
2. Install the official [PlatformIO IDE extension](https://docs.platformio.org/en/latest/integration/ide/vscode.html). Allow its initialization to finish.
3. Open the project folder and use the PlatformIO terminal. The extension's Build/Upload/Monitor buttons are also available.
4. Connect the assembled ESP32 using a **data-capable** USB cable. Install the driver for your board's USB bridge only if your OS does not recognize it. The reference board uses FTDI; other boards may differ.

The checked-in VS Code tasks call `pio` from PATH. If a task cannot find it, use the PlatformIO terminal or extension buttons. For a command-line environment instead of the extension, install Python 3.12, create a virtual environment and run:

```sh
python -m pip install -r requirements-dev.txt
```

The first build downloads a toolchain and framework and therefore needs internet access. The finished game runs locally without internet.

## Build and upload

```sh
pio run
pio device list
pio run --target upload
pio device monitor --baud 115200
```

Stop Serial Monitor before uploading. If multiple serial devices are attached, choose the one corresponding to your ESP32:

```sh
# Windows example (replace COM5 with the actual listed port)
pio run --target upload --upload-port COM5
pio device monitor --port COM5 --baud 115200

# Linux example
pio run --target upload --upload-port /dev/ttyUSB0
pio device monitor --port /dev/ttyUSB0 --baud 115200

# macOS example: substitute the actual /dev/cu.* path from pio device list
pio run --target upload --upload-port /dev/cu.usbserial-example
```

Use only the example matching your OS. On Linux, serial permissions may require membership in the device's access group (commonly `dialout`) and a new login. A cable can charge a device while lacking data wires.

If automatic bootloader entry fails, start upload, hold BOOT while the tool says `Connecting`, then release it once flashing begins. Do not hold BOOT during normal startup.

**Do not run erase-flash as a routine troubleshooting step.** A normal upload preserves the NVS settings; erasing flash removes Wi-Fi credentials, setup password and scores.

## First Wi-Fi connection

1. Open Serial Monitor at **115200 baud**. Tap **EN / RESET** if you missed the startup messages.
2. Find **Setup network password**. It is generated for this board and saved in NVS; no shared default password is included in this repository.
3. On your phone or laptop, join **ESP32-Color-Setup** with that password. Stay connected even if the OS reports no internet.
4. Open **http://192.168.4.1**. This address is for setup mode only.
5. Select your own **2.4 GHz** network. The list is scanned by the ESP32 on startup; a hidden network can be entered manually. Enter the password on this local page, not in source code, screenshots or GitHub issues.
6. Save, allow about 30 seconds for reboot, and return the phone/laptop to the selected network.
7. Open **http://color-game.local**. If mDNS is unavailable, use the IP printed as `Open on every phone on your LAN: http://…` in Serial Monitor.

The classic ESP32 joins 2.4 GHz Wi-Fi. The phone may use 5 GHz on the same router if both bands share the LAN and client communication is allowed. A network's name alone does not reveal its radio band.

## A simpler phone workflow

On the desktop version, open **Connect**. The application displays a QR code for the board's current IP address, generated entirely in the browser. Join the same local Wi-Fi on the phone, scan the QR with the camera, and open the link. The QR does not configure Wi-Fi or contain its password.

On iPhone, use Safari's **Share → Add to Home Screen** for convenient access. This is a shortcut to the locally hosted app, not an offline installation. If DHCP assigns a new IP, an old IP shortcut may stop working. Prefer the stable `color-game.local` hostname where supported, or reserve an address in your router using its own instructions.

No router port forwarding is required. This project intentionally does not expose the ESP32 on the public internet.

## After power-off

The program, Wi-Fi credentials, setup password and completed-turn records remain in flash. The board starts with all outputs off, then reconnects automatically. An active game or studio session is not resumed. Allow roughly 10–30 seconds before opening the page.

If the saved network cannot be joined during startup, the setup AP appears and the firmware retries the saved network in the background. An explicit BOOT-triggered setup stays in setup mode until you save a network. When already connected, Wi-Fi auto-reconnection is enabled; the runtime path does not promise a setup AP for every later router outage.

## Change Wi-Fi later

Press and release **EN**, then immediately hold **BOOT for 3 seconds** within the first 4 seconds after reset. Release it, wait for the setup AP, and repeat the setup steps. Do not hold BOOT across reset, which selects the serial bootloader instead.

## Windows + WSL (optional)

Use native Windows PlatformIO unless you specifically want a Linux development environment. Under WSL2 the USB serial device must be attached to WSL before uploading; this does not affect the board's standalone Wi-Fi operation.

Follow Microsoft's [USB-to-WSL guide](https://learn.microsoft.com/en-us/windows/wsl/connect-usb). In Windows PowerShell:

```powershell
usbipd list
usbipd bind --busid YOUR-BUSID       # Once, in an Administrator terminal
usbipd attach --wsl --busid YOUR-BUSID
```

Replace `YOUR-BUSID` with the listed USB serial adapter, not a Bluetooth or unrelated device. Then run `pio device list` inside WSL. Reattachment may be necessary after unplugging USB. To return the device to Windows:

```powershell
usbipd detach --busid YOUR-BUSID
```

## Upgrading from the earlier prototype

The network names and NVS namespace are retained; the UI is now English. The two green LEDs remain on GPIO26 and GPIO33. Point records use keys separate from the older completed-round records. Reload the browser after firmware upload so it receives the matching HTML/CSS/JS. Downloading or publishing this repository does not update the board; uploading firmware is a separate step.
