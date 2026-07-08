# Chrome Web Store Listing

## Store Description

### Short Description (132 chars max)
Upscales 720p and 1080p videos to 2560×1440 in real-time using WebGL2. Zero config — just open a video and it works.

### Detailed Description
**1440p Video Upscaler** automatically detects 720p and 1080p video elements on any webpage and upscales them to crisp 2560×1440 resolution in real-time — no configuration needed.

**How it works:**
1. Visit any page with a video (YouTube, Vimeo, Twitch, etc.)
2. The extension scans for 720p/1080p video elements
3. Each matching video gets upscaled to 1440p with GPU acceleration
4. Adjust sharpness from the popup to suit your preference

**Key Features:**
- Automatic detection of 720p and 1080p videos on all websites
- GPU-accelerated rendering via WebGL2 fragment shader
- Real-time adaptive sharpening with adjustable intensity (0-100%)
- Canvas 2D fallback when WebGL2 is unavailable
- On/off toggle without reloading the page
- Live status showing active upscaled videos
- Zero page interaction — all controls in the extension popup
- Works in iframes and dynamically loaded content
- Synced settings across Chrome devices

**Technical highlights:**
- WebGL2 fragment shader with bilinear texture sampling and adaptive contrast-aware sharpening
- Automatic center-crop for non-16:9 source videos
- MutationObserver-based detection handles SPAs and dynamic content
- ResizeObserver keeps the overlay aligned during layout changes
- Graceful fallback to Canvas 2D for DRM-protected or cross-origin videos

**Tips:**
- Open the extension popup to see how many videos are being upscaled
- Adjust the sharpening slider if the upscaled video looks soft
- Toggle the extension off to compare original vs. upscaled quality

## Categories
- Primary: Productivity
- Secondary: Accessibility

## Screenshots

### Screenshot 1 (required, 1280x800 or 640x400)
Show the extension popup open with a video playing. Include:
- A webpage with a video player visible
- The extension popup showing the upscaler toggle ON
- Status showing "1 video upscaled" with the green dot active
- The sharpness slider at 50%

### Screenshot 2 (optional)
Show the popup with the upscaler toggled OFF, demonstrating how easy it is to compare.

### Screenshot 3 (optional)
Show the popup on a page with multiple videos detected.

## Promotional Images
- Small promo tile: 440x280 px
- Large promo tile: 920x680 px
- Marquee promo tile: 1400x560 px

All should feature the extension name "1440p Video Upscaler" on a dark background with the gradient theme (#667eea to #764ba2).

## Additional Fields

### Language
English (United States)

### Privacy Policy
This extension does NOT collect, store, or transmit any user data.
- No analytics, no telemetry, no network requests to external servers
- No access to browsing history, bookmarks, or tabs beyond the active tab
- All processing happens locally in the browser using WebGL2 or Canvas 2D
- The only storage used is chrome.storage.sync for user preferences (on/off state and sharpness level), which syncs across your own Chrome devices

### Single Purpose
Upscale 720p and 1080p videos to 2560x1440 resolution in real-time.

### Permission Justification
- `activeTab`: Required to communicate with the content script in the currently active tab (toggle on/off, adjust sharpness, query status).
- `storage`: Required to persist user settings (enable state, sharpness level) across browser sessions and sync them across devices.
