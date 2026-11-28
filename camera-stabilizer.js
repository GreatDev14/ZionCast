/**
 * ZionCast Real-Time Camera Stabilizer Engine (EIS)
 * Lightweight frame-to-frame luminance tracking + pan-preserving high-pass filter
 * with strict overscan boundary clamping so black borders never appear.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.ZionCameraStabilizer = api;
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  const ANALYSIS_W = 96;
  const ANALYSIS_H = 54;

  const PRESETS = {
    off: { key: 'off', label: 'Off', overscan: 1.0, radius: 0, panFollow: 1.0, damp: 0.0, centerPull: 1.0 },
    light: { key: 'light', label: 'Light', overscan: 1.08, radius: 5, panFollow: 0.16, damp: 0.72, centerPull: 0.04 },
    medium: { key: 'medium', label: 'Medium', overscan: 1.14, radius: 7, panFollow: 0.10, damp: 0.80, centerPull: 0.025 },
    strong: { key: 'strong', label: 'Strong', overscan: 1.22, radius: 9, panFollow: 0.06, damp: 0.86, centerPull: 0.015 }
  };

  function clamp(val, min, max) {
    return val < min ? min : (val > max ? max : val);
  }

  function normalizeLevel(level) {
    const raw = String(level || 'off').toLowerCase().trim();
    if (raw === 'med') return 'medium';
    return Object.prototype.hasOwnProperty.call(PRESETS, raw) ? raw : 'off';
  }

  function getPreset(level) {
    return PRESETS[normalizeLevel(level)];
  }

  /**
   * Composes digital zoom and stabilizer overscan + translation into a GPU-composited
   * CSS transform clamped inside the safe overscan margin so black edges never show.
   */
  function computeTransform(offsetNormX, offsetNormY, baseZoom = 1, level = 'off') {
    const preset = getPreset(level);
    const z = clamp(Number(baseZoom) || 1, 1, 5);
    const totalScale = z * preset.overscan;

    if (preset.key === 'off') {
      return {
        level: 'off',
        scale: z,
        txPct: 0,
        tyPct: 0,
        css: z > 1.01 ? `scale(${z.toFixed(3)})` : 'none'
      };
    }

    const maxShiftPct = Math.max(0, 50 * (totalScale - 1) * 0.94);
    const rawTx = (Number(offsetNormX) || 0) * 100 * totalScale;
    const rawTy = (Number(offsetNormY) || 0) * 100 * totalScale;
    const txPct = clamp(rawTx, -maxShiftPct, maxShiftPct);
    const tyPct = clamp(rawTy, -maxShiftPct, maxShiftPct);

    return {
      level: preset.key,
      scale: totalScale,
      txPct,
      tyPct,
      css: `translate3d(${txPct.toFixed(3)}%, ${tyPct.toFixed(3)}%, 0) scale(${totalScale.toFixed(3)})`
    };
  }

  /**
   * Converts RGBA ImageData bytes into a fast integer luminance array (0-255).
   */
  function extractLuma(rgba, width, height, outBuf) {
    const len = width * height;
    const luma = outBuf && outBuf.length === len ? outBuf : new Uint8Array(len);
    for (let i = 0, p = 0; i < len; i++, p += 4) {
      luma[i] = (rgba[p] + (rgba[p + 1] << 1) + rgba[p + 2]) >> 2;
    }
    return luma;
  }

  function sadAtOffset(prevLuma, currLuma, width, height, margin, step, dx, dy) {
    let sum = 0;
    let count = 0;
    const yEnd = height - margin;
    const xEnd = width - margin;
    for (let y = margin; y < yEnd; y += step) {
      const pRow = y * width;
      const cRow = (y + dy) * width + dx;
      for (let x = margin; x < xEnd; x += step) {
        const diff = prevLuma[pRow + x] - currLuma[cRow + x];
        sum += diff < 0 ? -diff : diff;
        count++;
      }
    }
    return count > 0 ? (sum / count) : 255;
  }

  /**
   * Estimates inter-frame camera image shift (dx, dy in analysis pixels) using a
   * coarse-to-fine Sum-of-Absolute-Differences search with parabolic sub-pixel refinement.
   * Positive dx means scene content moved right (so camera rotated left); compensation shifts left (-dx).
   */
  function estimateShift(prevLuma, currLuma, width = ANALYSIS_W, height = ANALYSIS_H, searchRadius = 7) {
    if (!prevLuma || !currLuma || prevLuma.length !== currLuma.length || searchRadius <= 0) {
      return { dx: 0, dy: 0, confidence: 0 };
    }

    const r = clamp(Math.floor(searchRadius), 1, 14);
    const margin = r + 2;
    if (width <= margin * 2 + 4 || height <= margin * 2 + 4) {
      return { dx: 0, dy: 0, confidence: 0 };
    }

    // Measure local scene gradient + global brightness jump before searching
    let gradSum = 0;
    let lumDiff = 0;
    let sampleCount = 0;
    const yEnd = height - margin;
    const xEnd = width - margin;
    for (let y = margin; y < yEnd; y += 2) {
      const row = y * width;
      for (let x = margin; x < xEnd; x += 2) {
        const c = currLuma[row + x];
        const gx = c - currLuma[row + x + 1];
        const gy = c - currLuma[row + width + x];
        gradSum += (gx < 0 ? -gx : gx) + (gy < 0 ? -gy : gy);
        lumDiff += c - prevLuma[row + x];
        sampleCount++;
      }
    }

    const avgGrad = sampleCount > 0 ? gradSum / sampleCount : 0;
    const avgLumJump = sampleCount > 0 ? Math.abs(lumDiff / sampleCount) : 0;
    // Skip blank/flat frames (dark wall/blackout) or abrupt exposure/scene flashes
    if (avgGrad < 3.2 || avgLumJump > 38) {
      return { dx: 0, dy: 0, confidence: 0 };
    }

    // Stage 1: Coarse 2px search
    let coarseBestDx = 0;
    let coarseBestDy = 0;
    let coarseBestSad = Infinity;
    let zeroSad = sadAtOffset(prevLuma, currLuma, width, height, margin, 2, 0, 0);
    let totalSad = 0;
    let candidates = 0;

    for (let dy = -r; dy <= r; dy += 2) {
      for (let dx = -r; dx <= r; dx += 2) {
        const sad = sadAtOffset(prevLuma, currLuma, width, height, margin, 2, dx, dy);
        totalSad += sad;
        candidates++;
        if (sad < coarseBestSad) {
          coarseBestSad = sad;
          coarseBestDx = dx;
          coarseBestDy = dy;
        }
      }
    }

    // Stage 2: Fine 1px refinement around coarse best
    let bestDx = coarseBestDx;
    let bestDy = coarseBestDy;
    let bestSad = Infinity;

    for (let oy = -1; oy <= 1; oy++) {
      for (let ox = -1; ox <= 1; ox++) {
        const dx = clamp(coarseBestDx + ox, -r, r);
        const dy = clamp(coarseBestDy + oy, -r, r);
        const sad = sadAtOffset(prevLuma, currLuma, width, height, margin, 1, dx, dy);
        if (sad < bestSad) {
          bestSad = sad;
          bestDx = dx;
          bestDy = dy;
        }
      }
    }

    // Parabolic sub-pixel interpolation centered strictly on (bestDx, bestDy)
    let subDx = 0;
    let subDy = 0;
    if (bestDx > -r && bestDx < r) {
      const sL = sadAtOffset(prevLuma, currLuma, width, height, margin, 1, bestDx - 1, bestDy);
      const sR = sadAtOffset(prevLuma, currLuma, width, height, margin, 1, bestDx + 1, bestDy);
      const denomX = sL - 2 * bestSad + sR;
      if (denomX > 0.05) subDx = clamp(0.5 * (sL - sR) / denomX, -0.49, 0.49);
    }
    if (bestDy > -r && bestDy < r) {
      const sU = sadAtOffset(prevLuma, currLuma, width, height, margin, 1, bestDx, bestDy - 1);
      const sD = sadAtOffset(prevLuma, currLuma, width, height, margin, 1, bestDx, bestDy + 1);
      const denomY = sU - 2 * bestSad + sD;
      if (denomY > 0.05) subDy = clamp(0.5 * (sU - sD) / denomY, -0.49, 0.49);
    }

    const meanSad = candidates > 0 ? totalSad / candidates : 255;
    if (bestSad > 44) {
      return { dx: 0, dy: 0, confidence: 0 };
    }

    const contrastRatio = clamp((meanSad - bestSad) / (meanSad + 1), 0, 1);
    const improvement = Number.isFinite(zeroSad) && zeroSad > 0 ? clamp((zeroSad - bestSad) / (zeroSad + 0.5), 0, 1) : 0;
    const confidence = clamp(contrastRatio * 1.4 + improvement * 0.4, 0, 1);
    if (!Number.isFinite(confidence) || confidence < 0.08) {
      return { dx: 0, dy: 0, confidence: 0 };
    }

    return {
      dx: bestDx + subDx,
      dy: bestDy + subDy,
      confidence
    };
  }

  /**
   * High-pass trajectory filter: preserves smooth intentional camera pans while isolating
   * sudden high-frequency hand shake for cancellation.
   */
  function createFilterState() {
    return { camX: 0, camY: 0, smoothX: 0, smoothY: 0 };
  }

  function stepFilter(stateObj, frameDeltaNormX, frameDeltaNormY, preset, confidence = 1) {
    const p = preset || PRESETS.medium;
    const w = clamp(confidence, 0, 1);
    stateObj.camX = stateObj.camX * (1 - p.centerPull) + frameDeltaNormX * w;
    stateObj.camY = stateObj.camY * (1 - p.centerPull) + frameDeltaNormY * w;

    // Clamp trajectory excursion well within overscan envelope
    const maxOffset = Math.max(0.01, (p.overscan - 1) * 0.65);
    stateObj.camX = clamp(stateObj.camX, -maxOffset * 2.5, maxOffset * 2.5);
    stateObj.camY = clamp(stateObj.camY, -maxOffset * 2.5, maxOffset * 2.5);

    stateObj.smoothX += (stateObj.camX - stateObj.smoothX) * p.panFollow;
    stateObj.smoothY += (stateObj.camY - stateObj.smoothY) * p.panFollow;

    return {
      offsetNormX: (stateObj.smoothX - stateObj.camX) * p.damp,
      offsetNormY: (stateObj.smoothY - stateObj.camY) * p.damp
    };
  }

  const controllers = typeof WeakMap !== 'undefined' ? new WeakMap() : null;

  function createVideoController(videoEl) {
    const canvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
    if (canvas) {
      canvas.width = ANALYSIS_W;
      canvas.height = ANALYSIS_H;
    }
    const ctx = canvas ? canvas.getContext('2d', { willReadFrequently: true }) : null;
    const filter = createFilterState();
    let prevLuma = null;
    let currLuma = new Uint8Array(ANALYSIS_W * ANALYSIS_H);
    let lastVideoTime = -1;
    let level = 'off';
    let zoom = 1;
    let rafId = 0;
    let rvfcId = 0;

    function resetTracking() {
      prevLuma = null;
      lastVideoTime = -1;
      filter.camX = 0;
      filter.camY = 0;
      filter.smoothX = 0;
      filter.smoothY = 0;
    }

    function applyCurrentTransform(offsetNormX, offsetNormY) {
      if (!videoEl) return;
      const tf = computeTransform(offsetNormX, offsetNormY, zoom, level);
      videoEl.style.transformOrigin = 'center center';
      videoEl.style.transform = tf.css;
    }

    function stopLoop() {
      if (rafId && typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(rafId);
      }
      if (rvfcId && videoEl && typeof videoEl.cancelVideoFrameCallback === 'function') {
        try { videoEl.cancelVideoFrameCallback(rvfcId); } catch (_) {}
      }
      rafId = 0;
      rvfcId = 0;
    }

    function scheduleTick() {
      if (rafId || rvfcId || level === 'off') return;
      if (videoEl && typeof videoEl.requestVideoFrameCallback === 'function' && videoEl.readyState >= 2 && !videoEl.paused) {
        try {
          rvfcId = videoEl.requestVideoFrameCallback(() => {
            rvfcId = 0;
            tick();
          });
          return;
        } catch (_) {
          rvfcId = 0;
        }
      }
      if (typeof requestAnimationFrame === 'function') {
        rafId = requestAnimationFrame(tick);
      }
    }

    function tick() {
      rafId = 0;
      if (!videoEl || !videoEl.isConnected || level === 'off') {
        resetTracking();
        return;
      }
      if (videoEl.style.display === 'none') {
        resetTracking();
        applyCurrentTransform(0, 0);
        return;
      }
      if (ctx && videoEl.readyState >= 2 && videoEl.videoWidth > 0 && videoEl.videoHeight > 0 && !videoEl.paused) {
        const curTime = videoEl.currentTime;
        if (curTime !== lastVideoTime) {
          lastVideoTime = curTime;
          try {
            ctx.drawImage(videoEl, 0, 0, ANALYSIS_W, ANALYSIS_H);
            const imgData = ctx.getImageData(0, 0, ANALYSIS_W, ANALYSIS_H);
            extractLuma(imgData.data, ANALYSIS_W, ANALYSIS_H, currLuma);
            if (!prevLuma) {
              prevLuma = new Uint8Array(currLuma);
              applyCurrentTransform(0, 0);
            } else {
              const preset = getPreset(level);
              const shift = estimateShift(prevLuma, currLuma, ANALYSIS_W, ANALYSIS_H, preset.radius);
              // Swap reusable luma buffers without allocating memory
              const tmp = prevLuma;
              prevLuma = currLuma;
              currLuma = tmp;

              const deltaNormX = shift.dx / ANALYSIS_W;
              const deltaNormY = shift.dy / ANALYSIS_H;
              const comp = stepFilter(filter, deltaNormX, deltaNormY, preset, shift.confidence);
              applyCurrentTransform(comp.offsetNormX, comp.offsetNormY);
            }
          } catch (_) {
            resetTracking();
            applyCurrentTransform(0, 0);
          }
        }
      }
      scheduleTick();
    }

    function update(opts = {}) {
      const nextLevel = normalizeLevel(opts.level !== undefined ? opts.level : level);
      const nextZoom = opts.zoom !== undefined ? clamp(Number(opts.zoom) || 1, 1, 5) : zoom;
      const levelChanged = nextLevel !== level;
      level = nextLevel;
      zoom = nextZoom;

      if (level === 'off') {
        stopLoop();
        resetTracking();
        applyCurrentTransform(0, 0);
        return;
      }

      if (levelChanged) {
        resetTracking();
      }
      applyCurrentTransform(0, 0);
      if (videoEl.isConnected && videoEl.style.display !== 'none') {
        scheduleTick();
      } else {
        stopLoop();
        resetTracking();
      }
    }

    return { update, resetTracking, stopLoop };
  }

  function syncVideoTarget(videoEl, opts = {}) {
    if (!videoEl || !controllers) return null;
    let ctrl = controllers.get(videoEl);
    if (!ctrl) {
      ctrl = createVideoController(videoEl);
      controllers.set(videoEl, ctrl);
    }
    ctrl.update(opts);
    return ctrl;
  }

  function stopVideoTarget(videoEl) {
    if (!videoEl || !controllers) return;
    const ctrl = controllers.get(videoEl);
    if (ctrl) {
      ctrl.stopLoop();
      ctrl.resetTracking();
    }
  }

  return {
    ANALYSIS_W,
    ANALYSIS_H,
    PRESETS,
    normalizeLevel,
    getPreset,
    computeTransform,
    extractLuma,
    estimateShift,
    createFilterState,
    stepFilter,
    syncVideoTarget,
    stopVideoTarget
  };
});
