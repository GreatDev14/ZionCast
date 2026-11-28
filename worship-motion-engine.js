/**
 * ZionCast Shared 60fps Worship Motion Background Engine
 * Powers Display 2 TV Projector (#display-canvas) and Control Desk Monitors (#preview-canvas, #live-canvas)
 * with zero duplicated canvas animation logic.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.ZionWorshipMotion = api;
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  const DEFAULT_PARTICLE_COUNT = 75;

  function createParticlePool(count = DEFAULT_PARTICLE_COUNT, width = 1280, height = 720) {
    const list = [];
    for (let i = 0; i < count; i++) {
      list.push({
        x: Math.random() * width,
        y: Math.random() * height,
        radius: Math.random() * 4 + 1.5,
        speedY: Math.random() * 0.7 + 0.3,
        speedX: (Math.random() - 0.5) * 0.4,
        alpha: Math.random() * 0.7 + 0.2,
        pulseSpeed: Math.random() * 0.02 + 0.01
      });
    }
    return list;
  }

  function renderFrame(ctx, w, h, animTime, bgId, particlePool) {
    if (!ctx || !w || !h) return;
    const id = bgId || 'celestial-clouds';
    const particles = Array.isArray(particlePool) ? particlePool : null;

    if (id === 'ss-ember-glow') {
      // SundayScreens Aesthetic: Warm Ember Glow Sanctuary + Anamorphic Light Streaks + Bokeh Embers
      const bg = ctx.createRadialGradient(w * 0.5, h * 0.72, h * 0.04, w * 0.5, h * 0.52, w * 0.75);
      bg.addColorStop(0, '#5c1d0c');
      bg.addColorStop(0.45, '#260c09');
      bg.addColorStop(1, '#070406');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);

      // Horizontal anamorphic flare sweep
      const flareY = h * 0.55 + Math.sin(animTime * 0.45) * (h * 0.06);
      const flare = ctx.createLinearGradient(0, flareY - h * 0.14, 0, flareY + h * 0.14);
      flare.addColorStop(0, 'rgba(251, 146, 60, 0)');
      flare.addColorStop(0.5, 'rgba(251, 146, 60, 0.16)');
      flare.addColorStop(1, 'rgba(251, 146, 60, 0)');
      ctx.fillStyle = flare;
      ctx.fillRect(0, flareY - h * 0.14, w, h * 0.28);

      // Soft warm bokeh + crisp embers rising
      for (let i = 0; i < 42; i++) {
        const seed = (i * 97) % 100;
        const speed = 18 + (i % 5) * 9;
        const px = (w * seed / 100) + Math.sin(animTime * (0.7 + (i % 3) * 0.25) + i) * (w * 0.035);
        const py = h - ((animTime * speed + i * 51) % (h + 40)) + 20;
        const isBokeh = i % 5 === 0;
        const r = isBokeh ? Math.max(6, h * 0.022 + (i % 3) * 4) : Math.max(1.2, h * 0.003 + (i % 3) * 0.8);
        const alpha = isBokeh ? (0.07 + 0.04 * Math.sin(animTime * 2 + i)) : (0.35 + 0.45 * Math.sin(animTime * 3 + i));
        ctx.fillStyle = (i % 2 === 0)
          ? `rgba(253, 186, 116, ${Math.max(0.03, alpha)})`
          : `rgba(251, 113, 133, ${Math.max(0.03, alpha * 0.8)})`;
        ctx.beginPath();
        ctx.arc(px, py, r, 0, Math.PI * 2);
        ctx.fill();
      }

    } else if (id === 'ss-light-curtains') {
      // SundayScreens Aesthetic: Vertical Shimmering Stage Light Curtains
      const bg = ctx.createLinearGradient(0, 0, 0, h);
      bg.addColorStop(0, '#0f0b29');
      bg.addColorStop(0.55, '#19133e');
      bg.addColorStop(1, '#05040f');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);

      const stripCount = 11;
      for (let i = 0; i < stripCount; i++) {
        const nx = (i + 0.5) / stripCount;
        const drift = Math.sin(animTime * 0.65 + i * 0.7) * (w * 0.035);
        const cx = w * nx + drift;
        const colW = (w / stripCount) * (0.9 + 0.35 * Math.sin(animTime * 0.8 + i));
        const g = ctx.createLinearGradient(cx - colW, 0, cx + colW, 0);
        const intensity = 0.05 + 0.07 * (0.5 + 0.5 * Math.sin(animTime * 1.1 + i * 1.3));
        const colorRgb = (i % 3 === 0) ? '56, 189, 248' : ((i % 3 === 1) ? '168, 85, 247' : '129, 140, 248');
        g.addColorStop(0, `rgba(${colorRgb}, 0)`);
        g.addColorStop(0.5, `rgba(${colorRgb}, ${intensity.toFixed(3)})`);
        g.addColorStop(1, `rgba(${colorRgb}, 0)`);
        ctx.fillStyle = g;
        ctx.fillRect(cx - colW, 0, colW * 2, h);
      }

      const topHaze = ctx.createRadialGradient(w * 0.5, 0, 10, w * 0.5, 0, w * 0.65);
      topHaze.addColorStop(0, 'rgba(196, 181, 253, 0.22)');
      topHaze.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = topHaze;
      ctx.fillRect(0, 0, w, h);

    } else if (id === 'ss-halo-rings') {
      // SundayScreens Aesthetic: Glowing Concentric Sacred Light Rings
      const bg = ctx.createRadialGradient(w * 0.5, h * 0.5, h * 0.05, w * 0.5, h * 0.5, w * 0.75);
      bg.addColorStop(0, '#10243d');
      bg.addColorStop(0.5, '#091120');
      bg.addColorStop(1, '#020409');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);

      const cx = w * 0.5 + Math.sin(animTime * 0.35) * (w * 0.04);
      const cy = h * 0.5 + Math.cos(animTime * 0.3) * (h * 0.04);
      const baseR = Math.min(w, h) * 0.16;

      for (let r = 0; r < 5; r++) {
        const phase = (animTime * 0.28 + r * 0.2) % 1;
        const radius = baseR + phase * Math.min(w, h) * 0.45;
        const alpha = Math.sin(phase * Math.PI) * 0.32;
        ctx.save();
        ctx.strokeStyle = (r % 2 === 0)
          ? `rgba(251, 191, 36, ${alpha.toFixed(3)})`
          : `rgba(56, 189, 248, ${(alpha * 0.85).toFixed(3)})`;
        ctx.lineWidth = Math.max(2, h * 0.0055);
        ctx.shadowColor = (r % 2 === 0) ? 'rgba(251, 191, 36, 0.45)' : 'rgba(56, 189, 248, 0.45)';
        ctx.shadowBlur = Math.max(12, h * 0.028);
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

    } else if (id === 'ss-starfall') {
      // SundayScreens Aesthetic: Starfall Celestial Streaks & Deep Indigo Glow
      const bg = ctx.createLinearGradient(0, 0, 0, h);
      bg.addColorStop(0, '#020410');
      bg.addColorStop(0.6, '#0b1026');
      bg.addColorStop(1, '#120a24');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);

      const neb = ctx.createRadialGradient(w * 0.5, h * 0.35, 10, w * 0.5, h * 0.45, w * 0.65);
      neb.addColorStop(0, 'rgba(99, 102, 241, 0.16)');
      neb.addColorStop(0.6, 'rgba(56, 189, 248, 0.07)');
      neb.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = neb;
      ctx.fillRect(0, 0, w, h);

      for (let i = 0; i < 36; i++) {
        const xFrac = ((i * 37) % 100) / 100;
        const speed = 55 + (i % 6) * 28;
        const yPos = ((animTime * speed + i * 64) % (h + 120)) - 60;
        const xPos = w * xFrac + Math.sin(animTime * 0.4 + i) * 8;
        const streakLen = Math.max(14, h * (0.04 + (i % 4) * 0.02));
        const g = ctx.createLinearGradient(xPos, yPos - streakLen, xPos, yPos);
        g.addColorStop(0, 'rgba(224, 242, 254, 0)');
        g.addColorStop(1, i % 3 === 0 ? 'rgba(253, 224, 71, 0.55)' : 'rgba(186, 230, 253, 0.55)');
        ctx.strokeStyle = g;
        ctx.lineWidth = Math.max(1.2, h * 0.0028);
        ctx.beginPath();
        ctx.moveTo(xPos, yPos - streakLen);
        ctx.lineTo(xPos, yPos);
        ctx.stroke();
      }

    } else if (id === 'ss-rushing-waters') {
      // SundayScreens Aesthetic: Rushing Waters Deep Caustic Ribbons
      const bg = ctx.createLinearGradient(0, 0, w, h);
      bg.addColorStop(0, '#011826');
      bg.addColorStop(0.5, '#043850');
      bg.addColorStop(1, '#02111c');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);

      for (let wave = 0; wave < 5; wave++) {
        ctx.strokeStyle = `rgba(103, 232, 249, ${(0.06 + wave * 0.025).toFixed(3)})`;
        ctx.lineWidth = Math.max(3, h * 0.022);
        ctx.beginPath();
        const baseY = h * (0.2 + wave * 0.16);
        for (let x = 0; x <= w; x += Math.max(16, Math.round(w / 32))) {
          const y = baseY
            + Math.sin(animTime * (0.9 + wave * 0.18) + x * 0.006 + wave) * (h * 0.06)
            + Math.cos(animTime * 0.7 - x * 0.003 + wave * 2) * (h * 0.03);
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }

      const shimmer = ctx.createRadialGradient(w * 0.5 + Math.cos(animTime * 0.5) * w * 0.2, h * 0.45, 10, w * 0.5, h * 0.5, w * 0.55);
      shimmer.addColorStop(0, 'rgba(34, 211, 238, 0.18)');
      shimmer.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = shimmer;
      ctx.fillRect(0, 0, w, h);

    } else if (id === 'ss-sunset-horizon') {
      // SundayScreens Aesthetic: Warm Sunset Dusk Horizon Gradients
      const sky = ctx.createLinearGradient(0, 0, 0, h);
      sky.addColorStop(0, '#130724');
      sky.addColorStop(0.45, '#581c54');
      sky.addColorStop(0.78, '#b45309');
      sky.addColorStop(1, '#1c0a04');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, w, h);

      const sunY = h * 0.68 + Math.sin(animTime * 0.35) * (h * 0.04);
      const glow = ctx.createRadialGradient(w * 0.5, sunY, h * 0.03, w * 0.5, sunY, w * 0.62);
      glow.addColorStop(0, 'rgba(254, 240, 138, 0.36)');
      glow.addColorStop(0.45, 'rgba(244, 63, 94, 0.18)');
      glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, w, h);

      // Smooth horizon mist waves
      for (let b = 0; b < 3; b++) {
        ctx.fillStyle = `rgba(15, 6, 18, ${(0.18 + b * 0.12).toFixed(2)})`;
        ctx.beginPath();
        const wy = h * (0.72 + b * 0.08);
        ctx.moveTo(0, wy);
        for (let x = 0; x <= w; x += Math.max(16, Math.round(w / 24))) {
          ctx.lineTo(x, wy + Math.sin(animTime * (0.6 + b * 0.2) + x * 0.005 + b) * (h * 0.025));
        }
        ctx.lineTo(w, h);
        ctx.lineTo(0, h);
        ctx.closePath();
        ctx.fill();
      }

    } else if (id === 'ss-liquid-gold') {
      // SundayScreens Aesthetic: Liquid Gold & Obsidian Velvet Silk
      const bg = ctx.createLinearGradient(0, 0, w, h);
      bg.addColorStop(0, '#090704');
      bg.addColorStop(0.5, '#1f1407');
      bg.addColorStop(1, '#070503');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);

      for (let fold = 0; fold < 4; fold++) {
        const yOff = h * (0.25 + fold * 0.18);
        const grad = ctx.createLinearGradient(0, yOff - h * 0.12, w, yOff + h * 0.12);
        grad.addColorStop(0, 'rgba(217, 119, 6, 0.02)');
        grad.addColorStop(0.5, 'rgba(251, 191, 36, 0.16)');
        grad.addColorStop(1, 'rgba(180, 83, 9, 0.03)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(0, yOff);
        for (let x = 0; x <= w; x += Math.max(16, Math.round(w / 24))) {
          ctx.lineTo(x, yOff + Math.sin(animTime * (0.55 + fold * 0.15) + x * 0.0045 + fold * 1.4) * (h * 0.09));
        }
        ctx.lineTo(w, h);
        ctx.lineTo(0, h);
        ctx.closePath();
        ctx.fill();
      }

    } else if (id === 'ss-neon-praise') {
      // SundayScreens Aesthetic: Modern Worship Neon Stage Beams & Grid
      const bg = ctx.createLinearGradient(0, 0, 0, h);
      bg.addColorStop(0, '#050816');
      bg.addColorStop(0.55, '#110d2e');
      bg.addColorStop(1, '#04060f');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);

      const cx = w * 0.5;
      const hy = h * 0.52;
      const cyanBloom = ctx.createRadialGradient(cx - w * 0.18, hy, 10, cx - w * 0.18, hy, w * 0.42);
      cyanBloom.addColorStop(0, `rgba(6, 182, 212, ${(0.22 + 0.08 * Math.sin(animTime * 1.4)).toFixed(3)})`);
      cyanBloom.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = cyanBloom;
      ctx.fillRect(0, 0, w, h);

      const magBloom = ctx.createRadialGradient(cx + w * 0.18, hy, 10, cx + w * 0.18, hy, w * 0.42);
      magBloom.addColorStop(0, `rgba(217, 70, 239, ${(0.20 + 0.08 * Math.cos(animTime * 1.2)).toFixed(3)})`);
      magBloom.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = magBloom;
      ctx.fillRect(0, 0, w, h);

      // Subtle glowing horizon line
      const lineGrad = ctx.createLinearGradient(0, 0, w, 0);
      lineGrad.addColorStop(0, 'rgba(6, 182, 212, 0)');
      lineGrad.addColorStop(0.35, 'rgba(34, 211, 238, 0.45)');
      lineGrad.addColorStop(0.65, 'rgba(232, 121, 249, 0.45)');
      lineGrad.addColorStop(1, 'rgba(232, 121, 249, 0)');
      ctx.strokeStyle = lineGrad;
      ctx.lineWidth = Math.max(1.5, h * 0.004);
      ctx.beginPath();
      ctx.moveTo(0, hy + Math.sin(animTime * 0.7) * 6);
      ctx.lineTo(w, hy - Math.sin(animTime * 0.7) * 6);
      ctx.stroke();

    } else if (id === 'ss-velvet-smoke') {
      // SundayScreens Aesthetic: Volumetric Prayer Velvet Smoke Haze
      ctx.fillStyle = '#06080f';
      ctx.fillRect(0, 0, w, h);

      for (let s = 0; s < 5; s++) {
        const px = w * (0.2 + s * 0.15) + Math.sin(animTime * 0.25 + s * 1.7) * (w * 0.08);
        const py = h * (0.35 + (s % 2) * 0.3) + Math.cos(animTime * 0.22 + s * 1.1) * (h * 0.08);
        const rad = w * (0.28 + (s % 3) * 0.07);
        const plume = ctx.createRadialGradient(px, py, 10, px, py, rad);
        plume.addColorStop(0, s % 2 === 0 ? 'rgba(148, 163, 184, 0.10)' : 'rgba(99, 102, 241, 0.09)');
        plume.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = plume;
        ctx.fillRect(0, 0, w, h);
      }

    } else if (id === 'ss-alpha-prism') {
      // SundayScreens Aesthetic: Alpha & Omega Jewel Prism Rays
      const bg = ctx.createRadialGradient(w * 0.5, h * 0.5, 10, w * 0.5, h * 0.5, w * 0.75);
      bg.addColorStop(0, '#23163b');
      bg.addColorStop(0.55, '#100c1f');
      bg.addColorStop(1, '#04040a');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);

      ctx.save();
      ctx.translate(w * 0.5, h * 0.5);
      ctx.rotate(animTime * 0.12);
      for (let i = 0; i < 6; i++) {
        ctx.rotate(Math.PI / 3);
        const shard = ctx.createLinearGradient(0, 0, w * 0.55, h * 0.25);
        shard.addColorStop(0, i % 2 === 0 ? 'rgba(251, 191, 36, 0.14)' : 'rgba(129, 140, 248, 0.14)');
        shard.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = shard;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(w * 0.55, -h * 0.14);
        ctx.lineTo(w * 0.55, h * 0.14);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();

    } else if (id === 'celestial-clouds') {
      const grad = ctx.createRadialGradient(
        w * 0.5 + Math.sin(animTime * 0.5) * (w * 0.25),
        h * 0.4 + Math.cos(animTime * 0.4) * (h * 0.2),
        w * 0.1,
        w * 0.5,
        h * 0.5,
        w * 0.8
      );
      grad.addColorStop(0, '#581c87');
      grad.addColorStop(0.4, '#2e1065');
      grad.addColorStop(0.8, '#0f172a');
      grad.addColorStop(1, '#020617');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      ctx.fillStyle = 'rgba(168, 85, 247, 0.04)';
      ctx.beginPath();
      ctx.arc(w * 0.3 + Math.sin(animTime * 0.3) * 60, h * 0.6 + Math.cos(animTime * 0.2) * 40, w * 0.35, 0, Math.PI * 2);
      ctx.fill();

    } else if (id === 'deep-gradient-pulse') {
      const grad = ctx.createLinearGradient(
        Math.sin(animTime * 0.4) * w * 0.3,
        0,
        w + Math.cos(animTime * 0.3) * w * 0.2,
        h
      );
      grad.addColorStop(0, '#0c1a3b');
      grad.addColorStop(0.5, '#1e1b4b');
      grad.addColorStop(1, '#1e293b');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      const aura = ctx.createRadialGradient(
        w * 0.7 + Math.cos(animTime * 0.5) * 80,
        h * 0.3 + Math.sin(animTime * 0.6) * 50,
        20,
        w * 0.7,
        h * 0.3,
        w * 0.5
      );
      aura.addColorStop(0, 'rgba(6, 182, 212, 0.12)');
      aura.addColorStop(1, 'rgba(6, 182, 212, 0)');
      ctx.fillStyle = aura;
      ctx.fillRect(0, 0, w, h);

    } else if (id === 'worship-particles') {
      ctx.fillStyle = '#08070d';
      ctx.fillRect(0, 0, w, h);
      const nebula = ctx.createRadialGradient(w * 0.5, h * 0.7, 50, w * 0.5, h * 0.5, w * 0.7);
      nebula.addColorStop(0, 'rgba(124, 58, 237, 0.18)');
      nebula.addColorStop(1, 'rgba(8, 7, 13, 0)');
      ctx.fillStyle = nebula;
      ctx.fillRect(0, 0, w, h);

      if (particles) {
        for (let i = 0; i < particles.length; i++) {
          const p = particles[i];
          p.y -= p.speedY * (h / 720);
          p.x += Math.sin(animTime + i) * 0.3;
          p.alpha += Math.sin(animTime * 2 + i) * 0.005;
          if (p.y < -10) {
            p.y = h + 10;
            p.x = Math.random() * w;
          }
          ctx.fillStyle = `rgba(245, 158, 11, ${Math.max(0.1, Math.min(0.85, p.alpha))})`;
          ctx.beginPath();
          ctx.arc((p.x % w + w) % w, p.y, Math.max(1, p.radius * (h / 720)), 0, Math.PI * 2);
          ctx.fill();
        }
      }

    } else if (id === 'golden-sanctuary') {
      const grad = ctx.createRadialGradient(w * 0.5, h * 0.1, 20, w * 0.5, h * 0.5, w * 0.75);
      grad.addColorStop(0, '#78350f');
      grad.addColorStop(0.5, '#451a03');
      grad.addColorStop(1, '#0f0802');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = 'rgba(251, 191, 36, 0.05)';
      ctx.beginPath();
      ctx.moveTo(w * 0.5, 0);
      const beamSpread = Math.sin(animTime * 0.6) * (w * 0.08);
      ctx.lineTo(w * 0.2 + beamSpread, h);
      ctx.lineTo(w * 0.8 + beamSpread, h);
      ctx.closePath();
      ctx.fill();

    } else if (id === 'midnight-praise') {
      const grad = ctx.createLinearGradient(0, 0, w, h);
      grad.addColorStop(0, '#022c22');
      grad.addColorStop(0.5, '#0f172a');
      grad.addColorStop(1, '#030712');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
      const waveGrad = ctx.createRadialGradient(
        w * 0.4 + Math.sin(animTime * 0.5) * (w * 0.08),
        h * 0.6 + Math.cos(animTime * 0.4) * (h * 0.1),
        40, w * 0.5, h * 0.5, w * 0.6
      );
      waveGrad.addColorStop(0, 'rgba(16, 185, 129, 0.14)');
      waveGrad.addColorStop(1, 'rgba(16, 185, 129, 0)');
      ctx.fillStyle = waveGrad;
      ctx.fillRect(0, 0, w, h);

    } else if (id === 'sacred-light-rays') {
      const bg = ctx.createLinearGradient(0, 0, 0, h);
      bg.addColorStop(0, '#0a0d14');
      bg.addColorStop(1, '#020408');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 4; i++) {
        const offset = Math.sin(animTime * 0.4 + i * 1.2) * (w * 0.15);
        const originX = w * (0.2 + i * 0.2) + offset;
        const beamGrad = ctx.createRadialGradient(originX, 0, 10, originX, h * 0.6, w * 0.4);
        beamGrad.addColorStop(0, 'rgba(254, 240, 138, 0.14)');
        beamGrad.addColorStop(0.5, 'rgba(251, 191, 36, 0.05)');
        beamGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = beamGrad;
        ctx.beginPath();
        ctx.moveTo(originX - w * 0.015, 0);
        ctx.lineTo(originX + w * 0.015, 0);
        ctx.lineTo(originX + w * 0.25, h);
        ctx.lineTo(originX - w * 0.15, h);
        ctx.closePath();
        ctx.fill();
      }

    } else if (id === 'living-waters') {
      const bg = ctx.createLinearGradient(0, 0, w, h);
      bg.addColorStop(0, '#021526');
      bg.addColorStop(0.5, '#032b44');
      bg.addColorStop(1, '#010c14');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);
      for (let layer = 1; layer <= 3; layer++) {
        ctx.fillStyle = `rgba(0, 240, 255, ${0.03 * layer})`;
        ctx.beginPath();
        ctx.moveTo(0, h * (0.4 + layer * 0.15));
        for (let x = 0; x <= w; x += Math.max(16, Math.round(w / 24))) {
          const waveY = h * (0.4 + layer * 0.15) + Math.sin(animTime * 1.2 * layer + x * 0.005) * (h * 0.025 * layer);
          ctx.lineTo(x, waveY);
        }
        ctx.lineTo(w, h);
        ctx.lineTo(0, h);
        ctx.closePath();
        ctx.fill();
      }

    } else if (id === 'heavenly-dawn') {
      const grad = ctx.createRadialGradient(w * 0.5 + Math.sin(animTime * 0.3) * (w * 0.06), h * 0.65, 20, w * 0.5, h * 0.5, w * 0.7);
      grad.addColorStop(0, '#be185d');
      grad.addColorStop(0.35, '#831843');
      grad.addColorStop(0.7, '#2e1065');
      grad.addColorStop(1, '#05020a');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
      const sunAura = ctx.createRadialGradient(w * 0.5, h * 0.85, 10, w * 0.5, h * 0.85, w * 0.45);
      sunAura.addColorStop(0, 'rgba(251, 191, 36, 0.18)');
      sunAura.addColorStop(1, 'rgba(251, 191, 36, 0)');
      ctx.fillStyle = sunAura;
      ctx.fillRect(0, 0, w, h);

    } else if (id === 'holy-fire') {
      ctx.fillStyle = '#0f0202';
      ctx.fillRect(0, 0, w, h);
      const fireGlow = ctx.createRadialGradient(w * 0.5, h * 0.95, 20, w * 0.5, h * 0.6, w * 0.6);
      fireGlow.addColorStop(0, 'rgba(239, 68, 68, 0.28)');
      fireGlow.addColorStop(0.4, 'rgba(245, 158, 11, 0.16)');
      fireGlow.addColorStop(1, 'rgba(15, 2, 2, 0)');
      ctx.fillStyle = fireGlow;
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 40; i++) {
        const px = (w * ((i * 37) % 100) / 100) + Math.sin(animTime * 2 + i) * (w * 0.015);
        const py = h - ((animTime * (h * 0.15) + i * (h * 0.06)) % h);
        const pRadius = Math.max(1, ((i % 3) + 1.5) * (h / 720));
        ctx.fillStyle = `rgba(245, 158, 11, ${0.4 + Math.sin(animTime * 3 + i) * 0.3})`;
        ctx.beginPath();
        ctx.arc(px, py, pRadius, 0, Math.PI * 2);
        ctx.fill();
      }

    } else if (id === 'starlight-firmament') {
      ctx.fillStyle = '#030014';
      ctx.fillRect(0, 0, w, h);
      const nebula = ctx.createRadialGradient(w * 0.4 + Math.sin(animTime * 0.2) * (w * 0.04), h * 0.4, 20, w * 0.5, h * 0.5, w * 0.6);
      nebula.addColorStop(0, 'rgba(99, 102, 241, 0.12)');
      nebula.addColorStop(0.6, 'rgba(168, 85, 247, 0.08)');
      nebula.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = nebula;
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 50; i++) {
        const sx = w * ((i * 73) % 100) / 100;
        const sy = h * ((i * 47) % 100) / 100;
        const twinkle = Math.sin(animTime * 3 + i * 1.5) * 0.4 + 0.6;
        ctx.fillStyle = `rgba(255, 255, 255, ${twinkle * 0.8})`;
        ctx.beginPath();
        ctx.arc(sx, sy, (i % 4 === 0) ? Math.max(1.5, h * 0.003) : Math.max(0.8, h * 0.0018), 0, Math.PI * 2);
        ctx.fill();
      }

    } else if (id === 'rose-gold-elegance') {
      const grad = ctx.createLinearGradient(0, 0, w, h);
      grad.addColorStop(0, '#1c1418');
      grad.addColorStop(0.5, '#2e1822');
      grad.addColorStop(1, '#0c080a');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
      const sheen = ctx.createRadialGradient(w * 0.6 + Math.cos(animTime * 0.4) * (w * 0.07), h * 0.4 + Math.sin(animTime * 0.3) * (h * 0.08), 20, w * 0.6, h * 0.4, w * 0.5);
      sheen.addColorStop(0, 'rgba(251, 113, 133, 0.16)');
      sheen.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = sheen;
      ctx.fillRect(0, 0, w, h);

    } else if (id === 'cathedral-stained-glass') {
      ctx.fillStyle = '#080811';
      ctx.fillRect(0, 0, w, h);
      const colors = ['rgba(234, 179, 8, 0.08)', 'rgba(59, 130, 246, 0.08)', 'rgba(239, 68, 68, 0.08)', 'rgba(168, 85, 247, 0.08)'];
      for (let i = 0; i < 4; i++) {
        const cx = w * (0.25 + (i % 2) * 0.5) + Math.sin(animTime * 0.5 + i) * (w * 0.03);
        const cy = h * (0.3 + Math.floor(i / 2) * 0.4) + Math.cos(animTime * 0.4 + i) * (h * 0.03);
        const prism = ctx.createRadialGradient(cx, cy, 10, cx, cy, w * 0.35);
        prism.addColorStop(0, colors[i]);
        prism.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = prism;
        ctx.fillRect(0, 0, w, h);
      }

    } else if (id === 'cross-majesty') {
      const grad = ctx.createRadialGradient(w * 0.5, h * 0.38, h * 0.03, w * 0.5, h * 0.45, w * 0.65);
      grad.addColorStop(0, '#452205');
      grad.addColorStop(0.42, '#1c0e03');
      grad.addColorStop(1, '#050301');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
      const haloR = h * 0.32 + Math.sin(animTime * 1.4) * (h * 0.02);
      const halo = ctx.createRadialGradient(w * 0.5, h * 0.38, h * 0.02, w * 0.5, h * 0.38, haloR);
      halo.addColorStop(0, 'rgba(251, 191, 36, 0.42)');
      halo.addColorStop(0.45, 'rgba(217, 119, 6, 0.15)');
      halo.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = halo;
      ctx.fillRect(0, 0, w, h);
      const crossW = Math.max(5, h * 0.036);
      const crossH = h * 0.50;
      const barW = h * 0.30;
      const crossY = h * 0.18;
      ctx.save();
      ctx.shadowColor = 'rgba(251, 191, 36, 0.55)';
      ctx.shadowBlur = Math.max(8, h * 0.025);
      ctx.fillStyle = 'rgba(12, 6, 2, 0.85)';
      ctx.fillRect(w * 0.5 - crossW * 0.5, crossY, crossW, crossH);
      ctx.fillRect(w * 0.5 - barW * 0.5, crossY + crossH * 0.24, barW, crossW);
      ctx.restore();

    } else if (id === 'emerald-sanctuary') {
      const grad = ctx.createLinearGradient(0, 0, w, h);
      grad.addColorStop(0, '#021c14');
      grad.addColorStop(0.5, '#064e3b');
      grad.addColorStop(1, '#02100b');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
      const aura = ctx.createRadialGradient(w * 0.5 + Math.sin(animTime * 0.4) * (w * 0.06), h * 0.5 + Math.cos(animTime * 0.5) * (h * 0.07), 15, w * 0.5, h * 0.5, w * 0.55);
      aura.addColorStop(0, 'rgba(52, 211, 153, 0.16)');
      aura.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = aura;
      ctx.fillRect(0, 0, w, h);

    } else if (id === 'calvary-cross-glory') {
      const sky = ctx.createLinearGradient(0, 0, 0, h);
      sky.addColorStop(0, '#120624');
      sky.addColorStop(0.5, '#3b0f3f');
      sky.addColorStop(0.85, '#6b2214');
      sky.addColorStop(1, '#1a0805');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, w, h);
      const cx = w * 0.5;
      const cy = h * 0.38;
      ctx.save();
      ctx.translate(cx, cy);
      for (let r = 0; r < 8; r++) {
        const angle = (r * Math.PI) / 4 + Math.sin(animTime * 0.35) * 0.08;
        ctx.save();
        ctx.rotate(angle);
        const rayGrad = ctx.createLinearGradient(0, 0, w * 0.55, 0);
        rayGrad.addColorStop(0, 'rgba(253, 224, 71, 0.18)');
        rayGrad.addColorStop(0.5, 'rgba(245, 158, 11, 0.06)');
        rayGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = rayGrad;
        ctx.beginPath();
        ctx.moveTo(0, -h * 0.02);
        ctx.lineTo(w * 0.55, -h * 0.11);
        ctx.lineTo(w * 0.55, h * 0.11);
        ctx.lineTo(0, h * 0.02);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
      ctx.restore();
      const halo = ctx.createRadialGradient(cx, cy, h * 0.02, cx, cy, h * 0.38);
      halo.addColorStop(0, 'rgba(254, 240, 138, 0.45)');
      halo.addColorStop(0.4, 'rgba(245, 158, 11, 0.18)');
      halo.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = halo;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#09030c';
      ctx.beginPath();
      ctx.moveTo(0, h);
      ctx.quadraticCurveTo(cx, h * 0.72, w, h);
      ctx.closePath();
      ctx.fill();
      const crossW = Math.max(5, h * 0.032);
      const crossH = h * 0.62;
      const barW = h * 0.34;
      const crossTop = h * 0.17;
      ctx.save();
      ctx.shadowColor = 'rgba(251, 191, 36, 0.85)';
      ctx.shadowBlur = Math.max(8, h * 0.035);
      const crossGrad = ctx.createLinearGradient(cx, crossTop, cx, crossTop + crossH);
      crossGrad.addColorStop(0, 'rgba(254, 243, 199, 0.55)');
      crossGrad.addColorStop(0.55, 'rgba(217, 119, 6, 0.45)');
      crossGrad.addColorStop(1, 'rgba(45, 18, 6, 0.85)');
      ctx.fillStyle = crossGrad;
      ctx.fillRect(cx - crossW * 0.5, crossTop, crossW, crossH);
      ctx.fillRect(cx - barW * 0.5, crossTop + crossH * 0.23, barW, crossW);
      ctx.restore();

    } else if (id === 'royal-crown-velvet') {
      const bg = ctx.createLinearGradient(0, 0, w, h);
      bg.addColorStop(0, '#140526');
      bg.addColorStop(0.5, '#2e1065');
      bg.addColorStop(1, '#090314');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);
      for (let band = 0; band < 3; band++) {
        ctx.fillStyle = band === 1 ? 'rgba(245, 158, 11, 0.09)' : 'rgba(168, 85, 247, 0.08)';
        ctx.beginPath();
        const baseY = h * (0.28 + band * 0.22);
        ctx.moveTo(0, baseY);
        for (let x = 0; x <= w; x += Math.max(16, Math.round(w / 24))) {
          ctx.lineTo(x, baseY + Math.sin(animTime * (0.8 + band * 0.25) + x * 0.004 + band) * (h * 0.07));
        }
        ctx.lineTo(w, h);
        ctx.lineTo(0, h);
        ctx.closePath();
        ctx.fill();
      }
      const crownGlow = ctx.createRadialGradient(w * 0.5, h * 0.22, 10, w * 0.5, h * 0.3, w * 0.5);
      crownGlow.addColorStop(0, 'rgba(251, 191, 36, 0.18)');
      crownGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = crownGlow;
      ctx.fillRect(0, 0, w, h);

    } else if (id === 'holy-communion-crimson') {
      const bg = ctx.createRadialGradient(w * 0.5, h * 0.78, 10, w * 0.5, h * 0.5, w * 0.75);
      bg.addColorStop(0, '#6b0820');
      bg.addColorStop(0.45, '#360411');
      bg.addColorStop(1, '#0d0104');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);
      const candle = ctx.createRadialGradient(w * 0.5 + Math.sin(animTime * 1.4) * (w * 0.02), h * 0.9, 10, w * 0.5, h * 0.85, w * 0.45);
      candle.addColorStop(0, 'rgba(251, 191, 36, 0.22)');
      candle.addColorStop(0.5, 'rgba(244, 63, 94, 0.1)');
      candle.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = candle;
      ctx.fillRect(0, 0, w, h);

    } else if (id === 'dove-celestial-sky') {
      const sky = ctx.createLinearGradient(0, 0, 0, h);
      sky.addColorStop(0, '#082f49');
      sky.addColorStop(0.55, '#051e34');
      sky.addColorStop(1, '#020b16');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, w, h);
      const topLight = ctx.createRadialGradient(w * 0.5, -h * 0.05, 10, w * 0.5, h * 0.25, w * 0.65);
      topLight.addColorStop(0, 'rgba(224, 242, 254, 0.30)');
      topLight.addColorStop(0.45, 'rgba(56, 189, 248, 0.12)');
      topLight.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = topLight;
      ctx.fillRect(0, 0, w, h);

    } else if (id === 'shekinah-glory-gold') {
      const bg = ctx.createRadialGradient(
        w * 0.5 + Math.sin(animTime * 0.4) * (w * 0.15),
        h * 0.45 + Math.cos(animTime * 0.35) * (h * 0.12),
        10, w * 0.5, h * 0.5, w * 0.75
      );
      bg.addColorStop(0, '#713f12');
      bg.addColorStop(0.45, '#3f2008');
      bg.addColorStop(1, '#0c0702');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);
      for (let c = 0; c < 3; c++) {
        const cx = w * (0.3 + c * 0.2) + Math.sin(animTime * 0.35 + c * 2) * (w * 0.05);
        const cy = h * (0.38 + (c % 2) * 0.22) + Math.cos(animTime * 0.3 + c) * (h * 0.05);
        const puff = ctx.createRadialGradient(cx, cy, 5, cx, cy, w * 0.32);
        puff.addColorStop(0, 'rgba(254, 240, 138, 0.12)');
        puff.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = puff;
        ctx.fillRect(0, 0, w, h);
      }

    } else {
      const bg = ctx.createLinearGradient(0, 0, w, h);
      bg.addColorStop(0, '#0f172a');
      bg.addColorStop(1, '#020617');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);
    }
  }

  return {
    createParticlePool,
    renderFrame
  };
});
