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

test('lost hand gets a grace period, then bird flies away and clears', () => {
  const { context, element } = sketchContext();
  element('#hand-follow').checked = true;
  const result = vm.runInContext(`
    let clock = 1000;
    performance.now = millis = () => clock;
    updateTrackedPalm(Array.from({ length: 21 }, () => ({ x: 0.60, y: 0.55 })), true, clock);
    startFlight('palm');
    startedAt = -5000;
    let drawn = null;
    drawBird = (x, y) => { drawn = { x, y }; };
    clock = 1600;
    drawSequence();
    const flickerIgnored = departure === null;
    const perchedX = drawn.x;
    clock = 1800;
    drawSequence();
    const takeoffX = departure.x;
    clock = 2400;
    drawSequence();
    const movedRight = drawn.x > takeoffX;
    clock = 3300;
    drawSequence();
    ({ flickerIgnored, perchedX, takeoffX, movedRight, cleared: startedAt === null && departure === null });
  `, context);
  assert.equal(result.flickerIgnored, true);
  assert.equal(result.perchedX, result.takeoffX);
  assert.equal(result.movedRight, true);
  assert.equal(result.cleared, true);
});

test('visible closed hand does not trigger departure', () => {
  const { context, element } = sketchContext();
  element('#hand-follow').checked = true;
  const stays = vm.runInContext(`
    updateTrackedPalm(Array.from({ length: 21 }, () => ({ x: 0.60, y: 0.55 })), true, 1000);
    startFlight('palm');
    startedAt = -5000;
    performance.now = () => 3000;
    updateTrackedPalm(Array.from({ length: 21 }, () => ({ x: 0.60, y: 0.55 })), false, 3000);
    drawBird = () => {};
    drawSequence();
    departure === null;
  `, context);
  assert.equal(stays, true);
});

test('manual flight stays perched without a camera hand', () => {
  const { context } = sketchContext();
  const stays = vm.runInContext(`
    startFlight();
    startedAt = -5000;
    drawBird = () => {};
    drawSequence();
    departure === null && startedAt !== null;
  `, context);
  assert.equal(stays, true);
});

function cueTestContext() {
  const { context, element } = sketchContext();
  vm.runInContext(`
    let triggers = 0;
    startFlight = () => { triggers++; return true; };
    cueLatched = false;
  `, context);
  return { context, element };
}

test('brief pose flicker pauses hold and still produces exactly one cue', () => {
  const { context } = cueTestContext();
  const result = vm.runInContext(`
    for (let t = 0; t <= 1100; t += 50) updateCameraGate(t < 400 || t >= 550, t, true);
    for (let t = 1150; t <= 2200; t += 50) updateCameraGate(true, t, true);
    ({ triggers, cueLatched });
  `, context);
  assert.equal(result.triggers, 1);
  assert.equal(result.cueLatched, true);
});

test('a longer pose mismatch resets the cue hold', () => {
  const { context } = cueTestContext();
  const result = vm.runInContext(`
    for (let t = 0; t <= 400; t += 50) updateCameraGate(true, t, true);
    for (let t = 450; t <= 800; t += 50) updateCameraGate(false, t, true);
    for (let t = 850; t <= 1500; t += 50) updateCameraGate(true, t, true);
    triggers;
  `, context);
  assert.equal(result, 0);
});

test('pose changes cannot rearm; actual hand withdrawal can', () => {
  const { context } = cueTestContext();
  const result = vm.runInContext(`
    cueLatched = true;
    for (let t = 0; t <= 1000; t += 50) updateCameraGate(false, t, true);
    const visibleStillLatched = cueLatched;
    for (let t = 1050; t <= 1850; t += 50) updateCameraGate(false, t, false);
    ({ visibleStillLatched, rearmed: !cueLatched });
  `, context);
  assert.equal(result.visibleStillLatched, true);
  assert.equal(result.rearmed, true);
});

test('a stalled inference loop cannot complete a cue hold', () => {
  const { context } = cueTestContext();
  const result = vm.runInContext(`
    updateCameraGate(true, 0, true);
    updateCameraGate(true, 1200, true);
    triggers;
  `, context);
  assert.equal(result, 0);
});

test('silhouette-only tracking does not replace the manual landing point', () => {
  const { context, element } = sketchContext();
  element('#hand-silhouette').checked = true;
  const result = vm.runInContext(`
    updateTrackedPalm(Array.from({ length: 21 }, () => ({ x: 0.60, y: 0.55 })), true, 1000);
    startFlight();
    ({ requested: trackingRequested(), follows: flightFollowsPalm, x: flightTarget.x, manualX: landing.x });
  `, context);
  assert.equal(result.requested, true);
  assert.equal(result.follows, false);
  assert.equal(result.x, result.manualX);
});
