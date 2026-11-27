const assert = require('node:assert/strict');
const { PreviewDevice } = require('../preview/demo.js');
const owner = 'a'.repeat(32),
  other = 'b'.repeat(32);
for (const mode of [0, 1, 2]) {
  let now = 0,
    counter = 0;
  const device = new PreviewDevice(
    () => now,
    () => ((counter++ % 4) + 0.1) / 4
  );
  assert.equal(
    device.request('/api/start', owner, { name: 'Tester', interval: 250, mode }).status,
    200
  );
  assert.equal(
    device.request('/api/start', other, { name: 'Other', interval: 250, mode }).status,
    409
  );
  while (device.game.phase !== 'input') {
    now += 5;
    device.request('/api/state', owner);
  }
  const colors = [...device.sequence];
  if (mode === 1) colors.reverse();
  let expectedPoints = 0;
  for (const [index, color] of colors.entries()) {
    const green = [1, 2].includes(color),
      answer = green ? 3 - color : color;
    const data = { run: device.run, color: answer, length: 3, index };
    assert.equal(device.request('/api/press', owner, data).status, 200);
    expectedPoints += green ? 1 : 2;
    assert.equal(device.game.pointsHalf, expectedPoints);
    assert.equal(device.request('/api/press', owner, data).status, 409);
  }
  assert.equal(device.game.phase, 'roundWon');
  assert.equal(device.game.pointsHalf, 4);
  assert.equal(device.request('/api/stop', owner, { run: device.run }).status, 200);
  assert.equal(device.best[mode * 4 + 3], 4);
  assert.equal(device.request('/api/manual/start', owner, { name: 'Tester' }).status, 200);
  const run = device.run;
  assert.equal(device.request('/api/manual/test', other, { run }).status, 409);
  assert.equal(device.request('/api/manual/test', owner, { run }).status, 200);
  const start = device.manual.testStart;
  for (const [index, color] of [0, 1, 3, 2].entries()) {
    now = start + index * 1800;
    assert.equal(device.state(owner).manual.outputs[color], 127);
    now += 1499;
    assert.equal(device.state(owner).manual.outputs[color], 127);
    now += 1;
    assert.deepEqual(device.state(owner).manual.outputs, [0, 0, 0, 0]);
  }
  now = start + 7200;
  assert.equal(device.state(owner).manual.testing, false);
  assert.equal(
    device.request('/api/manual/set', owner, {
      run,
      mask: 15,
      brightness: 100,
      effect: 0,
      interval: 500
    }).status,
    200
  );
  assert.deepEqual(device.state(owner).manual.outputs, [255, 255, 255, 255]);
  now += 15000;
  assert.equal(device.state(other).manual.active, false);
  assert.deepEqual(device.state(other).manual.outputs, [0, 0, 0, 0]);
  assert.equal(
    device.request('/api/manual/set', owner, {
      run,
      mask: 15,
      brightness: 100,
      effect: 0,
      interval: 500
    }).status,
    400
  );
  assert.equal('sequence' in device.state(owner), false);
}
console.log(
  'PASS: preview modes, half points, duplicate answers, records, ownership, test timing and expiry.'
);
