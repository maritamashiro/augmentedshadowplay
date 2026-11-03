# Augmented Shadowplay

A p5.js projection: black fullscreen canvas, centered warm ivory light circle, and a sparrow silhouette clipped to the light. Your real hand creates the palm shadow; the sketch does not draw a hand.

## Open from GitHub Pages

In the GitHub repository, open **Settings → Pages**. Under **Build and deployment**, choose **Deploy from a branch**, select **main** and **/ (root)**, then **Save**. GitHub will show the published address when deployment finishes. The sketch runs directly from `index.html`; no build step is needed. Camera access requires browser permission.

After Pages is enabled, changes pushed to `main` redeploy automatically. Reload the published page after deployment to use the latest sketch; no HTML downloads are needed.

## First projector test

Open `index.html` in a browser, or download and open the standalone `Shadowplay.html` supplied with the sketch. The projection and Space trigger work offline. For a local server:

```sh
cd /workspace/augmentedshadowplay
python3 -m http.server 8000
```

1. Move the browser to the projector and press **F** for fullscreen.
2. Bring your real hand into the beam from the lower left, with a relaxed palm facing the ceiling as if offering seeds.
3. Click inside the ivory circle to align the landing crosshair with your palm shadow. The crosshair marks the bird's feet. **Arrows** adjust by one pixel; **Shift + arrows** by ten pixels. Points outside the circle are constrained to its edge.
4. Press **Space**: the bird flies into the light, slows, lands, pauses and pecks twice, then stays perched.
5. Press **M** to hide/show the marker. The small upper-left instructions remain visible. The expandable calibration panel includes bird size and optional camera controls.

The landing point stays manual; changes during a flight apply to the next cue. Placement survives resizing proportionally, but resets when reloading. Click the canvas or press Escape after using form controls to return shortcut focus to the sketch.

## Rehearse without a projector

Expand **Calibration & camera** and click **Enable camera**. The live camera image appears inside the ivory circle, behind the bird and landing marker. **Camera opacity** blends from 0% (ivory only) to 100% (full camera image). **Show camera in circle** hides/shows the feed without changing its opacity or stopping an active palm cue. **Mirror camera** defaults on so alignment feels like a mirror. Click the landing point on your visible palm, then press Space. Adjusting the opacity never fades the bird.

The feed is center-cropped to fill the circle without stretching. **Disable camera** releases the webcam. Rehearsal uses browser camera access only; Internet/model downloads are needed only when **Enable palm cue** is checked. Tracking failures leave the camera overlay usable.

## Optional camera cue

Use a browser that supports camera access on **HTTPS or localhost**. Local HTML camera permissions vary by browser; use a local server if permission is unavailable. Palm cue mode needs Internet access to `cdn.jsdelivr.net` to download pinned MediaPipe Hands 0.4.1675469240 assets. p5.js 1.11.11 is vendored locally (LGPL-2.1).

1. Expand **Calibration & camera**, click **Enable camera**, check **Enable palm cue**, and grant camera permission.
2. Position the camera so your actual hand is visible in sufficient light. The camera should see your hand, not just its wall shadow. Turn off **Show camera in circle** for projection; leave it on for screen rehearsal.
3. Offer your relaxed, open, palm-up pose and click **Learn palm-up pose**. Keep using the same hand and camera angle; relearn after moving the camera. The learned orientation is temporary.
4. Withdraw your hand for at least 0.7 seconds. Offer it again and hold for 0.9 seconds to cue once. Keeping it held does not repeat the cue. Withdraw to rearm.
5. **Disable camera** releases the camera. Space always remains available.

The cue uses local 3D hand landmarks, an open-finger check, and similarity to the learned palm orientation. It is a prototype heuristic, not a physical measurement of which way the ceiling is. It tolerates slightly bent fingers but may miss a deeply cupped or occluded hand. Real camera/pose accuracy needs testing in your projector setup. Video is processed in the browser and is not uploaded. Landing coordinates are never taken from tracking.

## Code

- `sketch.js`: circle geometry, clipping, manual landing calibration and bird animation. Timing constants are at the top.
- `camera.js`: optional landmark loading, pose learning, hold timing and one-shot rearming.
- `index.html`: muted instructions and controls outside the circle.

Browser checks cover the full animation, clipping at multiple flight/peck times, marker toggling, resize, standalone packaging and synthetic one-shot cue/rearm timing. These do not replace a real hand/projector test.
