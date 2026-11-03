const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

function sketchContext() {
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id, { checked: false, textContent: '' });
    return elements.get(id);
  };
  function vector(x, y) {
    return { x, y, set(x, y) { this.x = x; this.y = y; },
      copy() { return vector(this.x, this.y); },
      lerp(p, t) { this.x += (p.x - this.x) * t; this.y += (p.y - this.y) * t; } };
  }
  const context = vm.createContext({
    document: { querySelector: element }, window: { addEventListener() {} },
    performance: { now: () => 1000 }, createVector: vector,
    width: 1280, height: 800, deltaTime: 16, millis: () => 1000,
    constrain: (x, a, b) => Math.min(b, Math.max(a, x)),
    min: Math.min, max: Math.max, sin: Math.sin, pow: Math.pow, PI: Math.PI,
    lerp: (a, b, t) => a + (b - a) * t
  });
  for (const file of ['sketch.js', 'camera.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), context);
  }
  vm.runInContext(`
    landing = createVector(0.35, 0.65);
    cameraStream = {};
    cameraHands = {}; // Tracking is already running.
    cameraVideo = { videoWidth: 640, videoHeight: 480 };
  `, context);
  return { context, element };
}

test('enabling a palm cue also enables following', async () => {
  const { context, element } = sketchContext();
  element('#camera-cue').checked = true;
  await element('#camera-cue').onchange({ target: element('#camera-cue') });
  assert.equal(element('#hand-follow').checked, true);
});

test('palm-cued flight lands at tracked palm rather than manual marker', async () => {
  const { context, element } = sketchContext();
  element('#camera-cue').checked = true;
  await element('#camera-cue').onchange({ target: element('#camera-cue') });
  const result = vm.runInContext(`
    updateTrackedPalm(Array.from({ length: 21 }, () => ({ x: 0.60, y: 0.55 })), true, 1000);
    const palm = trackedLanding();
    startFlight();
    startedAt = -5000; // Six seconds later: landed, pecks complete.
    let drawn = null;
    drawBird = (x, y) => { drawn = { x, y }; };
    drawSequence();
    ({ drawn, palm: { x: palm.x * width, y: palm.y * height },
      manual: { x: landing.x * width, y: landing.y * height } });
  `, context);
  assert.ok(Math.abs(result.drawn.x - result.palm.x) < 0.001);
  assert.ok(Math.abs(result.drawn.y - result.palm.y) < 0.001);
  assert.ok(Math.abs(result.drawn.x - result.manual.x) > 100);
});

test('automatic cue refuses to use a manual marker when palm data is missing', () => {
  const { context } = sketchContext();
  const result = vm.runInContext(`
    const fired = startFlight('palm');
    ({ fired, startedAt });
  `, context);
  assert.equal(result.fired, false);
  assert.equal(result.startedAt, null);
});

test('actual automatic cue targets palm even if the follow checkbox is unchecked', () => {
  const { context, element } = sketchContext();
  element('#camera-cue').checked = true;
  const result = vm.runInContext(`
    updateTrackedPalm(Array.from({ length: 21 }, () => ({ x: 0.60, y: 0.55 })), true, 1000);
    const target = trackedLanding(true);
    cueLatched = false;
    cueHeldSince = 0;
    updateCameraGate(true, 1000);
    ({ startedAt, targetX: flightTarget.x, palmX: target.x, manualX: landing.x, follows: flightFollowsPalm });
  `, context);
  assert.equal(result.startedAt, 1000);
  assert.equal(result.targetX, result.palmX);
  assert.notEqual(result.targetX, result.manualX);
  assert.equal(result.follows, true);
});

test('learning a pose clears an old manual alignment offset', () => {
  const { context, element } = sketchContext();
  vm.runInContext('handOffset = { x: 0.2, y: 0.1 }; latestPalm = { open: true, normal: [0, 1, 0] };', context);
  element('#learn-pose').onclick();
  assert.equal(vm.runInContext('handOffset.x === 0 && handOffset.y === 0', context), true);
});
