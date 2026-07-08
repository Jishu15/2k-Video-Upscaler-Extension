const OUTPUT_W = 2560;
const OUTPUT_H = 1440;
const NS = 'http://www.w3.org/2000/svg';

let extensionEnabled = false;
let activeCanvases = new Map();
let detectedVideos = new WeakSet();
let videoScanTimer = null;
let totalDetected = 0;

function is720p(w, h) { return h >= 680 && h <= 760; }
function is1080p(w, h) { return h >= 1040 && h <= 1120; }

function scanForVideos() {
  if (!extensionEnabled) return;
  document.querySelectorAll('video').forEach((video) => {
    if (detectedVideos.has(video)) return;
    if (!video.videoWidth && !video.videoHeight) return;
    detectedVideos.add(video);
    totalDetected++;
    setupVideo(video);
  });
  notifyPopup();
}

function setupVideo(video) {
  video.addEventListener('play', () => {
    if (extensionEnabled && !activeCanvases.has(video)) tryUpscale(video);
  }, { once: true });
  if (extensionEnabled && !video.paused && !activeCanvases.has(video)) tryUpscale(video);
}

function tryUpscale(video) {
  const w = video.videoWidth;
  const h = video.videoHeight;
  if (!w || !h) return;
  if (!is720p(w, h) && !is1080p(w, h)) return;
  if (activeCanvases.has(video)) return;

  const canvas = document.createElement('canvas');
  canvas.width = OUTPUT_W;
  canvas.height = OUTPUT_H;

  const parent = video.parentElement;
  if (!parent) return;
  const pos = getComputedStyle(parent).position;
  if (pos === 'static') parent.style.position = 'relative';

  canvas.style.cssText = `position:absolute !important;top:${video.offsetTop}px !important;left:${video.offsetLeft}px !important;width:${video.offsetWidth}px !important;height:${video.offsetHeight}px !important;z-index:2147483647 !important;pointer-events:none !important;background:transparent !important`;
  parent.appendChild(canvas);

  video.style.opacity = '0';

  function makeRenderer(useWebGL) {
    if (useWebGL) {
      return new WebGLUpscaler(video, canvas, {
        width: OUTPUT_W, height: OUTPUT_H
      });
    }
    return new CanvasUpscaler(video, canvas, {
      width: OUTPUT_W, height: OUTPUT_H
    });
  }

  let renderer;
  try {
    renderer = makeRenderer(supportsWebGL2() && w >= 640);
  } catch (e) {
    renderer = makeRenderer(false);
  }

  renderer.onFallback = () => {
    renderer.stop();
    const r2 = makeRenderer(false);
    chrome.storage.sync.get(['sharpenStrength'], (data) => {
      r2.setSharpness(data.sharpenStrength ?? 0.5);
    });
    r2.start();
    activeCanvases.set(video, { canvas, renderer: r2, ro });
    notifyPopup();
  };

  chrome.storage.sync.get(['sharpenStrength'], (data) => {
    renderer.setSharpness(data.sharpenStrength ?? 0.5);
  });

  const ro = new ResizeObserver(() => {
    if (!video.parentElement) return;
    canvas.style.top = video.offsetTop + 'px';
    canvas.style.left = video.offsetLeft + 'px';
    canvas.style.width = video.offsetWidth + 'px';
    canvas.style.height = video.offsetHeight + 'px';
  });
  ro.observe(video);

  renderer.start();
  activeCanvases.set(video, { canvas, renderer, ro });
  notifyPopup();
}

function removeCanvas(video) {
  const entry = activeCanvases.get(video);
  if (!entry) return;
  const { canvas, renderer, ro } = entry;
  renderer.stop();
  ro.disconnect();
  canvas.remove();
  video.style.opacity = '';
  activeCanvases.delete(video);
  notifyPopup();
}

function removeAllCanvases() {
  for (const [video] of activeCanvases) removeCanvas(video);
}

function supportsWebGL2() {
  const c = document.createElement('canvas');
  const gl = c.getContext('webgl2', { alpha: false, antialias: false });
  if (!gl) return false;
  const ext = gl.getExtension('WEBGL_lose_context');
  if (ext) ext.loseContext();
  return true;
}

class WebGLUpscaler {
  constructor(video, canvas, opts) {
    this.video = video;
    this.canvas = canvas;
    this.opts = opts;
    this.canvas.width = opts.width;
    this.canvas.height = opts.height;
    this.running = false;
    this.paused = false;
    this.sharpness = 0.5;
    this.compareMode = false;
    this.texFailCount = 0;
    this.frameCount = 0;
    this.fpsTime = 0;
    this.lastFrameTime = -1;
    this.animId = null;

    this.gl = canvas.getContext('webgl2', {
      alpha: false, antialias: false, premultipliedAlpha: false
    });
    if (!this.gl) throw new Error('WebGL2 unavailable');
    this.initGL();
  }

  initGL() {
    const gl = this.gl;
    const vs = gl.createShader(gl.VERTEX_SHADER);
    gl.shaderSource(vs, `#version 300 es
      in vec2 aPos;
      out vec2 vTexCoord;
      void main() {
        vTexCoord = aPos * 0.5 + 0.5;
        gl_Position = vec4(aPos, 0.0, 1.0);
      }`);
    gl.compileShader(vs);

    const fs = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(fs, `#version 300 es
      precision highp float;
      in vec2 vTexCoord;
      out vec4 fragColor;
      uniform sampler2D uTexture;
      uniform vec2 uTexelSize;
      uniform float uSharpness;
      void main() {
        vec2 uv = vTexCoord;
        vec3 c = texture(uTexture, uv).rgb;
        vec2 t = uTexelSize;
        vec3 n = texture(uTexture, uv + vec2(0.0, -t.y)).rgb;
        vec3 s = texture(uTexture, uv + vec2(0.0,  t.y)).rgb;
        vec3 w_ = texture(uTexture, uv + vec2(-t.x, 0.0)).rgb;
        vec3 e_ = texture(uTexture, uv + vec2( t.x, 0.0)).rgb;
        vec3 mn = min(c, min(n, min(s, min(w_, e_))));
        vec3 mx = max(c, max(n, max(s, max(w_, e_))));
        vec3 contrast = mx - mn;
        vec3 amount = 1.0 - 1.0 / (contrast * 4.0 + 1.0);
        float sharp = uSharpness * 0.5;
        vec3 sharpened = c + amount * (c * 4.0 - n - s - w_ - e_) * sharp;
        vec3 result = mix(sharpened, sharpened * 1.04, 0.25);
        float luma = dot(result, vec3(0.2126, 0.7152, 0.0722));
        result = mix(vec3(luma), result, 1.05);
        fragColor = vec4(clamp(result, 0.0, 1.0), 1.0);
      }`);
    gl.compileShader(fs);

    if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
      throw new Error('FS compile: ' + gl.getShaderInfoLog(fs));
    }

    this.program = gl.createProgram();
    gl.attachShader(this.program, vs);
    gl.attachShader(this.program, fs);
    gl.linkProgram(this.program);
    gl.useProgram(this.program);

    const verts = new Float32Array([
      -1, -1,   1, -1,   -1, 1,
      -1,  1,   1, -1,    1, 1
    ]);
    this.vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);

    const aPos = gl.getAttribLocation(this.program, 'aPos');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    this.texelSizeLoc = gl.getUniformLocation(this.program, 'uTexelSize');
    this.sharpnessLoc = gl.getUniformLocation(this.program, 'uSharpness');
    this.texLoc = gl.getUniformLocation(this.program, 'uTexture');

    this.texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);

    this.vw = 0;
    this.vh = 0;
    this.fpsTime = performance.now();
    this.frameCount = 0;
  }

  setSharpness(v) { this.sharpness = Math.max(0, Math.min(1, v)); }
  setPaused(v) { this.paused = v; }
  setCompareMode(v) { this.compareMode = v; }

  start() {
    this.running = true;
    this.tick();
  }

  tick() {
    if (!this.running) return;
    this.animId = requestAnimationFrame(() => this.tick());
    if (this.paused) return;
    if (this.video.readyState < 2) return;

    const gl = this.gl;
    const w = this.video.videoWidth;
    const h = this.video.videoHeight;
    if (!w || !h) return;

    if (w !== this.vw || h !== this.vh) {
      this.vw = w;
      this.vh = h;
      gl.uniform2f(this.texelSizeLoc, 1 / w, 1 / h);
    }

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    try { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.video); }
    catch(e) {
      this.texFailCount++;
      if (this.texFailCount > 30) this.onFallback?.();
      return;
    }

    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.uniform1f(this.sharpnessLoc, this.compareMode ? 0 : this.sharpness);
    gl.uniform1i(this.texLoc, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    this.frameCount++;
    const now = performance.now();
    if (now - this.fpsTime >= 1000) {
      this.opts.onFps?.(Math.round(this.frameCount * 1000 / (now - this.fpsTime)));
      this.frameCount = 0;
      this.fpsTime = now;
    }
  }

  stop() {
    this.running = false;
    if (this.animId) { cancelAnimationFrame(this.animId); this.animId = null; }
    const gl = this.gl;
    if (gl) {
      gl.bindTexture(gl.TEXTURE_2D, null);
      gl.useProgram(null);
      gl.bindBuffer(gl.ARRAY_BUFFER, null);
    }
  }
}

class CanvasUpscaler {
  constructor(video, canvas, opts) {
    this.video = video;
    this.canvas = canvas;
    this.opts = opts;
    this.canvas.width = opts.width;
    this.canvas.height = opts.height;
    this.ctx = canvas.getContext('2d');
    this.ctx.imageSmoothingEnabled = true;
    this.ctx.imageSmoothingQuality = 'high';
    this.running = false;
    this.paused = false;
    this.sharpness = 0.5;
    this.compareMode = false;
    this.frameCount = 0;
    this.fpsTime = 0;
    this.animId = null;
    this.setupFilter();
  }

  setupFilter() {
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('width', '0');
    svg.setAttribute('height', '0');
    svg.style.position = 'absolute';
    svg.style.overflow = 'hidden';
    this.filterId = 'u1440-sharpen-' + Date.now();
    const filter = document.createElementNS(NS, 'filter');
    filter.id = this.filterId;
    this.kernelEl = document.createElementNS(NS, 'feConvolveMatrix');
    this.kernelEl.setAttribute('order', '3');
    this.kernelEl.setAttribute('preserveAlpha', 'true');
    this.kernelEl.setAttribute('edgeMode', 'duplicate');
    filter.appendChild(this.kernelEl);
    svg.appendChild(filter);
    document.body.appendChild(svg);
    this.svgEl = svg;
    this.enhanceFilter = 'contrast(1.04) brightness(1.01)';
    this.updateKernel();
    this.applyFilter();
  }

  updateKernel() {
    const s = this.sharpness;
    const neighbor = -s * 0.6;
    const center = 1 + 4 * s * 0.6;
    this.kernelEl.setAttribute('kernelMatrix',
      `0 ${neighbor} 0 ${neighbor} ${center} ${neighbor} 0 ${neighbor} 0`);
  }

  applyFilter() {
    if (this.compareMode) {
      this.canvas.style.filter = '';
    } else if (this.sharpness > 0.01) {
      this.canvas.style.filter = `url(#${this.filterId}) ${this.enhanceFilter}`;
    } else {
      this.canvas.style.filter = this.enhanceFilter;
    }
  }

  setSharpness(v) {
    this.sharpness = Math.max(0, Math.min(1, v));
    this.updateKernel();
    this.applyFilter();
  }

  setPaused(v) { this.paused = v; }
  setCompareMode(v) { this.compareMode = v; this.applyFilter(); }

  start() {
    this.running = true;
    this.fpsTime = performance.now();
    this.frameCount = 0;
    this.tick();
  }

  tick() {
    if (!this.running) return;
    this.animId = requestAnimationFrame(() => this.tick());
    if (this.paused) return;
    if (this.video.readyState < 2) return;

    const vw = this.video.videoWidth;
    const vh = this.video.videoHeight;
    if (!vw || !vh) return;

    const ctx = this.ctx;
    const cw = this.canvas.width;
    const ch = this.canvas.height;

    const srcRatio = vw / vh;
    const dstRatio = cw / ch;
    let sx = 0, sy = 0, sw = vw, sh = vh;
    if (srcRatio > dstRatio) {
      sw = vh * dstRatio;
      sx = (vw - sw) / 2;
    } else if (srcRatio < dstRatio) {
      sh = vw / dstRatio;
      sy = (vh - sh) / 2;
    }

    ctx.clearRect(0, 0, cw, ch);
    ctx.drawImage(this.video, sx, sy, sw, sh, 0, 0, cw, ch);

    this.frameCount++;
    const now = performance.now();
    if (now - this.fpsTime >= 1000) {
      this.opts.onFps?.(Math.round(this.frameCount * 1000 / (now - this.fpsTime)));
      this.frameCount = 0;
      this.fpsTime = now;
    }
  }

  stop() {
    this.running = false;
    if (this.animId) { cancelAnimationFrame(this.animId); this.animId = null; }
    this.canvas.style.filter = '';
    if (this.svgEl && this.svgEl.parentNode) this.svgEl.parentNode.removeChild(this.svgEl);
  }
}

function notifyPopup() {
  chrome.runtime.sendMessage({
    type: 'statusUpdate',
    active: activeCanvases.size > 0,
    count: activeCanvases.size,
    detected: totalDetected
  }).catch(() => {});
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'getStatus') {
    sendResponse({
      active: activeCanvases.size > 0,
      count: activeCanvases.size,
      detected: totalDetected,
      enabled: extensionEnabled
    });
  }
  if (msg.type === 'setSharpness') {
    for (const [, entry] of activeCanvases) {
      entry.renderer.setSharpness(msg.value);
    }
  }
  if (msg.type === 'setEnabled') {
    extensionEnabled = !!msg.value;
    if (!extensionEnabled) {
      removeAllCanvases();
    } else {
      detectedVideos = new WeakSet();
      totalDetected = 0;
      scanForVideos();
    }
    notifyPopup();
  }
  return true;
});

chrome.storage.sync.get(['enabled'], (data) => {
  extensionEnabled = data.enabled ?? true;
  if (extensionEnabled) scanForVideos();
});

const observer = new MutationObserver(() => {
  if (videoScanTimer) clearTimeout(videoScanTimer);
  videoScanTimer = setTimeout(scanForVideos, 300);
});
observer.observe(document.body, { childList: true, subtree: true });

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) setTimeout(scanForVideos, 500);
});
document.addEventListener('play', scanForVideos, true);

window.addEventListener('beforeunload', removeAllCanvases);
