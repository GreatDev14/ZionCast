/**
 * ZionCast Presentation Control Desk - Production Renderer Engine
 * Dual-Screen Projector Engine, OpenLP 3-Panel Workflow, DroidCam/OBS Video Hardware,
 * Offline Scripture Lookup, Real-Time Synchronizer.
 */

(() => {
  // =========================================================================
  // 1. STATE & STORAGE
  // =========================================================================
  const state = {
    // Current presentation selection
    activeItem: null,       // Currently loaded presentation item (song, scripture, custom)
    activeItemSource: '',   // 'library' or 'service'
    activeSlideIndex: 0,    // Currently broadcasting slide index
    previewItem: null,      // Currently previewed item in operator preview monitor
    previewSlideIndex: 0,   // Currently previewed slide index

    // Display & Styling State (synchronized with Display 2)
    displayOpen: false,
    blackout: false,
    clearText: false,
    themeOnly: false,
    fontSize: 44,
    fontFamily: 'Outfit',
    fontColor: '#ffffff',
    strokeWidth: 0,
    strokeColor: '#000000',
    dropShadow: true,
    textAlign: 'center',
    backgroundType: 'procedural',
    backgroundId: 'celestial-clouds',
    customBgUrl: '',
    cameraEnabled: false,
    cameraMode: 'none',    // 'none', 'background', 'preacher'
    cameraDeviceId: '',
    cameraOpacity: 0.75,
    bannerText: '',
    bannerActive: false,
    brightness: 100,

    // Hardware and displays
    displays: [],
    primaryDisplayId: null,
    videoDevices: []
  };

  // BroadcastChannel Fallback for cross-window communication
  let syncChannel = null;
  try {
    syncChannel = new BroadcastChannel('zioncast-sync');
  } catch (err) {
    console.warn('BroadcastChannel fallback not supported:', err);
  }

  // Preloaded Church Worship Songs Library (Classic & Modern Anthems)
  let songsLibrary = [
    {
      id: 'song-1',
      title: 'Way Maker',
      author: 'Sinach',
      ccli: 'CCLI #7115744',
      slides: [
        { label: 'Verse 1', body: 'You are here, moving in our midst\nI worship You, I worship You\nYou are here, working in this place\nI worship You, I worship You' },
        { label: 'Chorus', body: 'Way Maker, Miracle Worker\nPromise Keeper, Light in the darkness\nMy God, that is who You are' },
        { label: 'Verse 2', body: 'You are here, touching every heart\nI worship You, I worship You\nYou are here, healing every heart\nI worship You, I worship You' },
        { label: 'Bridge', body: 'Even when I don\'t see it, You\'re working\nEven when I don\'t feel it, You\'re working\nYou never stop, You never stop working' }
      ]
    },
    {
      id: 'song-2',
      title: 'Amazing Grace (My Chains Are Gone)',
      author: 'John Newton / Chris Tomlin',
      ccli: 'CCLI #4768151',
      slides: [
        { label: 'Verse 1', body: 'Amazing grace! How sweet the sound\nThat saved a wretch like me!\nI once was lost, but now am found;\nWas blind, but now I see.' },
        { label: 'Verse 2', body: '\'Twas grace that taught my heart to fear,\nAnd grace my fears relieved;\nHow precious did that grace appear\nThe hour I first believed.' },
        { label: 'Chorus', body: 'My chains are gone, I\'ve been set free\nMy God, my Savior has ransomed me\nAnd like a flood His mercy reigns\nUnending love, amazing grace' },
        { label: 'Verse 3', body: 'The Lord has promised good to me,\nHis word my hope secures;\nHe will my shield and portion be,\nAs long as life endures.' }
      ]
    },
    {
      id: 'song-3',
      title: 'Goodness of God',
      author: 'Bethel Music / Jenn Johnson',
      ccli: 'CCLI #7117726',
      slides: [
        { label: 'Verse 1', body: 'I love You, Lord\nFor Your mercy never fails me\nAll my days, I\'ve been held in Your hands\nFrom the moment that I wake up\nUntil I lay my head\nOh, I will sing of the goodness of God' },
        { label: 'Chorus', body: '\'Cause all my life You have been faithful\nAnd all my life You have been so, so good\nWith every breath that I am able\nOh, I will sing of the goodness of God' },
        { label: 'Verse 2', body: 'I love Your voice\nYou have led me through the fire\nIn darkest night You are close like no other\nI\'ve known You as a Father\nI\'ve known You as a Friend\nAnd I have lived in the goodness of God' },
        { label: 'Bridge', body: 'Your goodness is running after\nIt\'s running after me\nWith my life laid down, I surrender now\nI give You everything' }
      ]
    },
    {
      id: 'song-4',
      title: '10,000 Reasons (Bless The Lord)',
      author: 'Matt Redman',
      ccli: 'CCLI #6016351',
      slides: [
        { label: 'Chorus', body: 'Bless the Lord, O my soul, O my soul\nWorship His holy name\nSing like never before, O my soul\nI\'ll worship Your holy name' },
        { label: 'Verse 1', body: 'The sun comes up, it\'s a new day dawning\nIt\'s time to sing Your song again\nWhatever may pass, and whatever lies before me\nLet me be singing when the evening comes' },
        { label: 'Verse 2', body: 'You\'re rich in love, and You\'re slow to anger\nYour name is great, and Your heart is kind\nFor all Your goodness I will keep on singing\nTen thousand reasons for my heart to find' }
      ]
    },
    {
      id: 'song-5',
      title: 'Great Are You Lord',
      author: 'All Sons & Daughters',
      ccli: 'CCLI #6460220',
      slides: [
        { label: 'Verse 1', body: 'You give life, You are love\nYou bring light to the darkness\nYou give hope, You restore\nEvery heart that is broken\nGreat are You, Lord' },
        { label: 'Chorus', body: 'It\'s Your breath in our lungs\nSo we pour out our praise, we pour out our praise\nIt\'s Your breath in our lungs\nSo we pour out our praise to You only' },
        { label: 'Bridge', body: 'All the earth will shout Your praise\nOur hearts will cry, these bones will sing\nGreat are You, Lord!' }
      ]
    }
  ];

  // Preloaded Custom Slides (Welcome, Tithes, Announcements)
  let customSlidesLibrary = [
    {
      id: 'custom-1',
      title: 'WELCOME TO ZION CHURCH',
      subtitle: 'Sunday Worship Service',
      theme: 'celestial-clouds',
      slides: [
        { label: 'Welcome', body: 'WELCOME TO ZION SANCTUARY\n\nWe are rejoiced to worship together!\nConnect • Fellowship • Grow in Christ' },
        { label: 'First Time Guests', body: 'FIRST TIME WITH US?\n\nPlease fill out a Connect Card in the foyer\nor visit www.zionchurch.org/connect\nWe have a special welcome gift for you!' }
      ]
    },
    {
      id: 'custom-2',
      title: 'TITHES & OFFERINGS',
      subtitle: 'Worship Through Giving',
      theme: 'golden-sanctuary',
      slides: [
        { label: 'Scripture', body: '"Honor the Lord with your substance,\nand with the firstfruits of all thine increase."\n— Proverbs 3:9' },
        { label: 'Giving Methods', body: 'WAYS TO GIVE\n\n• Online: www.zionchurch.org/give\n• Mobile Transfer: Zion Church Bank\n• Account: 0123456789\n• Ushers passing giving envelopes now' }
      ]
    },
    {
      id: 'custom-3',
      title: 'MIDWEEK BIBLE STUDY',
      subtitle: 'Wednesday Night In The Word',
      theme: 'deep-gradient-pulse',
      slides: [
        { label: 'Announcement', body: 'DEEP DIVE BIBLE STUDY\n\nJoin us this Wednesday at 7:00 PM\nTopic: The Book of Romans • Walking in Victory\nLive in Sanctuary & Streaming Online' }
      ]
    }
  ];

  // Church Media Library (Images, Videos, Presentations)
  let mediaLibrary = [
    {
      id: 'media-1',
      title: 'Sunday Worship Sanctuary Banner',
      type: 'image',
      url: 'assets/icon.png'
    },
    {
      id: 'media-2',
      title: 'ZionCast Sanctuary Cross',
      type: 'image',
      url: 'assets/icon.png'
    }
  ];

  // Custom User Themes Library
  let customThemes = [
    {
      id: 'custom-theme-1',
      name: 'Sunday Morning Majesty',
      bgType: 'procedural',
      bgId: 'golden-sanctuary',
      fontFamily: 'Cinzel',
      fontSize: 48,
      fontColor: '#ffffff',
      strokeWidth: 0,
      dropShadow: true,
      scrimOpacity: 0.45
    },
    {
      id: 'custom-theme-2',
      name: 'Atmospheric Deep Midnight',
      bgType: 'procedural',
      bgId: 'celestial-clouds',
      fontFamily: 'Outfit',
      fontSize: 44,
      fontColor: '#ffffff',
      strokeWidth: 0,
      dropShadow: true,
      scrimOpacity: 0.5
    }
  ];

  // Sunday Order of Service Timeline
  let serviceOrder = [
    {
      id: 'svc-1',
      type: 'custom',
      title: 'Welcome to Zion Church',
      data: customSlidesLibrary[0]
    },
    {
      id: 'svc-2',
      type: 'song',
      title: 'Way Maker - Sinach',
      data: songsLibrary[0]
    },
    {
      id: 'svc-3',
      type: 'song',
      title: 'Goodness of God',
      data: songsLibrary[2]
    },
    {
      id: 'svc-4',
      type: 'custom',
      title: 'Tithes & Offerings',
      data: customSlidesLibrary[1]
    }
  ];

  let bibleDatabase = null;
  let currentBibleVersion = 'kjv';
  const bibleVersionsCache = {};
  let backgroundPresets = [];

  // =========================================================================
  // 2. DOM REFERENCES
  // =========================================================================
  // Toolbar controls
  const toolbarFontSize = document.getElementById('toolbar-font-size');
  const badgeFontSize = document.getElementById('badge-font-size');
  const toolbarFontFamily = document.getElementById('toolbar-font-family');
  const toolbarFontColor = document.getElementById('toolbar-font-color');
  const toolbarStrokeWidth = document.getElementById('toolbar-stroke-width');
  const badgeStrokeWidth = document.getElementById('badge-stroke-width');
  const btnToggleShadow = document.getElementById('btn-toggle-shadow');
  const btnAlignLeft = document.getElementById('btn-align-left');
  const btnAlignCenter = document.getElementById('btn-align-center');

  // Fast action controls
  const btnFastBlackout = document.getElementById('btn-fast-blackout');
  const btnFastTheme = document.getElementById('btn-fast-theme');
  const btnFastClear = document.getElementById('btn-fast-clear');
  const btnOpenBanner = document.getElementById('btn-open-banner');

  // TV Output & Multi-Screen Controls
  const btnLaunchTv = document.getElementById('btn-launch-tv');
  const btnTvLabel = document.getElementById('btn-tv-label');
  const tvStatusDot = document.getElementById('tv-status-dot');
  const selectTargetScreen = document.getElementById('select-target-screen');
  const btnIdentifyScreens = document.getElementById('btn-identify-screens');
  const btnSnapLaptop = document.getElementById('btn-snap-laptop');

  // Library Tabs & Lists
  const libTabButtons = document.querySelectorAll('.lib-tab-btn');
  const tabPanes = document.querySelectorAll('.tab-pane-content');
  const songsListContainer = document.getElementById('songs-list-container');
  const songsSearchInput = document.getElementById('songs-search-input');
  const customSlidesList = document.getElementById('custom-slides-list');
  const customSearchInput = document.getElementById('custom-search-input');

  // Bible controls
  const bibleVersionSelect = document.getElementById('bible-version-select');
  const bibleVersionBadge = document.getElementById('bible-version-badge');
  const bibleBookSelect = document.getElementById('bible-book-select');
  const bibleChapterSelect = document.getElementById('bible-chapter-select');
  const bibleVerseSelect = document.getElementById('bible-verse-select');
  const bibleQuickSearch = document.getElementById('bible-quick-search');
  const btnBibleLookup = document.getElementById('btn-bible-lookup');
  const bibleVersesList = document.getElementById('bible-verses-list');

  // Camera & Theme controls
  const cameraDeviceSelect = document.getElementById('camera-device-select');
  const btnRefreshDevices = document.getElementById('btn-refresh-devices');
  const camModeButtons = document.querySelectorAll('.cam-mode-btn');
  const cameraDimmerSlider = document.getElementById('camera-dimmer-slider');
  const badgeCameraDimmer = document.getElementById('badge-camera-dimmer');
  const themesPresetContainer = document.getElementById('themes-preset-container');
  const btnPickCustomBg = document.getElementById('btn-pick-custom-bg');

  // Center Monitors & Tiles
  const previewCanvas = document.getElementById('preview-canvas');
  const previewVideoStream = document.getElementById('preview-video-stream');
  const previewTextTitle = document.getElementById('preview-text-title');
  const previewTextBody = document.getElementById('preview-text-body');
  const btnPushLive = document.getElementById('btn-push-live');

  const liveCanvas = document.getElementById('live-canvas');
  const liveVideoStream = document.getElementById('live-video-stream');
  const liveTextTitle = document.getElementById('live-text-title');
  const liveTextBody = document.getElementById('live-text-body');
  const liveBlackoutOverlay = document.getElementById('live-blackout-overlay');

  const activeItemTitle = document.getElementById('active-item-title');
  const activeItemMeta = document.getElementById('active-item-meta');
  const slideTilesGrid = document.getElementById('slide-tiles-grid');
  const btnSlidePrev = document.getElementById('btn-slide-prev');
  const btnSlideNext = document.getElementById('btn-slide-next');

  // Right Panel: Service Order
  const serviceTitleInput = document.getElementById('service-title-input');
  const serviceOrderList = document.getElementById('service-order-list');
  const btnServiceMoveUp = document.getElementById('btn-service-move-up');
  const btnServiceMoveDown = document.getElementById('btn-service-move-down');
  const btnServiceRemove = document.getElementById('btn-service-remove');
  const btnServiceClear = document.getElementById('btn-service-clear');
  const btnSaveService = document.getElementById('btn-save-service');
  const btnLoadService = document.getElementById('btn-load-service');

  // Bottom Status & Master Brightness Quick Control
  const labelDisplayStatus = document.getElementById('label-display-status');
  const labelCameraStatus = document.getElementById('label-camera-status');
  const labelActiveSlideRef = document.getElementById('label-active-slide-ref');
  const toolbarBrightness = document.getElementById('toolbar-brightness');
  const badgeBrightness = document.getElementById('badge-brightness');
  const labelBrightnessReset = document.getElementById('label-brightness-reset');
  const liveDimmerOverlay = document.getElementById('live-dimmer-overlay');

  // Modals
  const modalSong = document.getElementById('modal-song');
  const modalImport = document.getElementById('modal-import');
  const modalCustom = document.getElementById('modal-custom');
  const modalBanner = document.getElementById('modal-banner');
  const modalThemeBuilder = document.getElementById('modal-theme-builder');
  const modalUploadMedia = document.getElementById('modal-upload-media');

  // Media Gallery Controls
  const mediaGalleryGrid = document.getElementById('media-gallery-grid');
  const mediaSearchInput = document.getElementById('media-search-input');
  const btnUploadImage = document.getElementById('btn-upload-image');
  const btnUploadVideo = document.getElementById('btn-upload-video');

  // DroidCam Studio Controls
  const droidcamStatusBadge = document.getElementById('droidcam-status-badge');
  const btnProjectPreacher = document.getElementById('btn-project-preacher');
  const btnProjectWorshipBg = document.getElementById('btn-project-worship-bg');
  const btnCameraOff = document.getElementById('btn-camera-off');

  // Theme Builder Controls
  const btnOpenThemeBuilder = document.getElementById('btn-open-theme-builder');
  const themeFormName = document.getElementById('theme-form-name');
  const themeFormBgType = document.getElementById('theme-form-bg-type');
  const themeFormPreset = document.getElementById('theme-form-preset');
  const themeCustomFileRow = document.getElementById('theme-custom-file-row');
  const themeFormFilePath = document.getElementById('theme-form-file-path');
  const btnBrowseThemeFile = document.getElementById('btn-browse-theme-file');
  const themeFormFontFamily = document.getElementById('theme-form-font-family');
  const themeFormFontColor = document.getElementById('theme-form-font-color');
  const themeFormFontSize = document.getElementById('theme-form-font-size');
  const themeFormScrim = document.getElementById('theme-form-scrim');
  const badgeThemeScrim = document.getElementById('badge-theme-scrim');
  const themePreviewBox = document.getElementById('theme-preview-box');
  const themePreviewScrim = document.getElementById('theme-preview-scrim');
  const themePreviewText = document.getElementById('theme-preview-text');
  const btnSaveCustomTheme = document.getElementById('btn-save-custom-theme');

  // Media Upload Modal Controls
  const uploadMediaTitle = document.getElementById('upload-media-title');
  const uploadFormTitle = document.getElementById('upload-form-title');
  const uploadFormType = document.getElementById('upload-form-type');
  const uploadFormFilePath = document.getElementById('upload-form-file-path');
  const btnBrowseUploadFile = document.getElementById('btn-browse-upload-file');
  const btnConfirmUploadMedia = document.getElementById('btn-confirm-upload-media');

  let saveDebounceTimer = null;

  function triggerAutoSave() {
    if (saveDebounceTimer) clearTimeout(saveDebounceTimer);
    saveDebounceTimer = setTimeout(() => {
      persistAllData();
    }, 200);
  }

  // Alias for backward compatibility
  function saveStoredLibrary() {
    triggerAutoSave();
  }

  async function persistAllData() {
    const bundle = {
      version: 1,
      savedAt: new Date().toISOString(),
      songs: songsLibrary,
      customSlides: customSlidesLibrary,
      media: mediaLibrary,
      customThemes: customThemes,
      serviceOrder: serviceOrder,
      serviceTitle: serviceTitleInput ? serviceTitleInput.value : 'Sunday Worship Service',
      settings: {
        fontSize: state.fontSize,
        fontFamily: state.fontFamily,
        fontColor: state.fontColor,
        strokeWidth: state.strokeWidth,
        strokeColor: state.strokeColor,
        dropShadow: state.dropShadow,
        textAlign: state.textAlign,
        backgroundType: state.backgroundType,
        backgroundId: state.backgroundId,
        customBgUrl: state.customBgUrl,
        cameraMode: state.cameraMode,
        cameraDeviceId: state.cameraDeviceId,
        cameraOpacity: state.cameraOpacity,
        currentBibleVersion: currentBibleVersion,
        bannerText: state.bannerText,
        brightness: typeof state.brightness === 'number' ? state.brightness : 100,
        activeItemId: state.activeItem ? state.activeItem.id : null,
        activeItemSource: state.activeItemSource,
        activeSlideIndex: state.activeSlideIndex
      }
    };

    // 1. Immediate localStorage cache
    try {
      localStorage.setItem('zioncast_database', JSON.stringify(bundle));
      localStorage.setItem('zioncast_songs', JSON.stringify(songsLibrary));
      localStorage.setItem('zioncast_custom', JSON.stringify(customSlidesLibrary));
      localStorage.setItem('zioncast_media', JSON.stringify(mediaLibrary));
      localStorage.setItem('zioncast_themes', JSON.stringify(customThemes));
      localStorage.setItem('zioncast_service', JSON.stringify(serviceOrder));
      localStorage.setItem('zioncast_settings', JSON.stringify(bundle.settings));
    } catch (e) {
      console.warn('localStorage save warning:', e);
    }

    // 2. Guaranteed native file write on PC disk via Electron
    if (window.zionApi && window.zionApi.saveUserData) {
      try {
        await window.zionApi.saveUserData(bundle);
      } catch (e) {
        console.warn('Native disk save error:', e);
      }
    }
  }

  async function loadAllPersistedData() {
    let bundle = null;

    // 1. Try reading from native disk JSON file first
    if (window.zionApi && window.zionApi.loadUserData) {
      try {
        bundle = await window.zionApi.loadUserData();
      } catch (e) {
        console.warn('Could not read user data from disk:', e);
      }
    }

    // 2. Fallback to unified localStorage database
    if (!bundle) {
      try {
        const stored = localStorage.getItem('zioncast_database');
        if (stored) {
          bundle = JSON.parse(stored);
        }
      } catch (e) {
        console.warn('Could not read user database from localStorage:', e);
      }
    }

    // 3. Fallback to individual legacy localStorage keys
    if (!bundle) {
      try {
        const storedSongs = localStorage.getItem('zioncast_songs');
        const storedCustom = localStorage.getItem('zioncast_custom');
        const storedMedia = localStorage.getItem('zioncast_media');
        const storedThemes = localStorage.getItem('zioncast_themes');
        const storedService = localStorage.getItem('zioncast_service');
        const storedSettings = localStorage.getItem('zioncast_settings');

        if (storedSongs || storedCustom || storedService || storedSettings) {
          bundle = {
            songs: storedSongs ? JSON.parse(storedSongs) : null,
            customSlides: storedCustom ? JSON.parse(storedCustom) : null,
            media: storedMedia ? JSON.parse(storedMedia) : null,
            customThemes: storedThemes ? JSON.parse(storedThemes) : null,
            serviceOrder: storedService ? JSON.parse(storedService) : null,
            settings: storedSettings ? JSON.parse(storedSettings) : null
          };
        }
      } catch (e) {
        console.warn('Individual localStorage fallback error:', e);
      }
    }

    // Apply loaded bundle into state
    if (bundle) {
      if (Array.isArray(bundle.songs) && bundle.songs.length > 0) {
        songsLibrary = bundle.songs;
      }
      if (Array.isArray(bundle.customSlides) && bundle.customSlides.length > 0) {
        customSlidesLibrary = bundle.customSlides;
      }
      if (Array.isArray(bundle.media) && bundle.media.length > 0) {
        mediaLibrary = bundle.media;
      }
      if (Array.isArray(bundle.customThemes) && bundle.customThemes.length > 0) {
        customThemes = bundle.customThemes;
      }
      if (Array.isArray(bundle.serviceOrder)) {
        serviceOrder = bundle.serviceOrder;
      }
      if (bundle.serviceTitle && serviceTitleInput) {
        serviceTitleInput.value = bundle.serviceTitle;
      }

      // Restore user preferences & styles
      if (bundle.settings) {
        const s = bundle.settings;
        if (s.fontSize !== undefined) {
          state.fontSize = s.fontSize;
          if (toolbarFontSize) toolbarFontSize.value = s.fontSize;
          if (badgeFontSize) badgeFontSize.textContent = `${s.fontSize}px`;
        }
        if (s.fontFamily) {
          state.fontFamily = s.fontFamily;
          if (toolbarFontFamily) toolbarFontFamily.value = s.fontFamily;
        }
        if (s.fontColor) {
          state.fontColor = s.fontColor;
          if (toolbarFontColor) toolbarFontColor.value = s.fontColor;
        }
        if (s.strokeWidth !== undefined) {
          state.strokeWidth = s.strokeWidth;
          if (toolbarStrokeWidth) toolbarStrokeWidth.value = s.strokeWidth;
          if (badgeStrokeWidth) badgeStrokeWidth.textContent = `${s.strokeWidth}px`;
        }
        if (s.dropShadow !== undefined) {
          state.dropShadow = s.dropShadow;
          if (btnToggleShadow) {
            btnToggleShadow.style.borderColor = s.dropShadow ? 'var(--accent-gold)' : 'var(--border-subtle)';
            btnToggleShadow.style.color = s.dropShadow ? 'var(--accent-gold)' : 'var(--text-main)';
          }
        }
        if (s.textAlign) {
          state.textAlign = s.textAlign;
          if (btnAlignLeft && btnAlignCenter) {
            btnAlignLeft.style.borderColor = s.textAlign === 'left' ? 'var(--accent-cyan)' : 'var(--border-subtle)';
            btnAlignCenter.style.borderColor = s.textAlign === 'center' ? 'var(--accent-cyan)' : 'var(--border-subtle)';
          }
        }
        if (s.backgroundType) state.backgroundType = s.backgroundType;
        if (s.backgroundId) state.backgroundId = s.backgroundId;
        if (s.customBgUrl) state.customBgUrl = s.customBgUrl;
        if (s.cameraDeviceId) state.cameraDeviceId = s.cameraDeviceId;
        if (s.cameraMode) state.cameraMode = s.cameraMode;
        if (s.cameraOpacity !== undefined) {
          state.cameraOpacity = s.cameraOpacity;
          if (cameraDimmerSlider) cameraDimmerSlider.value = s.cameraOpacity;
          if (badgeCameraDimmer) badgeCameraDimmer.textContent = `${Math.round(s.cameraOpacity * 100)}%`;
        }
        if (s.currentBibleVersion) {
          currentBibleVersion = s.currentBibleVersion;
          if (bibleVersionSelect) bibleVersionSelect.value = s.currentBibleVersion;
          if (bibleVersionBadge) bibleVersionBadge.textContent = s.currentBibleVersion.toUpperCase();
        }
        if (s.bannerText) {
          state.bannerText = s.bannerText;
          const bannerInput = document.getElementById('banner-input-text');
          if (bannerInput) bannerInput.value = s.bannerText;
        }
        if (s.brightness !== undefined) {
          state.brightness = Math.max(0, Math.min(200, s.brightness));
          if (toolbarBrightness) toolbarBrightness.value = state.brightness;
          if (badgeBrightness) badgeBrightness.textContent = `${state.brightness}%`;
        }
      }
    }
  }

  // =========================================================================
  // 3. INITIALIZATION
  // =========================================================================
  async function initApp() {
    // 1. Attach listeners FIRST so UI tabs, buttons, and inputs work immediately!
    attachEventListeners();
    attachKeyboardShortcuts();

    // 2. Load stored library & all settings from native disk / localStorage
    await loadAllPersistedData();
    // Flush initial state to disk so database file is guaranteed to exist
    persistAllData().catch(console.warn);

    // 3. Setup procedural canvases for dual preview monitors
    setupMonitorCanvases();

    // 4. Render initial library lists safely with try/catch
    try { renderSongsList(); } catch (e) { console.error('Songs render error:', e); }
    try { renderCustomSlidesList(); } catch (e) { console.error('Custom slides render error:', e); }
    try { renderMediaGallery(); } catch (e) { console.error('Media render error:', e); }
    try { renderThemesPresetGrid(); } catch (e) { console.error('Themes render error:', e); }
    try { renderServiceOrderList(); } catch (e) { console.error('Service order render error:', e); }

    // 5. Setup initial preview item (starts in operator preview, not live)
    if (songsLibrary.length > 0) {
      try { loadPresentationItem(songsLibrary[0], 'song', false); } catch (e) { console.warn(e); }
    }

    // 6. Asynchronous hardware and database populating in background
    loadBackgroundPresets().catch(console.warn);
    loadBibleData(currentBibleVersion).catch(console.warn);
    enumerateVideoDevices().then(() => {
      // Re-apply persisted camera device & mode if previously configured
      if (state.cameraDeviceId && cameraDeviceSelect) {
        cameraDeviceSelect.value = state.cameraDeviceId;
      }
      if (state.cameraMode && state.cameraMode !== 'none') {
        updateCameraMode(state.cameraMode);
      }
    }).catch(console.warn);
    queryDisplays().catch(console.warn);

    // Initial sync
    broadcastDisplayState();

    // Listen for displays changed event via IPC instead of aggressive polling
    if (window.zionApi && window.zionApi.onDisplaysChanged) {
      window.zionApi.onDisplaysChanged(() => {
        queryDisplays();
      });
    }

    // Periodic check every 5 seconds without DOM thrashing
    setInterval(() => {
      queryDisplays();
    }, 5000);

    // Auto-save on window close or unload
    window.addEventListener('beforeunload', () => {
      persistAllData();
    });
  }

  // =========================================================================
  // 4. MULTI-SCREEN & DISPLAY MANAGEMENT (Display 2 Output)
  // =========================================================================
  let lastDisplaySummary = '';
  async function queryDisplays() {
    if (!window.zionApi) {
      labelDisplayStatus.textContent = 'Display: Web Mode (Single Screen)';
      return;
    }

    const info = await window.zionApi.getDisplays();
    state.displays = info.displays;
    state.primaryDisplayId = info.primaryId;

    const displaySummary = info.displays.map(d => `${d.id}:${d.bounds.width}x${d.bounds.height}`).join(',');
    if (displaySummary !== lastDisplaySummary) {
      lastDisplaySummary = displaySummary;
      // Populate Target Screen Selector (OpenLP style)
      if (selectTargetScreen) {
        const currentVal = selectTargetScreen.value;
        selectTargetScreen.innerHTML = '<option value="">Auto-Detect TV / Projector</option>';
        info.displays.forEach(d => {
          const opt = document.createElement('option');
          opt.value = d.id;
          const role = d.isPrimary ? 'Laptop' : 'Projector/TV';
          opt.textContent = `Screen ${d.index}: ${role} (${d.bounds.width}x${d.bounds.height})`;
          if (info.selectedTargetId && (d.id === info.selectedTargetId || d.id === Number(info.selectedTargetId))) {
            opt.selected = true;
          }
          selectTargetScreen.appendChild(opt);
        });
        if (currentVal && !info.selectedTargetId) {
          selectTargetScreen.value = currentVal;
        }
      }

      const secondary = info.displays.find(d => d.id !== info.primaryId);
      if (secondary) {
        labelDisplayStatus.innerHTML = `Projector: <strong style="color: var(--accent-green);">Ready on Screen ${secondary.index} (${secondary.bounds.width}x${secondary.bounds.height})</strong>`;
      } else {
        labelDisplayStatus.innerHTML = `Projector: <strong style="color: var(--accent-gold);">1 Screen (Press Win+P to Extend)</strong>`;
      }
    }

    // Check if display window is currently open
    const status = await window.zionApi.getDisplayStatus();
    updateTvStatusUI(status.isOpen);
  }

  function updateTvStatusUI(isOpen) {
    state.displayOpen = isOpen;
    if (isOpen) {
      tvStatusDot.classList.add('online');
      btnLaunchTv.classList.add('tv-online');
      btnTvLabel.textContent = 'Hide TV Output';
    } else {
      tvStatusDot.classList.remove('online');
      btnLaunchTv.classList.remove('tv-online');
      btnTvLabel.textContent = 'Show TV Output';
    }
  }

  async function toggleTvOutput() {
    if (!window.zionApi) {
      alert('ZionCast is running inside a browser tab. Dual-screen projector management requires Electron desktop.');
      return;
    }

    if (state.displayOpen) {
      await window.zionApi.closeDisplay();
      updateTvStatusUI(false);
    } else {
      const targetScreenId = selectTargetScreen ? selectTargetScreen.value : null;
      await window.zionApi.launchDisplay(targetScreenId);
      updateTvStatusUI(true);
      setTimeout(() => broadcastDisplayState(), 250);
    }
  }

  // =========================================================================
  // 5. DIRECT HARDWARE VIDEO CAPTURE (DroidCam / OBS / USB Webcams)
  // =========================================================================
  async function enumerateVideoDevices() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoInputs = devices.filter(d => d.kind === 'videoinput');
      state.videoDevices = videoInputs;

      cameraDeviceSelect.innerHTML = '';
      if (videoInputs.length === 0) {
        cameraDeviceSelect.innerHTML = '<option value="">No camera devices found</option>';
        labelCameraStatus.textContent = 'Camera: No Hardware';
        return;
      }

      videoInputs.forEach((device, index) => {
        const option = document.createElement('option');
        option.value = device.deviceId;
        let label = device.label || `Camera ${index + 1}`;
        // Highlight DroidCam or OBS
        if (label.toLowerCase().includes('droidcam')) {
          label = `📱 ${label} (DroidCam)`;
        } else if (label.toLowerCase().includes('obs')) {
          label = `🎥 ${label} (OBS Virtual)`;
        } else {
          label = `📹 ${label}`;
        }
        option.textContent = label;
        cameraDeviceSelect.appendChild(option);
      });

      // Check for DroidCam specifically
      const droidCam = videoInputs.find(d => {
        const lbl = (d.label || '').toLowerCase();
        return lbl.includes('droidcam') || lbl.includes('droid');
      });

      if (droidcamStatusBadge) {
        if (droidCam) {
          droidcamStatusBadge.textContent = '📱 DroidCam Connected';
          droidcamStatusBadge.classList.remove('offline');
        } else if (videoInputs.length > 0) {
          droidcamStatusBadge.textContent = `📹 ${videoInputs.length} Camera(s) Ready`;
          droidcamStatusBadge.classList.remove('offline');
        } else {
          droidcamStatusBadge.textContent = '⚠️ DroidCam Not Detected';
          droidcamStatusBadge.classList.add('offline');
        }
      }

      // Default select DroidCam if present, or first device
      if (droidCam && !state.cameraDeviceId) {
        state.cameraDeviceId = droidCam.deviceId;
        cameraDeviceSelect.value = droidCam.deviceId;
      } else if (!state.cameraDeviceId && videoInputs.length > 0) {
        state.cameraDeviceId = videoInputs[0].deviceId;
        cameraDeviceSelect.value = videoInputs[0].deviceId;
      } else if (state.cameraDeviceId) {
        cameraDeviceSelect.value = state.cameraDeviceId;
      }

      labelCameraStatus.textContent = `Camera: ${videoInputs.length} Detected`;
    } catch (err) {
      console.warn('Could not enumerate video hardware:', err);
      cameraDeviceSelect.innerHTML = '<option value="">Camera access restricted</option>';
    }
  }

  async function updateCameraMode(mode) {
    state.cameraMode = mode;
    state.cameraEnabled = mode !== 'none';

    camModeButtons.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.mode === mode);
    });

    if (state.cameraEnabled && state.cameraDeviceId) {
      const isAlreadyActive = previewVideoStream.srcObject &&
        previewVideoStream.srcObject.getVideoTracks().some(t => t.readyState === 'live');

      if (!isAlreadyActive) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            video: { deviceId: { exact: state.cameraDeviceId } },
            audio: false
          });
          previewVideoStream.srcObject = stream;
          liveVideoStream.srcObject = stream;
          previewVideoStream.play().catch(e => console.warn('Preview video play error:', e));
          liveVideoStream.play().catch(e => console.warn('Live video play error:', e));
        } catch (e) {
          console.warn('Could not bind monitor camera streams with exact ID, trying fallback:', e);
          try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
            previewVideoStream.srcObject = stream;
            liveVideoStream.srcObject = stream;
          } catch (err) {
            console.error('All operator camera binding attempts failed:', err);
          }
        }
      }
      previewVideoStream.style.display = 'block';
      liveVideoStream.style.display = 'block';
      labelCameraStatus.textContent = `Camera: ${mode.toUpperCase()} Live`;
    } else {
      if (previewVideoStream.srcObject) {
        previewVideoStream.srcObject.getTracks().forEach(t => t.stop());
      }
      previewVideoStream.srcObject = null;
      liveVideoStream.srcObject = null;
      previewVideoStream.style.display = 'none';
      liveVideoStream.style.display = 'none';
      labelCameraStatus.textContent = 'Camera: Standby';
    }

    broadcastDisplayState();
    triggerAutoSave();
  }

  // =========================================================================
  // 6. REAL-TIME BROADCAST SYNCHRONIZER
  // =========================================================================
  function broadcastDisplayState() {
    let activeSlide = null;
    if (state.activeItem && state.activeItem.slides && state.activeItem.slides[state.activeSlideIndex]) {
      const s = state.activeItem.slides[state.activeSlideIndex];
      activeSlide = {
        label: s.label || '',
        body: s.body || '',
        index: state.activeSlideIndex + 1,
        total: state.activeItem.slides.length
      };
    }

    const payload = {
      activeSlide,
      activeItem: state.activeItem ? { title: state.activeItem.title } : null,
      blackout: state.blackout,
      clearText: state.clearText,
      themeOnly: state.themeOnly,
      fontSize: state.fontSize,
      fontFamily: state.fontFamily,
      fontColor: state.fontColor,
      strokeWidth: state.strokeWidth,
      strokeColor: state.strokeColor,
      dropShadow: state.dropShadow,
      textAlign: state.textAlign,
      backgroundType: state.backgroundType,
      backgroundId: state.backgroundId,
      customBgUrl: state.customBgUrl,
      cameraEnabled: state.cameraEnabled,
      cameraMode: state.cameraMode,
      cameraDeviceId: state.cameraDeviceId,
      cameraOpacity: state.cameraOpacity,
      bannerText: state.bannerText,
      bannerActive: state.bannerActive,
      brightness: typeof state.brightness === 'number' ? state.brightness : 100
    };

    // 1. Electron IPC Send
    if (window.zionApi && window.zionApi.sendToDisplay) {
      window.zionApi.sendToDisplay(payload);
    }

    // 2. BroadcastChannel Fallback
    if (syncChannel) {
      syncChannel.postMessage(payload);
    }

    // Update Local Live Monitor Mirror
    updateLiveMonitorMirror(payload);
  }

  function updateLiveMonitorMirror(payload) {
    if (payload.blackout) {
      liveBlackoutOverlay.classList.add('active');
    } else {
      liveBlackoutOverlay.classList.remove('active');
    }

    const bVal = typeof payload.brightness === 'number' ? Math.max(0, Math.min(200, payload.brightness)) : 100;
    const liveScrim = document.querySelector('#live-screen-box .monitor-dark-scrim');

    if (bVal <= 100) {
      if (liveDimmerOverlay) {
        liveDimmerOverlay.style.opacity = (100 - bVal) / 100;
      }
      if (liveCanvas) liveCanvas.style.filter = 'none';
      if (liveVideoStream) liveVideoStream.style.filter = 'none';
      if (liveScrim) liveScrim.style.opacity = '1';
    } else {
      if (liveDimmerOverlay) {
        liveDimmerOverlay.style.opacity = '0';
      }
      const boostFactor = bVal / 100;
      const boostFilter = `brightness(${boostFactor}) contrast(${1 + (boostFactor - 1) * 0.15}) saturate(${1 + (boostFactor - 1) * 0.1})`;
      if (liveCanvas) liveCanvas.style.filter = boostFilter;
      if (liveVideoStream) liveVideoStream.style.filter = boostFilter;
      if (liveScrim) {
        const extraRatio = (bVal - 100) / 100;
        liveScrim.style.opacity = Math.max(0.15, 1 - extraRatio * 0.75);
      }
    }

    if (payload.clearText || payload.themeOnly || payload.blackout || !payload.activeSlide) {
      liveTextTitle.style.opacity = '0';
      liveTextBody.style.opacity = '0';
    } else {
      liveTextTitle.style.opacity = '1';
      liveTextBody.style.opacity = '1';
      liveTextTitle.textContent = payload.activeItem ? `${payload.activeItem.title} • ${payload.activeSlide.label}` : payload.activeSlide.label;
      liveTextBody.textContent = payload.activeSlide.body;
      liveTextBody.style.fontFamily = payload.fontFamily;
      liveTextBody.style.color = payload.fontColor;
      liveTextBody.style.textAlign = payload.textAlign;
    }

    // Update status bar active reference
    if (payload.activeSlide) {
      labelActiveSlideRef.textContent = `${state.activeItem.title} (${payload.activeSlide.label})`;
    } else {
      labelActiveSlideRef.textContent = payload.blackout ? 'BLACKOUT' : (payload.clearText ? 'CLEARED' : 'None');
    }
  }

  // =========================================================================
  // 7. MONITOR CANVAS RENDERERS (Dual Previews)
  // =========================================================================
  function setupMonitorCanvases() {
    const ctxPrev = previewCanvas.getContext('2d');
    const ctxLive = liveCanvas.getContext('2d');
    let t = 0;
    let prevW = 0, prevH = 0, liveW = 0, liveH = 0;

    function resizeCanvases() {
      const p1 = previewCanvas.parentElement;
      const p2 = liveCanvas.parentElement;
      if (p1) {
        const nw = p1.clientWidth || 320;
        const nh = p1.clientHeight || 180;
        if (nw !== prevW || nh !== prevH) {
          prevW = previewCanvas.width = nw;
          prevH = previewCanvas.height = nh;
        }
      }
      if (p2) {
        const nw = p2.clientWidth || 320;
        const nh = p2.clientHeight || 180;
        if (nw !== liveW || nh !== liveH) {
          liveW = liveCanvas.width = nw;
          liveH = liveCanvas.height = nh;
        }
      }
    }

    window.addEventListener('resize', resizeCanvases);
    resizeCanvases();

    function drawMonitors() {
      // If the window is minimized or hidden, skip drawing to save 100% of CPU and GPU!
      if (!document.hidden) {
        t += 0.02;
        if (prevW === 0 || liveW === 0) resizeCanvases();

        // Draw active procedural background into both canvases
        renderMonitorBg(ctxPrev, prevW, prevH, t, state.backgroundId);
        renderMonitorBg(ctxLive, liveW, liveH, t, state.backgroundId);
      }

      requestAnimationFrame(drawMonitors);
    }

    requestAnimationFrame(drawMonitors);
  }

  const monitorImgCache = new Map();
  function renderMonitorBg(ctx, w, h, t, bgId) {
    if (state.backgroundType === 'image' && state.customBgUrl) {
      let img = monitorImgCache.get(state.customBgUrl);
      if (!img) {
        img = new Image();
        img.src = state.customBgUrl.startsWith('http') || state.customBgUrl.startsWith('file:') || state.customBgUrl.startsWith('data:')
          ? state.customBgUrl
          : 'file:///' + state.customBgUrl.replace(/\\/g, '/');
        monitorImgCache.set(state.customBgUrl, img);
      }
      if (img.complete && img.naturalWidth > 0) {
        ctx.drawImage(img, 0, 0, w, h);
        return;
      }
    }

    if (bgId === 'celestial-clouds') {
      const g = ctx.createRadialGradient(w * 0.5, h * 0.4, 20, w * 0.5, h * 0.5, w * 0.7);
      g.addColorStop(0, '#581c87');
      g.addColorStop(0.5, '#2e1065');
      g.addColorStop(1, '#090d16');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    } else if (bgId === 'deep-gradient-pulse') {
      const g = ctx.createLinearGradient(0, 0, w, h);
      g.addColorStop(0, '#0c1a3b');
      g.addColorStop(1, '#1e1b4b');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    } else if (bgId === 'golden-sanctuary') {
      const g = ctx.createRadialGradient(w * 0.5, h * 0.2, 10, w * 0.5, h * 0.5, w * 0.7);
      g.addColorStop(0, '#78350f');
      g.addColorStop(1, '#120b04');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    } else {
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, w, h);
    }
  }

  // =========================================================================
  // 8. PRESENTATION TILES & SELECTION LOGIC
  // =========================================================================
  function loadPresentationItem(item, type, pushDirectlyToLive = false) {
    if (type === 'media') {
      const isVideo = item.type === 'video';
      state.backgroundType = isVideo ? 'video' : 'image';
      state.customBgUrl = item.url;
      state.clearText = true;
      if (!item.slides) {
        item = {
          ...item,
          slides: [{ label: item.title, body: '' }]
        };
      }
    } else if (type === 'custom') {
      if (item.theme) {
        state.backgroundType = 'procedural';
        state.backgroundId = item.theme;
        state.customBgUrl = '';
      }
      state.clearText = false;
      state.themeOnly = false;
      state.blackout = false;
    }

    state.activeItem = item;
    state.activeItemSource = type;
    state.activeSlideIndex = 0;

    activeItemTitle.textContent = item.title;
    activeItemMeta.textContent = `${item.slides ? item.slides.length : 1} slide tiles available`;

    renderSlideTiles();

    if (pushDirectlyToLive) {
      updateOperatorPreview(0);
      goLiveSlide(0);
    } else {
      updateOperatorPreview(0);
    }
  }

  function renderSlideTiles() {
    slideTilesGrid.innerHTML = '';
    if (!state.activeItem || !state.activeItem.slides) return;

    state.activeItem.slides.forEach((slide, idx) => {
      const card = document.createElement('div');
      card.className = 'slide-tile-card';
      if (idx === state.activeSlideIndex) {
        card.classList.add('live-active');
      }
      if (idx === state.previewSlideIndex) {
        card.classList.add('preview-active');
      }

      card.innerHTML = `
        <div class="tile-live-badge">ON AIR</div>
        <div class="tile-top-bar">
          <span class="tile-label">${slide.label || `Slide ${idx + 1}`}</span>
          <span class="tile-index-badge">${idx + 1}/${state.activeItem.slides.length}</span>
        </div>
        <div class="tile-lyrics-preview">${escapeHtml(slide.body)}</div>
      `;

      // Single-click: Preview in Operator Monitor (does not change live screen)
      card.addEventListener('click', () => {
        updateOperatorPreview(idx);
      });

      // Double-click: Send directly LIVE to Live TV Output & TV Projector!
      card.addEventListener('dblclick', () => {
        goLiveSlide(idx);
      });

      slideTilesGrid.appendChild(card);
    });
  }

  function updateOperatorPreview(index) {
    if (!state.activeItem || !state.activeItem.slides[index]) return;
    state.previewSlideIndex = index;
    const slide = state.activeItem.slides[index];

    previewTextTitle.textContent = `${state.activeItem.title} • ${slide.label}`;
    previewTextBody.textContent = slide.body;

    // Highlight preview tile
    const cards = slideTilesGrid.querySelectorAll('.slide-tile-card');
    cards.forEach((c, i) => {
      c.classList.toggle('preview-active', i === index);
    });
  }

  function goLiveSlide(index) {
    if (!state.activeItem || !state.activeItem.slides[index]) return;
    state.activeSlideIndex = index;
    state.previewSlideIndex = index;

    // Turn off blackout / clear states on new slide transition
    state.blackout = false;
    state.clearText = false;
    btnFastBlackout.classList.remove('active-blackout');
    btnFastClear.classList.remove('active-clear');

    // Update active glowing border on slide cards
    const cards = slideTilesGrid.querySelectorAll('.slide-tile-card');
    cards.forEach((c, i) => {
      c.classList.toggle('live-active', i === index);
      c.classList.toggle('preview-active', i === index);
    });

    updateOperatorPreview(index);

    // Auto-launch Projector Output on the TV when going live (Just like OpenLP!)
    if (window.zionApi && !state.displayOpen) {
      const targetScreenId = selectTargetScreen ? selectTargetScreen.value : null;
      window.zionApi.launchDisplay(targetScreenId).then(() => {
        updateTvStatusUI(true);
        setTimeout(() => broadcastDisplayState(), 200);
      });
    }

    broadcastDisplayState();
    triggerAutoSave();
  }

  function nextSlide() {
    if (!state.activeItem || !state.activeItem.slides) return;
    if (state.activeSlideIndex < state.activeItem.slides.length - 1) {
      goLiveSlide(state.activeSlideIndex + 1);
    }
  }

  function prevSlide() {
    if (!state.activeItem || !state.activeItem.slides) return;
    if (state.activeSlideIndex > 0) {
      goLiveSlide(state.activeSlideIndex - 1);
    }
  }

  // =========================================================================
  // 9. LIBRARY RENDERING & CRUD (Songs, Scriptures, Custom)
  // =========================================================================
  function renderSongsList(filter = '') {
    songsListContainer.innerHTML = '';
    const q = filter.trim().toLowerCase();
    const filtered = songsLibrary.filter(s =>
      s.title.toLowerCase().includes(q) ||
      (s.author && s.author.toLowerCase().includes(q)) ||
      s.slides.some(v => v.body.toLowerCase().includes(q))
    );

    filtered.forEach(song => {
      const card = document.createElement('div');
      card.className = 'lib-item-card';
      if (state.activeItem && state.activeItem.id === song.id) card.classList.add('selected');

      const previewText = song.slides[0] ? song.slides[0].body.split('\n')[0] : '';

      card.innerHTML = `
        <div class="lib-item-header">
          <span class="lib-item-title">${escapeHtml(song.title)}</span>
          <span class="lib-item-badge">${song.slides.length} slides</span>
        </div>
        <div class="lib-item-preview">${escapeHtml(song.author ? `${song.author} • ` : '')}${escapeHtml(previewText)}</div>
        <div class="lib-item-actions">
          <button class="btn-mini add-service" title="Add to Order of Service">+ Service</button>
          <button class="btn-mini edit-song" title="Edit Lyrics">Edit</button>
          <button class="btn-mini delete-song" style="color: var(--accent-red);" title="Delete Song">&times;</button>
        </div>
      `;

      // Double-click immediately loads song to live!
      card.addEventListener('dblclick', () => {
        loadPresentationItem(song, 'song', true);
      });

      card.addEventListener('click', (e) => {
        if (e.target.closest('.add-service')) {
          addToServiceOrder('song', song.title, song);
          return;
        }
        if (e.target.closest('.edit-song')) {
          openSongEditor(song);
          return;
        }
        if (e.target.closest('.delete-song')) {
          if (confirm(`Delete song "${song.title}" from library?`)) {
            songsLibrary = songsLibrary.filter(s => s.id !== song.id);
            saveStoredLibrary();
            renderSongsList(songsSearchInput.value);
          }
          return;
        }
        loadPresentationItem(song, 'song', false);
      });

      songsListContainer.appendChild(card);
    });
  }

  function renderCustomSlidesList(filter = '') {
    if (!customSlidesList) {
      renderMediaGallery(mediaSearchInput ? mediaSearchInput.value : '');
      return;
    }
    customSlidesList.innerHTML = '';
    const q = filter.trim().toLowerCase();
    const filtered = customSlidesLibrary.filter(c =>
      c.title.toLowerCase().includes(q) ||
      (c.subtitle && c.subtitle.toLowerCase().includes(q))
    );

    filtered.forEach(custom => {
      const card = document.createElement('div');
      card.className = 'lib-item-card';

      card.innerHTML = `
        <div class="lib-item-header">
          <span class="lib-item-title">${escapeHtml(custom.title)}</span>
          <span class="lib-item-badge">${custom.slides.length} slides</span>
        </div>
        <div class="lib-item-preview">${escapeHtml(custom.subtitle || '')}</div>
        <div class="lib-item-actions">
          <button class="btn-mini add-service" title="Add to Order of Service">+ Service</button>
          <button class="btn-mini delete-custom" style="color: var(--accent-red);" title="Delete Slide">&times;</button>
        </div>
      `;

      card.addEventListener('dblclick', () => {
        loadPresentationItem(custom, 'custom', true);
      });

      card.addEventListener('click', (e) => {
        if (e.target.closest('.add-service')) {
          addToServiceOrder('custom', custom.title, custom);
          return;
        }
        if (e.target.closest('.delete-custom')) {
          if (confirm(`Delete slide "${custom.title}"?`)) {
            customSlidesLibrary = customSlidesLibrary.filter(c => c.id !== custom.id);
            saveStoredLibrary();
            renderCustomSlidesList(customSearchInput.value);
          }
          return;
        }
        loadPresentationItem(custom, 'custom', false);
      });

      customSlidesList.appendChild(card);
    });
  }

  // =========================================================================
  // 10. OFFLINE SCRIPTURE LOOKUP (Bibles: KJV, RSV, GNT)
  // =========================================================================
  async function loadBibleData(version = 'kjv') {
    const safeVer = ['kjv', 'rsv', 'gnt'].includes(String(version).toLowerCase())
      ? String(version).toLowerCase()
      : 'kjv';

    currentBibleVersion = safeVer;
    if (bibleVersionSelect && bibleVersionSelect.value !== safeVer) {
      bibleVersionSelect.value = safeVer;
    }
    if (bibleVersionBadge) {
      bibleVersionBadge.textContent = safeVer.toUpperCase();
    }

    // Check fast in-memory cache
    if (bibleVersionsCache[safeVer]) {
      bibleDatabase = bibleVersionsCache[safeVer];
      populateBibleDropdowns(true);
      doBibleLookup();
      return;
    }

    let data = null;
    if (window.zionApi && window.zionApi.getBibleData) {
      data = await window.zionApi.getBibleData(safeVer);
    }
    if (!data) {
      try {
        const res = await fetch(`assets/bibles/${safeVer}.json`);
        data = await res.json();
      } catch (e) {
        console.warn(`Could not load ${safeVer.toUpperCase()} Bible JSON:`, e);
      }
    }

    if (data && data.books) {
      bibleVersionsCache[safeVer] = data;
      bibleDatabase = data;
      populateBibleDropdowns(true);
      doBibleLookup();
    }
  }

  function populateBibleDropdowns(preserveSelection = false) {
    if (!bibleDatabase || !bibleDatabase.books || !bibleBookSelect) return;
    const books = Object.keys(bibleDatabase.books);

    const savedBook = bibleBookSelect.value;
    bibleBookSelect.innerHTML = '';
    books.forEach(book => {
      const opt = document.createElement('option');
      opt.value = book;
      opt.textContent = book;
      bibleBookSelect.appendChild(opt);
    });

    if (preserveSelection && savedBook && bibleDatabase.books[savedBook]) {
      bibleBookSelect.value = savedBook;
    } else if (bibleDatabase.books['John']) {
      bibleBookSelect.value = 'John';
    } else {
      bibleBookSelect.value = books[0];
    }

    updateChapterDropdown(preserveSelection);
  }

  function updateChapterDropdown(preserveSelection = false) {
    if (!bibleBookSelect || !bibleChapterSelect) return;
    const book = bibleBookSelect.value;
    if (!bibleDatabase || !bibleDatabase.books || !bibleDatabase.books[book]) return;
    const chapters = Object.keys(bibleDatabase.books[book]);

    const savedChapter = bibleChapterSelect.value;
    bibleChapterSelect.innerHTML = '';
    chapters.forEach(ch => {
      const opt = document.createElement('option');
      opt.value = ch;
      opt.textContent = `Ch ${ch}`;
      bibleChapterSelect.appendChild(opt);
    });

    if (preserveSelection && savedChapter && chapters.includes(savedChapter)) {
      bibleChapterSelect.value = savedChapter;
    } else if (chapters.includes('3')) {
      bibleChapterSelect.value = '3';
    } else {
      bibleChapterSelect.value = chapters[0];
    }

    updateVerseDropdown(preserveSelection);
  }

  function updateVerseDropdown(preserveSelection = false) {
    if (!bibleBookSelect || !bibleChapterSelect || !bibleVerseSelect) return;
    const book = bibleBookSelect.value;
    const ch = bibleChapterSelect.value;
    if (!bibleDatabase || !bibleDatabase.books || !bibleDatabase.books[book] || !bibleDatabase.books[book][ch]) return;
    const verses = Object.keys(bibleDatabase.books[book][ch]);

    const savedVerse = bibleVerseSelect.value;
    bibleVerseSelect.innerHTML = '<option value="all">All Verses</option>';
    verses.forEach(v => {
      const opt = document.createElement('option');
      opt.value = v;
      opt.textContent = `v. ${v}`;
      bibleVerseSelect.appendChild(opt);
    });

    if (preserveSelection && savedVerse && (savedVerse === 'all' || verses.includes(savedVerse))) {
      bibleVerseSelect.value = savedVerse;
    } else if (verses.includes('16')) {
      bibleVerseSelect.value = '16';
    }
  }

  async function doBibleLookup(quickQuery = '') {
    if (!bibleDatabase || !bibleDatabase.books) return;
    let targetBook = bibleBookSelect ? bibleBookSelect.value : 'John';
    let targetChapter = bibleChapterSelect ? bibleChapterSelect.value : '3';
    let targetVerse = bibleVerseSelect ? bibleVerseSelect.value : '16';

    const query = (quickQuery || (bibleQuickSearch ? bibleQuickSearch.value : '')).trim();
    if (query) {
      // Check if quick search has version code: kjv, rsv, gnt
      const verMatch = query.match(/\b(kjv|rsv|gnt)\b/i);
      let queryClean = query;
      if (verMatch) {
        const reqVer = verMatch[1].toLowerCase();
        queryClean = query.replace(/\b(kjv|rsv|gnt)\b/gi, '').trim();
        if (reqVer !== currentBibleVersion) {
          await loadBibleData(reqVer);
        }
      }

      // Parse reference query e.g. "John 3:16", "Romans 8:28", "Psalm 23", "Gen 1:1"
      const match = queryClean.match(/^([1-3]?\s?[a-zA-Z]+)\s*(\d+)?:?(\d+)?/i);
      if (match) {
        const rawBook = match[1].trim().toLowerCase();
        const foundBook = Object.keys(bibleDatabase.books).find(b =>
          b.toLowerCase() === rawBook || b.toLowerCase().startsWith(rawBook)
        );
        if (foundBook) {
          targetBook = foundBook;
          targetChapter = match[2] || '1';
          targetVerse = match[3] || 'all';
          if (bibleBookSelect) bibleBookSelect.value = targetBook;
          updateChapterDropdown(false);
          if (bibleChapterSelect) bibleChapterSelect.value = targetChapter;
          updateVerseDropdown(false);
          if (bibleVerseSelect) bibleVerseSelect.value = targetVerse;
        }
      }
    }

    const versionAbbr = bibleDatabase.abbreviation || currentBibleVersion.toUpperCase();
    const chObj = bibleDatabase.books[targetBook] ? bibleDatabase.books[targetBook][targetChapter] : null;
    if (!bibleVersesList) return;
    bibleVersesList.innerHTML = '';

    if (!chObj) {
      bibleVersesList.innerHTML = `<div style="padding: 10px; color: var(--text-muted); font-size: 0.8rem;">No verses found for ${escapeHtml(targetBook)} ${escapeHtml(targetChapter)} (${versionAbbr}).</div>`;
      return;
    }

    const versesToDisplay = (targetVerse && targetVerse !== 'all')
      ? (chObj[targetVerse] ? [targetVerse] : Object.keys(chObj))
      : Object.keys(chObj);

    // Build presentation slides for this scripture
    const scriptureSlides = [];
    versesToDisplay.forEach(vNum => {
      const text = chObj[vNum];
      if (text) {
        scriptureSlides.push({
          label: `${targetBook} ${targetChapter}:${vNum} (${versionAbbr})`,
          body: `"${text}"\n\n— ${targetBook} ${targetChapter}:${vNum} (${versionAbbr})`
        });

        // Add card to library pane
        const vCard = document.createElement('div');
        vCard.className = 'lib-item-card';
        vCard.innerHTML = `
          <div class="lib-item-header">
            <span class="lib-item-title">${escapeHtml(targetBook)} ${targetChapter}:${vNum}</span>
            <span class="lib-item-badge" style="background: rgba(245, 158, 11, 0.2); color: var(--accent-gold);">${versionAbbr}</span>
          </div>
          <div class="lib-item-preview">${escapeHtml(text)}</div>
          <div class="lib-item-actions">
            <button class="btn-mini add-service">+ Service</button>
            <button class="btn-mini send-live" style="color: var(--accent-gold);">Send Live</button>
          </div>
        `;

        const singleItem = {
          id: `scripture-${versionAbbr}-${targetBook}-${targetChapter}-${vNum}`,
          title: `${targetBook} ${targetChapter}:${vNum} (${versionAbbr})`,
          slides: [{
            label: `${targetBook} ${targetChapter}:${vNum} (${versionAbbr})`,
            body: `"${text}"\n\n— ${targetBook} ${targetChapter}:${vNum} (${versionAbbr})`
          }]
        };

        vCard.addEventListener('dblclick', () => {
          loadPresentationItem(singleItem, 'scripture', true);
        });

        vCard.addEventListener('click', (e) => {
          if (e.target.closest('.add-service')) {
            addToServiceOrder('scripture', singleItem.title, singleItem);
            return;
          }
          if (e.target.closest('.send-live')) {
            loadPresentationItem(singleItem, 'scripture', true);
            return;
          }
          loadPresentationItem(singleItem, 'scripture', false);
        });

        bibleVersesList.appendChild(vCard);
      }
    });

    // If multiple verses, add a bulk "All Verses" presentation item at top
    if (scriptureSlides.length > 1) {
      const bulkItem = {
        id: `scripture-${versionAbbr}-${targetBook}-${targetChapter}-all`,
        title: `${targetBook} ${targetChapter}:${versesToDisplay[0]}-${versesToDisplay[versesToDisplay.length - 1]} (${versionAbbr})`,
        slides: scriptureSlides
      };
      const bulkBtn = document.createElement('button');
      bulkBtn.className = 'btn-primary';
      bulkBtn.style.margin = '4px 0 8px 0';
      bulkBtn.style.fontSize = '0.78rem';
      bulkBtn.textContent = `Send Entire Passage Live (${scriptureSlides.length} Verses - ${versionAbbr})`;
      bulkBtn.onclick = () => loadPresentationItem(bulkItem, 'scripture', true);
      bibleVersesList.insertBefore(bulkBtn, bibleVersesList.firstChild);
    }
  }

  // =========================================================================
  // 11. THEMES & BACKGROUND PRESETS
  // =========================================================================
  async function loadBackgroundPresets() {
    let presetsData = null;
    if (window.zionApi && window.zionApi.getBackgroundPresets) {
      presetsData = await window.zionApi.getBackgroundPresets();
    }
    if (!presetsData) {
      try {
        const res = await fetch('assets/backgrounds/presets.json');
        presetsData = await res.json();
      } catch (e) {
        console.warn('Could not load presets:', e);
      }
    }

    if (presetsData && presetsData.presets) {
      backgroundPresets = presetsData.presets;
      renderThemeCards();
    }
  }

  function renderThemesPresetGrid() {
    if (!themesPresetContainer) return;
    themesPresetContainer.innerHTML = '';

    // 1. Built-in Procedural Motion Presets
    backgroundPresets.forEach(preset => {
      const card = document.createElement('div');
      card.className = 'theme-card-preview';
      if (state.backgroundType === 'procedural' && state.backgroundId === preset.id && !state.customBgUrl) {
        card.classList.add('active');
      }

      card.style.background = `linear-gradient(135deg, ${preset.primaryColor} 0%, ${preset.secondaryColor} 50%, ${preset.accentColor} 100%)`;
      card.innerHTML = `
        <span style="font-weight: 700;">${preset.name}</span>
        <span style="font-size: 0.65rem; opacity: 0.75; text-transform: uppercase;">Built-in</span>
      `;

      card.addEventListener('click', () => {
        state.backgroundType = 'procedural';
        state.backgroundId = preset.id;
        state.customBgUrl = '';
        document.querySelectorAll('.theme-card-preview').forEach(c => c.classList.remove('active'));
        card.classList.add('active');
        broadcastDisplayState();
      });

      themesPresetContainer.appendChild(card);
    });

    // 2. Custom User Themes
    customThemes.forEach((theme, index) => {
      const card = document.createElement('div');
      card.className = 'theme-card-preview';
      if (state.customBgUrl === theme.customBgUrl && state.backgroundId === theme.bgId) {
        card.classList.add('active');
      }

      if (theme.bgType === 'procedural') {
        const matchingPreset = backgroundPresets.find(p => p.id === theme.bgId) || backgroundPresets[0];
        if (matchingPreset) {
          card.style.background = `linear-gradient(135deg, ${matchingPreset.primaryColor} 0%, ${matchingPreset.secondaryColor} 50%, ${matchingPreset.accentColor} 100%)`;
        } else {
          card.style.background = 'linear-gradient(135deg, #3b0764 0%, #0f172a 100%)';
        }
      } else if (theme.customBgUrl) {
        const fileUrl = theme.customBgUrl.startsWith('http') || theme.customBgUrl.startsWith('file:') || theme.customBgUrl.startsWith('data:')
          ? theme.customBgUrl
          : 'file:///' + theme.customBgUrl.replace(/\\/g, '/');
        card.style.backgroundImage = `linear-gradient(rgba(0,0,0,0.4), rgba(0,0,0,0.6)), url("${fileUrl}")`;
        card.style.backgroundSize = 'cover';
        card.style.backgroundPosition = 'center';
      } else {
        card.style.background = 'linear-gradient(135deg, #1e1b4b 0%, #090d16 100%)';
      }

      card.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: flex-start; width: 100%;">
          <span style="font-weight: 700; color: #fff;">${escapeHtml(theme.name)}</span>
          <button class="btn-mini btn-del-theme" style="color: var(--accent-red); padding: 1px 4px; font-size: 0.75rem;" title="Delete Theme">&times;</button>
        </div>
        <span style="font-size: 0.65rem; color: var(--accent-gold); text-transform: uppercase;">
          ${escapeHtml(theme.fontFamily || 'Outfit')} • ${theme.fontSize || 44}px
        </span>
      `;

      card.addEventListener('click', (e) => {
        if (e.target.closest('.btn-del-theme')) {
          if (confirm(`Delete custom theme "${theme.name}"?`)) {
            customThemes.splice(index, 1);
            saveStoredLibrary();
            renderThemesPresetGrid();
          }
          return;
        }

        applyTheme(theme);
        document.querySelectorAll('.theme-card-preview').forEach(c => c.classList.remove('active'));
        card.classList.add('active');
      });

      themesPresetContainer.appendChild(card);
    });
  }

  const renderThemeCards = renderThemesPresetGrid;

  function applyTheme(theme) {
    state.backgroundType = theme.bgType || 'procedural';
    state.backgroundId = theme.bgId || 'celestial-clouds';
    state.customBgUrl = theme.customBgUrl || '';

    if (theme.fontFamily) {
      state.fontFamily = theme.fontFamily;
      if (toolbarFontFamily) toolbarFontFamily.value = theme.fontFamily;
    }
    if (theme.fontSize) {
      state.fontSize = parseInt(theme.fontSize, 10);
      if (toolbarFontSize) toolbarFontSize.value = state.fontSize;
      if (badgeFontSize) badgeFontSize.textContent = `${state.fontSize}px`;
    }
    if (theme.fontColor) {
      state.fontColor = theme.fontColor;
      if (toolbarFontColor) toolbarFontColor.value = theme.fontColor;
    }
    if (theme.strokeWidth !== undefined) {
      state.strokeWidth = parseInt(theme.strokeWidth, 10);
      if (toolbarStrokeWidth) toolbarStrokeWidth.value = state.strokeWidth;
      if (badgeStrokeWidth) badgeStrokeWidth.textContent = `${state.strokeWidth}px`;
    }

    broadcastDisplayState();
    triggerAutoSave();
  }

  // =========================================================================
  // 11b. CHURCH MEDIA GALLERY (Images, Videos, Presentations)
  // =========================================================================
  function renderMediaGallery(filter = '') {
    if (!mediaGalleryGrid) return;
    mediaGalleryGrid.innerHTML = '';
    const q = (filter || '').trim().toLowerCase();

    const filteredCustom = customSlidesLibrary.filter(c =>
      c.title.toLowerCase().includes(q) ||
      (c.subtitle && c.subtitle.toLowerCase().includes(q)) ||
      (c.slides && c.slides.some(s => s.body && s.body.toLowerCase().includes(q)))
    );

    const filteredMedia = mediaLibrary.filter(m =>
      m.title.toLowerCase().includes(q) ||
      m.type.toLowerCase().includes(q)
    );

    if (filteredCustom.length === 0 && filteredMedia.length === 0) {
      mediaGalleryGrid.innerHTML = `
        <div style="grid-column: 1 / -1; padding: 24px 12px; text-align: center; color: var(--text-dim); font-size: 0.78rem;">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="margin: 0 auto 8px; display: block; opacity: 0.5;">
            <rect x="3" y="3" width="18" height="18" rx="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline>
          </svg>
          No media files or announcement slides found.<br>Click <strong>+ Announcement Slide</strong>, <strong>+ Upload Image</strong>, or <strong>+ Upload Video</strong> above to add content.
        </div>
      `;
      return;
    }

    // 1. Render Announcements & Sermon Slides
    if (filteredCustom.length > 0) {
      const headerCustom = document.createElement('div');
      headerCustom.className = 'media-section-header';
      headerCustom.style.color = 'var(--accent-gold)';
      headerCustom.innerHTML = `
        <span style="display: flex; align-items: center; gap: 5px;">
          📢 Announcements & Sermon Points
        </span>
        <span class="lib-item-badge" style="background: rgba(245, 158, 11, 0.2); color: var(--accent-gold);">${filteredCustom.length}</span>
      `;
      mediaGalleryGrid.appendChild(headerCustom);

      filteredCustom.forEach(custom => {
        const card = document.createElement('div');
        card.className = 'media-card announcement-card';

        card.innerHTML = `
          <div class="media-thumbnail-box" style="background: linear-gradient(135deg, #1e1b4b 0%, #0f172a 100%); display: flex; flex-direction: column; justify-content: center; align-items: center; padding: 8px; text-align: center;">
            <span class="media-type-pill" style="color: var(--accent-gold); border-color: rgba(245, 158, 11, 0.4);">ANNOUNCEMENT</span>
            <div style="font-size: 0.82rem; font-weight: 800; color: #fff; line-height: 1.2; max-width: 90%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(custom.title)}</div>
            <div style="font-size: 0.68rem; color: var(--accent-cyan); margin-top: 3px;">${custom.slides.length} slide tile${custom.slides.length > 1 ? 's' : ''}</div>
          </div>
          <div class="media-info-bar">
            <span class="media-title-text" title="${escapeHtml(custom.title)}">${escapeHtml(custom.title)}</span>
            <span style="font-size: 0.68rem; color: var(--text-dim); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(custom.subtitle || (custom.slides[0]?.body || ''))}</span>
            <div class="media-card-buttons">
              <button class="btn-mini btn-proj-live" style="color: var(--accent-gold); font-weight: 700;" title="Project Live to TV">⚡ Live</button>
              <button class="btn-mini btn-add-service" title="Add to Sunday Order of Service">+ Service</button>
              <button class="btn-mini btn-del-custom" style="color: var(--accent-red);" title="Delete Announcement">&times;</button>
            </div>
          </div>
        `;

        card.addEventListener('dblclick', () => {
          loadPresentationItem(custom, 'custom', true);
        });

        card.addEventListener('click', (e) => {
          if (e.target.closest('.btn-proj-live')) {
            loadPresentationItem(custom, 'custom', true);
            return;
          }
          if (e.target.closest('.btn-add-service')) {
            addToServiceOrder('custom', custom.title, custom);
            return;
          }
          if (e.target.closest('.btn-del-custom')) {
            if (confirm(`Delete announcement slide "${custom.title}"?`)) {
              customSlidesLibrary = customSlidesLibrary.filter(c => c.id !== custom.id);
              saveStoredLibrary();
              renderMediaGallery(mediaSearchInput ? mediaSearchInput.value : '');
            }
            return;
          }

          loadPresentationItem(custom, 'custom', false);
        });

        mediaGalleryGrid.appendChild(card);
      });
    }

    // 2. Render Uploaded Media Files (Images, Videos)
    if (filteredMedia.length > 0) {
      const headerMedia = document.createElement('div');
      headerMedia.className = 'media-section-header';
      headerMedia.style.color = 'var(--accent-cyan)';
      headerMedia.innerHTML = `
        <span style="display: flex; align-items: center; gap: 5px;">
          🎬 Church Media & Video Backgrounds
        </span>
        <span class="lib-item-badge">${filteredMedia.length}</span>
      `;
      mediaGalleryGrid.appendChild(headerMedia);

      filteredMedia.forEach(item => {
        const card = document.createElement('div');
        card.className = 'media-card';

        const isVideo = item.type === 'video';
        const fileUrl = item.url.startsWith('http') || item.url.startsWith('file:') || item.url.startsWith('data:') 
          ? item.url 
          : 'file:///' + item.url.replace(/\\/g, '/');

        card.innerHTML = `
          <div class="media-thumbnail-box">
            ${isVideo 
              ? `<video class="media-thumb-video" src="${fileUrl}" muted preload="metadata"></video><div style="position: absolute; color: #fff; font-size: 1.2rem; pointer-events: none; text-shadow: 0 2px 4px rgba(0,0,0,0.8);">▶</div>`
              : `<img class="media-thumb-img" src="${fileUrl}" alt="${escapeHtml(item.title)}" onerror="this.src='assets/icon.png'">`
            }
            <span class="media-type-pill">${item.type}</span>
          </div>
          <div class="media-info-bar">
            <span class="media-title-text" title="${escapeHtml(item.title)}">${escapeHtml(item.title)}</span>
            <div class="media-card-buttons">
              <button class="btn-mini btn-proj-live" style="color: var(--accent-gold); font-weight: 700;" title="Project Fullscreen Live to TV">⚡ Project</button>
              <button class="btn-mini btn-set-bg" style="color: var(--accent-cyan);" title="Set as Background Under Lyrics">🎵 Bg</button>
              <button class="btn-mini btn-add-service" title="Add to Sunday Order of Service">+ Service</button>
              <button class="btn-mini btn-del-media" style="color: var(--accent-red);" title="Delete Media">&times;</button>
            </div>
          </div>
        `;

        card.addEventListener('dblclick', () => {
          projectMediaLive(item);
        });

        card.addEventListener('click', (e) => {
          if (e.target.closest('.btn-proj-live')) {
            projectMediaLive(item);
            return;
          }
          if (e.target.closest('.btn-set-bg')) {
            setMediaAsBackground(item);
            return;
          }
          if (e.target.closest('.btn-add-service')) {
            addToServiceOrder('media', item.title, item);
            return;
          }
          if (e.target.closest('.btn-del-media')) {
            if (confirm(`Remove "${item.title}" from Media Library?`)) {
              mediaLibrary = mediaLibrary.filter(m => m.id !== item.id);
              saveStoredLibrary();
              renderMediaGallery(mediaSearchInput ? mediaSearchInput.value : '');
            }
            return;
          }

          // Single click: update preview
          state.backgroundType = isVideo ? 'video' : 'image';
          state.customBgUrl = item.url;
          previewTextTitle.textContent = item.title;
          previewTextBody.textContent = isVideo ? '[Video Media Loop Ready]' : '[Image Graphic Ready]';
        });

        mediaGalleryGrid.appendChild(card);
      });
    }
  }

  function projectMediaLive(item) {
    const isVideo = item.type === 'video';
    state.backgroundType = isVideo ? 'video' : 'image';
    state.customBgUrl = item.url;
    state.clearText = true;
    state.themeOnly = true;
    state.blackout = false;
    btnFastClear.classList.add('active-clear');
    btnFastTheme.classList.add('active-theme');
    btnFastBlackout.classList.remove('active-blackout');

    state.activeItem = {
      id: item.id,
      title: item.title,
      slides: [{ label: item.title, body: '' }]
    };
    state.activeSlideIndex = 0;
    activeItemTitle.textContent = item.title;
    activeItemMeta.textContent = `Media Graphic (${item.type.toUpperCase()})`;
    renderSlideTiles();

    // Auto-launch TV output if closed
    if (window.zionApi && !state.displayOpen) {
      const targetScreenId = selectTargetScreen ? selectTargetScreen.value : null;
      window.zionApi.launchDisplay(targetScreenId).then(() => {
        updateTvStatusUI(true);
        setTimeout(() => broadcastDisplayState(), 200);
      });
    }

    broadcastDisplayState();
  }

  function setMediaAsBackground(item) {
    const isVideo = item.type === 'video';
    state.backgroundType = isVideo ? 'video' : 'image';
    state.customBgUrl = item.url;
    broadcastDisplayState();
    triggerAutoSave();
  }

  // =========================================================================
  // 11c. THEME BUILDER & DROIDCAM INITIALIZATION
  // =========================================================================
  function initThemeBuilderModal() {
    if (!btnOpenThemeBuilder) return;

    btnOpenThemeBuilder.addEventListener('click', () => {
      if (modalThemeBuilder) modalThemeBuilder.classList.add('open');
      updateThemePreview();
    });

    if (themeFormBgType) {
      themeFormBgType.addEventListener('change', () => {
        const val = themeFormBgType.value;
        if (themeCustomFileRow) {
          themeCustomFileRow.style.display = (val === 'image' || val === 'video') ? 'block' : 'none';
        }
        updateThemePreview();
      });
    }

    if (btnBrowseThemeFile) {
      btnBrowseThemeFile.addEventListener('click', async () => {
        if (window.zionApi && window.zionApi.openFileDialog) {
          const res = await window.zionApi.openFileDialog({
            title: 'Choose Background Image or Video for Theme',
            filters: [{ name: 'Media Files', extensions: ['jpg', 'jpeg', 'png', 'webp', 'mp4', 'webm'] }]
          });
          if (res && !res.canceled && res.filePaths.length > 0) {
            themeFormFilePath.value = res.filePaths[0];
            updateThemePreview();
          }
        }
      });
    }

    [themeFormFontFamily, themeFormFontColor, themeFormFontSize, themeFormPreset, themeFormScrim].forEach(el => {
      if (el) el.addEventListener('input', updateThemePreview);
    });

    if (themeFormScrim && badgeThemeScrim) {
      themeFormScrim.addEventListener('input', () => {
        badgeThemeScrim.textContent = `${Math.round(themeFormScrim.value * 100)}%`;
      });
    }

    if (btnSaveCustomTheme) {
      btnSaveCustomTheme.addEventListener('click', () => {
        const name = (themeFormName ? themeFormName.value : '').trim();
        if (!name) {
          alert('Please enter a name for your custom theme.');
          return;
        }

        const newTheme = {
          id: `theme-${Date.now()}`,
          name: name,
          bgType: themeFormBgType ? themeFormBgType.value : 'procedural',
          bgId: themeFormPreset ? themeFormPreset.value : 'celestial-clouds',
          customBgUrl: themeFormFilePath ? themeFormFilePath.value : '',
          fontFamily: themeFormFontFamily ? themeFormFontFamily.value : 'Outfit',
          fontColor: themeFormFontColor ? themeFormFontColor.value : '#ffffff',
          fontSize: themeFormFontSize ? parseInt(themeFormFontSize.value, 10) : 48,
          strokeWidth: 0,
          scrimOpacity: themeFormScrim ? parseFloat(themeFormScrim.value) : 0.45
        };

        customThemes.push(newTheme);
        saveStoredLibrary();
        renderThemesPresetGrid();
        applyTheme(newTheme);
        if (modalThemeBuilder) modalThemeBuilder.classList.remove('open');
      });
    }
  }

  function updateThemePreview() {
    if (!themePreviewBox) return;
    const fontFamily = themeFormFontFamily ? themeFormFontFamily.value : 'Outfit';
    const fontColor = themeFormFontColor ? themeFormFontColor.value : '#ffffff';
    const scrimVal = themeFormScrim ? themeFormScrim.value : 0.45;
    const bgType = themeFormBgType ? themeFormBgType.value : 'procedural';
    const preset = themeFormPreset ? themeFormPreset.value : 'celestial-clouds';
    const filePath = themeFormFilePath ? themeFormFilePath.value : '';

    if (themePreviewText) {
      themePreviewText.style.fontFamily = fontFamily;
      themePreviewText.style.color = fontColor;
    }
    if (themePreviewScrim) {
      themePreviewScrim.style.background = `rgba(0, 0, 0, ${scrimVal})`;
    }

    if (bgType === 'image' && filePath) {
      const formatted = filePath.startsWith('http') || filePath.startsWith('file:') || filePath.startsWith('data:') 
        ? filePath 
        : 'file:///' + filePath.replace(/\\/g, '/');
      themePreviewBox.style.backgroundImage = `url("${formatted}")`;
      themePreviewBox.style.backgroundSize = 'cover';
    } else {
      themePreviewBox.style.backgroundImage = 'none';
      if (preset === 'celestial-clouds') {
        themePreviewBox.style.background = 'radial-gradient(circle at 50% 40%, #581c87 0%, #090d16 100%)';
      } else if (preset === 'golden-sanctuary') {
        themePreviewBox.style.background = 'radial-gradient(circle at 50% 20%, #78350f 0%, #120b04 100%)';
      } else if (preset === 'deep-gradient-pulse') {
        themePreviewBox.style.background = 'linear-gradient(135deg, #0c1a3b 0%, #1e1b4b 100%)';
      } else {
        themePreviewBox.style.background = '#0d111a';
      }
    }
  }

  function initUploadMediaModal() {
    if (btnUploadImage) {
      btnUploadImage.addEventListener('click', () => {
        openMediaUploadModal('image');
      });
    }
    if (btnUploadVideo) {
      btnUploadVideo.addEventListener('click', () => {
        openMediaUploadModal('video');
      });
    }

    if (btnBrowseUploadFile) {
      btnBrowseUploadFile.addEventListener('click', async () => {
        if (!window.zionApi || !window.zionApi.openFileDialog) return;
        const currentType = uploadFormType ? uploadFormType.value : 'image';
        const isVideo = currentType === 'video';
        const filters = isVideo
          ? [{ name: 'Videos', extensions: ['mp4', 'webm', 'mov', 'mkv'] }]
          : [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif'] }];

        const res = await window.zionApi.openFileDialog({
          title: `Select Church ${isVideo ? 'Video' : 'Image'}`,
          filters
        });

        if (res && !res.canceled && res.filePaths.length > 0) {
          const selectedPath = res.filePaths[0];
          if (uploadFormFilePath) uploadFormFilePath.value = selectedPath;
          if (uploadFormTitle && !uploadFormTitle.value.trim()) {
            const parts = selectedPath.split(/[\\/]/);
            const fileName = parts[parts.length - 1];
            uploadFormTitle.value = fileName.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' ');
          }
        }
      });
    }

    if (btnConfirmUploadMedia) {
      btnConfirmUploadMedia.addEventListener('click', () => {
        const title = (uploadFormTitle ? uploadFormTitle.value : '').trim();
        const filePath = (uploadFormFilePath ? uploadFormFilePath.value : '').trim();
        const type = uploadFormType ? uploadFormType.value : 'image';

        if (!title) {
          alert('Please enter a title for this media.');
          return;
        }
        if (!filePath) {
          alert('Please browse and select a media file from your computer.');
          return;
        }

        const newItem = {
          id: `media-${Date.now()}`,
          title: title,
          type: type,
          url: filePath
        };

        mediaLibrary.unshift(newItem);
        saveStoredLibrary();
        renderMediaGallery(mediaSearchInput ? mediaSearchInput.value : '');

        if (modalUploadMedia) modalUploadMedia.classList.remove('open');
      });
    }

    if (mediaSearchInput) {
      mediaSearchInput.addEventListener('input', (e) => {
        renderMediaGallery(e.target.value);
      });
    }
  }

  function openMediaUploadModal(type = 'image') {
    if (uploadMediaTitle) {
      uploadMediaTitle.textContent = type === 'video' ? 'Upload Church Video Loop' : 'Upload Church Image / Flyer';
    }
    if (uploadFormType) uploadFormType.value = type;
    if (uploadFormTitle) uploadFormTitle.value = '';
    if (uploadFormFilePath) uploadFormFilePath.value = '';
    if (modalUploadMedia) modalUploadMedia.classList.add('open');
  }

  function initDroidCamStudio() {
    if (btnProjectPreacher) {
      btnProjectPreacher.addEventListener('click', async () => {
        const droidCam = state.videoDevices.find(d => {
          const lbl = (d.label || '').toLowerCase();
          return lbl.includes('droidcam') || lbl.includes('droid');
        });
        const targetDevice = droidCam || state.videoDevices[0];

        if (!targetDevice) {
          alert('No camera detected. Please open DroidCam on your phone and PC, then click Refresh Cameras.');
          return;
        }

        state.cameraDeviceId = targetDevice.deviceId;
        if (cameraDeviceSelect) cameraDeviceSelect.value = targetDevice.deviceId;

        if (window.zionApi && !state.displayOpen) {
          const targetScreenId = selectTargetScreen ? selectTargetScreen.value : null;
          await window.zionApi.launchDisplay(targetScreenId);
          updateTvStatusUI(true);
        }

        await updateCameraMode('preacher');
        state.clearText = true;
        btnFastClear.classList.add('active-clear');
        broadcastDisplayState();
      });
    }

    if (btnProjectWorshipBg) {
      btnProjectWorshipBg.addEventListener('click', async () => {
        const droidCam = state.videoDevices.find(d => {
          const lbl = (d.label || '').toLowerCase();
          return lbl.includes('droidcam') || lbl.includes('droid');
        });
        const targetDevice = droidCam || state.videoDevices[0];

        if (!targetDevice) {
          alert('No camera detected. Please connect DroidCam via WiFi/USB, then click Refresh.');
          return;
        }

        state.cameraDeviceId = targetDevice.deviceId;
        if (cameraDeviceSelect) cameraDeviceSelect.value = targetDevice.deviceId;

        if (window.zionApi && !state.displayOpen) {
          const targetScreenId = selectTargetScreen ? selectTargetScreen.value : null;
          await window.zionApi.launchDisplay(targetScreenId);
          updateTvStatusUI(true);
        }

        await updateCameraMode('background');
        state.clearText = false;
        btnFastClear.classList.remove('active-clear');
        broadcastDisplayState();
      });
    }

    if (btnCameraOff) {
      btnCameraOff.addEventListener('click', async () => {
        await updateCameraMode('none');
      });
    }
  }

  // =========================================================================
  // 12. SERVICE ORDER TIMELINE (Right Panel)
  // =========================================================================
  let selectedServiceIndex = -1;

  function renderServiceOrderList() {
    serviceOrderList.innerHTML = '';
    serviceOrder.forEach((item, index) => {
      const row = document.createElement('div');
      row.className = 'service-timeline-item';
      if (index === selectedServiceIndex) row.classList.add('active');

      row.innerHTML = `
        <div class="timeline-index-num">${index + 1}</div>
        <div class="timeline-info">
          <span class="timeline-title">${escapeHtml(item.title)}</span>
          <span class="timeline-type-pill">${item.type}</span>
        </div>
      `;

      // Single-click: Load into Center Panel & Operator Preview
      row.addEventListener('click', () => {
        selectedServiceIndex = index;
        document.querySelectorAll('.service-timeline-item').forEach((r, i) => {
          r.classList.toggle('active', i === index);
        });
        loadPresentationItem(item.data, item.type, false);
      });

      // Double-clicking immediately loads item & goes LIVE!
      row.addEventListener('dblclick', () => {
        selectedServiceIndex = index;
        document.querySelectorAll('.service-timeline-item').forEach((r, i) => {
          r.classList.toggle('active', i === index);
        });
        loadPresentationItem(item.data, item.type, true);
      });

      serviceOrderList.appendChild(row);
    });
  }

  function addToServiceOrder(type, title, data) {
    serviceOrder.push({
      id: `svc-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      type,
      title,
      data
    });
    saveStoredLibrary();
    renderServiceOrderList();
  }

  function moveServiceItem(direction) {
    if (selectedServiceIndex < 0) return;
    const targetIdx = selectedServiceIndex + direction;
    if (targetIdx < 0 || targetIdx >= serviceOrder.length) return;

    const temp = serviceOrder[selectedServiceIndex];
    serviceOrder[selectedServiceIndex] = serviceOrder[targetIdx];
    serviceOrder[targetIdx] = temp;
    selectedServiceIndex = targetIdx;

    saveStoredLibrary();
    renderServiceOrderList();
  }

  function removeServiceItem() {
    if (selectedServiceIndex < 0) return;
    serviceOrder.splice(selectedServiceIndex, 1);
    if (selectedServiceIndex >= serviceOrder.length) {
      selectedServiceIndex = serviceOrder.length - 1;
    }
    saveStoredLibrary();
    renderServiceOrderList();
  }

  function clearAllServiceItems() {
    if (confirm('Clear entire Sunday Order of Service?')) {
      serviceOrder = [];
      selectedServiceIndex = -1;
      saveStoredLibrary();
      renderServiceOrderList();
    }
  }

  // =========================================================================
  // 13. MODALS, SONG BUILDER & OPENLP PARSER
  // =========================================================================
  function parseOpenLPLyrics(rawText) {
    const lines = rawText.split('\n');
    let title = 'Imported Worship Song';
    let author = '';
    const slides = [];

    let currentLabel = 'Verse 1';
    let currentBody = [];

    lines.forEach(line => {
      const trimmed = line.trim();
      if (!trimmed) {
        if (currentBody.length > 0) {
          slides.push({ label: currentLabel, body: currentBody.join('\n') });
          currentBody = [];
        }
        return;
      }

      // Metadata headers
      if (trimmed.toLowerCase().startsWith('title:')) {
        title = trimmed.substring(6).trim();
        return;
      }
      if (trimmed.toLowerCase().startsWith('author:')) {
        author = trimmed.substring(7).trim();
        return;
      }

      // Verse/Chorus tags like [Verse 1], [Chorus], [Bridge], [Ending]
      const tagMatch = trimmed.match(/^\[?(verse\s*\d*|chorus\s*\d*|bridge\s*\d*|tag|ending|v\d+|c\d+)\]?$/i);
      if (tagMatch) {
        if (currentBody.length > 0) {
          slides.push({ label: currentLabel, body: currentBody.join('\n') });
          currentBody = [];
        }
        currentLabel = trimmed.replace(/[\[\]]/g, '');
        return;
      }

      currentBody.push(line);
    });

    if (currentBody.length > 0) {
      slides.push({ label: currentLabel, body: currentBody.join('\n') });
    }

    return {
      id: `song-${Date.now()}`,
      title,
      author,
      ccli: '',
      slides: slides.length > 0 ? slides : [{ label: 'Lyrics', body: rawText }]
    };
  }

  let editingSongId = null;
  function openSongEditor(song = null) {
    editingSongId = song ? song.id : null;
    document.getElementById('modal-song-title').textContent = song ? 'Edit Worship Song' : 'Create Worship Song';
    document.getElementById('song-form-title').value = song ? song.title : '';
    document.getElementById('song-form-author').value = song ? (song.author || '') : '';
    document.getElementById('song-form-ccli').value = song ? (song.ccli || '') : '';

    if (song && song.slides) {
      const lyricsJoined = song.slides.map(s => `[${s.label}]\n${s.body}`).join('\n\n');
      document.getElementById('song-form-lyrics').value = lyricsJoined;
    } else {
      document.getElementById('song-form-lyrics').value = '';
    }

    modalSong.classList.add('open');
  }

  // =========================================================================
  // 14. EVENT LISTENERS
  // =========================================================================
  function attachEventListeners() {
    // Top Bar Dynamic Font Size Slider (Eliminates OpenLP Theme Friction)
    if (toolbarFontSize) {
      toolbarFontSize.addEventListener('input', (e) => {
        const val = parseInt(e.target.value, 10);
        state.fontSize = val;
        if (badgeFontSize) badgeFontSize.textContent = `${val}px`;
        broadcastDisplayState();
        triggerAutoSave();
      });
    }

    // Font Family
    if (toolbarFontFamily) {
      toolbarFontFamily.addEventListener('change', (e) => {
        state.fontFamily = e.target.value;
        broadcastDisplayState();
        triggerAutoSave();
      });
    }

    // Font Color
    if (toolbarFontColor) {
      toolbarFontColor.addEventListener('input', (e) => {
        state.fontColor = e.target.value;
        broadcastDisplayState();
        triggerAutoSave();
      });
    }

    // Stroke Outline Slider
    if (toolbarStrokeWidth) {
      toolbarStrokeWidth.addEventListener('input', (e) => {
        const val = parseInt(e.target.value, 10);
        state.strokeWidth = val;
        if (badgeStrokeWidth) badgeStrokeWidth.textContent = `${val}px`;
        broadcastDisplayState();
        triggerAutoSave();
      });
    }

    // Shadow Toggle
    if (btnToggleShadow) {
      btnToggleShadow.addEventListener('click', () => {
        state.dropShadow = !state.dropShadow;
        btnToggleShadow.style.borderColor = state.dropShadow ? 'var(--accent-gold)' : 'var(--border-subtle)';
        btnToggleShadow.style.color = state.dropShadow ? 'var(--accent-gold)' : 'var(--text-main)';
        broadcastDisplayState();
        triggerAutoSave();
      });
    }

    // Text Alignment
    if (btnAlignLeft) {
      btnAlignLeft.addEventListener('click', () => {
        state.textAlign = 'left';
        btnAlignLeft.style.borderColor = 'var(--accent-cyan)';
        if (btnAlignCenter) btnAlignCenter.style.borderColor = 'var(--border-subtle)';
        broadcastDisplayState();
        triggerAutoSave();
      });
    }
    if (btnAlignCenter) {
      btnAlignCenter.addEventListener('click', () => {
        state.textAlign = 'center';
        btnAlignCenter.style.borderColor = 'var(--accent-cyan)';
        if (btnAlignLeft) btnAlignLeft.style.borderColor = 'var(--border-subtle)';
        broadcastDisplayState();
        triggerAutoSave();
      });
    }

    // Master Audience Screen Brightness & Image Booster Quick Shortcut
    if (toolbarBrightness) {
      toolbarBrightness.addEventListener('input', (e) => {
        const val = parseInt(e.target.value, 10);
        state.brightness = isNaN(val) ? 100 : Math.max(0, Math.min(200, val));
        if (badgeBrightness) badgeBrightness.textContent = `${state.brightness}%`;
        broadcastDisplayState();
        triggerAutoSave();
      });
    }

    function resetBrightnessToFull() {
      state.brightness = 100;
      if (toolbarBrightness) toolbarBrightness.value = 100;
      if (badgeBrightness) badgeBrightness.textContent = '100%';
      broadcastDisplayState();
      triggerAutoSave();
    }

    if (labelBrightnessReset) {
      labelBrightnessReset.addEventListener('click', resetBrightnessToFull);
    }
    if (badgeBrightness) {
      badgeBrightness.addEventListener('click', resetBrightnessToFull);
    }

    // Fast Action Buttons: Blackout, Theme Only, Clear
    if (btnFastBlackout) {
      btnFastBlackout.addEventListener('click', () => {
        state.blackout = !state.blackout;
        btnFastBlackout.classList.toggle('active-blackout', state.blackout);
        broadcastDisplayState();
      });
    }

    if (btnFastTheme) {
      btnFastTheme.addEventListener('click', () => {
        state.themeOnly = !state.themeOnly;
        btnFastTheme.classList.toggle('active-theme', state.themeOnly);
        broadcastDisplayState();
      });
    }

    if (btnFastClear) {
      btnFastClear.addEventListener('click', () => {
        state.clearText = !state.clearText;
        btnFastClear.classList.toggle('active-clear', state.clearText);
        broadcastDisplayState();
      });
    }

    // Alert Banner Modal
    if (btnOpenBanner) {
      btnOpenBanner.addEventListener('click', () => {
        if (modalBanner) modalBanner.classList.add('open');
      });
    }

    const btnPubBanner = document.getElementById('btn-publish-banner');
    if (btnPubBanner) {
      btnPubBanner.addEventListener('click', () => {
        const input = document.getElementById('banner-input-text');
        const text = input ? input.value.trim() : '';
        if (text) {
          state.bannerText = text;
          state.bannerActive = true;
          if (btnOpenBanner) {
            btnOpenBanner.style.color = 'var(--accent-red)';
            btnOpenBanner.style.borderColor = 'var(--accent-red)';
          }
        }
        if (modalBanner) modalBanner.classList.remove('open');
        broadcastDisplayState();
        triggerAutoSave();
      });
    }

    const btnClrBanner = document.getElementById('btn-clear-banner');
    if (btnClrBanner) {
      btnClrBanner.addEventListener('click', () => {
        state.bannerText = '';
        state.bannerActive = false;
        const input = document.getElementById('banner-input-text');
        if (input) input.value = '';
        if (btnOpenBanner) {
          btnOpenBanner.style.color = 'var(--text-main)';
          btnOpenBanner.style.borderColor = 'var(--border-subtle)';
        }
        if (modalBanner) modalBanner.classList.remove('open');
        broadcastDisplayState();
        triggerAutoSave();
      });
    }

    // TV Output Launch Button
    if (btnLaunchTv) btnLaunchTv.addEventListener('click', toggleTvOutput);

    // Target Screen Selector (OpenLP style)
    if (selectTargetScreen) {
      selectTargetScreen.addEventListener('change', (e) => {
        const targetId = e.target.value;
        if (window.zionApi) {
          window.zionApi.launchDisplay(targetId).then(() => {
            updateTvStatusUI(true);
            setTimeout(() => broadcastDisplayState(), 200);
          });
        }
      });
    }

    // Identify Screens (Flashes large numbers on displays)
    if (btnIdentifyScreens) {
      btnIdentifyScreens.addEventListener('click', () => {
        if (window.zionApi) {
          window.zionApi.identifyScreens();
        }
      });
    }

    // Snap Control Desk back to Laptop
    if (btnSnapLaptop) {
      btnSnapLaptop.addEventListener('click', () => {
        if (window.zionApi) {
          window.zionApi.moveControlToPrimary();
        }
      });
    }

    // Operator Go Live Button
    if (btnPushLive) {
      btnPushLive.addEventListener('click', () => {
        goLiveSlide(state.previewSlideIndex);
      });
    }

    // Slide Navigation
    if (btnSlideNext) btnSlideNext.addEventListener('click', nextSlide);
    if (btnSlidePrev) btnSlidePrev.addEventListener('click', prevSlide);

    // Library Tabs - Robust Multi-Tab Switcher
    const allTabBtns = document.querySelectorAll('.lib-tab-btn');
    const allPanes = document.querySelectorAll('.tab-pane-content');

    allTabBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const tabId = btn.dataset.tab;
        if (!tabId) return;

        allTabBtns.forEach(b => b.classList.remove('active'));
        allPanes.forEach(p => p.classList.remove('active'));

        btn.classList.add('active');
        const targetPane = document.getElementById(tabId);
        if (targetPane) {
          targetPane.classList.add('active');
        }

        // Auto-refresh pane content when switching tabs
        if (tabId === 'tab-media') {
          renderMediaGallery(mediaSearchInput ? mediaSearchInput.value : '');
        } else if (tabId === 'tab-themes') {
          renderThemesPresetGrid();
        } else if (tabId === 'tab-songs') {
          renderSongsList(songsSearchInput ? songsSearchInput.value : '');
        } else if (tabId === 'tab-bibles') {
          if (!bibleDatabase) loadBibleData();
        } else if (tabId === 'tab-camera') {
          enumerateVideoDevices();
        }
      });
    });

    // Search filters
    if (songsSearchInput) songsSearchInput.addEventListener('input', (e) => renderSongsList(e.target.value));
    if (customSearchInput) customSearchInput.addEventListener('input', (e) => renderCustomSlidesList(e.target.value));

    // Bible Version Switcher & Selectors
    if (bibleVersionSelect) {
      bibleVersionSelect.addEventListener('change', async (e) => {
        await loadBibleData(e.target.value);
        triggerAutoSave();
      });
    }
    if (bibleBookSelect) bibleBookSelect.addEventListener('change', () => updateChapterDropdown(false));
    if (bibleChapterSelect) bibleChapterSelect.addEventListener('change', () => updateVerseDropdown(false));
    if (bibleVerseSelect) bibleVerseSelect.addEventListener('change', () => doBibleLookup());
    if (btnBibleLookup) btnBibleLookup.addEventListener('click', () => doBibleLookup());
    if (bibleQuickSearch) {
      bibleQuickSearch.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') doBibleLookup();
      });
    }

    // Camera hardware dropdown
    if (cameraDeviceSelect) {
      cameraDeviceSelect.addEventListener('change', (e) => {
        state.cameraDeviceId = e.target.value;
        if (state.cameraEnabled) updateCameraMode(state.cameraMode);
        triggerAutoSave();
      });
    }
    if (btnRefreshDevices) btnRefreshDevices.addEventListener('click', enumerateVideoDevices);

    camModeButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        updateCameraMode(btn.dataset.mode);
      });
    });

    if (cameraDimmerSlider) {
      cameraDimmerSlider.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        state.cameraOpacity = val;
        if (badgeCameraDimmer) badgeCameraDimmer.textContent = `${Math.round(val * 100)}%`;
        broadcastDisplayState();
        triggerAutoSave();
      });
    }

    // Browse custom background file (jpg, mp4, etc.)
    if (btnPickCustomBg) {
      btnPickCustomBg.addEventListener('click', async () => {
        if (window.zionApi && window.zionApi.openFileDialog) {
          const res = await window.zionApi.openFileDialog({
            title: 'Select Background Video or Image',
            filters: [{ name: 'Media Files', extensions: ['mp4', 'webm', 'jpg', 'jpeg', 'png', 'webp'] }]
          });
          if (res && !res.canceled && res.filePaths.length > 0) {
            const filePath = res.filePaths[0];
            const isVideo = filePath.endsWith('.mp4') || filePath.endsWith('.webm');
            state.backgroundType = isVideo ? 'video' : 'image';
            state.customBgUrl = filePath;
            broadcastDisplayState();
            triggerAutoSave();
          }
        }
      });
    }

    // Service Title Input
    if (serviceTitleInput) {
      serviceTitleInput.addEventListener('input', () => {
        triggerAutoSave();
      });
    }

    // Service Timeline Reordering Buttons
    if (btnServiceMoveUp) btnServiceMoveUp.addEventListener('click', () => moveServiceItem(-1));
    if (btnServiceMoveDown) btnServiceMoveDown.addEventListener('click', () => moveServiceItem(1));
    if (btnServiceRemove) btnServiceRemove.addEventListener('click', removeServiceItem);
    if (btnServiceClear) btnServiceClear.addEventListener('click', clearAllServiceItems);

    // Save & Load Service Order
    if (btnSaveService) {
      btnSaveService.addEventListener('click', async () => {
        if (window.zionApi && window.zionApi.saveFileDialog) {
          const res = await window.zionApi.saveFileDialog({
            title: 'Save ZionCast Service Order',
            defaultPath: `${serviceTitleInput ? serviceTitleInput.value.replace(/\s+/g, '_') : 'ServiceOrder'}.json`
          });
          if (res && !res.canceled && res.filePath) {
            await window.zionApi.writeFile(res.filePath, JSON.stringify({
              title: serviceTitleInput ? serviceTitleInput.value : 'Service Order',
              items: serviceOrder
            }, null, 2));
            alert('Service order saved successfully!');
          }
        }
      });
    }

    if (btnLoadService) {
      btnLoadService.addEventListener('click', async () => {
        if (window.zionApi && window.zionApi.openFileDialog) {
          const res = await window.zionApi.openFileDialog({
            title: 'Load ZionCast Service Order',
            filters: [{ name: 'Service Order JSON', extensions: ['json'] }]
          });
          if (res && !res.canceled && res.filePaths.length > 0) {
            const fileRes = await window.zionApi.readFile(res.filePaths[0]);
            if (fileRes.success) {
              try {
                const parsed = JSON.parse(fileRes.data);
                if (parsed.items) {
                  serviceOrder = parsed.items;
                  if (parsed.title && serviceTitleInput) serviceTitleInput.value = parsed.title;
                  saveStoredLibrary();
                  renderServiceOrderList();
                }
              } catch (err) {
                alert('Failed to parse service file: ' + err.message);
              }
            }
          }
        }
      });
    }

    // Modals Open Buttons
    const btnAddSongModal = document.getElementById('btn-add-song-modal');
    if (btnAddSongModal) btnAddSongModal.addEventListener('click', () => openSongEditor(null));

    const btnImportSongModal = document.getElementById('btn-import-song-modal');
    if (btnImportSongModal) btnImportSongModal.addEventListener('click', () => {
      if (modalImport) modalImport.classList.add('open');
    });

    const btnAddCustomModal = document.getElementById('btn-add-custom-modal');
    if (btnAddCustomModal) btnAddCustomModal.addEventListener('click', () => {
      if (modalCustom) modalCustom.classList.add('open');
    });

    // Modal Close buttons
    document.querySelectorAll('[data-close]').forEach(btn => {
      btn.addEventListener('click', () => {
        const modalId = btn.dataset.close;
        const targetModal = document.getElementById(modalId);
        if (targetModal) targetModal.classList.remove('open');
      });
    });

    // Save Song Handler
    const btnSaveSong = document.getElementById('btn-save-song');
    if (btnSaveSong) {
      btnSaveSong.addEventListener('click', () => {
        const title = (document.getElementById('song-form-title')?.value || '').trim();
        const author = (document.getElementById('song-form-author')?.value || '').trim();
        const ccli = (document.getElementById('song-form-ccli')?.value || '').trim();
        const rawLyrics = (document.getElementById('song-form-lyrics')?.value || '').trim();

        if (!title) {
          alert('Please enter a song title.');
          return;
        }

        const parsed = parseOpenLPLyrics(`Title: ${title}\nAuthor: ${author}\n\n${rawLyrics}`);
        parsed.ccli = ccli;

        if (editingSongId) {
          const idx = songsLibrary.findIndex(s => s.id === editingSongId);
          if (idx !== -1) songsLibrary[idx] = { ...parsed, id: editingSongId };
        } else {
          songsLibrary.unshift(parsed);
        }

        saveStoredLibrary();
        renderSongsList(songsSearchInput ? songsSearchInput.value : '');
        if (modalSong) modalSong.classList.remove('open');
      });
    }

    // Parse & Import Song Handler
    const btnParseImport = document.getElementById('btn-parse-import');
    if (btnParseImport) {
      btnParseImport.addEventListener('click', () => {
        const raw = (document.getElementById('import-raw-text')?.value || '').trim();
        if (!raw) return;
        const parsed = parseOpenLPLyrics(raw);
        songsLibrary.unshift(parsed);
        saveStoredLibrary();
        renderSongsList(songsSearchInput ? songsSearchInput.value : '');
        if (modalImport) modalImport.classList.remove('open');
        alert(`Imported "${parsed.title}" with ${parsed.slides.length} slides!`);
      });
    }

    // Save Custom Slide Handler
    const btnSaveCustomSlide = document.getElementById('btn-save-custom-slide');
    if (btnSaveCustomSlide) {
      btnSaveCustomSlide.addEventListener('click', () => {
        const title = (document.getElementById('custom-form-title')?.value || '').trim();
        const subtitle = (document.getElementById('custom-form-subtitle')?.value || '').trim();
        const content = (document.getElementById('custom-form-content')?.value || '').trim();
        const theme = document.getElementById('custom-form-theme')?.value || 'celestial-clouds';

        if (!title) {
          alert('Please enter a title for the announcement.');
          return;
        }

        const chunks = content.split(/\n\s*\n/).filter(c => c.trim().length > 0);
        const slides = chunks.map((chunk, i) => ({
          label: chunks.length > 1 ? `Slide ${i + 1}` : 'Notice',
          body: `${title}\n\n${chunk}`
        }));

        const newCustom = {
          id: `custom-${Date.now()}`,
          title,
          subtitle,
          theme,
          slides: slides.length > 0 ? slides : [{ label: 'Notice', body: title }]
        };

        customSlidesLibrary.unshift(newCustom);
        saveStoredLibrary();
        renderCustomSlidesList(customSearchInput ? customSearchInput.value : '');
        renderMediaGallery(mediaSearchInput ? mediaSearchInput.value : '');
        if (modalCustom) modalCustom.classList.remove('open');

        // Reset form inputs for next slide
        const titleEl = document.getElementById('custom-form-title');
        const subEl = document.getElementById('custom-form-subtitle');
        const contEl = document.getElementById('custom-form-content');
        if (titleEl) titleEl.value = '';
        if (subEl) subEl.value = '';
        if (contEl) contEl.value = '';

        // Automatically load newly created announcement into operator desk preview!
        loadPresentationItem(newCustom, 'custom', false);
      });
    }

    // Electron display status changes
    if (window.zionApi && window.zionApi.onDisplayStatusUpdate) {
      window.zionApi.onDisplayStatusUpdate((info) => {
        updateTvStatusUI(info.isOpen);
      });
    }

    if (window.zionApi && window.zionApi.onDisplaysChanged) {
      window.zionApi.onDisplaysChanged(() => {
        queryDisplays();
      });
    }

    // Initialize Theme Builder, Upload Media, and DroidCam Studio
    initThemeBuilderModal();
    initUploadMediaModal();
    initDroidCamStudio();
  }

  // =========================================================================
  // 15. KEYBOARD SHORTCUTS
  // =========================================================================
  function attachKeyboardShortcuts() {
    window.addEventListener('keydown', (e) => {
      // Don't trigger presentation hotkeys while typing inside inputs or textareas
      const activeEl = document.activeElement;
      if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.isContentEditable)) {
        return;
      }

      switch (e.key) {
        case 'ArrowRight':
        case ' ': // Spacebar
          e.preventDefault();
          nextSlide();
          break;

        case 'ArrowLeft':
          e.preventDefault();
          prevSlide();
          break;

        case 'b':
        case 'B':
          e.preventDefault();
          state.blackout = !state.blackout;
          btnFastBlackout.classList.toggle('active-blackout', state.blackout);
          broadcastDisplayState();
          break;

        case 'c':
        case 'C':
          e.preventDefault();
          state.clearText = !state.clearText;
          btnFastClear.classList.toggle('active-clear', state.clearText);
          broadcastDisplayState();
          break;

        case 't':
        case 'T':
          e.preventDefault();
          state.themeOnly = !state.themeOnly;
          btnFastTheme.classList.toggle('active-theme', state.themeOnly);
          broadcastDisplayState();
          break;

        case 'F11':
          e.preventDefault();
          if (window.zionApi && window.zionApi.toggleFullscreen) {
            window.zionApi.toggleFullscreen();
          }
          break;
      }
    });
  }

  // Utility escape HTML
  function escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Boot on DOM ready
  document.addEventListener('DOMContentLoaded', initApp);
})();
