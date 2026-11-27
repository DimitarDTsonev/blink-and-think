#include <Arduino.h>
#include <ESPmDNS.h>
#include <Preferences.h>
#include <WebServer.h>
#include <WiFi.h>
#include <esp_random.h>
#include "game.h"
#include "hardware.h"
#include "manual.h"

extern const char gamePage[] asm("_binary_web_index_html_start");
extern const char setupPage[] asm("_binary_web_setup_html_start");
extern const char appStyles[] asm("_binary_web_style_css_start");
extern const char appScript[] asm("_binary_web_app_js_start");
extern const char setupScript[] asm("_binary_web_setup_js_start");
extern const char qrScript[] asm("_binary_web_vendor_qrcode_js_start");
extern const char favicon[] asm("_binary_web_favicon_svg_start");

WebServer server(80);
Preferences preferences;
MemoryGame game(esp_random);
ManualControl manual;
String owner, playerName;
String networkScanJson = "[]";
uint32_t runId = 0, restartAt = 0;
unsigned best[12]{};
bool setupMode = false;
bool retryHome = false, mdnsStarted = false;
uint32_t lastReconnect = 0;
std::array<unsigned, 4> lastOutput{256, 256, 256, 256};

unsigned speedIndex() {
    switch (game.interval()) {
    case 2000: return 0;
    case 500: return 2;
    case 250: return 3;
    default: return 1;
    }
}

String quoted(const String &value) {
    String result = "\"";
    for (unsigned i = 0; i < value.length(); ++i) {
        const unsigned char c = value[i];
        if (c == '"' || c == '\\') { result += '\\'; result += char(c); }
        else if (c >= 32) result += char(c);
    }
    return result + '"';
}

bool validClient(const String &id) {
    if (id.length() != 32) return false;
    for (unsigned i = 0; i < id.length(); ++i)
        if (!isxdigit(static_cast<unsigned char>(id[i]))) return false;
    return true;
}

bool number(const char *name, uint32_t &out) {
    String text = server.arg(name);
    if (text.isEmpty() || text.length() > 10) return false;
    uint64_t value = 0;
    for (unsigned i = 0; i < text.length(); ++i) {
        if (text[i] < '0' || text[i] > '9') return false;
        value = value * 10 + text[i] - '0';
        if (value > UINT32_MAX) return false;
    }
    out = static_cast<uint32_t>(value);
    return true;
}

void error(int code, const char *message) {
    server.send(code, "application/json; charset=utf-8", "{\"error\":" + quoted(message) + "}");
}

void updateOutputs() {
    const int current = game.led();
    auto output = manual.outputs(millis());
    if (game.busy())
        for (unsigned i = 0; i < 4; ++i) output[i] = current == int(i) ? 255 : 0;
    if (output != lastOutput) {
        for (unsigned i = 0; i < 4; ++i) ledcWrite(LED_PINS[i], output[i]);
        if (BUZZER_PIN >= 0) {
            const unsigned tones[] = {262, 330, 392, 523};
            ledcWriteTone(BUZZER_PIN, current >= 0 ? tones[current] : 0);
        }
        lastOutput = output;
    }
    const unsigned slot = unsigned(game.mode()) * 4 + speedIndex();
    // Save once at the end of a run, not on every half-point/flash update.
    if (!game.busy() && game.pointsHalf() > best[slot]) {
        best[slot] = game.pointsHalf();
        const String key = "pts" + String(slot);
        preferences.putUInt(key.c_str(), best[slot]);
    }
}

void state() {
    const bool mine = !owner.isEmpty() && server.header("X-Player-Id") == owner;
    if (mine) { game.heartbeat(millis()); manual.heartbeat(millis()); }
    static const char *phases[] = {"idle", "countdown", "showing", "input", "roundWon", "over"};
    static const char *results[] = {"none", "mistake", "timeout", "abandoned", "completed", "cancelled"};
    String body;
    body.reserve(512);
    body = "{\"phase\":" + quoted(phases[int(game.phase())]);
    body += ",\"result\":" + quoted(results[int(game.result())]);
    body += ",\"mine\":" + String(mine ? "true" : "false");
    body += ",\"busy\":" + String(game.busy() ? "true" : "false");
    body += ",\"player\":" + quoted(playerName);
    body += ",\"run\":" + String(runId);
    body += ",\"length\":" + String(game.length());
    body += ",\"answered\":" + String(game.answered());
    body += ",\"score\":" + String(game.score());
    body += ",\"pointsHalf\":" + String(game.pointsHalf());
    body += ",\"lastAwardHalf\":" + String(game.lastAwardHalf());
    body += ",\"interval\":" + String(game.interval());
    body += ",\"mode\":" + String(unsigned(game.mode()));
    body += ",\"remaining\":" + String(game.remaining(millis()));
    body += ",\"best\":[";
    for (unsigned i = 0; i < 12; ++i) { if (i) body += ','; body += String(best[i]); }
    body += "] ,\"manual\":{\"active\":" + String(manual.active() ? "true" : "false");
    body += ",\"mask\":" + String(manual.mask()) + ",\"brightness\":" + String(manual.brightness());
    body += ",\"effect\":" + String(manual.effect()) + ",\"interval\":" + String(manual.interval());
    body += ",\"testing\":" + String(manual.testing() ? "true" : "false");
    body += ",\"testStart\":" + String(manual.testStart());
    body += ",\"testOn\":" + String(ManualControl::TestOn) + ",\"testStep\":" + String(ManualControl::TestStep);
    body += ",\"outputs\":[";
    const auto output = manual.outputs(millis());
    for (unsigned i = 0; i < 4; ++i) { if (i) body += ','; body += String(output[i]); }
    body += "]}";
    body += ",\"now\":" + String(millis());
    body += ",\"address\":" + quoted("http://" + WiFi.localIP().toString()) + "}";
    // Only manual/test outputs are disclosed. Game playback stays physical-only.
    server.sendHeader("Cache-Control", "no-store");
    server.send(200, "application/json; charset=utf-8", body);
}

bool gameRequest() {
    if (setupMode) { error(503, "Set up the Wi-Fi connection first."); return false; }
    if (!validClient(server.header("X-Player-Id"))) {
        error(400, "Reload the page to create a player session."); return false;
    }
    game.tick(millis());
    manual.tick(millis());
    updateOutputs();
    return true;
}

bool ownedRequest() {
    if (!gameRequest()) return false;
    uint32_t expectedRun;
    if (server.header("X-Player-Id") != owner || !number("run", expectedRun) || expectedRun != runId) {
        error(409, "This session belongs to another player or has already ended."); return false;
    }
    game.heartbeat(millis());
    return true;
}

void configureRoutes() {
    const char *headers[] = {"X-Player-Id", "X-Setup"};
    server.collectHeaders(headers, 2);
    server.on("/", HTTP_GET, [] {
        server.sendHeader("Cache-Control", "no-store");
        server.send_P(200, "text/html; charset=utf-8", setupMode ? setupPage : gamePage);
    });
    server.on("/style.css", HTTP_GET, [] { server.sendHeader("Cache-Control", "no-store"); server.send_P(200, "text/css", appStyles); });
    server.on("/app.js", HTTP_GET, [] { server.sendHeader("Cache-Control", "no-store"); server.send_P(200, "application/javascript", appScript); });
    server.on("/setup.js", HTTP_GET, [] { server.sendHeader("Cache-Control", "no-store"); server.send_P(200, "application/javascript", setupScript); });
    server.on("/vendor/qrcode.js", HTTP_GET, [] { server.sendHeader("Cache-Control", "no-store"); server.send_P(200, "application/javascript", qrScript); });
    server.on("/favicon.svg", HTTP_GET, [] { server.send_P(200, "image/svg+xml", favicon); });
    server.on("/api/state", HTTP_GET, [] { if (gameRequest()) state(); });
    server.on("/api/start", HTTP_POST, [] {
        if (!gameRequest()) return;
        uint32_t interval, mode = 0;
        String name = server.arg("name");
        name.trim();
        if (!number("interval", interval) || !MemoryGame::validInterval(interval) ||
            (server.hasArg("mode") && !number("mode", mode)) || mode > 2 || name.isEmpty() || name.length() > 48) {
            error(400, "Enter a short name and choose a valid mode and speed."); return;
        }
        if (manual.active() || !game.start(millis(), interval, MemoryGame::Mode(mode))) {
            error(409, "The board is busy. End the current session first."); return;
        }
        owner = server.header("X-Player-Id");
        playerName = name;
        ++runId;
        updateOutputs();
        state();
    });
    server.on("/api/press", HTTP_POST, [] {
        if (!ownedRequest()) return;
        uint32_t color, length, index;
        if (!number("color", color) || !number("length", length) || !number("index", index)) {
            error(400, "Invalid answer."); return;
        }
        if (!game.press(millis(), color, length, index)) {
            error(409, "That answer is late or was already accepted. Wait for an update."); return;
        }
        updateOutputs();
        state();
    });
    server.on("/api/stop", HTTP_POST, [] {
        if (!ownedRequest()) return;
        game.cancel(millis());
        manual.stop();
        updateOutputs();
        state();
    });
    server.on("/api/manual/start", HTTP_POST, [] {
        if (!gameRequest()) return;
        String name = server.arg("name"); name.trim();
        if (name.isEmpty() || name.length() > 48) { error(400, "Enter a short player name."); return; }
        if (game.busy() || !manual.start(millis())) { error(409, "The board is busy."); return; }
        game.clear();
        owner = server.header("X-Player-Id"); playerName = name; ++runId;
        updateOutputs(); state();
    });
    server.on("/api/manual/set", HTTP_POST, [] {
        if (!ownedRequest()) return;
        uint32_t mask, brightness, effect, interval;
        if (!number("mask", mask) || !number("brightness", brightness) ||
            !number("effect", effect) || !number("interval", interval) ||
            !manual.set(millis(), mask, brightness, effect, interval)) {
            error(400, "The light session has ended or the setting is invalid."); return;
        }
        updateOutputs(); state();
    });
    server.on("/api/manual/test", HTTP_POST, [] {
        if (!ownedRequest()) return;
        if (!manual.startTest(millis())) { error(409, "Start a light studio session first."); return; }
        updateOutputs(); state();
    });
    server.on("/api/wifi", HTTP_POST, [] {
        if (!setupMode) { error(403, "Network settings are available only in Wi-Fi setup mode."); return; }
        if (server.header("X-Setup") != "1") { error(403, "Use the Wi-Fi setup page."); return; }
        const String ssid = server.arg("ssid"), password = server.arg("password");
        if (ssid.isEmpty() || ssid.length() > 32 || password.length() > 63 || (!password.isEmpty() && password.length() < 8)) {
            error(400, "Check the network name and password (8-63 bytes, or blank for an open network)."); return;
        }
        preferences.putString("ssid", ssid);
        preferences.putString("password", password);
        server.send(200, "application/json", "{\"saved\":true}");
        restartAt = millis() + 1200;
    });
    server.on("/api/networks", HTTP_GET, [] {
        if (!setupMode) { error(403, "The network list is available only in setup mode."); return; }
        server.sendHeader("Cache-Control", "no-store");
        server.send(200, "application/json; charset=utf-8",
                    "{\"saved\":" + quoted(preferences.getString("ssid", "")) +
                    ",\"networks\":" + networkScanJson + "}");
    });
    server.onNotFound([] { error(404, "Page not found."); });
    server.begin();
}

void setupNetwork(bool forceSetup) {
    WiFi.persistent(false);
    WiFi.setHostname("color-game");
    WiFi.onEvent([](WiFiEvent_t, WiFiEventInfo_t info) {
        Serial.printf("Wi-Fi disconnect reason: %u\n", info.wifi_sta_disconnected.reason);
    }, ARDUINO_EVENT_WIFI_STA_DISCONNECTED);
    const String ssid = preferences.getString("ssid", "");
    WiFi.mode(WIFI_STA);
    Serial.println("Scanning available 2.4 GHz networks...");
    const int count = WiFi.scanNetworks(false, true);
    bool found = false;
    networkScanJson = "[";
    bool first = true;
    for (int i = 0; i < count; ++i) {
        const String name = WiFi.SSID(i);
        if (name.isEmpty()) continue;
        if (!first) networkScanJson += ',';
        first = false;
        networkScanJson += "{\"ssid\":" + quoted(name) + ",\"channel\":" + String(WiFi.channel(i)) +
                           ",\"rssi\":" + String(WiFi.RSSI(i)) + "}";
        if (name == ssid) found = true;
        Serial.printf("2.4 GHz: %s | channel=%d | RSSI=%d dBm\n",
                      name.c_str(), int(WiFi.channel(i)), int(WiFi.RSSI(i)));
    }
    networkScanJson += ']';
    WiFi.scanDelete();
    if (!forceSetup && !ssid.isEmpty()) {
        Serial.print("Saved Wi-Fi name: "); Serial.println(ssid);
        Serial.printf("Scan result: %d networks; saved name %s\n", count, found ? "FOUND" : "NOT FOUND");
        WiFi.setAutoReconnect(true);
        WiFi.begin(ssid.c_str(), preferences.getString("password", "").c_str());
        Serial.println("Connecting to saved Wi-Fi (up to 20 seconds)...");
        const uint32_t began = millis();
        while (WiFi.status() != WL_CONNECTED && uint32_t(millis() - began) < 20000) delay(50);
        if (WiFi.status() == WL_CONNECTED) {
            Serial.print("Open on every phone on your LAN: http://");
            Serial.println(WiFi.localIP());
            if (MDNS.begin("color-game")) {
                mdnsStarted = true;
                MDNS.addService("http", "tcp", 80);
                Serial.println("Alternative address: http://color-game.local");
            }
            return;
        }
        Serial.printf("Home Wi-Fi connection failed; status=%d\n", int(WiFi.status()));
    }
    setupMode = true;
    WiFi.disconnect();
    WiFi.mode(WIFI_AP);
    String apPassword = preferences.getString("setup-pass", "");
    if (apPassword.length() != 16) {
        char generated[17];
        snprintf(generated, sizeof(generated), "%08lx%08lx", (unsigned long)esp_random(), (unsigned long)esp_random());
        apPassword = generated;
        preferences.putString("setup-pass", apPassword);
    }
    WiFi.softAP("ESP32-Color-Setup", apPassword.c_str());
    // Keep the setup page responsive while retrying saved credentials in the background.
    retryHome = !forceSetup && !ssid.isEmpty();
    lastReconnect = millis();
    if (retryHome) {
        WiFi.mode(WIFI_AP_STA);
        WiFi.begin(ssid.c_str(), preferences.getString("password", "").c_str());
    }
    Serial.println("Wi-Fi setup: connect your phone to ESP32-Color-Setup");
    Serial.printf("Setup network password: %s\n", apPassword.c_str());
    Serial.print("Then open http://"); Serial.println(WiFi.softAPIP());
}

void setup() {
    Serial.begin(115200);
    for (unsigned pin : LED_PINS) {
        pinMode(pin, OUTPUT); digitalWrite(pin, LOW);
        if (!ledcAttach(pin, 5000, 8)) {
            Serial.println("LED PWM initialization failed; restart required.");
            while (true) delay(1000);
        }
        ledcWrite(pin, 0);
    }
    if (BUZZER_PIN >= 0) ledcAttach(BUZZER_PIN, 262, 8);
    preferences.begin("color-game", false);
    for (unsigned i = 0; i < 12; ++i) {
        // New units (half-points) must not reinterpret previous round records.
        const String key = "pts" + String(i);
        best[i] = preferences.getUInt(key.c_str(), 0);
    }
    runId = esp_random();
    pinMode(0, INPUT_PULLUP);
    Serial.println("Hold BOOT for 3 seconds NOW to configure Wi-Fi. Do not hold it during reset.");
    const uint32_t began = millis();
    uint32_t heldSince = 0;
    bool forceSetup = false;
    while (uint32_t(millis() - began) < 4000) {
        if (digitalRead(0) == LOW) {
            if (!heldSince) heldSince = millis();
            if (uint32_t(millis() - heldSince) >= 3000) { forceSetup = true; break; }
        } else heldSince = 0;
        delay(10);
    }
    setupNetwork(forceSetup);
    configureRoutes();
    if (!setupMode) Serial.printf("Connected network: %s | IP: %s\n", WiFi.SSID().c_str(), WiFi.localIP().toString().c_str());
    Serial.println("Blink & Think ready.");
}

void loop() {
    game.tick(millis());
    manual.tick(millis());
    updateOutputs();
    server.handleClient();
    if (setupMode && retryHome && WiFi.status() == WL_CONNECTED) {
        setupMode = false; retryHome = false;
        WiFi.softAPdisconnect(true);
        WiFi.mode(WIFI_STA);
        mdnsStarted = MDNS.begin("color-game");
        if (mdnsStarted) MDNS.addService("http", "tcp", 80);
        Serial.print("Home Wi-Fi recovered. Open http://"); Serial.println(WiFi.localIP());
    }
    if (retryHome && uint32_t(millis() - lastReconnect) >= 30000) {
        lastReconnect = millis(); WiFi.reconnect();
    }
    if (restartAt && int32_t(millis() - restartAt) >= 0) ESP.restart();
    delay(1);
}
