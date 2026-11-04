// Image-based hand cutout. Landmarks seed GrabCut; camera colors and edges
// determine the final mask. Run off the main thread to protect cue timing.
const OPENCV_URL = 'https://cdn.jsdelivr.net/npm/@techstark/opencv-js@4.10.0-release.1/dist/opencv.js';
let ready = false;
self.onmessage = event => {
  if (event.data.type === 'init') {
    try {
      importScripts(OPENCV_URL);
      cv.then(() => { ready = true; self.postMessage({ type: 'ready' }); });
    } catch (error) { self.postMessage({ type: 'error', message: String(error) }); }
    return;
  }
  if (!ready || event.data.type !== 'frame') return;
  const frame = event.data;
  const owned = [];
  const own = mat => { owned.push(mat); return mat; };
  try {
    const { width, height, points } = frame;
    const rgba = own(cv.matFromImageData({ width, height, data: new Uint8ClampedArray(frame.pixels) }));
    const rgb = own(new cv.Mat());
    cv.cvtColor(rgba, rgb, cv.COLOR_RGBA2RGB);
    const mask = own(new cv.Mat(height, width, cv.CV_8UC1, new cv.Scalar(cv.GC_PR_BGD)));
    const palmWidth = Math.hypot(points[5].x - points[17].x, points[5].y - points[17].y);
    const radius = Math.max(2, palmWidth * 0.10);
    const scalar = value => new cv.Scalar(value);
    const point = p => new cv.Point(Math.round(p.x), Math.round(p.y));

    function palmPolygon(scale, value) {
      const ids = [0, 1, 2, 5, 9, 13, 17];
      const center = ids.reduce((c, i) => ({ x: c.x + points[i].x / ids.length,
        y: c.y + points[i].y / ids.length }), { x: 0, y: 0 });
      const coords = ids.flatMap(i => [Math.round(center.x + (points[i].x - center.x) * scale),
        Math.round(center.y + (points[i].y - center.y) * scale)]);
      const polygon = own(cv.matFromArray(ids.length, 1, cv.CV_32SC2, coords));
      const hull = own(new cv.Mat());
      cv.convexHull(polygon, hull);
      cv.fillConvexPoly(mask, hull, scalar(value));
    }
    function fingers(thickness, value) {
      for (const chain of [[0, 1, 2, 3, 4], [5, 6, 7, 8], [9, 10, 11, 12], [13, 14, 15, 16], [17, 18, 19, 20]]) {
        for (let i = 1; i < chain.length; i++) {
          const a = point(points[chain[i - 1]]), b = point(points[chain[i]]);
          const r = Math.max(1, Math.round(radius * thickness));
          cv.line(mask, a, b, scalar(value), r * 2, cv.LINE_8);
          cv.circle(mask, b, r, scalar(value), -1);
        }
      }
    }
    palmPolygon(1.12, cv.GC_PR_FGD);
    fingers(1.6, cv.GC_PR_FGD);
    palmPolygon(0.60, cv.GC_FGD);
    fingers(0.35, cv.GC_FGD);
    // A guaranteed background border makes each small ROI independently solvable.
    cv.rectangle(mask, new cv.Point(0, 0), new cv.Point(width - 1, height - 1), scalar(cv.GC_BGD), 3);
    const background = own(new cv.Mat()), foreground = own(new cv.Mat());
    cv.grabCut(rgb, mask, new cv.Rect(), background, foreground, 2, cv.GC_INIT_WITH_MASK);
    // If camera colors provide no usable separation, don't show a misleading
    // landmark-shaped fallback or a solid rectangular blob.
    const colors = [[0, 0, 0, 0], [0, 0, 0, 0]];
    for (let i = 0; i < mask.data.length; i++) {
      const foregroundPixel = mask.data[i] === cv.GC_FGD || mask.data[i] === cv.GC_PR_FGD;
      const sum = colors[foregroundPixel ? 1 : 0];
      sum[3]++;
      for (let c = 0; c < 3; c++) sum[c] += rgb.data[i * 3 + c];
    }
    const contrast = Math.hypot(...[0, 1, 2].map(c =>
      colors[1][c] / Math.max(1, colors[1][3]) - colors[0][c] / Math.max(1, colors[0][3])));
    const coverage = colors[1][3] / (width * height);
    if (contrast < 18 || coverage > 0.9 || coverage < 0.01) {
      self.postMessage({ type: 'uncertain' });
      return;
    }
    const output = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < mask.data.length; i++) {
      output[i * 4 + 3] = mask.data[i] === cv.GC_FGD || mask.data[i] === cv.GC_PR_FGD ? 255 : 0;
    }
    self.postMessage({ type: 'mask', pixels: output.buffer, width, height,
      roi: frame.roi, videoWidth: frame.videoWidth, videoHeight: frame.videoHeight,
      capturedAt: frame.capturedAt }, [output.buffer]);
  } catch (error) { self.postMessage({ type: 'error', message: String(error) }); }
  finally { owned.reverse().forEach(mat => mat.delete()); }
};
