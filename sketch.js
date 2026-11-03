// All positions describe the bird's feet: the landing point is its perch.
const FLIGHT_SECONDS = 3.2;
const PAUSE_SECONDS = 0.9;
const PECK_SECONDS = 0.55;
const PAPER = '#f4edda';
const INK = '#080909';

let landing; // Normalized coordinates preserve placement after a resize.
let flightTarget;
let flightStart;
let startedAt = null;
let markerVisible = true;
let birdSize = 1;

function setup() {
  const canvas = createCanvas(windowWidth, windowHeight);
  landing = createVector(0.50, 0.63);
  canvas.mousePressed(() => {
    landing.set(mouseX / width, mouseY / height);
    constrainLanding();
  });
  document.querySelector('#marker').onchange = event => {
    markerVisible = event.target.checked;
  };
  document.querySelector('#size').oninput = event => {
    birdSize = Number(event.target.value);
  };
  document.querySelector('#fly').onclick = startFlight;
  document.querySelector('#fullscreen').onclick = () => fullscreen(!fullscreen());
}

function startFlight() {
  // Snapshot the perch so adjustments during a flight apply to the next replay.
  flightTarget = landing.copy();
  const light = lightCircle();
  flightStart = createVector((light.x - light.radius - 160) / width,
    Math.max(0.12, flightTarget.y - 0.24));
  startedAt = millis();
}

function lightCircle() {
  return { x: width / 2, y: height / 2, radius: min(height * 0.38, width * 0.31) };
}

function constrainLanding() {
  // Leave a little margin; the feet cannot be calibrated into the black border.
  const light = lightCircle();
  const dx = landing.x * width - light.x;
  const dy = landing.y * height - light.y;
  const distance = Math.hypot(dx, dy);
  const limit = max(1, light.radius - 16);
  if (distance > limit) {
    landing.set((light.x + dx / distance * limit) / width,
      (light.y + dy / distance * limit) / height);
  }
}

function draw() {
  background(0);
  const light = lightCircle();
  noStroke();
  fill(PAPER);
  circle(light.x, light.y, light.radius * 2);
  // Canvas clipping applies to every bird part, including wings and toes.
  drawingContext.save();
  drawingContext.beginPath();
  drawingContext.arc(light.x, light.y, light.radius, 0, Math.PI * 2);
  drawingContext.clip();
  drawCameraOverlay(light);
  if (markerVisible) drawLandingMarker();
  if (startedAt !== null) drawSequence();
  drawingContext.restore();
}

function drawSequence() {

  const elapsed = (millis() - startedAt) / 1000;
  const progress = constrain(elapsed / FLIGHT_SECONDS, 0, 1);
  // Cubic ease-out brings the bird smoothly to rest at the perch.
  const travel = 1 - pow(1 - progress, 3);
  const x = lerp(flightStart.x, flightTarget.x, travel) * width;
  const y = lerp(flightStart.y, flightTarget.y, travel) * height
    - sin(PI * progress) * height * 0.12;
  const grounded = progress >= 1;
  const peckTime = elapsed - FLIGHT_SECONDS - PAUSE_SECONDS;
  let peck = 0;
  if (peckTime >= 0 && peckTime < PECK_SECONDS * 2) {
    // Two discrete down-and-up motions, then stay perched.
    peck = pow(sin(PI * ((peckTime % PECK_SECONDS) / PECK_SECONDS)), 2);
  }
  drawBird(x, y, grounded, peck, elapsed, progress);
  document.querySelector('#status').textContent = !grounded ? 'Flying'
    : peckTime < 0 ? 'Landed — pausing'
    : peckTime < PECK_SECONDS * 2 ? 'Pecking' : 'Perched — Space to replay';
}

// A side-on sparrow built from curved, overlapping black shapes.
// The legs stay anchored while the torso and head lean into each peck.
function drawBird(x, y, grounded, peck, time, progress) {
  const approach = smoothstep(0.72, 1, progress);
  const contactTime = max(0, time - FLIGHT_SECONDS);
  const settle = grounded ? sin(min(contactTime / 0.38, 1) * PI) * 4 : 0;
  const breath = grounded ? sin(contactTime * 2.3) * 0.45 : 0;
  const bodyY = -33 + settle + peck * 5 + breath;
  const bodyTilt = grounded ? peck * 0.30 : lerp(0.13, -0.16, approach);

  push();
  translate(x, y);
  scale(birdSize);
  fill(INK);
  noStroke();

  // Uncurl the legs before touchdown; contact and toes stay on the perch.
  const legExtension = grounded ? 1 : approach;
  for (const hipX of [-15, 1]) {
    stroke(INK);
    strokeWeight(2.1);
    strokeCap(ROUND);
    const ankleX = hipX + lerp(-13, 3, legExtension);
    const ankleY = lerp(bodyY + 10, -3, legExtension);
    line(hipX, bodyY + 9, hipX - 4, bodyY + 19);
    line(hipX - 4, bodyY + 19, ankleX, ankleY);
    // Three slender toes, including a backward gripping toe.
    line(ankleX, ankleY, ankleX + 10, ankleY + 3);
    line(ankleX, ankleY, ankleX + 7, ankleY + 1);
    line(ankleX, ankleY, ankleX - 6, ankleY + 2);
  }
  noStroke();

  push();
  translate(-9, bodyY);
  rotate(bodyTilt);

  // A tapered, slightly notched tail, continuous with the rump.
  beginShape();
  vertex(-21, -7);
  bezierVertex(-36, -9, -52, -16, -65, -20);
  vertex(-63, -13);
  vertex(-66, -11);
  bezierVertex(-49, -2, -36, 8, -21, 10);
  endShape(CLOSE);

  // Wings fold over the back as the bird finishes braking.
  const fold = grounded ? 1 : smoothstep(0.86, 1, progress);
  if (fold < 1) {
    const beat = sin(time * 21);
    drawFlightWing(beat, fold, 0.82); // Far wing
  }

  // Rump, arched back, shoulder, rounded breast and belly.
  beginShape();
  vertex(-34, 1);
  bezierVertex(-33, -14, -18, -23, -1, -21);
  bezierVertex(10, -22, 16, -18, 22, -11);
  bezierVertex(34, 3, 22, 21, 7, 24);
  bezierVertex(-9, 28, -27, 17, -34, 1);
  endShape(CLOSE);

  if (fold < 1) drawFlightWing(sin(time * 21 + 0.35), fold, 1);

  // The neck stretches down and forward, rather than hinging a detached head.
  push();
  translate(13 + peck * 5, -11 + peck * 4);
  rotate(peck * 1.05);
  beginShape();
  vertex(-9, 8);
  bezierVertex(-11, -4, -8, -13, -2, -22);
  bezierVertex(2, -34, 20, -36, 29, -28);
  bezierVertex(34, -24, 34, -19, 33, -16);
  vertex(46, -11); // Short conical sparrow beak
  vertex(32, -8);
  bezierVertex(29, -3, 23, -1, 17, 1);
  bezierVertex(16, 9, 11, 17, 3, 19);
  bezierVertex(-2, 20, -7, 15, -9, 8);
  endShape(CLOSE);
  pop();
  pop();
  pop();
}

function drawFlightWing(beat, fold, size) {
  push();
  translate(-8, -10);
  // Shoulder, elbow and long primaries describe a flexible wing fan.
  rotate(lerp(beat * 1.05 - 0.2, -0.1, fold));
  scale(size * (1 - fold), size * (1 - fold));
  beginShape();
  vertex(12, 3);
  bezierVertex(-2, -15, -17, -37, -45, -62);
  bezierVertex(-48, -63, -46, -55, -41, -47);
  vertex(-53, -56);
  bezierVertex(-58, -58, -52, -45, -44, -36);
  vertex(-56, -44);
  bezierVertex(-60, -43, -50, -29, -42, -25);
  vertex(-50, -29);
  bezierVertex(-53, -24, -35, -11, -24, -8);
  bezierVertex(-13, 1, 0, 11, 12, 3);
  endShape(CLOSE);
  pop();
}

function smoothstep(low, high, value) {
  const t = constrain((value - low) / (high - low), 0, 1);
  return t * t * (3 - 2 * t);
}

function drawLandingMarker() {
  const x = landing.x * width;
  const y = landing.y * height;
  push();
  stroke('#b65c45');
  strokeWeight(1);
  noFill();
  circle(x, y, 24);
  line(x - 22, y, x + 22, y);
  line(x, y - 22, x, y + 22);
  noStroke();
  fill('#90503e');
  textAlign(CENTER);
  textSize(12);
  text('LANDING POINT · FEET', constrain(x, 90, width - 90), y > height - 40 ? y - 30 : y + 38);
  pop();
}

function keyPressed(event) {
  // Space remains a cue even after clicking a camera or calibration button.
  if (key === ' ') { startFlight(); return false; }
  // Keep native keyboard interaction available inside the controls.
  if (['INPUT', 'BUTTON'].includes(document.activeElement.tagName)) {
    if (keyCode !== ESCAPE) return;
    document.activeElement.blur();
  }
  if (key.toLowerCase() === 'm') {
    markerVisible = !markerVisible;
    document.querySelector('#marker').checked = markerVisible;
  }
  if (key.toLowerCase() === 'f') fullscreen(!fullscreen());
  const step = event.shiftKey ? 10 : 1;
  if (keyCode === LEFT_ARROW) landing.x -= step / width;
  if (keyCode === RIGHT_ARROW) landing.x += step / width;
  if (keyCode === UP_ARROW) landing.y -= step / height;
  if (keyCode === DOWN_ARROW) landing.y += step / height;
  landing.x = constrain(landing.x, 0, 1);
  landing.y = constrain(landing.y, 0, 1);
  constrainLanding();
  if (key === ' ' || [LEFT_ARROW, RIGHT_ARROW, UP_ARROW, DOWN_ARROW].includes(keyCode)) return false;
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  constrainLanding();
}
