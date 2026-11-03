// Optional camera cue. Landmark inference stays in the browser; video is never
// uploaded. The optional rehearsal overlay stays inside the light circle.
const CAMERA_ASSETS = 'https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/';
const HOLD_MS = 900;
const RELEASE_MS = 700;
let cameraStream = null;
let cameraHands = null;
let cameraVideo = null;
let cameraFrame = null;
let learnedPalmNormal = null;
let latestPalm = null;
let cueHeldSince = null;
let cueReleasedSince = null;
let cueLatched = true;
let cameraGeneration = 0;
const cameraStatus = message => {
  document.querySelector('#camera-status').textContent = message;
};

function cameraErrorMessage(error) {
  if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
    return 'Camera permission was blocked. Open this page in Chrome, Edge or Safari (not a file preview), allow Camera in the browser’s site settings, then retry. Also check your computer’s camera privacy settings.';
  }
  if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
    return 'No camera found. Connect or enable a webcam, then retry.';
  }
  if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
    return 'Camera could not start. Close other apps using it (such as Zoom or Teams), then retry.';
  }
  return error.message || 'Camera could not start. Try opening the sketch directly in a browser.';
}

function loadHandLibrary() {
  if (window.Hands) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    const timer = setTimeout(() => {
      script.remove();
      reject(new Error('Hand tracking download timed out. Check Internet access to cdn.jsdelivr.net, then retry.'));
    }, 20000);
    script.src = CAMERA_ASSETS + 'hands.js';
    script.onload = () => { clearTimeout(timer); resolve(); };
    script.onerror = () => {
      clearTimeout(timer);
      script.remove();
      reject(new Error('Could not download hand tracking. Check Internet access to cdn.jsdelivr.net, then retry.'));
    };
    document.head.appendChild(script);
  });
}

async function enableCamera() {
  const button = document.querySelector('#camera');
  button.disabled = true;
  cameraStatus('Waiting for camera permission — choose Allow in your browser’s camera prompt.');
  try {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('This page cannot request a camera. Open the downloaded HTML directly in Chrome or Edge, not in a preview. If it still fails, serve it on localhost or HTTPS. Space still works.');
    }
    // Request permission before downloading optional tracking assets.
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: 640, height: 480 }, audio: false
    });
    cameraVideo = document.createElement('video');
    cameraVideo.muted = true;
    cameraVideo.playsInline = true;
    cameraVideo.srcObject = cameraStream;
    await cameraVideo.play();
    button.textContent = 'Disable camera';
    cameraStatus('Camera on — adjust opacity and click the landing point on your palm.');
    if (document.querySelector('#camera-cue').checked) await startPalmTracking();
  } catch (error) {
    await disableCamera();
    cameraStatus(cameraErrorMessage(error) + ' Space still works.');
  } finally {
    button.disabled = false;
  }
}

async function stopPalmTracking() {
  cameraGeneration++;
  cancelAnimationFrame(cameraFrame);
  const hands = cameraHands;
  cameraHands = null;
  learnedPalmNormal = latestPalm = null;
  resetCameraGate();
  document.querySelector('#learn-pose').disabled = true;
  if (hands) { try { await hands.close(); } catch { /* Already stopped. */ } }
}

async function startPalmTracking() {
  const generation = ++cameraGeneration;
  cameraStatus('Camera on. Loading optional palm tracking…');
  try {
    await loadHandLibrary();
    if (generation !== cameraGeneration || !cameraStream) return;
    const hands = new window.Hands({ locateFile: file => CAMERA_ASSETS + file });
    cameraHands = hands;
    hands.setOptions({ maxNumHands: 1, modelComplexity: 1,
      minDetectionConfidence: 0.65, minTrackingConfidence: 0.65 });
    hands.onResults(results => {
      if (generation === cameraGeneration) handleCameraResults(results);
    });
    document.querySelector('#learn-pose').disabled = false;
    cameraStatus('Offer your palm facing the ceiling, then click Learn palm-up pose.');
    let lastFrame = -1;
    async function detect() {
      if (generation !== cameraGeneration) return;
      try {
        if (cameraVideo.currentTime !== lastFrame) {
          lastFrame = cameraVideo.currentTime;
          await hands.send({ image: cameraVideo });
        }
        if (generation === cameraGeneration) cameraFrame = requestAnimationFrame(detect);
      } catch (error) {
        if (generation !== cameraGeneration) return;
        await stopPalmTracking();
        document.querySelector('#camera-cue').checked = false;
        cameraStatus('Palm tracking stopped: ' + error.message + ' Camera overlay and Space still work.');
      }
    }
    cameraFrame = requestAnimationFrame(detect);
  } catch (error) {
    if (generation !== cameraGeneration) return;
    await stopPalmTracking();
    document.querySelector('#camera-cue').checked = false;
    cameraStatus(error.message + ' Camera overlay and Space still work.');
  }
}

async function disableCamera() {
  cameraStream?.getTracks().forEach(track => track.stop());
  cameraStream = null;
  if (cameraVideo) { cameraVideo.pause(); cameraVideo.srcObject = null; }
  cameraVideo = null;
  await stopPalmTracking();
  document.querySelector('#camera').textContent = 'Enable camera';
  cameraStatus('Camera off. Space always works.');
}

// Draw behind the bird, inside the circle clip established in sketch.js.
// Cover the circle's bounding square without stretching the camera image.
function drawCameraOverlay(light) {
  if (!cameraVideo || cameraVideo.readyState < 2 ||
      !document.querySelector('#camera-overlay').checked) return;
  const opacity = Number(document.querySelector('#camera-opacity').value) / 100;
  if (!opacity) return;
  const side = light.radius * 2;
  const cover = Math.max(side / cameraVideo.videoWidth, side / cameraVideo.videoHeight);
  const ctx = drawingContext;
  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.translate(light.x, light.y);
  if (document.querySelector('#camera-mirror').checked) ctx.scale(-1, 1);
  const w = cameraVideo.videoWidth * cover;
  const h = cameraVideo.videoHeight * cover;
  ctx.drawImage(cameraVideo, -w / 2, -h / 2, w, h);
  ctx.restore();
}

document.querySelector('#camera-opacity').oninput = event => {
  document.querySelector('#opacity-value').textContent = event.target.value + '%';
};
document.querySelector('#camera-cue').onchange = async event => {
  if (!event.target.checked) {
    await stopPalmTracking();
    cameraStatus(cameraStream ? 'Palm cue off. Camera overlay and Space still work.' : 'Camera off. Space always works.');
  } else if (cameraStream) await startPalmTracking();
  else cameraStatus('Enable the camera first.');
};

function resetCameraGate() {
  cueHeldSince = cueReleasedSince = null;
  cueLatched = true; // Learning cannot itself trigger the bird.
}

function palmFeatures(points) {
  if (!points || points.length !== 21) return null;
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
  // Allow softly bent fingers, but reject a fist. At least three long fingers
  // must retain most of their extended length.
  let openFingers = 0;
  for (const base of [5, 9, 13, 17]) {
    let length = 0;
    for (let j = base; j < base + 3; j++) length += distance(points[j], points[j + 1]);
    if (length > 0 && distance(points[base], points[base + 3]) / length > 0.78) openFingers++;
  }
  const a = { x: points[5].x - points[0].x, y: points[5].y - points[0].y, z: points[5].z - points[0].z };
  const b = { x: points[17].x - points[0].x, y: points[17].y - points[0].y, z: points[17].z - points[0].z };
  const normal = [a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x];
  const length = Math.hypot(...normal);
  if (length < 1e-8) return null;
  return { open: openFingers >= 3, normal: normal.map(n => n / length) };
}

function handleCameraResults(results) {
  latestPalm = palmFeatures(results.multiHandWorldLandmarks?.[0]);
  if (!learnedPalmNormal) return;
  const dot = latestPalm?.normal.reduce((sum, n, i) => sum + n * learnedPalmNormal[i], 0) ?? -1;
  const matches = latestPalm?.open && dot > 0.82;
  updateCameraGate(Boolean(matches), performance.now());
}

// Separate timing from detection so the one-shot behavior can be tested.
function updateCameraGate(matches, now) {
  if (!matches) {
    cueHeldSince = null;
    if (cueReleasedSince === null) cueReleasedSince = now;
    if (now - cueReleasedSince >= RELEASE_MS) cueLatched = false;
    cameraStatus(cueLatched ? 'Withdraw your hand briefly to rearm.' : 'Ready — offer your learned palm-up pose.');
    return;
  }
  cueReleasedSince = null;
  if (cueLatched) { cameraStatus('Cue used — withdraw your hand to rearm.'); return; }
  if (cueHeldSince === null) cueHeldSince = now;
  if (now - cueHeldSince < HOLD_MS) { cameraStatus('Hold your palm steady…'); return; }
  // Do not interrupt a Space cue or a bird already in its flight/peck sequence.
  const busy = startedAt !== null && millis() - startedAt <
    (FLIGHT_SECONDS + PAUSE_SECONDS + PECK_SECONDS * 2) * 1000;
  if (busy) { cameraStatus('Bird busy — keep holding, or withdraw to cancel.'); return; }
  cueLatched = true;
  startFlight();
  cameraStatus('Bird cued — withdraw your hand before the next cue.');
}

document.querySelector('#camera').onclick = async () => {
  if (cameraStream) {
    const button = document.querySelector('#camera');
    button.disabled = true;
    await disableCamera();
    button.disabled = false;
  } else await enableCamera();
};
document.querySelector('#learn-pose').onclick = () => {
  if (!latestPalm?.open) {
    cameraStatus('No open hand detected. Offer your relaxed palm in clear camera light and try again.');
    return;
  }
  learnedPalmNormal = latestPalm.normal.slice();
  resetCameraGate();
  cameraStatus('Pose learned. Withdraw your hand, then offer it again to cue.');
};
window.addEventListener('pagehide', () => cameraStream?.getTracks().forEach(track => track.stop()));
