/* Browser-only simulator. Never embedded in or connected to the ESP32. */
(function (root) {
  'use strict';
  class PreviewDevice {
    constructor(clock = () => performance.now(), random = Math.random) {
      this.clock = clock;
      this.random = random;
      this.owner = '';
      this.name = '';
      this.run = 1;
      this.best = Array(12).fill(0);
      this.resetGame();
      this.manual = {
        active: false,
        mask: 0,
        brightness: 35,
        effect: 0,
        interval: 500,
        testing: false,
        testStart: 0,
        testOn: 1500,
        testStep: 1800
      };
      this.lastHeartbeat = 0;
      this.manualSince = 0;
    }
    resetGame() {
      this.game = {
        phase: 'idle',
        result: 'none',
        length: 0,
        answered: 0,
        score: 0,
        pointsHalf: 0,
        lastAwardHalf: 0,
        interval: 1000,
        mode: 0
      };
      this.sequence = [];
    }
    busy() {
      return !['idle', 'over'].includes(this.game.phase);
    }
    enter(phase, now) {
      this.game.phase = phase;
      this.since = now;
    }
    finish(result, now) {
      this.game.result = result;
      this.enter('over', now);
      const slot = this.game.mode * 4 + [2000, 1000, 500, 250].indexOf(this.game.interval);
      this.best[slot] = Math.max(this.best[slot], this.game.pointsHalf);
    }
    color() {
      return Math.floor(this.random() * 4) % 4;
    }
    tick() {
      const now = this.clock(),
        g = this.game,
        m = this.manual;
      if (this.busy() && now - this.lastHeartbeat >= 15000) this.finish('abandoned', now);
      if (m.active && now - this.lastHeartbeat >= 15000)
        Object.assign(m, { active: false, mask: 0, effect: 0, testing: false });
      if (m.testing && now - m.testStart >= 7200) m.testing = false;
      if (g.phase === 'countdown' && now - this.since >= 1500) {
        this.shown = 0;
        this.illuminated = true;
        this.enter('showing', now);
      } else if (g.phase === 'showing') {
        if (this.illuminated && now - this.since >= (g.interval * 3) / 4) {
          this.illuminated = false;
          this.since = now;
        } else if (!this.illuminated && now - this.since >= g.interval / 4) {
          if (++this.shown === g.length) {
            g.answered = 0;
            this.enter('input', now);
          } else {
            this.illuminated = true;
            this.since = now;
          }
        }
      } else if (g.phase === 'input' && now - this.since >= 30000) this.finish('timeout', now);
      else if (g.phase === 'roundWon' && now - this.since >= 1400) {
        ++g.length;
        this.sequence.push(this.color());
        if (g.mode === 2) this.sequence = Array.from({ length: g.length }, () => this.color());
        this.enter('countdown', now);
      }
    }
    virtualLed() {
      this.tick();
      return this.game.phase === 'showing' && this.illuminated ? this.sequence[this.shown] : -1;
    }
    outputs() {
      const m = this.manual,
        now = this.clock();
      if (!m.active) return [0, 0, 0, 0];
      let mask = m.mask,
        duty = Math.floor((m.brightness * 255) / 100);
      const step = Math.floor((now - this.manualSince) / m.interval);
      if (m.testing) {
        const elapsed = now - m.testStart;
        mask =
          elapsed >= 0 && elapsed < 7200 && elapsed % 1800 < 1500
            ? 1 << [0, 1, 3, 2][Math.floor(elapsed / 1800)]
            : 0;
      } else if (m.effect === 1) mask = 1 << [0, 1, 3, 2][step % 4];
      else if (m.effect === 2) mask = step % 2 ? 0 : 15;
      else if (m.effect === 3) mask = [9, 6, 9, 6, 15, 0, 15, 0][step % 8];
      else if (m.effect === 4) {
        mask = 15;
        const period = m.interval * 4,
          x = (now - this.manualSince) % period;
        duty = Math.floor((duty * Math.min(x, period - x)) / (period / 2));
      } else if (m.effect === 5) mask = 1 << [0, 1, 3, 2, 3, 1][step % 6];
      return [0, 1, 2, 3].map((i) => (mask & (1 << i) ? duty : 0));
    }
    state(id) {
      this.tick();
      if (id === this.owner) this.lastHeartbeat = this.clock();
      return {
        ...this.game,
        busy: this.busy(),
        mine: id === this.owner,
        player: this.name,
        run: this.run,
        remaining:
          this.game.phase === 'input' ? Math.max(0, 30000 - (this.clock() - this.since)) : 0,
        best: [...this.best],
        manual: { ...this.manual, outputs: this.outputs() },
        now: Math.floor(this.clock()),
        address: 'http://192.0.2.10'
      };
    }
    request(path, id, data) {
      this.tick();
      const fail = (status, error) => ({ status, body: { error } });
      const g = this.game,
        m = this.manual,
        now = this.clock();
      if (!/^[a-f0-9]{32}$/i.test(id))
        return fail(400, 'Reload the page to create a player session.');
      if (path === '/api/state') return { status: 200, body: this.state(id) };
      const number = (key) => (data && /^\d+$/.test(String(data[key])) ? Number(data[key]) : NaN);
      if (path === '/api/start' || path === '/api/manual/start') {
        if (!data?.name?.trim() || new TextEncoder().encode(data.name.trim()).length > 48)
          return fail(400, 'Enter a short player name.');
        if (this.busy() || m.active)
          return fail(409, 'The board is busy. End the current session first.');
        if (path === '/api/start') {
          const interval = number('interval'),
            mode = data.mode === undefined ? 0 : number('mode');
          if (![2000, 1000, 500, 250].includes(interval) || ![0, 1, 2].includes(mode))
            return fail(400, 'Choose a valid mode and speed.');
          this.resetGame();
          Object.assign(this.game, { interval, mode, length: 3 });
          this.sequence = Array.from({ length: 3 }, () => this.color());
          this.enter('countdown', now);
        } else {
          this.resetGame();
          Object.assign(m, { active: true, mask: 0, effect: 0, testing: false });
          this.manualSince = now;
        }
        this.owner = id;
        this.name = data.name.trim();
        ++this.run;
        this.lastHeartbeat = now;
      } else {
        if (!['/api/press', '/api/stop', '/api/manual/set', '/api/manual/test'].includes(path))
          return fail(404, 'Page not found.');
        if (id !== this.owner || number('run') !== this.run)
          return fail(409, 'This session belongs to another player or has already ended.');
        if (path === '/api/stop') {
          if (this.busy()) this.finish('cancelled', now);
          Object.assign(m, { active: false, mask: 0, effect: 0, testing: false });
        } else if (path === '/api/manual/test') {
          if (!m.active) return fail(409, 'Start a light studio session first.');
          Object.assign(m, {
            testing: true,
            testStart: now + 1200,
            mask: 0,
            effect: 0,
            brightness: 50
          });
        } else if (path === '/api/manual/set') {
          const mask = number('mask'),
            brightness = number('brightness'),
            effect = number('effect'),
            interval = number('interval');
          if (
            !m.active ||
            ![mask, brightness, effect, interval].every(Number.isFinite) ||
            mask > 15 ||
            brightness > 100 ||
            effect > 5 ||
            interval < 100 ||
            interval > 2000
          )
            return fail(400, 'The light session has ended or the setting is invalid.');
          Object.assign(m, { mask, brightness, effect, interval, testing: false });
          this.manualSince = now;
        } else {
          const color = number('color');
          if (
            g.phase !== 'input' ||
            !Number.isInteger(color) ||
            color > 3 ||
            number('length') !== g.length ||
            number('index') !== g.answered
          )
            return fail(409, 'That answer is late or was already accepted.');
          const expected = this.sequence[g.mode === 1 ? g.length - 1 - g.answered : g.answered];
          g.lastAwardHalf =
            color === expected ? 2 : [1, 2].includes(color) && [1, 2].includes(expected) ? 1 : 0;
          if (!g.lastAwardHalf) this.finish('mistake', now);
          else {
            g.pointsHalf += g.lastAwardHalf;
            ++g.answered;
            this.since = now;
            if (g.answered === g.length) {
              ++g.score;
              if (g.length === 32) this.finish('completed', now);
              else this.enter('roundWon', now);
            }
          }
        }
        this.lastHeartbeat = now;
      }
      return { status: 200, body: this.state(id) };
    }
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = { PreviewDevice };
  else {
    root.BLINK_PREVIEW = true;
    root.previewDevice = new PreviewDevice();
  }
})(typeof window === 'undefined' ? globalThis : window);
