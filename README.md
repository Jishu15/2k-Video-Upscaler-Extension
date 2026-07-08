# 1440p Video Upscaler

[![GitHub release](https://img.shields.io/github/v/release/Jishu15/2k-Video-Upscaler-Extension)](https://github.com/Jishu15/2k-Video-Upscaler-Extension/releases)
[![License](https://img.shields.io/github/license/Jishu15/2k-Video-Upscaler-Extension)](LICENSE)

A Chrome extension that automatically upscales 720p and 1080p videos to **2560×1440 (1440p)** in real-time. Uses WebGL2 for GPU-accelerated rendering with a Canvas 2D fallback, all controlled entirely from the extension popup — no interaction with the web page required.

## Features

- **Automatic video detection** — scans every page (including iframes) for `<video>` elements and checks if they match 720p or 1080p resolution
- **Real-time upscaling to 1440p** — renders every video frame at 2560×1440 with high-quality bilinear interpolation
- **Dual renderer architecture**:
  - **WebGL2 renderer (primary)** — uses a GPU fragment shader for hardware-accelerated texture sampling and on-the-fly sharpening
  - **Canvas 2D renderer (fallback)** — uses `drawImage` with `imageSmoothingQuality: 'high'` and an SVG convolution filter for sharpening; activates automatically when WebGL2 is unavailable
- **On/off toggle** — enable or disable upscaling on the fly without reloading the page; disabling restores the original video immediately
- **Adjustable sharpening** — a slider (0–100%) controls an adaptive contrast-aware sharpen effect that reduces the softness inherent in upscaled video
- **Live status monitoring** — the popup displays how many videos are currently being upscaled, how many were detected, and whether the extension is active
- **Persistent overlay alignment** — a `ResizeObserver` keeps the canvas locked to the video element's position and size even when the page layout changes
- **FPS reporting** — each renderer tracks frame rate and reports it back for debugging or performance monitoring
- **Edge case coverage** — handles dynamic DOM mutations, tab visibility changes, video resolution changes across frames, nested iframes, and WebGL context loss gracefully

## How It Works

The entire pipeline runs inside the content script injected into every page:

1. **Video scanning** — the content script watches for `<video>` elements using a `MutationObserver`. When a new video is found, it checks `videoWidth` and `videoHeight` against 720p (680–760 px tall) and 1080p (1040–1120 px tall) thresholds.

2. **Canvas overlay** — an empty `<canvas>` element is created at 2560×1440 resolution and positioned absolutely on top of the video. The original video is hidden by setting its CSS `opacity` to `0`.

3. **Per-frame rendering** — inside a `requestAnimationFrame` loop, each new video frame is drawn onto the canvas at the target resolution:
   - **WebGL2 path**: the video is uploaded as a GPU texture, then a fragment shader samples it with bilinear filtering and applies a sharpening pass. The sharpening algorithm is adaptive: it measures local contrast around each pixel (comparing against its four orthogonal neighbors) and applies more correction in high-detail areas.
   - **Canvas 2D path**: `drawImage` scales the frame to 2560×1440 with `imageSmoothingQuality: 'high'`. Sharpening is applied declaratively via a CSS filter backed by an SVG `<feConvolveMatrix>` element.

4. **Popup communication** — the popup talks to the content script via `chrome.tabs.sendMessage`. Messages include `setEnabled` (toggle on/off), `setSharpness` (update sharpen slider), and `getStatus` (query current state).

## Installation

### Chrome Web Store
Install with one click once published:
> **Link:** https://chromewebstore.google.com/... *(pending review)*

### Manual Install (Unpacked)
1. [Download the latest ZIP](https://github.com/Jishu15/2k-Video-Upscaler-Extension/releases) from Releases.
2. Extract the ZIP to a folder.
3. Open Chrome/Edge/Brave/Opera and go to `chrome://extensions`.
4. Enable **Developer mode** (top-right toggle).
5. Click **Load unpacked** and select the extracted folder.
6. Pin the extension icon from the toolbar.

### Build from Source
```powershell
.\scripts\build.ps1
# Output: dist/1440p-video-upscaler-v1.0.0.zip
```

## Usage

Click the extension icon in the toolbar to open the popup:

| Control | Description |
|---|---|
| **Upscaler toggle** | Turns upscaling on or off for the current tab. When turned off, all overlay canvases are removed and the original videos become visible again. When turned back on, the page is re-scanned for videos. |
| **Sharpening slider** | Adjusts the intensity of the post-upscale sharpening effect from 0 (no sharpening) to 100% (maximum sharpening). The default is 50%. Changes apply instantly. |
| **Status indicator** | Shows the current state: number of videos being upscaled, number of detected videos that don't match 720p/1080p, or a message indicating the extension is idle. A green dot means at least one video is actively being upscaled. |

## Project Structure

```
2k-video-upscaler-extension/
├── manifest.json              # Extension manifest (Manifest V3)
├── background.js              # Service worker — defaults on install
├── content.js                 # Content script — scanning, overlay, renderers, messaging
├── popup.html                 # Popup UI
├── popup.js                   # Popup logic — settings, messaging
├── styles.css                 # Page styles (mostly inline on canvas)
├── STORE_LISTING.md           # Chrome Web Store listing guidance
├── scripts/
│   └── build.ps1              # Packaging script (ZIP + unpacked)
├── .github/
│   └── workflows/
│       └── release.yml        # Auto-build on version tag
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── README.md
```

## Technical Details

### Rendering Pipeline

- **Canvas dimensions**: 2560×1440 (16:9 aspect ratio)
- **Input crop**: when the source video's aspect ratio differs from 16:9, the renderer center-crops the source to match before upscaling
- **WebGL2 fragment shader**: GLSL ES 3.00 shader that samples the video texture with `LINEAR` min/mag filtering, then applies an adaptive sharpen:
  - Computes per-pixel local contrast as `max(r,g,b) - min(r,g,b)` across the pixel and its four neighbors
  - Derives a per-pixel sharpening amount inversely proportional to contrast (smoother areas get less sharpening, reducing noise amplification)
  - Applies a subtle saturation boost (`1.04×`) and luma-weighted contrast enhancement (`1.05×`)
- **Canvas 2D sharpen**: a 3×3 convolution kernel with center = `1 + 4 * s * 0.6` and neighbors = `-s * 0.6`, combined with a `contrast(1.04) brightness(1.01)` CSS filter

### Video Detection Logic

- **720p**: `videoHeight` between 680 and 760 pixels (inclusive)
- **1080p**: `videoHeight` between 1040 and 1120 pixels (inclusive)
- Uses a `WeakSet` to track already-processed videos and avoid duplicate setup
- Re-scans on every DOM mutation (debounced at 300ms), on `visibilitychange` (when the tab becomes visible), and on `play` events

### Persistence

- Settings (`sharpenStrength`, `enabled`) are stored in `chrome.storage.sync` so they sync across browser devices
- The extension is enabled by default on install

### Error Handling & Fallbacks

- If the WebGL2 context fails to initialize, the Canvas 2D fallback is used immediately
- If `texImage2D` fails repeatedly (30+ consecutive failures, which can happen with certain DRM-protected video or cross-origin restrictions), the renderer switches to Canvas 2D at runtime
- All `chrome.runtime.sendMessage` calls to the popup have a `.catch(() => {})` to suppress errors when the popup is closed
- The `beforeunload` event cleans up all canvases when the page navigates away

## Browser Compatibility

- **Chrome** 88+ (Manifest V3, WebGL2)
- **Edge** 88+ (Chromium-based)
- **Opera** 74+
- **Brave** 1.20+
- Not compatible with Firefox (uses Manifest V2) or Safari (no Manifest V3 support)

WebGL2 is required for the GPU-accelerated renderer. If unavailable, the extension falls back to Canvas 2D automatically with no user intervention needed.

## Performance Considerations

- Upscaling is done per-frame inside `requestAnimationFrame`, so it only runs when the tab is visible and the page is actively painting
- The WebGL2 renderer is significantly more performant than the Canvas 2D fallback, especially for 1080p→1440p upscaling
- Sharpening is intentionally kept subtle by design (adaptive gain control) to avoid amplifying compression artifacts or noise in low-detail areas

## Deployment

### GitHub Releases
Push a version tag to trigger the automated build:
```bash
git tag v1.0.0
git push origin v1.0.0
```
The [Build & Release](.github/workflows/release.yml) workflow packages the extension into a ZIP and creates a GitHub Release.

### Chrome Web Store
1. Prepare assets — see [`STORE_LISTING.md`](STORE_LISTING.md) for screenshot specs and descriptions.
2. Run `.\scripts\build.ps1` or download the ZIP from Releases.
3. Go to the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole).
4. Create a new item, upload the ZIP, fill in the listing.
5. Pay the one-time $5 developer registration fee.
6. Submit for review.

## License

MIT — see [LICENSE](LICENSE) for details.
