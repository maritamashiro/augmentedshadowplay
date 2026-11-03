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

## Hand tracking for screen rehearsal

1. Expand **Calibration & camera**, click **Enable camera**, and keep the overlay visible.
2. Check **Follow open palm**. Hand tracking assets download the first time. Put your open hand inside the circle in good camera light.
3. The landing crosshair follows the center of your palm. Click the spot where you want the feet, or use arrows, to add an alignment offset. **Reset palm alignment** removes that offset.
4. Press **Space**. The bird approaches the moving perch and continues following it while perched and pecking.
5. For a hands-free trigger, also check **Palm cue + follow**, offer a palm facing the ceiling, and click **Learn palm-up pose**. Withdraw briefly and offer it again.

Following accepts an open hand without pose learning; the automatic cue requires learning your palm-up orientation. The landmark filter reduces jitter. A missing/closed hand or a hand outside the circle stops updating the bird after a short grace period; the bird holds its last position rather than jumping. If hand landmarks disappear for 0.7 seconds, it takes off from its current position and flies upward out of the circle. A brief tracking flicker does not trigger departure; a visible hand that merely closes or turns also does not. Departure applies to palm-following flights, while manually placed birds remain perched. Turn following off to return to click-based manual calibration. The camera and tracking can run with the video overlay hidden.

Coordinates match the overlay's crop and mirror setting. This is suitable for camera rehearsal, not a calibrated camera-to-projector mapping. A physical projection will need a separate mapping/calibration pass. Real-hand accuracy still depends on lighting, camera angle and occlusion.

## Optional camera cue

Use a browser that supports camera access on **HTTPS or localhost**. Local HTML camera permissions vary by browser; use a local server if permission is unavailable. Palm cue mode needs Internet access to `cdn.jsdelivr.net` to download pinned MediaPipe Hands 0.4.1675469240 assets. p5.js 1.11.11 is vendored locally (LGPL-2.1).

1. Expand **Calibration & camera**, click **Enable camera**, check **Palm cue + follow**, and grant camera permission.
2. Position the camera so your actual hand is visible in sufficient light. The camera should see your hand, not just its wall shadow. Turn off **Show camera in circle** for projection; leave it on for screen rehearsal.
3. Offer your relaxed, open, palm-up pose and click **Learn palm-up pose**. Keep using the same hand and camera angle; relearn after moving the camera. The learned orientation is temporary.
4. Withdraw your hand for at least 0.7 seconds. Offer it again and hold for 0.9 seconds to cue once. Keeping it held does not repeat the cue. Withdraw to rearm.
5. **Disable camera** releases the camera. Space always remains available.

The cue uses local 3D hand landmarks, an open-finger check, and similarity to the learned palm orientation. It is a prototype heuristic, not a physical measurement of which way the ceiling is. It tolerates slightly bent fingers but may miss a deeply cupped or occluded hand. Real camera/pose accuracy needs testing in your projector setup. Video is processed in the browser and is not uploaded. Landing coordinates stay manual unless **Follow open palm** is enabled.

## Code

- `sketch.js`: circle geometry, clipping, manual landing calibration and bird animation. Timing constants are at the top.
- `camera.js`: optional landmark loading, palm following, camera coordinate mapping, pose learning, hold timing and one-shot rearming.
- `index.html`: muted instructions and controls outside the circle.

Browser checks cover the full animation, clipping at multiple flight/peck times, marker toggling, resize, standalone packaging and synthetic one-shot cue/rearm timing. These do not replace a real hand/projector test.

Enabling **Palm cue + follow** automatically enables **Follow open palm**, so the offered palm becomes the perch. Automatic palm cues require a live palm and never fall back to the manual marker. Disable both palm options for a fixed manual perch. Relearning a pose clears previous alignment offsets. The green marker labeled LIVE PALM shows the current target; LAST PALM indicates tracking has been lost.

### Cue feedback

The **Cue hold** bar shows the 0.9-second pose hold. Small wrist rotations and detection flickers up to 0.22 seconds pause progress instead of discarding it; longer mismatches reset it. After a cue, move your hand fully out of the camera frame for 0.7 seconds to rearm. Turning or closing a visible hand does not rearm the cue. Long inference stalls do not count toward a hold or withdrawal. Relaxed, gently bent fingers are accepted; Space remains available as a backup.
