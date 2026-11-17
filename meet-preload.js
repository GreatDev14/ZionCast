/**
 * ZionCast Google Meet Webview Preload
 * Protects Church TV cameras (Iriun Webcam, Camo Studio, OBS, DroidCam) from being
 * hijacked by Google Meet while keeping Headset Microphone & Earphone routing working.
 */
(() => {
  let allowCamera = false;
  let preferredAudioOutputId = '';

  window.__zionMeetSetAllowCamera = (allowed) => {
    allowCamera = !!allowed;
  };

  window.__zionMeetSetAudioOutput = async (sinkId) => {
    preferredAudioOutputId = sinkId || '';
    const els = document.querySelectorAll('audio, video');
    for (const el of els) {
      if (typeof el.setSinkId === 'function') {
        try {
          await el.setSinkId(preferredAudioOutputId);
        } catch (_) {}
      }
    }
  };

  // Automatically apply preferred headset audio output to any newly created audio/video elements
  const origCreateElement = document.createElement.bind(document);
  document.createElement = function (tagName, options) {
    const el = origCreateElement(tagName, options);
    if (preferredAudioOutputId && (String(tagName).toLowerCase() === 'audio' || String(tagName).toLowerCase() === 'video')) {
      setTimeout(() => {
        if (typeof el.setSinkId === 'function') {
          el.setSinkId(preferredAudioOutputId).catch(() => {});
        }
      }, 250);
    }
    return el;
  };

  if (navigator.mediaDevices) {
    const origGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async function (constraints) {
      if (!allowCamera && constraints && typeof constraints === 'object' && constraints.video) {
        // Keep audio active for headset mic, strip video so Iriun/Camo stay free for ZionCast TV!
        if (constraints.audio) {
          const audioOnly = { audio: constraints.audio, video: false };
          return origGetUserMedia(audioOnly);
        }
        const err = new DOMException('Camera protected for ZionCast TV output', 'NotAllowedError');
        throw err;
      }
      return origGetUserMedia(constraints);
    };

    const origEnumerateDevices = navigator.mediaDevices.enumerateDevices.bind(navigator.mediaDevices);
    navigator.mediaDevices.enumerateDevices = async function () {
      const devices = await origEnumerateDevices();
      if (allowCamera) return devices;
      // Hide videoinput devices from Google Meet when TV Camera Protection is ON
      return devices.filter((d) => d.kind !== 'videoinput');
    };
  }
})();
