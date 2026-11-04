// Optional camera-pixel segmentation, independent of video opacity and cueing.
let silhouetteWorker = null;
let silhouetteReady = false;
let silhouetteBusy = false;
let silhouetteTimeout = null;
let silhouetteFrame = null;
let silhouetteCapture = null;
let silhouetteMask = null;
let silhouetteLastSent = -Infinity;
const SILHOUETTE_INTERVAL_MS = 125;
const SILHOUETTE_MAX_AGE_MS = 450;
const silhouetteStatus = text => {
  document.querySelector('#silhouette-status').textContent = text;
};

function clearHandSilhouette() { silhouetteFrame = null; }

function stopHandSilhouette() {
  silhouetteWorker?.terminate();
  silhouetteWorker = null;
  clearTimeout(silhouetteTimeout);
  silhouetteReady = silhouetteBusy = false;
  silhouetteLastSent = -Infinity;
  clearHandSilhouette();
}

function silhouetteFailed(message) {
  stopHandSilhouette();
  document.querySelector('#hand-silhouette').checked = false;
  silhouetteStatus('Silhouette unavailable: ' + message + ' Camera and bird still work.');
}

function startHandSilhouette() {
  if (silhouetteWorker) return;
  silhouetteStatus('Loading image segmentation…');
  (() => {
    let url = null;
    try {
      // Standalone downloads embed this source; the website uses the same worker file.
      if (window.SHADOWPLAY_SEGMENTATION_WORKER) {
        url = URL.createObjectURL(new Blob([window.SHADOWPLAY_SEGMENTATION_WORKER], { type: 'text/javascript' }));
      }
      const worker = new Worker(url || 'silhouette-worker.js?v=palm6');
      silhouetteWorker = worker;
      worker.onmessage = event => {
        if (silhouetteWorker !== worker) return;
        const result = event.data;
        clearTimeout(silhouetteTimeout);
        if (result.type === 'ready') {
          silhouetteReady = true;
          silhouetteStatus('Segmentation ready — show your hand against a contrasting background.');
        } else if (result.type === 'mask') {
          silhouetteBusy = false;
          silhouetteMask ||= document.createElement('canvas');
          silhouetteMask.width = result.width;
          silhouetteMask.height = result.height;
          silhouetteMask.getContext('2d').putImageData(new ImageData(
            new Uint8ClampedArray(result.pixels), result.width, result.height), 0, 0);
          silhouetteFrame = result;
          silhouetteStatus('Live hand cutout');
        } else if (result.type === 'uncertain') {
          silhouetteBusy = false;
          clearHandSilhouette();
          silhouetteStatus('Hand edge unclear — try brighter light or a contrasting background.');
        } else if (result.type === 'error') silhouetteFailed(result.message);
      };
      worker.onerror = () => {
        if (silhouetteWorker === worker) silhouetteFailed('Could not load the segmentation worker. Check Internet access.');
      };
      silhouetteTimeout = setTimeout(() => silhouetteFailed('Segmentation load timed out. Try again.'), 30000);
      worker.postMessage({ type: 'init' });
    } catch (error) { silhouetteFailed(error.message); }
    finally { if (url) URL.revokeObjectURL(url); }
  })();
}

function handRegion(points, videoWidth, videoHeight) {
  const xs = points.map(p => p.x * videoWidth), ys = points.map(p => p.y * videoHeight);
  const padding = Math.max(12, Math.hypot((points[5].x - points[17].x) * videoWidth,
    (points[5].y - points[17].y) * videoHeight) * 0.4);
  const x = Math.max(0, Math.floor(Math.min(...xs) - padding));
  const y = Math.max(0, Math.floor(Math.min(...ys) - padding));
  const right = Math.min(videoWidth, Math.ceil(Math.max(...xs) + padding));
  const bottom = Math.min(videoHeight, Math.ceil(Math.max(...ys) + padding));
  return { x, y, width: Math.max(1, right - x), height: Math.max(1, bottom - y) };
}

function updateHandSilhouette(points, now) {
  if (!document.querySelector('#hand-silhouette').checked) return;
  if (!points || points.length !== 21) {
    clearHandSilhouette();
    silhouetteStatus('Looking for a hand');
    return;
  }
  if (!silhouetteReady || silhouetteBusy || !cameraVideo || cameraVideo.readyState < 2 ||
      now - silhouetteLastSent < SILHOUETTE_INTERVAL_MS) return;
  const vw = cameraVideo.videoWidth, vh = cameraVideo.videoHeight;
  const roi = handRegion(points, vw, vh);
  const scale = Math.min(1, 224 / Math.max(roi.width, roi.height));
  silhouetteCapture ||= document.createElement('canvas');
  silhouetteCapture.width = Math.max(8, Math.round(roi.width * scale));
  silhouetteCapture.height = Math.max(8, Math.round(roi.height * scale));
  const ctx = silhouetteCapture.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(cameraVideo, roi.x, roi.y, roi.width, roi.height, 0, 0,
    silhouetteCapture.width, silhouetteCapture.height);
  const image = ctx.getImageData(0, 0, silhouetteCapture.width, silhouetteCapture.height);
  const mapped = points.map(p => ({ x: (p.x * vw - roi.x) * silhouetteCapture.width / roi.width,
    y: (p.y * vh - roi.y) * silhouetteCapture.height / roi.height }));
  silhouetteBusy = true;
  silhouetteLastSent = now;
  silhouetteTimeout = setTimeout(() => silhouetteFailed('Segmentation stalled. Try again.'), 5000);
  silhouetteWorker.postMessage({ type: 'frame', pixels: image.data.buffer,
    width: image.width, height: image.height, points: mapped, roi,
    videoWidth: vw, videoHeight: vh, capturedAt: now }, [image.data.buffer]);
}

function drawHandSilhouette(light) {
  if (!document.querySelector('#hand-silhouette').checked || !cameraStream || !silhouetteFrame ||
      performance.now() - silhouetteFrame.capturedAt > SILHOUETTE_MAX_AGE_MS ||
      performance.now() - lastHandSeenAt > 250) return;
  const frame = silhouetteFrame;
  const cover = Math.max(light.radius * 2 / frame.videoWidth, light.radius * 2 / frame.videoHeight);
  const ctx = drawingContext;
  ctx.save();
  ctx.translate(light.x, light.y);
  if (document.querySelector('#camera-mirror').checked) ctx.scale(-1, 1);
  ctx.drawImage(silhouetteMask, (frame.roi.x - frame.videoWidth / 2) * cover,
    (frame.roi.y - frame.videoHeight / 2) * cover,
    frame.roi.width * cover, frame.roi.height * cover);
  ctx.restore();
}

document.querySelector('#hand-silhouette').onchange = async event => {
  if (event.target.checked) {
    await startHandSilhouette();
    if (event.target.checked) await changeTrackingMode();
  } else {
    stopHandSilhouette();
    silhouetteStatus('Silhouette off');
    await changeTrackingMode();
  }
};
window.addEventListener('pagehide', stopHandSilhouette);
