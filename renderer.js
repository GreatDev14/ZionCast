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
    cameraDeviceLabel: '',
    cameraOpacity: 0.75,
    bannerText: '',
    bannerActive: false,
    bannerStyle: 'urgent-red',
    bannerLayout: 'bar',
    bannerAutoDismiss: 60,
    brightness: 100,
    showClockOnTv: false,

    // YouTube Live & Online Stream Player
    youtubeVideoId: '',
    youtubeUrl: '',
    youtubeTitle: '',
    youtubeMuted: false,
    youtubeActive: false,

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

  // Comprehensive Media Formats Support (Any Image & Any Video)
  const ALL_IMAGE_EXTS = new Set([
    'jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'ico', 'tiff', 'tif', 'avif', 'jfif', 'heic', 'heif', 'raw', 'cr2', 'nef'
  ]);
  const ALL_VIDEO_EXTS = new Set([
    'mp4', 'webm', 'mov', 'mkv', 'avi', 'm4v', 'wmv', 'flv', 'ogv', '3gp', 'ts', 'mts', 'm2ts', 'vob', 'mpg', 'mpeg', 'asf', 'divx'
  ]);

  function isVideoFile(pathOrUrl) {
    if (!pathOrUrl) return false;
    const clean = String(pathOrUrl).split('?')[0].split('#')[0];
    const ext = clean.split('.').pop().toLowerCase();
    return ALL_VIDEO_EXTS.has(ext) || clean.toLowerCase().includes('video');
  }

  function isImageFile(pathOrUrl) {
    if (!pathOrUrl) return false;
    const clean = String(pathOrUrl).split('?')[0].split('#')[0];
    const ext = clean.split('.').pop().toLowerCase();
    return ALL_IMAGE_EXTS.has(ext);
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
      subtitle: 'Sunday 10:00 AM • Sanctuary & Online',
      theme: 'celestial-clouds',
      slides: [
        { label: 'Welcome', subtitle: 'Sunday 10:00 AM • Sanctuary & Online', body: '• We are thrilled to worship with you today!\n• Connect • Fellowship • Grow in Christ' },
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
  const btnOpenYoutubeModal = document.getElementById('btn-open-youtube-modal');

  // Camera Studio Controls (Camo, DroidCam, OBS, USB)
  const cameraStatusBadge = document.getElementById('camera-status-badge') || document.getElementById('droidcam-status-badge');
  const btnProjectPreacher = document.getElementById('btn-project-preacher');
  const btnProjectWorshipBg = document.getElementById('btn-project-worship-bg');
  const btnCameraOff = document.getElementById('btn-camera-off');

  // YouTube Live & Online Video Controls
  const modalYoutube = document.getElementById('modal-youtube');
  const youtubeUrlInput = document.getElementById('youtube-url-input');
  const youtubeTitleInput = document.getElementById('youtube-title-input');
  const youtubeMuteToggle = document.getElementById('youtube-mute-toggle');
  const youtubePreviewImg = document.getElementById('youtube-preview-img');
  const youtubePreviewPlaceholder = document.getElementById('youtube-preview-placeholder');
  const youtubePreviewBadge = document.getElementById('youtube-preview-badge');
  const btnSaveYoutubeLibrary = document.getElementById('btn-save-youtube-library');
  const btnProjectYoutubeWorship = document.getElementById('btn-project-youtube-worship');
  const btnProjectYoutubeLive = document.getElementById('btn-project-youtube-live');
  const activeYoutubeBar = document.getElementById('active-youtube-bar');
  const labelActiveYoutubeTitle = document.getElementById('label-active-youtube-title');
  const btnToggleYoutubeMute = document.getElementById('btn-toggle-youtube-mute');
  const btnStopYoutube = document.getElementById('btn-stop-youtube');

  // Mobile Remote Controls
  const btnOpenRemoteModal = document.getElementById('btn-open-remote-modal');
  const modalRemote = document.getElementById('modal-remote');
  const remoteQrImg = document.getElementById('remote-qr-img');
  const remoteUrlDisplay = document.getElementById('remote-url-display');
  const btnCopyRemoteUrl = document.getElementById('btn-copy-remote-url');
  const btnOpenRemoteBrowser = document.getElementById('btn-open-remote-browser');
  const remoteModalStatusText = document.getElementById('remote-modal-status-text');

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

  // Stage Display & Tech Booth Private Alert State
  let stageAlertMessageText = '';
  let stageAlertMessageActive = false;

  // Pre-Service Countdown Timer State
  let countdownTimerId = null;
  let countdownRemainingSec = 300;
  let countdownTotalSec = 300;
  let countdownRunning = false;
  let countdownProjected = false;
  let countdownTitleText = 'Service Begins In';
  let countdownPosition = 'top-right';
  let countdownSize = 'compact';
  let countdownSubText = 'Welcome to Worship';
  let remoteLibraryVersion = 1;
  let remoteControlCountdown = null;

  // Dual-Bible Scripture Comparison State
  let isDualBibleCompare = false;
  let secondaryBibleVersion = 'rsv';
  let secondaryBibleDatabase = null;

  function showToast(message) {
    try {
      let toast = document.getElementById('zioncast-toast-pill');
      if (!toast) {
        toast = document.createElement('div');
        toast.id = 'zioncast-toast-pill';
        toast.style.cssText = 'position:fixed;bottom:48px;right:20px;z-index:9999;background:rgba(15,23,42,0.96);color:#fbbf24;border:1px solid rgba(245,158,11,0.5);padding:10px 16px;border-radius:10px;font-size:0.8rem;font-weight:700;box-shadow:0 10px 28px rgba(0,0,0,0.65);transition:opacity 0.25s ease,transform 0.25s ease;pointer-events:none;opacity:0;transform:translateY(8px);';
        document.body.appendChild(toast);
      }
      toast.textContent = message;
      toast.style.opacity = '1';
      toast.style.transform = 'translateY(0)';
      clearTimeout(toast.__hideTimer);
      toast.__hideTimer = setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(8px)';
      }, 3200);
    } catch (e) {}
  }

  function triggerAutoSave() {
    if (saveDebounceTimer) clearTimeout(saveDebounceTimer);
    saveDebounceTimer = setTimeout(() => {
      persistAllData();
    }, 200);
  }

  // Alias for backward compatibility + push updated catalog/serviceOrder to Mobile Remote
  function saveStoredLibrary() {
    remoteLibraryVersion++;
    triggerAutoSave();
    syncRemoteStatus(true);
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
        bannerStyle: state.bannerStyle,
        bannerLayout: state.bannerLayout,
        bannerAutoDismiss: state.bannerAutoDismiss,
        brightness: typeof state.brightness === 'number' ? state.brightness : 100,
        showClockOnTv: !!state.showClockOnTv,
        countdownPosition: countdownPosition || 'top-right',
        countdownSize: countdownSize || 'compact',
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
        if (s.bannerStyle) state.bannerStyle = s.bannerStyle;
        if (s.bannerLayout) state.bannerLayout = s.bannerLayout;
        if (s.bannerAutoDismiss !== undefined) state.bannerAutoDismiss = s.bannerAutoDismiss;
        if (s.brightness !== undefined) {
          state.brightness = Math.max(0, Math.min(200, s.brightness));
          if (toolbarBrightness) toolbarBrightness.value = state.brightness;
          if (badgeBrightness) badgeBrightness.textContent = `${state.brightness}%`;
        }
        if (s.countdownPosition) {
          countdownPosition = s.countdownPosition;
          const selPos = document.getElementById('countdown-select-position');
          if (selPos) selPos.value = countdownPosition;
        }
        if (s.countdownSize) {
          countdownSize = s.countdownSize;
          const selSz = document.getElementById('countdown-select-size');
          if (selSz) selSz.value = countdownSize;
        }
        if (s.showClockOnTv !== undefined) {
          state.showClockOnTv = !!s.showClockOnTv;
          const btnToggleTvClock = document.getElementById('btn-toggle-tv-clock');
          if (btnToggleTvClock && state.showClockOnTv) {
            btnToggleTvClock.innerHTML = '<span>🕒 TV Clock: ON</span>';
            btnToggleTvClock.style.color = '#10b981';
            btnToggleTvClock.style.borderColor = '#34d399';
            btnToggleTvClock.style.background = 'rgba(16, 185, 129, 0.2)';
          }
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

    // Initial sync (including full Songs/Media/Notices catalog & Order of Service for Mobile Remote)
    broadcastDisplayState();
    syncRemoteStatus(true);

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

  // =========================================================================
  // 4b. NON-BLOCKING TOAST, IN-APP CONFIRM & KEYBOARD FOCUS GUARD (Win32 Safe)
  // =========================================================================
  function ensureRendererFocus() {
    if (window.zionApi && typeof window.zionApi.ensureControlFocus === 'function') {
      window.zionApi.ensureControlFocus();
    }
  }

  function focusInputSafely(el, delayMs = 30) {
    if (!el) return;
    setTimeout(() => {
      ensureRendererFocus();
      try {
        el.focus({ preventScroll: false });
        if (typeof el.setSelectionRange === 'function' && el.type !== 'number' && el.type !== 'color' && el.type !== 'range') {
          const len = (el.value || '').length;
          el.setSelectionRange(len, len);
        }
      } catch (_) {}
    }, delayMs);
  }

  function flashInvalidInput(el) {
    if (!el) return;
    el.classList.add('input-invalid-flash');
    focusInputSafely(el, 15);
    setTimeout(() => el.classList.remove('input-invalid-flash'), 1800);
  }

  function showToast(message, type = 'info') {
    const container = document.getElementById('zc-toast-container');
    if (!container) {
      console.log('[Toast]', type, message);
      return;
    }
    const icons = { success: '✓', warning: '⚠️', error: '✕', info: 'ℹ️' };
    const toast = document.createElement('div');
    toast.className = `zc-toast toast-${type}`;
    toast.innerHTML = `<span>${icons[type] || 'ℹ️'}</span><span>${escapeHtml(String(message))}</span>`;
    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.25s ease';
      setTimeout(() => toast.remove(), 260);
    }, 3400);
  }

  // Prevent any accidental native synchronous window.alert() from detaching Win32 keyboard focus
  window.alert = (msg) => showToast(String(msg || ''), 'warning');

  function askConfirm(message, title = 'Confirm Action', confirmLabel = 'Delete') {
    return new Promise((resolve) => {
      const modal = document.getElementById('modal-confirm-dialog');
      const titleEl = document.getElementById('confirm-modal-title');
      const msgEl = document.getElementById('confirm-modal-message');
      const btnOk = document.getElementById('btn-confirm-ok');
      const btnCancel = document.getElementById('btn-confirm-cancel');
      const btnClose = document.getElementById('btn-confirm-close');
      const prevFocused = document.activeElement;

      if (!modal || !btnOk || !btnCancel) {
        resolve(true);
        return;
      }

      if (titleEl) titleEl.textContent = title;
      if (msgEl) msgEl.textContent = message;
      btnOk.textContent = confirmLabel;
      modal.classList.add('open');
      setTimeout(() => btnOk.focus(), 20);

      let settled = false;
      const finish = (result) => {
        if (settled) return;
        settled = true;
        modal.classList.remove('open');
        window.removeEventListener('keydown', onKey, true);
        btnOk.onclick = null;
        btnCancel.onclick = null;
        if (btnClose) btnClose.onclick = null;
        ensureRendererFocus();
        if (prevFocused && (prevFocused.tagName === 'INPUT' || prevFocused.tagName === 'TEXTAREA')) {
          focusInputSafely(prevFocused, 20);
        }
        resolve(result);
      };

      const onKey = (e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          finish(false);
        } else if (e.key === 'Enter') {
          e.preventDefault();
          e.stopPropagation();
          finish(true);
        }
      };

      window.addEventListener('keydown', onKey, true);
      btnOk.onclick = () => finish(true);
      btnCancel.onclick = () => finish(false);
      if (btnClose) btnClose.onclick = () => finish(false);
    });
  }

  // Global first-click focus recovery: clicking any input/textarea always restores OS window focus immediately
  document.addEventListener('mousedown', (e) => {
    if (!document.hasFocus()) {
      ensureRendererFocus();
    }
    const target = e.target && e.target.closest
      ? e.target.closest('input, textarea, [contenteditable="true"], select')
      : null;
    if (target && !target.disabled && !target.readOnly) {
      if (document.activeElement !== target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
        setTimeout(() => {
          if (document.activeElement !== target) {
            target.focus();
          }
        }, 0);
      }
    }
  }, true);

  async function toggleTvOutput() {
    if (!window.zionApi) {
      showToast('Dual-screen projector management requires ZionCast Desktop.', 'warning');
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
  // 5. DIRECT HARDWARE VIDEO CAPTURE (Camo / DroidCam / OBS / HDMI Capture)
  // =========================================================================
  let activeControlCameraId = null;

  if (window.zionApi && window.zionApi.onReleaseControlCamera) {
    window.zionApi.onReleaseControlCamera(() => {
      // Release Control Desk local preview handle so single-client Windows drivers (e.g. DroidCam / HDMI Capture)
      // can bind exclusively to the Audience TV Output window without NotReadableError!
      if (previewVideoStream && previewVideoStream.srcObject) {
        previewVideoStream.srcObject.getTracks().forEach(t => t.stop());
        previewVideoStream.srcObject = null;
      }
      if (liveVideoStream) liveVideoStream.srcObject = null;
      activeControlCameraId = null;
      if (state.cameraEnabled && labelCameraStatus) {
        labelCameraStatus.textContent = `Camera: ${state.cameraMode.toUpperCase()} LIVE ON TV`;
      }
    });
  }

  
  // =========================================================================
  // CAMERA DEVICE & MULTI-CAM DISPLAY SECTION HELPERS
  // =========================================================================
  function parseCameraDeviceInfo(device, index) {
    const rawLabel = (device && device.label ? device.label : '').trim();
    const low = rawLabel.toLowerCase();
    let cleanName = rawLabel || ('Camera ' + (index + 1));
    let typeBadge = 'USB Camera';
    let camNumber = index + 1;
    let isIriun = false;

    if (low.includes('iriun') || low.includes('irium')) {
      isIriun = true;
      typeBadge = 'Iriun Wireless Cam';
      const numMatch = rawLabel.match(/#\s*(\d+)|(?:cam(?:era)?\s*)(\d+)|\((\d+)\)/i);
      if (numMatch) {
        camNumber = parseInt(numMatch[1] || numMatch[2] || numMatch[3], 10);
      } else {
        camNumber = 1;
      }
      cleanName = 'Iriun Webcam (Cam ' + camNumber + ')';
    } else if (low.includes('droidcam') || low.includes('droid')) {
      typeBadge = 'DroidCam Wireless';
      const numMatch = rawLabel.match(/#\s*(\d+)|(?:source\s*)(\d+)|\((\d+)\)/i);
      camNumber = numMatch ? parseInt(numMatch[1] || numMatch[2] || numMatch[3], 10) : (index + 1);
      cleanName = 'DroidCam Video (Cam ' + camNumber + ')';
    } else if (low.includes('camo')) {
      typeBadge = 'Camo Studio';
      cleanName = 'Camo Studio Cam';
    } else if (low.includes('obs')) {
      typeBadge = 'OBS Studio';
      cleanName = 'OBS Virtual Camera';
    } else if (low.includes('capture') || low.includes('elgato') || low.includes('cam link') || low.includes('atem') || low.includes('hdmi')) {
      typeBadge = 'HDMI Capture';
      cleanName = 'HDMI Video Capture';
    }

    return {
      deviceId: device ? device.deviceId : '',
      rawLabel: rawLabel,
      cleanName: cleanName,
      typeBadge: typeBadge,
      camNumber: camNumber,
      isIriun: isIriun
    };
  }

  let cameraCardStreams = new Map();

  function stopAllCameraCardStreams() {
    cameraCardStreams.forEach((stream) => {
      if (stream && stream.getTracks) {
        stream.getTracks().forEach(t => t.stop());
      }
    });
    cameraCardStreams.clear();
  }

  
  // Probe active live signal for a camera device (detects live phone vs idle logo)
  async function probeCameraSignal(deviceId) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: { exact: deviceId }, width: { ideal: 64 }, height: { ideal: 48 } },
        audio: false
      });
      const v = document.createElement('video');
      v.muted = true;
      v.srcObject = stream;
      await v.play();
      await new Promise(r => setTimeout(r, 200));

      const c = document.createElement('canvas');
      c.width = 16;
      c.height = 12;
      const ctx = c.getContext('2d');
      ctx.drawImage(v, 0, 0, 16, 12);
      const f1 = ctx.getImageData(0, 0, 16, 12).data;

      await new Promise(r => setTimeout(r, 180));
      ctx.drawImage(v, 0, 0, 16, 12);
      const f2 = ctx.getImageData(0, 0, 16, 12).data;

      let diff = 0;
      for (let i = 0; i < f1.length; i += 4) {
        diff += Math.abs(f1[i] - f2[i]) + Math.abs(f1[i+1] - f2[i+1]) + Math.abs(f1[i+2] - f2[i+2]);
      }
      const avgDiff = diff / (16 * 12);
      stream.getTracks().forEach(t => t.stop());

      // Live camera feeds have real sensor noise/light change (avgDiff > 0.05).
      // Disconnected idle splash screens (Camo, Iriun, SplitCam, DroidCam idle) have diff = 0.
      return avgDiff > 0.04;
    } catch (e) {
      return false;
    }
  }

  let filterConnectedCamerasOnly = true;

  async function enumerateVideoDevices() {
    try {
      let devices = await navigator.mediaDevices.enumerateDevices();
      let videoInputs = devices.filter(d => d.kind === 'videoinput');

      // Prime permission once if Chromium hasn't unlocked deviceIds/labels yet
      if (videoInputs.length > 0 && videoInputs.every(d => !d.deviceId && !d.label)) {
        try {
          const tempStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
          tempStream.getTracks().forEach(t => t.stop());
          devices = await navigator.mediaDevices.enumerateDevices();
          videoInputs = devices.filter(d => d.kind === 'videoinput');
        } catch (permErr) {
          console.warn('Camera permission prime skipped:', permErr);
        }
      }

      state.videoDevices = videoInputs;

      // Fast background probe to detect which cameras are actively connected to a phone/device
      (async () => {
        for (const d of videoInputs) {
          const isVirtual = /camo|iriun|irium|droidcam|droid|splitcam|obs/i.test(d.label || '');
          if (isVirtual) {
            d.isLiveDevice = await probeCameraSignal(d.deviceId);
          } else {
            d.isLiveDevice = true;
          }
        }
        if (state.cameraDisplaySectionOpen) {
          renderCameraDisplaySection();
        }
      })();

      cameraDeviceSelect.innerHTML = '';
      if (videoInputs.length === 0) {
        cameraDeviceSelect.innerHTML = '<option value="">No camera devices found</option>';
        labelCameraStatus.textContent = 'Camera: No Hardware';
        const badge = cameraStatusBadge;
        if (badge) {
          badge.textContent = '⚠️ No Camera Detected';
          badge.className = 'camera-status-pill offline';
        }
        return;
      }

      // Check specifically for Camo, DroidCam, and OBS
      const camoCam = videoInputs.find(d => (d.label || '').toLowerCase().includes('camo'));
      const droidCam = videoInputs.find(d => {
        const lbl = (d.label || '').toLowerCase();
        return lbl.includes('droidcam') || lbl.includes('droid');
      });
      const obsCam = videoInputs.find(d => (d.label || '').toLowerCase().includes('obs'));
      const hdmiCapture = videoInputs.find(d => {
        const lbl = (d.label || '').toLowerCase();
        return lbl.includes('capture') || lbl.includes('elgato') || lbl.includes('cam link') || lbl.includes('atem') || lbl.includes('hdmi');
      });

      videoInputs.forEach((device, index) => {
        const option = document.createElement('option');
        option.value = device.deviceId;
        option.dataset.rawLabel = device.label || '';
        let label = device.label || `Camera ${index + 1}`;
        const low = label.toLowerCase();
        if (low.includes('camo')) {
          label = `✨ ${label} (Camo Studio)`;
        } else if (low.includes('droidcam') || low.includes('droid')) {
          label = `📱 ${label} (DroidCam)`;
        } else if (low.includes('obs')) {
          label = `🎬 ${label} (OBS Virtual Cam)`;
        } else if (low.includes('capture') || low.includes('elgato') || low.includes('cam link') || low.includes('atem') || low.includes('hdmi')) {
          label = `📡 ${label} (HDMI Capture Card)`;
        } else {
          label = `📹 ${label}`;
        }
        option.textContent = label;
        cameraDeviceSelect.appendChild(option);
      });

      // Update badge with active camera platform info
      const badge = cameraStatusBadge;
      if (badge) {
        badge.className = 'camera-status-pill';
        if (camoCam) {
          badge.textContent = '✨ Camo Connected';
          badge.classList.add('camo-active');
        } else if (droidCam) {
          badge.textContent = '📱 DroidCam Connected';
        } else if (obsCam) {
          badge.textContent = '🎬 OBS Cam Connected';
          badge.classList.add('obs-active');
        } else if (hdmiCapture) {
          badge.textContent = '📡 HDMI Capture Ready';
        } else if (videoInputs.length > 0) {
          badge.textContent = `📹 ${videoInputs.length} Camera(s) Ready`;
        } else {
          badge.textContent = '⚠️ No Camera Detected';
          badge.classList.add('offline');
        }
      }

      // Verify saved cameraDeviceId actually exists in current hardware list; otherwise pick priority device
      const savedExists = state.cameraDeviceId && videoInputs.some(d => d.deviceId === state.cameraDeviceId);
      if (!savedExists) {
        const chosen = camoCam || droidCam || obsCam || hdmiCapture || videoInputs[0];
        if (chosen) {
          state.cameraDeviceId = chosen.deviceId;
          state.cameraDeviceLabel = chosen.label || '';
        }
      } else {
        const matched = videoInputs.find(d => d.deviceId === state.cameraDeviceId);
        if (matched) state.cameraDeviceLabel = matched.label || '';
      }

      if (state.cameraDeviceId && cameraDeviceSelect) {
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

    if (state.cameraEnabled) {
      // Ensure YouTube layer (z-index 15) is turned off so it never covers the live camera on TV!
      if (state.backgroundType === 'youtube' || state.youtubeActive) {
        state.youtubeActive = false;
        state.youtubeVideoId = '';
        state.backgroundType = 'procedural';
        const prevYtOverlay = document.getElementById('preview-youtube-overlay');
        if (prevYtOverlay) prevYtOverlay.classList.remove('active');
        const liveYtOverlay = document.getElementById('live-youtube-overlay');
        if (liveYtOverlay) liveYtOverlay.classList.remove('active');
        if (activeYoutubeBar) activeYoutubeBar.style.display = 'none';
      }

      state.blackout = false;
      if (btnFastBlackout) btnFastBlackout.classList.remove('active-blackout');

      const matchedDev = state.videoDevices.find(d => d.deviceId === state.cameraDeviceId) || state.videoDevices[0];
      if (matchedDev) {
        if (!state.cameraDeviceId) state.cameraDeviceId = matchedDev.deviceId;
        state.cameraDeviceLabel = matchedDev.label || '';
      }

      const isAlreadyActive = previewVideoStream.srcObject &&
        previewVideoStream.srcObject.getVideoTracks().some(t => t.readyState === 'live') &&
        activeControlCameraId === state.cameraDeviceId;

      // Bind live video stream to operator monitors so the operator ALWAYS sees what the camera is showing!
      if (!isAlreadyActive) {
        if (previewVideoStream.srcObject) {
          previewVideoStream.srcObject.getTracks().forEach(t => t.stop());
          previewVideoStream.srcObject = null;
          liveVideoStream.srcObject = null;
        }
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            video: state.cameraDeviceId
              ? { deviceId: { exact: state.cameraDeviceId }, width: { ideal: 1280 }, height: { ideal: 720 } }
              : { width: { ideal: 1280 }, height: { ideal: 720 } },
            audio: false
          });
          activeControlCameraId = state.cameraDeviceId;
          previewVideoStream.srcObject = stream;
          liveVideoStream.srcObject = stream;
          previewVideoStream.play().catch(e => console.warn('Preview video play error:', e));
          liveVideoStream.play().catch(e => console.warn('Live video play error:', e));
        } catch (e) {
          console.warn('Could not bind monitor camera streams with exact ID, trying fallback:', e);
          try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
            activeControlCameraId = state.cameraDeviceId;
            previewVideoStream.srcObject = stream;
            liveVideoStream.srcObject = stream;
            previewVideoStream.play().catch(() => {});
            liveVideoStream.play().catch(() => {});
          } catch (err) {
            console.warn('Operator local preview unavailable (TV Output will still acquire camera directly):', err);
          }
        }
      }
      previewVideoStream.style.display = 'block';
      liveVideoStream.style.display = 'block';
      labelCameraStatus.textContent = `Camera: ${mode.toUpperCase()} Live`;
      const statusCamInfo = document.getElementById('status-camera-info');
      if (statusCamInfo) statusCamInfo.style.display = 'inline-flex';
    } else {
      if (previewVideoStream.srcObject) {
        previewVideoStream.srcObject.getTracks().forEach(t => t.stop());
      }
      activeControlCameraId = null;
      previewVideoStream.srcObject = null;
      liveVideoStream.srcObject = null;
      previewVideoStream.style.display = 'none';
      liveVideoStream.style.display = 'none';
      labelCameraStatus.textContent = 'Camera: Standby';
      const statusCamInfo = document.getElementById('status-camera-info');
      if (statusCamInfo) statusCamInfo.style.display = 'none';
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
        isDualComparison: !!s.isDualComparison,
        dualPrimary: s.dualPrimary || null,
        dualSecondary: s.dualSecondary || null,
        index: state.activeSlideIndex + 1,
        total: state.activeItem.slides.length
      };
    }

    const payload = {
      activeSlide,
      activeItem: state.activeItem ? {
        title: state.activeItem.title,
        type: state.activeItem.type || state.activeItemSource || ''
      } : null,
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
      cameraDeviceLabel: state.cameraDeviceLabel || '',
      cameraOpacity: state.cameraOpacity,
      bannerText: state.bannerText,
      bannerActive: state.bannerActive,
      bannerStyle: state.bannerStyle || 'urgent-red',
      bannerLayout: state.bannerLayout || 'bar',
      bannerAutoDismiss: state.bannerAutoDismiss || 0,
      brightness: typeof state.brightness === 'number' ? state.brightness : 100,
      youtubeVideoId: state.youtubeVideoId || '',
      youtubeUrl: state.youtubeUrl || '',
      youtubeTitle: state.youtubeTitle || '',
      youtubeMuted: !!state.youtubeMuted,
      youtubeActive: !!state.youtubeActive,
      showClockOnTv: !!state.showClockOnTv,
      countdownActive: !!countdownProjected,
      countdownRunning: !!countdownRunning,
      countdownRemaining: Math.floor(countdownRemainingSec),
      countdownTotal: Math.floor(countdownTotalSec),
      countdownTitle: countdownTitleText || 'Service Begins In',
      countdownPosition: countdownPosition || 'top-right',
      countdownSize: countdownSize || 'compact',
      countdownSub: countdownSubText || 'Welcome to Worship'
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

    // Synchronize Connected Mobile Wi-Fi Remotes
    syncRemoteStatus();
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
      const pTitle = payload.activeItem ? (payload.activeItem.title || '').trim() : '';
      const pLabel = payload.activeSlide ? (payload.activeSlide.label || '').trim() : '';
      if (pTitle && pLabel) {
        liveTextTitle.textContent = (pTitle.toLowerCase() === pLabel.toLowerCase()) ? pTitle : `${pTitle} • ${pLabel}`;
      } else {
        liveTextTitle.textContent = pTitle || pLabel;
      }
      const liveTextSub = document.getElementById('live-text-subtitle');
      if (liveTextSub) {
        const sub = (payload.activeSlide && payload.activeSlide.subtitle) || (payload.activeItem && payload.activeItem.subtitle) || '';
        if (sub && !payload.clearText && !payload.themeOnly && !payload.blackout) {
          liveTextSub.textContent = sub;
          liveTextSub.classList.add('active');
          liveTextSub.style.display = 'block';
        } else {
          liveTextSub.textContent = '';
          liveTextSub.classList.remove('active');
          liveTextSub.style.display = 'none';
        }
      }
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

    // Mirror Nursery / Congregation Alert Banner on Live Monitor
    const liveBanner = document.getElementById('live-banner-overlay');
    if (liveBanner) {
      if (payload.bannerActive && payload.bannerText) {
        const style = payload.bannerStyle || 'urgent-red';
        let icon = '📢';
        if (style === 'urgent-red') icon = '🚨';
        else if (style === 'amber-warning') icon = '⚠️';
        else if (style === 'royal-blue') icon = '📢';
        else if (style === 'celebration-green') icon = '🕊️';
        else if (style === 'obsidian-glass') icon = '✨';
        liveBanner.textContent = `${icon} ${payload.bannerText}`;
        liveBanner.className = `monitor-banner-overlay active ${style}`;
      } else {
        liveBanner.className = 'monitor-banner-overlay';
      }
    }

    // Mirror YouTube Live overlay & stream control bar
    const liveYtOverlay = document.getElementById('live-youtube-overlay');
    const liveYtThumb = document.getElementById('live-youtube-thumb');
    const activeYtBar = document.getElementById('active-youtube-bar');
    const labelActiveYtTitle = document.getElementById('label-active-youtube-title');

    if (payload.youtubeActive && payload.youtubeVideoId && !payload.blackout) {
      if (liveYtOverlay) {
        liveYtOverlay.classList.add('active');
        if (liveYtThumb) {
          liveYtThumb.src = `https://img.youtube.com/vi/${payload.youtubeVideoId}/hqdefault.jpg`;
        }
      }
      if (activeYtBar) {
        activeYtBar.style.display = 'flex';
        if (labelActiveYtTitle) {
          labelActiveYtTitle.textContent = payload.youtubeTitle || 'YouTube Live Stream';
        }
      }
    } else {
      if (liveYtOverlay) {
        liveYtOverlay.classList.remove('active');
      }
      if (activeYtBar && (!payload.youtubeActive || !payload.youtubeVideoId)) {
        activeYtBar.style.display = 'none';
      }
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
    } else if (bgId === 'sacred-light-rays') {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#0a0d14');
      g.addColorStop(1, '#020408');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = 'rgba(254, 240, 138, 0.15)';
      ctx.beginPath();
      ctx.moveTo(w * 0.5, 0);
      ctx.lineTo(w * 0.2, h);
      ctx.lineTo(w * 0.8, h);
      ctx.closePath();
      ctx.fill();
    } else if (bgId === 'living-waters') {
      const g = ctx.createLinearGradient(0, 0, w, h);
      g.addColorStop(0, '#021526');
      g.addColorStop(0.5, '#032b44');
      g.addColorStop(1, '#010c14');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    } else if (bgId === 'heavenly-dawn') {
      const g = ctx.createRadialGradient(w * 0.5, h * 0.6, 20, w * 0.5, h * 0.5, w * 0.7);
      g.addColorStop(0, '#be185d');
      g.addColorStop(0.5, '#831843');
      g.addColorStop(1, '#05020a');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    } else if (bgId === 'holy-fire') {
      const g = ctx.createRadialGradient(w * 0.5, h * 0.9, 20, w * 0.5, h * 0.6, w * 0.6);
      g.addColorStop(0, '#ef4444');
      g.addColorStop(0.5, '#7f1d1d');
      g.addColorStop(1, '#0f0202');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    } else if (bgId === 'starlight-firmament') {
      ctx.fillStyle = '#030014';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = 'rgba(99, 102, 241, 0.15)';
      ctx.beginPath();
      ctx.arc(w * 0.5, h * 0.5, w * 0.4, 0, Math.PI * 2);
      ctx.fill();
    } else if (bgId === 'cross-majesty') {
      const g = ctx.createRadialGradient(w * 0.5, h * 0.38, 8, w * 0.5, h * 0.45, w * 0.62);
      g.addColorStop(0, '#5a2d08');
      g.addColorStop(0.5, '#1f0f03');
      g.addColorStop(1, '#050301');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      const cw = Math.max(5, h * 0.036);
      const ch = h * 0.52;
      const bw = h * 0.30;
      ctx.fillStyle = 'rgba(10, 5, 2, 0.85)';
      ctx.fillRect(w * 0.5 - cw * 0.5, h * 0.18, cw, ch);
      ctx.fillRect(w * 0.5 - bw * 0.5, h * 0.18 + ch * 0.24, bw, cw);
    } else if (bgId === 'calvary-cross-glory') {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#160826');
      g.addColorStop(0.55, '#4a1242');
      g.addColorStop(1, '#451a03');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      const halo = ctx.createRadialGradient(w * 0.5, h * 0.38, 4, w * 0.5, h * 0.38, h * 0.36);
      halo.addColorStop(0, 'rgba(254, 240, 138, 0.45)');
      halo.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = halo;
      ctx.fillRect(0, 0, w, h);
      const cw = Math.max(5, h * 0.034);
      const ch = h * 0.56;
      const bw = h * 0.32;
      ctx.fillStyle = 'rgba(254, 240, 138, 0.65)';
      ctx.fillRect(w * 0.5 - cw * 0.5, h * 0.17, cw, ch);
      ctx.fillRect(w * 0.5 - bw * 0.5, h * 0.17 + ch * 0.23, bw, cw);
    } else if (bgId === 'royal-crown-velvet') {
      const g = ctx.createLinearGradient(0, 0, w, h);
      g.addColorStop(0, '#17072b');
      g.addColorStop(0.55, '#4c1d95');
      g.addColorStop(1, '#291504');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    } else if (bgId === 'holy-communion-crimson') {
      const g = ctx.createRadialGradient(w * 0.5, h * 0.75, 10, w * 0.5, h * 0.5, w * 0.7);
      g.addColorStop(0, '#6b0820');
      g.addColorStop(0.5, '#360411');
      g.addColorStop(1, '#0d0104');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    } else if (bgId === 'dove-celestial-sky') {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#075985');
      g.addColorStop(0.5, '#082f49');
      g.addColorStop(1, '#020b16');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    } else if (bgId === 'shekinah-glory-gold') {
      const g = ctx.createRadialGradient(w * 0.5, h * 0.45, 10, w * 0.5, h * 0.5, w * 0.7);
      g.addColorStop(0, '#713f12');
      g.addColorStop(0.5, '#3f2008');
      g.addColorStop(1, '#0c0702');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    } else if (bgId === 'emerald-sanctuary') {
      const g = ctx.createLinearGradient(0, 0, w, h);
      g.addColorStop(0, '#021c14');
      g.addColorStop(0.5, '#064e3b');
      g.addColorStop(1, '#02100b');
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
    if (type === 'youtube' || (item && item.type === 'youtube')) {
      const vid = item.videoId || extractYouTubeId(item.url);
      state.backgroundType = 'youtube';
      state.youtubeVideoId = vid;
      state.youtubeUrl = item.url || (vid ? `https://www.youtube.com/watch?v=${vid}` : '');
      state.youtubeTitle = item.title || 'YouTube Live Stream';
      state.youtubeActive = true;
      state.youtubeMuted = false;
      state.customBgUrl = '';
      state.clearText = true;
      if (!item.slides) {
        item = {
          ...item,
          slides: [{ label: item.title, body: '' }]
        };
      }
    } else if (type === 'media') {
      const isVideo = isVideoFile(item.url || item.title || item.type) || item.type === 'video';
      state.youtubeActive = false;
      state.youtubeVideoId = '';
      if (activeYoutubeBar) activeYoutubeBar.style.display = 'none';
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

    const itemT = (state.activeItem.title || '').trim();
    const slideL = (slide.label || '').trim();
    previewTextTitle.textContent = (itemT.toLowerCase() === slideL.toLowerCase()) ? itemT : `${itemT} • ${slideL}`;
    const previewTextSub = document.getElementById('preview-text-subtitle');
    if (previewTextSub) {
      const sub = slide.subtitle || state.activeItem.subtitle || '';
      if (sub) {
        previewTextSub.textContent = sub;
        previewTextSub.classList.add('active');
        previewTextSub.style.display = 'block';
      } else {
        previewTextSub.textContent = '';
        previewTextSub.classList.remove('active');
        previewTextSub.style.display = 'none';
      }
    }
    previewTextBody.textContent = slide.body;

    // Highlight preview tile
    const cards = slideTilesGrid.querySelectorAll('.slide-tile-card');
    cards.forEach((c, i) => {
      c.classList.toggle('preview-active', i === index);
    });

    // YouTube preview overlay
    const prevYtOverlay = document.getElementById('preview-youtube-overlay');
    const prevYtThumb = document.getElementById('preview-youtube-thumb');
    if (prevYtOverlay) {
      if ((state.backgroundType === 'youtube' || (state.activeItem && state.activeItem.type === 'youtube')) && state.youtubeVideoId) {
        prevYtOverlay.classList.add('active');
        if (prevYtThumb) {
          prevYtThumb.src = `https://img.youtube.com/vi/${state.youtubeVideoId}/hqdefault.jpg`;
        }
      } else {
        prevYtOverlay.classList.remove('active');
      }
    }
  }

  function goLiveSlide(index) {
    if (!state.activeItem || !state.activeItem.slides[index]) return;
    state.activeSlideIndex = index;
    state.previewSlideIndex = index;

    const slide = state.activeItem.slides[index];
    const hasBody = !!(slide && slide.body && slide.body.trim().length > 0);
    const itemType = state.activeItem.type || state.activeItemSource || '';

    state.blackout = false;
    btnFastBlackout.classList.remove('active-blackout');

    if (itemType === 'youtube') {
      const vid = state.activeItem.videoId || extractYouTubeId(state.activeItem.url);
      if (vid) {
        state.backgroundType = 'youtube';
        state.youtubeVideoId = vid;
        state.youtubeActive = true;
      }
      state.clearText = true;
      state.themeOnly = true;
      btnFastClear.classList.add('active-clear');
      btnFastTheme.classList.add('active-theme');
    } else if (!hasBody) {
      // Pure image/video media slide: keep text hidden so title badge doesn't cover media
      state.clearText = true;
      state.themeOnly = true;
      btnFastClear.classList.add('active-clear');
      btnFastTheme.classList.add('active-theme');
    } else {
      // Song, Scripture, or Custom Announcement with text: ensure text is visible on TV!
      state.clearText = false;
      state.themeOnly = false;
      btnFastClear.classList.remove('active-clear');
      btnFastTheme.classList.remove('active-theme');
      // If unmuted Fullscreen YouTube Live was previously playing, switch back to worship background
      if (state.backgroundType === 'youtube' && !state.youtubeMuted) {
        state.youtubeActive = false;
        state.youtubeVideoId = '';
        state.backgroundType = 'procedural';
        if (activeYoutubeBar) activeYoutubeBar.style.display = 'none';
      }
    }

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
          askConfirm(`Delete song "${song.title}" from library?`, 'Delete Song', 'Delete').then((yes) => {
            if (yes) {
              songsLibrary = songsLibrary.filter(s => s.id !== song.id);
              saveStoredLibrary();
              renderSongsList(songsSearchInput ? songsSearchInput.value : '');
              showToast(`Deleted "${song.title}"`, 'info');
            }
          });
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
          askConfirm(`Delete slide "${custom.title}"?`, 'Delete Slide', 'Delete').then((yes) => {
            if (yes) {
              customSlidesLibrary = customSlidesLibrary.filter(c => c.id !== custom.id);
              saveStoredLibrary();
              renderCustomSlidesList(customSearchInput ? customSearchInput.value : '');
              showToast(`Deleted "${custom.title}"`, 'info');
            }
          });
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

      const BOOK_ALIASES = {
        gn: 'Genesis', dt: 'Deuteronomy', jsh: 'Joshua', jdg: 'Judges', sm: '1 Samuel',
        ps: 'Psalms', psalm: 'Psalms', prv: 'Proverbs', sg: 'Song of Solomon', song: 'Song of Solomon',
        mt: 'Matthew', mk: 'Mark', mrk: 'Mark', lk: 'Luke', luk: 'Luke', jn: 'John', jhn: 'John',
        rm: 'Romans', php: 'Philippians', col: 'Colossians', heb: 'Hebrews', jas: 'James',
        jm: 'James', jud: 'Jude', rv: 'Revelation'
      };
      // Parse reference query e.g. "John 3:16", "John 3:16-18", "1 Cor 13:4", "Psalm 23", or full-text keyword search
      const match = queryClean.match(/^([1-3]?\s*[a-zA-Z][a-zA-Z\s]*?)\s*(\d+)(?:\s*:\s*(\d+)(?:\s*-\s*(\d+))?)?$/i)
        || queryClean.match(/^([1-3]?\s*[a-zA-Z]+)$/i);
      let matchedRef = false;
      var rangeEndVerse = null;
      if (match) {
        const rawBook = match[1].trim().toLowerCase().replace(/\./g, '');
        const aliasTarget = BOOK_ALIASES[rawBook];
        const foundBook = Object.keys(bibleDatabase.books).find(b => {
          const bl = b.toLowerCase();
          return (aliasTarget && bl === aliasTarget.toLowerCase()) || bl === rawBook || bl.startsWith(rawBook);
        });
        if (foundBook && (match[2] || rawBook.length >= 3)) {
          matchedRef = true;
          targetBook = foundBook;
          targetChapter = match[2] || '1';
          targetVerse = match[3] || 'all';
          if (match[3] && match[4]) {
            rangeEndVerse = parseInt(match[4], 10);
          }
          if (bibleBookSelect) bibleBookSelect.value = targetBook;
          updateChapterDropdown(false);
          if (bibleChapterSelect) bibleChapterSelect.value = targetChapter;
          updateVerseDropdown(false);
          if (bibleVerseSelect) bibleVerseSelect.value = (targetVerse === 'all' || rangeEndVerse) ? 'all' : targetVerse;
        }
      }

      // If query was not a book/chapter reference, perform fast full-text Scripture phrase search!
      if (!matchedRef && queryClean.length >= 2 && bibleVersesList) {
        const needle = queryClean.toLowerCase();
        const versionAbbrSearch = bibleDatabase.abbreviation || currentBibleVersion.toUpperCase();
        const keywordHits = [];
        outerSearch:
        for (const [bName, chMap] of Object.entries(bibleDatabase.books)) {
          for (const [cNum, vMap] of Object.entries(chMap)) {
            for (const [vNum, vTxt] of Object.entries(vMap)) {
              if (String(vTxt).toLowerCase().includes(needle)) {
                keywordHits.push({ book: bName, chapter: cNum, verse: vNum, text: vTxt });
                if (keywordHits.length >= 40) break outerSearch;
              }
            }
          }
        }
        bibleVersesList.innerHTML = '';
        if (keywordHits.length === 0) {
          bibleVersesList.innerHTML = `<div style="padding: 12px; color: var(--text-muted); font-size: 0.8rem;">No verses matching "<strong>${escapeHtml(queryClean)}</strong>" in ${escapeHtml(versionAbbrSearch)}.</div>`;
          return;
        }
        const hitSlides = keywordHits.map(h => ({
          label: `${h.book} ${h.chapter}:${h.verse} (${versionAbbrSearch})`,
          body: `"${h.text}"\n\n— ${h.book} ${h.chapter}:${h.verse} (${versionAbbrSearch})`
        }));
        const searchPres = {
          id: `bible-search-${Date.now()}`,
          title: `Search: "${queryClean}" (${versionAbbrSearch})`,
          slides: hitSlides
        };
        keywordHits.forEach((h, idx) => {
          const card = document.createElement('div');
          card.className = 'lib-item-card';
          card.innerHTML = `
            <div class="lib-item-header">
              <span class="lib-item-title" style="color: var(--accent-gold);">${escapeHtml(h.book)} ${h.chapter}:${h.verse}</span>
              <span class="lib-item-badge">${escapeHtml(versionAbbrSearch)}</span>
            </div>
            <div style="font-size: 0.78rem; color: var(--text-main); line-height: 1.35;">${escapeHtml(h.text)}</div>
            <div class="lib-item-actions">
              <button class="btn-mini add-service" title="Add Verse to Order of Service">+ Service</button>
            </div>
          `;
          const singlePres = {
            id: `bible-${h.book}-${h.chapter}-${h.verse}-${currentBibleVersion}`,
            title: `${h.book} ${h.chapter}:${h.verse} (${versionAbbrSearch})`,
            slides: [hitSlides[idx]]
          };
          card.addEventListener('dblclick', () => loadPresentationItem(singlePres, 'bible', true));
          card.addEventListener('click', (ev) => {
            if (ev.target.closest('.add-service')) {
              addToServiceOrder('bible', singlePres.title, singlePres);
              return;
            }
            loadPresentationItem(searchPres, 'bible', false);
            updateOperatorPreview(idx);
          });
          bibleVersesList.appendChild(card);
        });
        loadPresentationItem(searchPres, 'bible', false);
        return;
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
      ? (typeof rangeEndVerse === 'number' && rangeEndVerse >= parseInt(targetVerse, 10)
          ? Object.keys(chObj).filter(v => {
              const vn = parseInt(v, 10);
              return vn >= parseInt(targetVerse, 10) && vn <= rangeEndVerse;
            })
          : (chObj[targetVerse] ? [targetVerse] : Object.keys(chObj)))
      : Object.keys(chObj);

    // Build presentation slides for this scripture
    const scriptureSlides = [];
    versesToDisplay.forEach(vNum => {
      const text = chObj[vNum];
      if (text) {
        let itemTitle = `${targetBook} ${targetChapter}:${vNum} (${versionAbbr})`;
        let slideBody = `"${text}"\n\n— ${targetBook} ${targetChapter}:${vNum} (${versionAbbr})`;
        let isDual = false;
        let dualPrimaryObj = null;
        let dualSecondaryObj = null;
        let secText = '';
        let secAbbr = '';

        if (isDualBibleCompare && secondaryBibleDatabase && secondaryBibleDatabase.books) {
          const secCh = secondaryBibleDatabase.books[targetBook] ? secondaryBibleDatabase.books[targetBook][targetChapter] : null;
          secText = secCh ? (secCh[vNum] || '') : '';
          secAbbr = secondaryBibleDatabase.abbreviation || secondaryBibleVersion.toUpperCase();

          if (secText) {
            isDual = true;
            itemTitle = `${targetBook} ${targetChapter}:${vNum} (${versionAbbr} vs ${secAbbr})`;
            slideBody = `✦ ${versionAbbr}:\n"${text}"\n\n✦ ${secAbbr}:\n"${secText}"\n\n— ${targetBook} ${targetChapter}:${vNum}`;
            dualPrimaryObj = { label: versionAbbr, text: text };
            dualSecondaryObj = { label: secAbbr, text: secText };
          }
        }

        scriptureSlides.push({
          label: itemTitle,
          body: slideBody,
          isDualComparison: isDual,
          dualPrimary: dualPrimaryObj,
          dualSecondary: dualSecondaryObj
        });

        // Add card to library pane
        const vCard = document.createElement('div');
        vCard.className = 'lib-item-card';
        vCard.innerHTML = `
          <div class="lib-item-header">
            <span class="lib-item-title">${escapeHtml(targetBook)} ${targetChapter}:${vNum}</span>
            <span class="lib-item-badge" style="background: rgba(245, 158, 11, 0.2); color: var(--accent-gold);">${versionAbbr}</span>
            ${isDual ? `<span class="lib-item-badge" style="background: rgba(56, 189, 248, 0.2); color: #38bdf8;">${secAbbr}</span>` : ''}
          </div>
          <div class="lib-item-preview">
            ${isDual ? `
              <div style="margin-bottom: 4px;"><strong style="color: var(--accent-gold);">${versionAbbr}:</strong> ${escapeHtml(text)}</div>
              <div><strong style="color: #38bdf8;">${secAbbr}:</strong> ${escapeHtml(secText)}</div>
            ` : escapeHtml(text)}
          </div>
          <div class="lib-item-actions">
            <button class="btn-mini add-service">+ Service</button>
            <button class="btn-mini send-live" style="color: var(--accent-gold);">Send Live</button>
          </div>
        `;



        const singleItem = {
          id: `scripture-${isDual ? 'dual-' : ''}${versionAbbr}-${targetBook}-${targetChapter}-${vNum}`,
          title: itemTitle,
          slides: [{
            label: itemTitle,
            body: slideBody,
            isDualComparison: isDual,
            dualPrimary: dualPrimaryObj,
            dualSecondary: dualSecondaryObj
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

      const isCrossPreset = preset.id.includes('cross');
      card.style.background = `linear-gradient(135deg, ${preset.primaryColor} 0%, ${preset.secondaryColor} 55%, ${preset.accentColor} 100%)`;
      card.style.flexDirection = 'column';
      card.style.alignItems = 'flex-start';
      card.style.justifyContent = 'flex-end';
      card.style.gap = '2px';
      card.innerHTML = `
        ${isCrossPreset ? '<span style="position: absolute; top: 4px; right: 8px; font-size: 1.45rem; line-height: 1; color: #fde68a; opacity: 0.85; text-shadow: 0 0 12px rgba(251, 191, 36, 0.9); pointer-events: none;">✝</span>' : ''}
        <span style="font-weight: 700; line-height: 1.15;">${escapeHtml(preset.name)}</span>
        <span style="font-size: 0.6rem; opacity: 0.8; text-transform: uppercase; letter-spacing: 0.04em; color: #fde68a;">${escapeHtml(preset.category || 'Built-in')}</span>
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
          askConfirm(`Delete custom theme "${theme.name}"?`, 'Delete Theme', 'Delete').then((yes) => {
            if (yes) {
              customThemes.splice(index, 1);
              saveStoredLibrary();
              renderThemesPresetGrid();
              showToast(`Deleted theme "${theme.name}"`, 'info');
            }
          });
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
        card.className = 'media-row-card announcement-row';

        card.innerHTML = `
          <div class="media-row-icon-badge" title="Announcement Slide">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
            </svg>
          </div>
          <div class="media-row-content">
            <span class="media-row-title" title="${escapeHtml(custom.title)}">${escapeHtml(custom.title)}</span>
            <div class="media-row-meta">
              <span class="media-row-tag tag-announcement">${custom.slides.length} slide${custom.slides.length > 1 ? 's' : ''}</span>
              <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(custom.subtitle || (custom.slides[0]?.body ? custom.slides[0].body.split('\n')[0] : ''))}</span>
            </div>
          </div>
          <div class="media-row-actions">
            <button class="btn-mini btn-proj-live" style="color: var(--accent-gold); font-weight: 700;" title="Project Live to TV">⚡ Live</button>
            <button class="btn-mini btn-add-service" title="Add to Sunday Order of Service">+ Service</button>
            <button class="btn-mini btn-del-custom" style="color: var(--accent-red);" title="Delete Announcement">&times;</button>
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
            askConfirm(`Delete announcement slide "${custom.title}"?`, 'Delete Announcement', 'Delete').then((yes) => {
              if (yes) {
                customSlidesLibrary = customSlidesLibrary.filter(c => c.id !== custom.id);
                saveStoredLibrary();
                renderMediaGallery(mediaSearchInput ? mediaSearchInput.value : '');
                showToast(`Deleted "${custom.title}"`, 'info');
              }
            });
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
        card.className = 'media-row-card';

        const isYouTube = item.type === 'youtube' || !!item.videoId;
        const isVideo = !isYouTube && isVideoFile(item.url || item.title || item.type);
        const ytId = isYouTube ? (item.videoId || extractYouTubeId(item.url)) : '';
        const thumbUrl = isYouTube 
          ? `https://img.youtube.com/vi/${ytId}/hqdefault.jpg`
          : (item.url.startsWith('http') || item.url.startsWith('file:') || item.url.startsWith('data:') 
              ? item.url 
              : 'file:///' + item.url.replace(/\\/g, '/'));

        let thumbMarkup = '';
        if (isYouTube) {
          thumbMarkup = `<img class="media-row-thumb-img" src="${thumbUrl}" alt="${escapeHtml(item.title)}" onerror="this.src='assets/icon.png'"><div style="position: absolute; color: #ef4444; font-size: 0.95rem; pointer-events: none; text-shadow: 0 1px 3px rgba(0,0,0,0.9);">▶</div>`;
        } else if (isVideo) {
          thumbMarkup = `<video class="media-row-thumb-video" src="${thumbUrl}" muted preload="metadata"></video><div style="position: absolute; color: #fff; font-size: 0.9rem; pointer-events: none; text-shadow: 0 1px 3px rgba(0,0,0,0.9);">▶</div>`;
        } else {
          thumbMarkup = `<img class="media-row-thumb-img" src="${thumbUrl}" alt="${escapeHtml(item.title)}" onerror="this.src='assets/icon.png'">`;
        }

        const typeLabel = isYouTube ? 'YOUTUBE' : (isVideo ? 'VIDEO' : 'IMAGE');
        const tagClass = isYouTube ? 'tag-youtube' : (isVideo ? 'tag-video' : 'tag-image');
        const descLabel = isYouTube ? 'Online Live Stream' : (isVideo ? 'Motion Video Loop' : 'Background Graphic');

        card.innerHTML = `
          <div class="media-row-thumb-box">
            ${thumbMarkup}
          </div>
          <div class="media-row-content">
            <span class="media-row-title" title="${escapeHtml(item.title)}">${escapeHtml(item.title)}</span>
            <div class="media-row-meta">
              <span class="media-row-tag ${tagClass}">${typeLabel}</span>
              <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${descLabel}</span>
            </div>
          </div>
          <div class="media-row-actions">
            <button class="btn-mini btn-proj-live" style="color: var(--accent-gold); font-weight: 700;" title="Project Fullscreen Live to TV">⚡ Project</button>
            <button class="btn-mini btn-set-bg" style="color: var(--accent-cyan);" title="Set as Background Under Lyrics">🎵 Bg</button>
            <button class="btn-mini btn-add-service" title="Add to Sunday Order of Service">+ Service</button>
            <button class="btn-mini btn-del-media" style="color: var(--accent-red);" title="Delete Media">&times;</button>
          </div>
        `;

        card.addEventListener('dblclick', () => {
          if (isYouTube) {
            projectYouTubeLive(item);
          } else {
            projectMediaLive(item);
          }
        });

        card.addEventListener('click', (e) => {
          if (e.target.closest('.btn-proj-live')) {
            if (isYouTube) {
              projectYouTubeLive(item);
            } else {
              projectMediaLive(item);
            }
            return;
          }
          if (e.target.closest('.btn-set-bg')) {
            if (isYouTube) {
              setYouTubeAsBackground(item, true);
            } else {
              setMediaAsBackground(item);
            }
            return;
          }
          if (e.target.closest('.btn-add-service')) {
            addToServiceOrder(isYouTube ? 'youtube' : 'media', item.title, item);
            return;
          }
          if (e.target.closest('.btn-del-media')) {
            askConfirm(`Remove "${item.title}" from Media Library?`, 'Remove Media', 'Remove').then((yes) => {
              if (yes) {
                mediaLibrary = mediaLibrary.filter(m => m.id !== item.id);
                saveStoredLibrary();
                renderMediaGallery(mediaSearchInput ? mediaSearchInput.value : '');
                showToast(`Removed "${item.title}"`, 'info');
              }
            });
            return;
          }

          // Single click: update preview
          if (isYouTube) {
            state.backgroundType = 'youtube';
            state.youtubeVideoId = ytId;
            state.youtubeUrl = item.url;
            state.youtubeTitle = item.title;
            state.activeItem = {
              id: item.id,
              title: item.title,
              type: 'youtube',
              videoId: ytId,
              url: item.url,
              slides: [{ label: item.title, body: '' }]
            };
            previewTextTitle.textContent = item.title;
            previewTextBody.textContent = '[YouTube Live Stream Ready]';
            updateOperatorPreview(0);
          } else {
            state.backgroundType = isVideo ? 'video' : 'image';
            state.customBgUrl = item.url;
            previewTextTitle.textContent = item.title;
            previewTextBody.textContent = isVideo ? '[Video Media Loop Ready]' : '[Image Graphic Ready]';
            const prevYtOverlay = document.getElementById('preview-youtube-overlay');
            if (prevYtOverlay) prevYtOverlay.classList.remove('active');
          }
        });

        mediaGalleryGrid.appendChild(card);
      });
    }
  }

  function extractYouTubeId(urlOrId) {
    if (!urlOrId) return '';
    const clean = String(urlOrId).trim();
    if (/^[a-zA-Z0-9_-]{11}$/.test(clean)) return clean;
    const regex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?|live|shorts)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i;
    const match = clean.match(regex);
    return match ? match[1] : '';
  }

  function projectYouTubeLive(item, muted = false) {
    const videoId = item.videoId || extractYouTubeId(item.url);
    if (!videoId) {
      showToast('Could not determine a valid YouTube video ID from the provided link.', 'warning');
      return;
    }

    if (state.cameraEnabled || state.cameraMode !== 'none') {
      state.cameraMode = 'none';
      state.cameraEnabled = false;
      if (previewVideoStream && previewVideoStream.srcObject) {
        previewVideoStream.srcObject.getTracks().forEach(t => t.stop());
        previewVideoStream.srcObject = null;
      }
      if (liveVideoStream) liveVideoStream.srcObject = null;
      if (previewVideoStream) previewVideoStream.style.display = 'none';
      if (liveVideoStream) liveVideoStream.style.display = 'none';
      activeControlCameraId = null;
      if (labelCameraStatus) labelCameraStatus.textContent = 'Camera: Standby';
      const statusCamInfo = document.getElementById('status-camera-info');
      if (statusCamInfo) statusCamInfo.style.display = 'none';
    }

    state.backgroundType = 'youtube';
    state.youtubeVideoId = videoId;
    state.youtubeUrl = item.url || `https://www.youtube.com/watch?v=${videoId}`;
    state.youtubeTitle = item.title || 'YouTube Live Stream';
    state.youtubeMuted = muted;
    state.youtubeActive = true;
    state.customBgUrl = '';
    state.clearText = true;
    state.themeOnly = true;
    state.blackout = false;

    btnFastClear.classList.add('active-clear');
    btnFastTheme.classList.add('active-theme');
    btnFastBlackout.classList.remove('active-blackout');

    state.activeItem = {
      id: item.id || `yt-${Date.now()}`,
      title: state.youtubeTitle,
      type: 'youtube',
      videoId: videoId,
      url: state.youtubeUrl,
      slides: [{ label: state.youtubeTitle, body: '' }]
    };
    state.activeSlideIndex = 0;
    activeItemTitle.textContent = state.youtubeTitle;
    activeItemMeta.textContent = `YouTube Stream (Live TV)`;
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
    triggerAutoSave();
  }

  function setYouTubeAsBackground(item, muted = true) {
    const videoId = item.videoId || extractYouTubeId(item.url);
    if (!videoId) {
      showToast('Could not determine a valid YouTube video ID.', 'warning');
      return;
    }

    state.backgroundType = 'youtube';
    state.youtubeVideoId = videoId;
    state.youtubeUrl = item.url || `https://www.youtube.com/watch?v=${videoId}`;
    state.youtubeTitle = item.title || 'YouTube Background';
    state.youtubeMuted = muted;
    state.youtubeActive = true;
    state.customBgUrl = '';

    broadcastDisplayState();
    triggerAutoSave();
  }

  function stopYouTubeStream() {
    state.youtubeActive = false;
    state.youtubeVideoId = '';
    state.youtubeUrl = '';
    state.youtubeTitle = '';
    if (state.backgroundType === 'youtube') {
      state.backgroundType = 'procedural';
    }
    const prevYtOverlay = document.getElementById('preview-youtube-overlay');
    if (prevYtOverlay) prevYtOverlay.classList.remove('active');
    const liveYtOverlay = document.getElementById('live-youtube-overlay');
    if (liveYtOverlay) liveYtOverlay.classList.remove('active');
    if (activeYoutubeBar) activeYoutubeBar.style.display = 'none';

    broadcastDisplayState();
    triggerAutoSave();
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
      focusInputSafely(themeFormName);
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
            filters: [
              { name: 'All Media Files (Images & Videos)', extensions: [...ALL_IMAGE_EXTS, ...ALL_VIDEO_EXTS] },
              { name: 'All Images', extensions: [...ALL_IMAGE_EXTS] },
              { name: 'All Videos', extensions: [...ALL_VIDEO_EXTS] },
              { name: 'All Files (*.*)', extensions: ['*'] }
            ]
          });
          if (res && !res.canceled && res.filePaths.length > 0) {
            themeFormFilePath.value = res.filePaths[0];
            if (themeFormBgType) {
              themeFormBgType.value = isVideoFile(res.filePaths[0]) ? 'video' : 'image';
            }
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
          showToast('Please enter a name for your custom theme.', 'warning');
          flashInvalidInput(themeFormName);
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
      const matchedPreset = backgroundPresets.find(p => p.id === preset);
      if (matchedPreset) {
        themePreviewBox.style.background = `linear-gradient(135deg, ${matchedPreset.primaryColor} 0%, ${matchedPreset.secondaryColor} 55%, ${matchedPreset.accentColor} 100%)`;
      } else if (preset === 'celestial-clouds') {
        themePreviewBox.style.background = 'radial-gradient(circle at 50% 40%, #581c87 0%, #090d16 100%)';
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
        const filters = [
          { name: 'All Media Files (Images & Videos)', extensions: [...ALL_IMAGE_EXTS, ...ALL_VIDEO_EXTS] },
          { name: 'All Images (*.jpg, *.png, *.webp, *.gif, *.svg, etc.)', extensions: [...ALL_IMAGE_EXTS] },
          { name: 'All Videos (*.mp4, *.webm, *.mov, *.mkv, *.avi, etc.)', extensions: [...ALL_VIDEO_EXTS] },
          { name: 'All Files (*.*)', extensions: ['*'] }
        ];

        const res = await window.zionApi.openFileDialog({
          title: `Select Church ${isVideo ? 'Video' : 'Image'}`,
          filters
        });

        if (res && !res.canceled && res.filePaths.length > 0) {
          const selectedPath = res.filePaths[0];
          if (uploadFormFilePath) uploadFormFilePath.value = selectedPath;
          if (uploadFormType) {
            uploadFormType.value = isVideoFile(selectedPath) ? 'video' : 'image';
          }
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
        const chosenType = uploadFormType ? uploadFormType.value : 'image';
        const actualType = isVideoFile(filePath) ? 'video' : (isImageFile(filePath) ? 'image' : chosenType);

        if (!title) {
          showToast('Please enter a title for this media.', 'warning');
          flashInvalidInput(uploadFormTitle);
          return;
        }
        if (!filePath) {
          showToast('Please browse and select a media file from your computer.', 'warning');
          return;
        }

        const newItem = {
          id: `media-${Date.now()}`,
          title: title,
          type: actualType,
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
    focusInputSafely(uploadFormTitle);
  }

  function getActiveCameraDevice() {
    if (cameraDeviceSelect && cameraDeviceSelect.value) {
      const match = state.videoDevices.find(d => d.deviceId === cameraDeviceSelect.value);
      if (match) return match;
    }
    const camo = state.videoDevices.find(d => (d.label || '').toLowerCase().includes('camo'));
    if (camo) return camo;
    const droid = state.videoDevices.find(d => {
      const lbl = (d.label || '').toLowerCase();
      return lbl.includes('droidcam') || lbl.includes('droid');
    });
    if (droid) return droid;
    const obs = state.videoDevices.find(d => (d.label || '').toLowerCase().includes('obs'));
    if (obs) return obs;
    return state.videoDevices[0] || null;
  }

  function initDroidCamStudio() {
    if (btnProjectPreacher) {
      btnProjectPreacher.addEventListener('click', async () => {
        if (!state.videoDevices || state.videoDevices.length === 0) {
          await enumerateVideoDevices();
        }
        const targetDevice = getActiveCameraDevice();

        if (!targetDevice) {
          showToast('No camera detected. Connect Camo, DroidCam, OBS Virtual Cam, or USB/HDMI capture, then click Refresh ↺.', 'warning');
          return;
        }

        state.cameraDeviceId = targetDevice.deviceId;
        state.cameraDeviceLabel = targetDevice.label || '';
        if (cameraDeviceSelect) cameraDeviceSelect.value = targetDevice.deviceId;

        state.clearText = true;
        btnFastClear.classList.add('active-clear');

        if (window.zionApi && !state.displayOpen) {
          const targetScreenId = selectTargetScreen ? selectTargetScreen.value : null;
          await window.zionApi.launchDisplay(targetScreenId);
          updateTvStatusUI(true);
        }

        await updateCameraMode('preacher');
      });
    }

    if (btnProjectWorshipBg) {
      btnProjectWorshipBg.addEventListener('click', async () => {
        if (!state.videoDevices || state.videoDevices.length === 0) {
          await enumerateVideoDevices();
        }
        const targetDevice = getActiveCameraDevice();

        if (!targetDevice) {
          showToast('No camera detected. Connect Camo, DroidCam, OBS Virtual Cam, or USB/HDMI capture, then click Refresh ↺.', 'warning');
          return;
        }

        state.cameraDeviceId = targetDevice.deviceId;
        state.cameraDeviceLabel = targetDevice.label || '';
        if (cameraDeviceSelect) cameraDeviceSelect.value = targetDevice.deviceId;

        state.clearText = false;
        state.themeOnly = false;
        btnFastClear.classList.remove('active-clear');
        btnFastTheme.classList.remove('active-theme');

        if (window.zionApi && !state.displayOpen) {
          const targetScreenId = selectTargetScreen ? selectTargetScreen.value : null;
          await window.zionApi.launchDisplay(targetScreenId);
          updateTvStatusUI(true);
        }

        await updateCameraMode('background');
      });
    }

    if (btnCameraOff) {
      btnCameraOff.addEventListener('click', async () => {
        await updateCameraMode('none');
      });
    }
  }

  function initYouTubeModal() {
    if (btnOpenYoutubeModal) {
      btnOpenYoutubeModal.addEventListener('click', () => {
        if (modalYoutube) modalYoutube.classList.add('open');
        if (youtubeUrlInput) {
          youtubeUrlInput.value = '';
          youtubeUrlInput.focus();
        }
        if (youtubeTitleInput) youtubeTitleInput.value = '';
        if (youtubePreviewImg) {
          youtubePreviewImg.style.display = 'none';
          youtubePreviewImg.src = '';
        }
        if (youtubePreviewPlaceholder) youtubePreviewPlaceholder.style.display = 'block';
        if (youtubePreviewBadge) youtubePreviewBadge.style.display = 'none';
        if (youtubeMuteToggle) youtubeMuteToggle.checked = false;
      });
    }

    // Live URL input listener for thumbnail preview
    if (youtubeUrlInput) {
      youtubeUrlInput.addEventListener('input', () => {
        const raw = youtubeUrlInput.value.trim();
        const vid = extractYouTubeId(raw);
        if (vid) {
          if (youtubePreviewImg) {
            youtubePreviewImg.src = `https://img.youtube.com/vi/${vid}/hqdefault.jpg`;
            youtubePreviewImg.style.display = 'block';
          }
          if (youtubePreviewPlaceholder) youtubePreviewPlaceholder.style.display = 'none';
          if (youtubePreviewBadge) youtubePreviewBadge.style.display = 'flex';
          if (youtubeTitleInput && !youtubeTitleInput.value.trim()) {
            youtubeTitleInput.value = `YouTube Live (${vid})`;
          }
        } else {
          if (youtubePreviewImg) {
            youtubePreviewImg.style.display = 'none';
            youtubePreviewImg.src = '';
          }
          if (youtubePreviewPlaceholder) youtubePreviewPlaceholder.style.display = 'block';
          if (youtubePreviewBadge) youtubePreviewBadge.style.display = 'none';
        }
      });
    }

    // Save to Media Library
    if (btnSaveYoutubeLibrary) {
      btnSaveYoutubeLibrary.addEventListener('click', () => {
        const raw = (youtubeUrlInput ? youtubeUrlInput.value : '').trim();
        const vid = extractYouTubeId(raw);
        if (!vid) {
          showToast('Please enter a valid YouTube video or live stream link.', 'warning');
          flashInvalidInput(youtubeUrlInput);
          return;
        }
        const title = (youtubeTitleInput && youtubeTitleInput.value.trim()) || `YouTube Stream (${vid})`;
        const item = {
          id: `yt-${Date.now()}`,
          title: title,
          type: 'youtube',
          videoId: vid,
          url: raw.startsWith('http') ? raw : `https://www.youtube.com/watch?v=${vid}`
        };
        mediaLibrary.unshift(item);
        saveStoredLibrary();
        renderMediaGallery(mediaSearchInput ? mediaSearchInput.value : '');
        if (modalYoutube) modalYoutube.classList.remove('open');
      });
    }

    // Project Live TV
    if (btnProjectYoutubeLive) {
      btnProjectYoutubeLive.addEventListener('click', () => {
        const raw = (youtubeUrlInput ? youtubeUrlInput.value : '').trim();
        const vid = extractYouTubeId(raw);
        if (!vid) {
          showToast('Please enter a valid YouTube video or live stream link.', 'warning');
          flashInvalidInput(youtubeUrlInput);
          return;
        }
        const title = (youtubeTitleInput && youtubeTitleInput.value.trim()) || `YouTube Live (${vid})`;
        const muted = youtubeMuteToggle ? youtubeMuteToggle.checked : false;
        const item = {
          id: `yt-${Date.now()}`,
          title: title,
          type: 'youtube',
          videoId: vid,
          url: raw.startsWith('http') ? raw : `https://www.youtube.com/watch?v=${vid}`
        };
        if (!mediaLibrary.some(m => m.videoId === vid)) {
          mediaLibrary.unshift(item);
          saveStoredLibrary();
          renderMediaGallery(mediaSearchInput ? mediaSearchInput.value : '');
        }
        projectYouTubeLive(item, muted);
        if (modalYoutube) modalYoutube.classList.remove('open');
      });
    }

    // Worship Background Mode
    if (btnProjectYoutubeWorship) {
      btnProjectYoutubeWorship.addEventListener('click', () => {
        const raw = (youtubeUrlInput ? youtubeUrlInput.value : '').trim();
        const vid = extractYouTubeId(raw);
        if (!vid) {
          showToast('Please enter a valid YouTube video link.', 'warning');
          flashInvalidInput(youtubeUrlInput);
          return;
        }
        const title = (youtubeTitleInput && youtubeTitleInput.value.trim()) || `YouTube Background (${vid})`;
        const item = {
          id: `yt-${Date.now()}`,
          title: title,
          type: 'youtube',
          videoId: vid,
          url: raw.startsWith('http') ? raw : `https://www.youtube.com/watch?v=${vid}`
        };
        if (!mediaLibrary.some(m => m.videoId === vid)) {
          mediaLibrary.unshift(item);
          saveStoredLibrary();
          renderMediaGallery(mediaSearchInput ? mediaSearchInput.value : '');
        }
        setYouTubeAsBackground(item, true);
        if (modalYoutube) modalYoutube.classList.remove('open');
      });
    }

    // Active Stream Bar Controls
    if (btnToggleYoutubeMute) {
      btnToggleYoutubeMute.addEventListener('click', () => {
        state.youtubeMuted = !state.youtubeMuted;
        btnToggleYoutubeMute.textContent = state.youtubeMuted ? '🔇 Audio Muted' : '🔊 Audio On';
        broadcastDisplayState();
      });
    }

    if (btnStopYoutube) {
      btnStopYoutube.addEventListener('click', () => {
        stopYouTubeStream();
      });
    }
  }

  // =========================================================================

  // =========================================================================
  // DEDICATED CAMERA DISPLAY SECTION & MULTI-CAM VIDEO SWITCHER
  // =========================================================================
  state.cameraDisplaySectionOpen = false;

  function openCameraDisplaySection() {
    state.cameraDisplaySectionOpen = true;
    const camSection = document.getElementById('camera-display-section');
    const tilesSection = document.querySelector('.center-tiles-section');
    if (camSection) camSection.style.display = 'flex';
    if (tilesSection) tilesSection.style.display = 'none';

    // Highlight top-bar button
    const btnTopCam = document.getElementById('btn-open-camera-studio');
    if (btnTopCam) {
      btnTopCam.style.background = '#f43f5e';
      btnTopCam.style.color = '#fff';
    }

    // Activate tab-camera in left panel if not active
    const tabCamBtn = document.querySelector('.lib-tab-btn[data-tab="tab-camera"]');
    if (tabCamBtn && !tabCamBtn.classList.contains('active')) {
      const allTabBtns = document.querySelectorAll('.lib-tab-btn');
      const allPanes = document.querySelectorAll('.tab-pane-content');
      allTabBtns.forEach(b => b.classList.remove('active'));
      allPanes.forEach(p => p.classList.remove('active'));
      tabCamBtn.classList.add('active');
      const pane = document.getElementById('tab-camera');
      if (pane) pane.classList.add('active');
    }

    renderCameraDisplaySection();
  }

  function closeCameraDisplaySection() {
    state.cameraDisplaySectionOpen = false;
    const camSection = document.getElementById('camera-display-section');
    const tilesSection = document.querySelector('.center-tiles-section');
    if (camSection) camSection.style.display = 'none';
    if (tilesSection) tilesSection.style.display = 'flex';

    // Reset top-bar button
    const btnTopCam = document.getElementById('btn-open-camera-studio');
    if (btnTopCam) {
      btnTopCam.style.background = 'rgba(244, 63, 94, 0.1)';
      btnTopCam.style.color = '#f43f5e';
    }

    // Stop card preview streams to release hardware
    if (viewfinderStream) {
      viewfinderStream.getTracks().forEach(t => t.stop());
      viewfinderStream = null;
    }
    stopAllCameraCardStreams();
  }

  function switchCameraSource(deviceId, deviceLabel, mode = 'preacher') {
    state.cameraDeviceId = deviceId;
    state.cameraDeviceLabel = deviceLabel || '';
    if (cameraDeviceSelect) cameraDeviceSelect.value = deviceId;
    updateCameraMode(mode);
    if (state.cameraDisplaySectionOpen) {
      renderCameraDisplaySection();
    }
    showToast('📹 Switched to ' + (deviceLabel || 'Camera') + ' (' + mode.toUpperCase() + ')');
  }


  let viewfinderStream = null;
  let selectedViewfinderDeviceId = null;

  async function setViewfinderCamera(deviceId, deviceLabel = '') {
    selectedViewfinderDeviceId = deviceId;
    const vfVideo = document.getElementById('camera-studio-main-video');
    const placeholder = document.getElementById('camera-viewfinder-placeholder');
    const nameLabel = document.getElementById('viewfinder-cam-name');
    const iconSpan = document.getElementById('viewfinder-cam-icon');
    const resBadge = document.getElementById('viewfinder-cam-resolution');
    const statusBadge = document.getElementById('viewfinder-cam-status-badge');
    const liveBanner = document.getElementById('camera-viewfinder-live-banner');
    const liveBannerText = document.getElementById('viewfinder-live-banner-text');

    const devices = state.videoDevices || [];
    const matchedDev = devices.find(d => d.deviceId === deviceId) || devices[0];
    if (!matchedDev) return;

    const info = parseCameraDeviceInfo(matchedDev, devices.indexOf(matchedDev));
    if (nameLabel) nameLabel.textContent = info.cleanName + ' (' + (matchedDev.label || 'Camera') + ')';
    if (iconSpan) iconSpan.textContent = info.isIriun ? '📱' : (info.typeBadge.includes('Camo') ? '✨' : '📹');

    const isLive = state.cameraEnabled && (state.cameraDeviceId === matchedDev.deviceId || state.cameraDeviceLabel === matchedDev.label);
    if (statusBadge) {
      if (isLive) {
        if (state.cameraMode === 'preacher') {
          statusBadge.className = 'viewfinder-status-badge live';
          statusBadge.textContent = '🔴 ON AIR ON TV (PREACHER)';
        } else {
          statusBadge.className = 'viewfinder-status-badge worship';
          statusBadge.textContent = '🎵 WORSHIP BACKGROUND';
        }
      } else {
        statusBadge.className = 'viewfinder-status-badge';
        statusBadge.textContent = 'VIEWFINDER PREVIEW';
      }
    }

    if (liveBanner && liveBannerText) {
      if (isLive) {
        liveBanner.style.display = 'flex';
        liveBannerText.textContent = state.cameraMode === 'preacher' ? '🔴 LIVE ON CHURCH TV (PREACHER MODE)' : '🎵 LIVE ON CHURCH TV (WORSHIP BG)';
      } else {
        liveBanner.style.display = 'none';
      }
    }

    // Stop previous viewfinder stream
    if (viewfinderStream) {
      viewfinderStream.getTracks().forEach(t => t.stop());
      viewfinderStream = null;
    }

    if (vfVideo) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { deviceId: { exact: matchedDev.deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false
        });
        viewfinderStream = stream;
        vfVideo.srcObject = stream;
        await vfVideo.play();
        if (placeholder) placeholder.style.display = 'none';

        if (resBadge) {
          setTimeout(() => {
            const w = vfVideo.videoWidth || 1280;
            const h = vfVideo.videoHeight || 720;
            resBadge.textContent = w + 'x' + h + (w >= 1920 ? ' Full HD' : ' HD');
          }, 300);
        }
      } catch (err) {
        console.warn('Viewfinder stream acquire failed:', err);
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
          viewfinderStream = stream;
          vfVideo.srcObject = stream;
          await vfVideo.play();
          if (placeholder) placeholder.style.display = 'none';
        } catch (e2) {
          if (placeholder) {
            placeholder.style.display = 'flex';
            placeholder.innerHTML = '<div>⚠️ Camera In Use by Another App or Offline</div><div style="font-size:0.75rem; color:#fca5a5;">' + (err.message || 'Could not start video stream') + '</div>';
          }
        }
      }
    }

    // Update gallery selection highlights
    document.querySelectorAll('.camera-card').forEach(card => {
      card.classList.toggle('selected-source', card.dataset.deviceId === matchedDev.deviceId);
    });
  }

  async function renderCameraDisplaySection() {
    const camSection = document.getElementById('camera-display-section');
    if (!camSection || camSection.style.display === 'none') return;

    const metaLabel = document.getElementById('camera-display-meta');
    const galleryCount = document.getElementById('camera-gallery-count');
    const grid = document.getElementById('camera-multiview-grid');
    const filterBtn = document.getElementById('btn-toggle-cam-filter');

    const devices = state.videoDevices || [];
    const activeConnected = devices.filter(d => d.isLiveDevice);

    if (filterBtn) {
      filterBtn.textContent = filterConnectedCamerasOnly ? '🟢 Connected Only (' + activeConnected.length + ')' : '⚙️ All Drivers (' + devices.length + ')';
      filterBtn.style.background = filterConnectedCamerasOnly ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255, 255, 255, 0.08)';
      filterBtn.style.color = filterConnectedCamerasOnly ? '#34d399' : '#cbd5e1';
      filterBtn.style.borderColor = filterConnectedCamerasOnly ? 'rgba(16, 185, 129, 0.4)' : 'rgba(255, 255, 255, 0.2)';
    }

    const displayedDevices = filterConnectedCamerasOnly ? (activeConnected.length > 0 ? activeConnected : []) : devices;

    if (metaLabel) {
      metaLabel.textContent = activeConnected.length + (activeConnected.length === 1 ? ' Camera Connected & In Use' : ' Cameras Connected & In Use');
    }
    if (galleryCount) {
      galleryCount.textContent = displayedDevices.length + (displayedDevices.length === 1 ? ' Camera' : ' Cameras');
    }

    // Default select active connected camera in Viewfinder (ONLY previews on laptop, does NOT send to TV!)
    const preferredId = (state.cameraEnabled && state.cameraDeviceId) ? state.cameraDeviceId : (displayedDevices[0] ? displayedDevices[0].deviceId : null);
    if (preferredId && (!selectedViewfinderDeviceId || selectedViewfinderDeviceId !== preferredId)) {
      setViewfinderCamera(preferredId);
    }

    // Render Camera Cards Grid
    if (grid) {
      grid.innerHTML = '';

      if (displayedDevices.length === 0) {
        grid.innerHTML = `
          <div style="grid-column: 1/-1; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 30px 20px; background: rgba(0, 0, 0, 0.35); border-radius: 10px; border: 1px dashed rgba(255, 255, 255, 0.15); text-align: center; gap: 8px;">
            <div style="font-size: 2rem;">📱</div>
            <div style="font-size: 0.95rem; font-weight: 800; color: #fff;">No Camera Currently Connected to a Phone or Device</div>
            <p style="font-size: 0.76rem; color: #94a3b8; max-width: 440px; margin: 0 auto; line-height: 1.45;">
              To project, open <strong>Iriun Webcam</strong> or <strong>Camo Studio</strong> on your phone and PC.<br>
              Once your phone connects, ZionCast will automatically display the live camera here.
            </p>
            <div style="display: flex; gap: 8px; margin-top: 6px;">
              <button id="btn-empty-scan" class="btn-fast" style="padding: 6px 14px; background: #f43f5e; color: #fff; font-weight: 700; border-color: #f43f5e;">
                🔄 Scan for Connected Cameras
              </button>
              <button id="btn-empty-show-all" class="btn-fast" style="padding: 6px 14px; font-weight: 700;">
                ⚙️ Show All ${devices.length} Drivers
              </button>
            </div>
          </div>
        `;
        const btnEmptyScan = document.getElementById('btn-empty-scan');
        if (btnEmptyScan) btnEmptyScan.addEventListener('click', enumerateVideoDevices);
        const btnEmptyShowAll = document.getElementById('btn-empty-show-all');
        if (btnEmptyShowAll) {
          btnEmptyShowAll.addEventListener('click', () => {
            filterConnectedCamerasOnly = false;
            renderCameraDisplaySection();
          });
        }
        return;
      }

      displayedDevices.forEach((dev, index) => {
        const info = parseCameraDeviceInfo(dev, index);
        const isLiveOnTv = state.cameraEnabled && (state.cameraDeviceId === dev.deviceId || state.cameraDeviceLabel === dev.label);
        const isSelectedInVf = selectedViewfinderDeviceId === dev.deviceId;

        const card = document.createElement('div');
        card.className = 'camera-card';
        card.dataset.deviceId = dev.deviceId;
        if (isSelectedInVf) card.classList.add('selected-source');
        if (isLiveOnTv) card.classList.add(state.cameraMode === 'preacher' ? 'live-on-tv' : 'live-worship-bg');

        // Top Row
        const topRow = document.createElement('div');
        topRow.style.display = 'flex';
        topRow.style.alignItems = 'center';
        topRow.style.justifyContent = 'space-between';
        topRow.style.padding = '8px 10px';
        topRow.style.background = 'rgba(0,0,0,0.45)';
        topRow.style.borderBottom = '1px solid rgba(255,255,255,0.06)';

        const nameSpan = document.createElement('div');
        nameSpan.style.fontWeight = '700';
        nameSpan.style.fontSize = '0.8rem';
        nameSpan.style.color = '#f8fafc';
        nameSpan.style.overflow = 'hidden';
        nameSpan.style.textOverflow = 'ellipsis';
        nameSpan.style.whiteSpace = 'nowrap';
        const icon = info.isIriun ? '📱' : (info.typeBadge.includes('Camo') ? '✨' : '📹');
        nameSpan.innerHTML = '<span>' + icon + '</span> ' + info.cleanName;

        const badge = document.createElement('span');
        badge.style.fontSize = '0.66rem';
        badge.style.fontWeight = '800';
        badge.style.padding = '2px 7px';
        badge.style.borderRadius = '4px';

        if (isLiveOnTv) {
          badge.style.background = state.cameraMode === 'preacher' ? '#ef4444' : '#06b6d4';
          badge.style.color = '#ffffff';
          badge.textContent = state.cameraMode === 'preacher' ? '🔴 ON TV' : '🎵 WORSHIP';
        } else if (dev.isLiveDevice) {
          badge.style.background = 'rgba(16, 185, 129, 0.2)';
          badge.style.color = '#34d399';
          badge.style.border = '1px solid rgba(16, 185, 129, 0.4)';
          badge.textContent = '🟢 IN USE';
        } else {
          badge.style.background = 'rgba(255, 255, 255, 0.08)';
          badge.style.color = '#94a3b8';
          badge.textContent = 'IDLE';
        }

        topRow.appendChild(nameSpan);
        topRow.appendChild(badge);
        card.appendChild(topRow);

        // Body Preview / Signal Box
        const bodyPreview = document.createElement('div');
        bodyPreview.className = 'camera-card-body-preview';
        bodyPreview.style.background = '#090d16';
        bodyPreview.innerHTML = dev.isLiveDevice
          ? '<div style="font-size: 1.3rem;">📱</div><div style="font-size: 0.72rem; color: #34d399; font-weight: 700; margin-left: 6px;">Live Signal Ready</div>'
          : '<div style="font-size: 1.3rem; opacity: 0.5;">⚪</div><div style="font-size: 0.72rem; color: #94a3b8; margin-left: 6px;">No phone connected</div>';
        card.appendChild(bodyPreview);

        // Card Action Footer
        const footer = document.createElement('div');
        footer.style.display = 'flex';
        footer.style.gap = '6px';
        footer.style.padding = '6px 8px';
        footer.style.background = 'rgba(0,0,0,0.3)';

        const btnPreviewOnly = document.createElement('button');
        btnPreviewOnly.className = 'btn-fast';
        btnPreviewOnly.style.flex = '1';
        btnPreviewOnly.style.padding = '5px';
        btnPreviewOnly.style.fontSize = '0.72rem';
        btnPreviewOnly.textContent = '👁️ Preview';
        btnPreviewOnly.title = 'Preview this camera in the Viewfinder on your laptop (Does NOT send to TV)';
        btnPreviewOnly.addEventListener('click', (e) => {
          e.stopPropagation();
          setViewfinderCamera(dev.deviceId, dev.label);
        });

        const btnAddToTv = document.createElement('button');
        btnAddToTv.className = 'btn-fast btn-cam-preacher-live';
        btnAddToTv.style.flex = '1.3';
        btnAddToTv.style.padding = '5px';
        btnAddToTv.style.fontSize = '0.72rem';
        btnAddToTv.style.fontWeight = '800';
        btnAddToTv.textContent = '📺 Add to TV';
        btnAddToTv.title = 'Project this camera full-screen onto congregation TV';
        btnAddToTv.addEventListener('click', (e) => {
          e.stopPropagation();
          setViewfinderCamera(dev.deviceId, dev.label);
          switchCameraSource(dev.deviceId, dev.label, 'preacher');
        });

        footer.appendChild(btnPreviewOnly);
        footer.appendChild(btnAddToTv);
        card.appendChild(footer);

        // Clicking card previews in Viewfinder ONLY (DOES NOT GO TO TV!)
        card.addEventListener('click', () => {
          setViewfinderCamera(dev.deviceId, dev.label);
        });

        grid.appendChild(card);
      });
    }
  }

    // 11d. MOBILE WI-FI REMOTE CONTROL SYNCHRONIZATION
  // =========================================================================
  function syncRemoteStatus(includeLibrary = false) {
    if (!window.zionApi || !window.zionApi.updateRemoteStatus) return;

    let slidesList = [];
    let currentSlideLabel = 'Ready';
    let currentSlideBody = 'Ready for service';
    let nextSlideLabel = 'End of Item';
    let nextSlideBody = 'No upcoming slide';

    if (state.activeItem && Array.isArray(state.activeItem.slides) && state.activeItem.slides.length > 0) {
      slidesList = state.activeItem.slides.map((s, idx) => ({
        index: idx,
        label: s.label || `Slide ${idx + 1}`,
        body: (s.body || '').substring(0, 150)
      }));

      const curSlide = state.activeItem.slides[state.activeSlideIndex];
      if (curSlide) {
        currentSlideLabel = curSlide.label || `Slide ${state.activeSlideIndex + 1}`;
        currentSlideBody = curSlide.body || '';
      }

      const nextSlide = state.activeItem.slides[state.activeSlideIndex + 1];
      if (nextSlide) {
        nextSlideLabel = nextSlide.label || `Slide ${state.activeSlideIndex + 2}`;
        nextSlideBody = nextSlide.body || '';
      } else {
        nextSlideLabel = 'End of Item';
        nextSlideBody = 'Next item in Order of Service';
      }
    }

    let liveSvcIndex = -1;
    if (state.activeItem) {
      if (selectedServiceIndex >= 0 && selectedServiceIndex < serviceOrder.length) {
        const sel = serviceOrder[selectedServiceIndex];
        if ((sel.data && sel.data.id && sel.data.id === state.activeItem.id) || sel.title === state.activeItem.title || sel.data?.title === state.activeItem.title) {
          liveSvcIndex = selectedServiceIndex;
        }
      }
      if (liveSvcIndex === -1) {
        liveSvcIndex = serviceOrder.findIndex(it =>
          (it.data && it.data.id && state.activeItem.id === it.data.id) ||
          it.title === state.activeItem.title
        );
      }
    }

    const mappedServiceOrder = serviceOrder.map((item, idx) => {
      const dataSlides = item.data && Array.isArray(item.data.slides) ? item.data.slides.length : 1;
      const isLive = idx === liveSvcIndex;
      return {
        index: idx,
        id: item.id,
        type: item.type || 'item',
        title: item.title,
        slideCount: dataSlides,
        isLive
      };
    });

    const statusPayload = {
      activeItemTitle: state.activeItem ? state.activeItem.title : 'ZionCast Broadcast',
      currentSlideIndex: state.activeSlideIndex || 0,
      totalSlides: state.activeItem && state.activeItem.slides ? state.activeItem.slides.length : 1,
      currentSlideLabel,
      currentSlideBody,
      nextSlideLabel,
      nextSlideBody,
      slidesList,
      blackout: !!state.blackout,
      clearText: !!state.clearText,
      themeOnly: !!state.themeOnly,
      showClockOnTv: !!state.showClockOnTv,
      bannerActive: !!state.bannerActive,
      bannerText: state.bannerText || '',
      stageMessage: stageAlertMessageText || '',
      stageMessageActive: !!stageAlertMessageActive,
      countdownActive: !!countdownProjected,
      countdownProjected: !!countdownProjected,
      countdownRunning: !!countdownRunning,
      countdownRemaining: Math.floor(countdownRemainingSec),
      countdownTotal: Math.floor(countdownTotalSec),
      countdownTitle: countdownTitleText || 'Service Begins In',
      countdownPosition: countdownPosition || 'top-right',
      countdownSize: countdownSize || 'compact',
      serviceTitle: serviceTitleInput ? (serviceTitleInput.value || 'Sunday Worship Service') : 'Sunday Worship Service',
      serviceOrder: mappedServiceOrder,
      libraryVersion: remoteLibraryVersion
    };

    if (includeLibrary) {
      statusPayload.libraryCatalog = {
        songs: songsLibrary.map(s => ({
          id: s.id,
          title: s.title,
          subtitle: (s.author ? `${s.author} • ` : '') + `${s.slides ? s.slides.length : 1} slides`
        })),
        media: mediaLibrary.map(m => ({
          id: m.id,
          title: m.title,
          subtitle: (m.type === 'youtube' || m.videoId)
            ? 'YouTube Stream'
            : (isVideoFile(m.url || m.title || m.type) ? 'Motion Video' : 'Church Flyer / Image')
        })),
        custom: customSlidesLibrary.map(c => ({
          id: c.id,
          title: c.title,
          subtitle: c.subtitle || (c.slides && c.slides[0] && c.slides[0].body ? c.slides[0].body.split('\n')[0] : 'Notice')
        }))
      };
    }

    window.zionApi.updateRemoteStatus(statusPayload);
  }

  function toggleBlackout() {
    state.blackout = !state.blackout;
    if (btnFastBlackout) btnFastBlackout.classList.toggle('active-blackout', state.blackout);
    broadcastDisplayState();
  }

  function toggleClearText() {
    state.clearText = !state.clearText;
    if (btnFastClear) btnFastClear.classList.toggle('active-clear', state.clearText);
    broadcastDisplayState();
  }

  function toggleThemeOnly() {
    state.themeOnly = !state.themeOnly;
    if (btnFastTheme) btnFastTheme.classList.toggle('active-theme', state.themeOnly);
    broadcastDisplayState();
  }

  function initRemoteModal() {
    const btnOpenRemoteModalBottom = document.getElementById('btn-open-remote-modal-bottom');
    if (btnOpenRemoteModalBottom && btnOpenRemoteModal) {
      btnOpenRemoteModalBottom.addEventListener('click', () => {
        btnOpenRemoteModal.click();
      });
    }

    const btnOpenCountdownBottom = document.getElementById('btn-open-countdown-bottom');
    const btnOpenCountdownModal = document.getElementById('btn-open-countdown-modal');
    if (btnOpenCountdownBottom && btnOpenCountdownModal) {
      btnOpenCountdownBottom.addEventListener('click', () => {
        btnOpenCountdownModal.click();
      });
    }

    const btnOpenPadsBottom = document.getElementById('btn-open-pads-bottom');
    const btnOpenPadsModal = document.getElementById('btn-open-pads-modal');
    if (btnOpenPadsBottom && btnOpenPadsModal) {
      btnOpenPadsBottom.addEventListener('click', () => {
        btnOpenPadsModal.click();
      });
    }

    const btnToggleTvClock = document.getElementById('btn-toggle-tv-clock');
    if (btnToggleTvClock) {
      btnToggleTvClock.addEventListener('click', () => {
        state.showClockOnTv = !state.showClockOnTv;
        if (state.showClockOnTv) {
          btnToggleTvClock.innerHTML = '<span>🕒 TV Clock: ON</span>';
          btnToggleTvClock.style.color = '#10b981';
          btnToggleTvClock.style.borderColor = '#34d399';
          btnToggleTvClock.style.background = 'rgba(16, 185, 129, 0.2)';
        } else {
          btnToggleTvClock.innerHTML = '<span>🕒 TV Clock: OFF</span>';
          btnToggleTvClock.style.color = '#f59e0b';
          btnToggleTvClock.style.borderColor = 'rgba(245, 158, 11, 0.4)';
          btnToggleTvClock.style.background = 'rgba(245, 158, 11, 0.12)';
        }
        broadcastDisplayState();
        triggerAutoSave();
      });
    }

    if (btnOpenRemoteModal) {
      btnOpenRemoteModal.addEventListener('click', async () => {
        if (modalRemote) modalRemote.classList.add('open');
        if (window.zionApi && window.zionApi.getRemoteInfo) {
          const info = await window.zionApi.getRemoteInfo();
          if (info) {
            if (remoteQrImg && info.qrCodeDataUrl) {
              remoteQrImg.src = info.qrCodeDataUrl;
            }
            if (remoteUrlDisplay && info.primaryUrl) {
              remoteUrlDisplay.value = info.primaryUrl;
            }
            if (remoteModalStatusText) {
              const count = info.connectedCount || 0;
              remoteModalStatusText.textContent = count > 0 
                ? `Active • ${count} Mobile Device${count > 1 ? 's' : ''} Connected`
                : `Server Active on Local Wi-Fi (${info.localIps ? info.localIps[0] : 'Local'})`;
            }
          }
        }
      });
    }

    if (btnCopyRemoteUrl && remoteUrlDisplay) {
      btnCopyRemoteUrl.addEventListener('click', () => {
        navigator.clipboard.writeText(remoteUrlDisplay.value).then(() => {
          const prev = btnCopyRemoteUrl.textContent;
          btnCopyRemoteUrl.textContent = 'Copied!';
          setTimeout(() => { btnCopyRemoteUrl.textContent = prev; }, 2000);
        });
      });
    }

    if (btnOpenRemoteBrowser && remoteUrlDisplay) {
      btnOpenRemoteBrowser.addEventListener('click', () => {
        if (window.zionApi && window.zionApi.openExternalUrl) {
          window.zionApi.openExternalUrl(remoteUrlDisplay.value);
        } else {
          window.open(remoteUrlDisplay.value, '_blank');
        }
      });
    }
  }

  function projectRemoteScripture(data, pushLive = true) {
    const versionAbbr = (data.versionAbbr || data.version || currentBibleVersion || 'KJV').toUpperCase();
    const vNum = data.verse || '1';
    const itemTitle = `${data.book} ${data.chapter}:${vNum} (${versionAbbr})`;
    const slideBody = `"${data.text || ''}"\n\n— ${data.book} ${data.chapter}:${vNum} (${versionAbbr})`;

    const slides = (Array.isArray(data.slides) && data.slides.length > 0)
      ? data.slides
      : [{ label: itemTitle, body: slideBody }];

    let targetSvcIdx = serviceOrder.findIndex(s => s.title === itemTitle);
    let scriptureItem = targetSvcIdx !== -1 && serviceOrder[targetSvcIdx].data
      ? serviceOrder[targetSvcIdx].data
      : {
          id: `bible-${Date.now()}`,
          title: itemTitle,
          type: 'scripture',
          slides
        };

    if (targetSvcIdx === -1) {
      addToServiceOrder('scripture', itemTitle, scriptureItem);
      targetSvcIdx = serviceOrder.length - 1;
    }

    if (pushLive) {
      selectedServiceIndex = targetSvcIdx;
      renderServiceOrderList();
      loadPresentationItem(scriptureItem, 'scripture', true);
      showToast(`📖 Projected ${itemTitle} Live!`);
    } else {
      syncRemoteStatus();
      showToast(`📖 Added ${itemTitle} to Order of Service`);
    }
  }

  function initRemoteActionListener() {
    if (!window.zionApi || !window.zionApi.onRemoteAction) return;

    window.zionApi.onRemoteAction(({ action, data }) => {
      console.log('[Remote Action Received from Mobile]', action, data);
      if (action === 'next') {
        nextSlide();
      } else if (action === 'prev') {
        prevSlide();
      } else if (action === 'goto') {
        if (data && typeof data.index === 'number') {
          goLiveSlide(data.index);
        }
      } else if (action === 'blackout') {
        toggleBlackout();
      } else if (action === 'clear') {
        toggleClearText();
      } else if (action === 'theme') {
        toggleThemeOnly();
      } else if (action === 'toggle-clock') {
        const btnToggleTvClock = document.getElementById('btn-toggle-tv-clock');
        if (btnToggleTvClock) btnToggleTvClock.click();
      } else if (action === 'alert') {
        if (data && data.text) {
          state.bannerText = data.text;
          state.bannerActive = true;
          broadcastDisplayState();
          triggerAutoSave();
          showToast(`📢 TV Alert: "${data.text}"`);
        }
      } else if (action === 'switch-camera') {
        if (data && data.deviceId) {
          state.cameraDeviceId = data.deviceId;
          if (data.label) state.cameraDeviceLabel = data.label;
          const targetMode = data.mode || (state.cameraEnabled && state.cameraMode !== 'none' ? state.cameraMode : 'preacher');
          updateCameraMode(targetMode);
          if (cameraDeviceSelect) cameraDeviceSelect.value = state.cameraDeviceId;
          if (state.cameraDisplaySectionOpen) renderCameraDisplaySection();
          showToast('📹 Switched to ' + (data.label || 'Camera') + ' from Mobile');
        } else if (data && data.mode) {
          updateCameraMode(data.mode);
          if (state.cameraDisplaySectionOpen) renderCameraDisplaySection();
        }
      } else if (action === 'clear-alert') {
        state.bannerActive = false;
        broadcastDisplayState();
        triggerAutoSave();
        showToast('TV Alert Cleared');
      } else if (action === 'project-scripture') {
        if (data && data.book && data.chapter) {
          projectRemoteScripture(data, true);
        }
      } else if (action === 'add-scripture-service') {
        if (data && data.book && data.chapter) {
          projectRemoteScripture(data, false);
        }
      } else if (action === 'service-launch') {
        const idx = data && typeof data.index === 'number' ? data.index : -1;
        if (idx >= 0 && idx < serviceOrder.length) {
          const svcItem = serviceOrder[idx];
          selectedServiceIndex = idx;
          renderServiceOrderList();
          loadPresentationItem(svcItem.data, svcItem.type, true);
          showToast(`▶ Launched "${svcItem.title}" from Mobile`);
        }
      } else if (action === 'service-move') {
        const idx = data && typeof data.index === 'number' ? data.index : -1;
        const dir = data && typeof data.direction === 'number' ? data.direction : 0;
        const targetIdx = idx + dir;
        if (idx >= 0 && idx < serviceOrder.length && targetIdx >= 0 && targetIdx < serviceOrder.length) {
          const tmp = serviceOrder[idx];
          serviceOrder[idx] = serviceOrder[targetIdx];
          serviceOrder[targetIdx] = tmp;
          if (selectedServiceIndex === idx) selectedServiceIndex = targetIdx;
          else if (selectedServiceIndex === targetIdx) selectedServiceIndex = idx;
          saveStoredLibrary();
          renderServiceOrderList();
        }
      } else if (action === 'service-remove') {
        const idx = data && typeof data.index === 'number' ? data.index : -1;
        if (idx >= 0 && idx < serviceOrder.length) {
          const removed = serviceOrder.splice(idx, 1)[0];
          if (selectedServiceIndex >= serviceOrder.length) {
            selectedServiceIndex = serviceOrder.length - 1;
          }
          saveStoredLibrary();
          renderServiceOrderList();
          if (removed) showToast(`Removed "${removed.title}" from Order of Service`);
        }
      } else if (action === 'service-add-library-item') {
        if (!data || !data.category || !data.id) return;
        let found = null;
        let svcType = 'song';
        if (data.category === 'songs') {
          found = songsLibrary.find(s => s.id === data.id);
          svcType = 'song';
        } else if (data.category === 'media') {
          found = mediaLibrary.find(m => m.id === data.id);
          svcType = (found && (found.type === 'youtube' || found.videoId)) ? 'youtube' : 'media';
        } else if (data.category === 'custom') {
          found = customSlidesLibrary.find(c => c.id === data.id);
          svcType = 'custom';
        }
        if (found) {
          addToServiceOrder(svcType, found.title, found);
          if (data.goLive) {
            selectedServiceIndex = serviceOrder.length - 1;
            renderServiceOrderList();
            loadPresentationItem(found, svcType, true);
            showToast(`⚡ Projected "${found.title}" Live!`);
          } else {
            showToast(`➕ Added "${found.title}" to Order of Service`);
          }
        }
      } else if (action === 'service-add-custom-note') {
        if (!data) return;
        const title = String(data.title || 'Sanctuary Notice').trim();
        const bodyRaw = String(data.body || title).trim();
        const chunks = bodyRaw.split(/\n\s*\n/).filter(c => c.trim().length > 0);
        const slides = chunks.length > 0
          ? chunks.map((chunk, i) => ({
              label: chunks.length > 1 ? `Slide ${i + 1}` : 'Notice',
              body: chunk.trim() === title ? title : `${title}\n\n${chunk.trim()}`
            }))
          : [{ label: 'Notice', body: title }];
        const newCustom = {
          id: `custom-${Date.now()}`,
          title,
          subtitle: 'Mobile Remote Slide',
          theme: 'celestial-clouds',
          slides
        };
        customSlidesLibrary.unshift(newCustom);
        renderCustomSlidesList(customSearchInput ? customSearchInput.value : '');
        renderMediaGallery(mediaSearchInput ? mediaSearchInput.value : '');
        addToServiceOrder('custom', title, newCustom);
        if (data.goLive) {
          selectedServiceIndex = serviceOrder.length - 1;
          renderServiceOrderList();
          loadPresentationItem(newCustom, 'custom', true);
          showToast(`⚡ Projected "${title}" Live!`);
        } else {
          showToast(`➕ Added "${title}" to Order of Service`);
        }
      } else if (action === 'countdown-control') {
        if (typeof remoteControlCountdown === 'function' && data) {
          remoteControlCountdown(data);
        }
      } else if (action === 'stage-message') {
        if (data && data.text) {
          stageAlertMessageText = data.text;
          stageAlertMessageActive = true;
          syncRemoteStatus();
          showToast(`🤫 Secret note sent to Preacher Stage Display: "${data.text}"`);
        }
      } else if (action === 'clear-stage-message') {
        stageAlertMessageText = '';
        stageAlertMessageActive = false;
        syncRemoteStatus();
        showToast('Stage screen note cleared');
      }
    });
  }

  // =========================================================================
  // 11e. PREACHER & CHOIR STAGE DISPLAY / CONFIDENCE MONITOR
  // =========================================================================
  function initStageModal() {
    const btnOpenStageModal = document.getElementById('btn-open-stage-modal');
    const modalStage = document.getElementById('modal-stage');
    const btnLaunchStageWin = document.getElementById('btn-launch-stage-win');
    const stageUrlDisplay = document.getElementById('stage-url-display');
    const btnCopyStageUrl = document.getElementById('btn-copy-stage-url');
    const btnOpenStageBrowser = document.getElementById('btn-open-stage-browser');
    const obsUrlDisplay = document.getElementById('obs-url-display');
    const btnCopyObsUrl = document.getElementById('btn-copy-obs-url');
    const techStageMsgInput = document.getElementById('tech-stage-msg-input');
    const btnSendStageMsg = document.getElementById('btn-send-stage-msg');
    const btnClearStageMsg = document.getElementById('btn-clear-stage-msg');

    if (btnOpenStageModal) {
      btnOpenStageModal.addEventListener('click', async () => {
        if (modalStage) modalStage.classList.add('open');
        if (window.zionApi && window.zionApi.getRemoteInfo) {
          const info = await window.zionApi.getRemoteInfo();
          if (info) {
            if (stageUrlDisplay && info.stageUrl) stageUrlDisplay.value = info.stageUrl;
            if (obsUrlDisplay && info.lowerThirdsUrl) obsUrlDisplay.value = info.lowerThirdsUrl;
          }
        }
      });
    }

    if (btnLaunchStageWin) {
      btnLaunchStageWin.addEventListener('click', async () => {
        if (window.zionApi && window.zionApi.launchStageDisplay) {
          await window.zionApi.launchStageDisplay();
        }
      });
    }

    if (btnCopyStageUrl && stageUrlDisplay) {
      btnCopyStageUrl.addEventListener('click', () => {
        navigator.clipboard.writeText(stageUrlDisplay.value).then(() => {
          const prev = btnCopyStageUrl.textContent;
          btnCopyStageUrl.textContent = 'Copied!';
          setTimeout(() => { btnCopyStageUrl.textContent = prev; }, 2000);
        });
      });
    }

    if (btnOpenStageBrowser && stageUrlDisplay) {
      btnOpenStageBrowser.addEventListener('click', () => {
        if (window.zionApi && window.zionApi.openExternalUrl) {
          window.zionApi.openExternalUrl(stageUrlDisplay.value);
        } else {
          window.open(stageUrlDisplay.value, '_blank');
        }
      });
    }

    if (btnCopyObsUrl && obsUrlDisplay) {
      btnCopyObsUrl.addEventListener('click', () => {
        navigator.clipboard.writeText(obsUrlDisplay.value).then(() => {
          const prev = btnCopyObsUrl.textContent;
          btnCopyObsUrl.textContent = 'Copied!';
          setTimeout(() => { btnCopyObsUrl.textContent = prev; }, 2000);
        });
      });
    }

    // Private Tech Booth to Preacher Message
    if (btnSendStageMsg && techStageMsgInput) {
      btnSendStageMsg.addEventListener('click', () => {
        const text = techStageMsgInput.value.trim();
        if (text) {
          stageAlertMessageText = text;
          stageAlertMessageActive = true;
          syncRemoteStatus();
          btnSendStageMsg.textContent = 'Sent!';
          setTimeout(() => { btnSendStageMsg.textContent = 'Send Alert'; }, 1500);
        }
      });
    }

    if (btnClearStageMsg) {
      btnClearStageMsg.addEventListener('click', () => {
        stageAlertMessageText = '';
        stageAlertMessageActive = false;
        if (techStageMsgInput) techStageMsgInput.value = '';
        syncRemoteStatus();
      });
    }

    // Preset buttons
    document.querySelectorAll('.btn-stage-preset').forEach(btn => {
      btn.addEventListener('click', () => {
        const msg = btn.dataset.msg;
        if (msg) {
          if (techStageMsgInput) techStageMsgInput.value = msg;
          stageAlertMessageText = msg;
          stageAlertMessageActive = true;
          syncRemoteStatus();
        }
      });
    });
  }

  // =========================================================================
  // 11f. PRE-SERVICE COUNTDOWN TIMER CONTROLLER (SLEEK BROADCAST HUD)
  // =========================================================================
  function initCountdownTimer() {
    const btnOpenCountdownModal = document.getElementById('btn-open-countdown-modal');
    const modalCountdown = document.getElementById('modal-countdown');
    const digitsDisplay = document.getElementById('countdown-ctrl-digits');
    const titlePreview = document.getElementById('countdown-ctrl-title-preview');
    const statusText = document.getElementById('countdown-ctrl-status');
    const inputTitle = document.getElementById('countdown-input-title');
    const inputMinutes = document.getElementById('countdown-input-minutes');
    const selectPosition = document.getElementById('countdown-select-position');
    const selectSize = document.getElementById('countdown-select-size');
    const btnStart = document.getElementById('btn-countdown-start');
    const btnPause = document.getElementById('btn-countdown-pause');
    const btnReset = document.getElementById('btn-countdown-reset');
    const btnProjectToggle = document.getElementById('btn-countdown-project-toggle');

    function formatTime(sec) {
      const s = Math.max(0, Math.floor(sec));
      const m = Math.floor(s / 60);
      const rem = s % 60;
      return String(m).padStart(2, '0') + ':' + String(rem).padStart(2, '0');
    }

    function setCountdownProjectedUI(projected) {
      countdownProjected = !!projected;
      if (btnProjectToggle) {
        if (countdownProjected) {
          btnProjectToggle.textContent = '🟢 Showing on TV (Click to Hide)';
          btnProjectToggle.style.background = '#10b981';
          btnProjectToggle.style.borderColor = '#34d399';
        } else {
          btnProjectToggle.textContent = '🔴 Send to Projector';
          btnProjectToggle.style.background = '#dc2626';
          btnProjectToggle.style.borderColor = '#ef4444';
        }
      }
    }

    function updateTimerUI() {
      if (digitsDisplay) digitsDisplay.textContent = formatTime(countdownRemainingSec);
      if (titlePreview && inputTitle) titlePreview.textContent = inputTitle.value.trim() || 'SERVICE BEGINS IN';
      if (selectPosition && selectPosition.value !== countdownPosition) selectPosition.value = countdownPosition;
      if (selectSize && selectSize.value !== countdownSize) selectSize.value = countdownSize;
      if (statusText) {
        if (countdownRunning) {
          statusText.textContent = countdownProjected ? 'STATUS: LIVE ON TV' : 'STATUS: RUNNING (HIDDEN)';
          statusText.style.color = '#f59e0b';
        } else if (countdownRemainingSec <= 0) {
          statusText.textContent = 'STATUS: FINISHED';
          statusText.style.color = '#10b981';
        } else {
          statusText.textContent = countdownProjected ? 'STATUS: PAUSED ON TV' : 'STATUS: READY';
          statusText.style.color = '#10b981';
        }
      }
      if (btnStart) {
        btnStart.textContent = countdownRunning ? '▶ Running...' : '▶ Start Timer';
      }
    }

    function syncCountdown() {
      countdownTitleText = (inputTitle ? inputTitle.value.trim() : '') || 'Service Begins In';
      broadcastDisplayState();
    }

    function startTimer() {
      if (countdownRunning) return;
      if (countdownRemainingSec <= 0) {
        const mins = parseInt(inputMinutes ? inputMinutes.value : '5', 10) || 5;
        countdownTotalSec = mins * 60;
        countdownRemainingSec = countdownTotalSec;
      }
      countdownRunning = true;
      // Automatically show on TV when operator starts countdown!
      setCountdownProjectedUI(true);

      // Auto-launch TV output if not yet open
      if (window.zionApi && !state.displayOpen) {
        const targetScreenId = selectTargetScreen ? selectTargetScreen.value : null;
        window.zionApi.launchDisplay(targetScreenId).then(() => {
          updateTvStatusUI(true);
          setTimeout(() => broadcastDisplayState(), 200);
        });
      }

      updateTimerUI();
      syncCountdown();

      if (countdownTimerId) clearInterval(countdownTimerId);
      countdownTimerId = setInterval(() => {
        countdownRemainingSec--;
        if (countdownRemainingSec <= 0) {
          countdownRemainingSec = 0;
          pauseTimer();
        }
        updateTimerUI();
        syncCountdown();
      }, 1000);
    }

    function pauseTimer() {
      if (countdownTimerId) {
        clearInterval(countdownTimerId);
        countdownTimerId = null;
      }
      countdownRunning = false;
      updateTimerUI();
      syncCountdown();
    }

    function resetTimer() {
      pauseTimer();
      const mins = parseInt(inputMinutes ? inputMinutes.value : '5', 10) || 5;
      countdownTotalSec = mins * 60;
      countdownRemainingSec = countdownTotalSec;
      updateTimerUI();
      syncCountdown();
    }

    // Expose remote control hook for smartphones
    remoteControlCountdown = (payload) => {
      if (!payload || !payload.cmd) return;
      if (payload.cmd === 'start') {
        startTimer();
      } else if (payload.cmd === 'pause') {
        pauseTimer();
      } else if (payload.cmd === 'reset') {
        resetTimer();
      } else if (payload.cmd === 'toggle-project') {
        setCountdownProjectedUI(!countdownProjected);
        updateTimerUI();
        syncCountdown();
      } else if (payload.cmd === 'set-minutes') {
        const mins = Math.max(1, parseInt(payload.minutes, 10) || 5);
        if (inputMinutes) inputMinutes.value = mins;
        pauseTimer();
        countdownTotalSec = mins * 60;
        countdownRemainingSec = countdownTotalSec;
        updateTimerUI();
        syncCountdown();
      } else if (payload.cmd === 'set-style') {
        if (payload.position) countdownPosition = payload.position;
        if (payload.size) countdownSize = payload.size;
        updateTimerUI();
        syncCountdown();
        triggerAutoSave();
      }
    };

    if (btnOpenCountdownModal) {
      btnOpenCountdownModal.addEventListener('click', () => {
        if (modalCountdown) modalCountdown.classList.add('open');
        updateTimerUI();
      });
    }

    if (btnStart) btnStart.addEventListener('click', startTimer);
    if (btnPause) btnPause.addEventListener('click', pauseTimer);
    if (btnReset) btnReset.addEventListener('click', resetTimer);

    if (selectPosition) {
      selectPosition.addEventListener('change', () => {
        countdownPosition = selectPosition.value || 'top-right';
        syncCountdown();
        triggerAutoSave();
      });
    }

    if (selectSize) {
      selectSize.addEventListener('change', () => {
        countdownSize = selectSize.value || 'compact';
        syncCountdown();
        triggerAutoSave();
      });
    }

    if (inputMinutes) {
      inputMinutes.addEventListener('change', () => {
        if (!countdownRunning) {
          const mins = Math.max(1, parseInt(inputMinutes.value, 10) || 5);
          countdownTotalSec = mins * 60;
          countdownRemainingSec = countdownTotalSec;
          updateTimerUI();
          syncCountdown();
        }
      });
    }

    if (inputTitle) {
      inputTitle.addEventListener('input', () => {
        if (titlePreview) titlePreview.textContent = inputTitle.value.trim() || 'SERVICE BEGINS IN';
        syncCountdown();
      });
    }

    // Preset buttons (5, 10, 15, 20 mins)
    document.querySelectorAll('.btn-countdown-preset').forEach(btn => {
      btn.addEventListener('click', () => {
        const mins = parseInt(btn.dataset.min, 10) || 5;
        if (inputMinutes) inputMinutes.value = mins;
        pauseTimer();
        countdownTotalSec = mins * 60;
        countdownRemainingSec = countdownTotalSec;
        updateTimerUI();
        syncCountdown();
      });
    });

    // Toggle live projector output
    if (btnProjectToggle) {
      btnProjectToggle.addEventListener('click', () => {
        setCountdownProjectedUI(!countdownProjected);
        updateTimerUI();
        syncCountdown();
      });
    }
  }

  // =========================================================================
  // 11g. AMBIENT WORSHIP PAD PLAYER (Continuous Sanctuary Synth Drone)
  // =========================================================================
  class AmbientPadSynth {
    constructor() {
      this.ctx = null;
      this.activeKey = null;
      this.activeGain = null;
      this.activeOscillators = [];
      this.activeLFO = null;
      this.tone = 'naija-worship';
      this.octave = 'normal';
      this.volume = 0.75;
      this.fadeDuration = 2.4;

      this.frequencies = {
        'C': 130.81, 'C#': 138.59, 'D': 146.83, 'D#': 155.56,
        'E': 164.81, 'F': 174.61, 'F#': 185.00, 'G': 196.00,
        'G#': 207.65, 'A': 220.00, 'A#': 233.08, 'B': 246.94
      };
    }

    ensureContext() {
      if (!this.ctx) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AudioCtx();
      }
      if (this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
    }

    playKey(key) {
      this.ensureContext();
      const baseFreq = this.frequencies[key];
      if (!baseFreq) return;

      // Smooth crossfade out old oscillators
      if (this.activeGain) {
        const oldGain = this.activeGain;
        const oldOscs = this.activeOscillators;
        const oldLfo = this.activeLFO;
        const now = this.ctx.currentTime;
        oldGain.gain.setValueAtTime(oldGain.gain.value, now);
        oldGain.gain.exponentialRampToValueAtTime(0.0001, now + this.fadeDuration);
        setTimeout(() => {
          oldOscs.forEach(o => {
            try { o.stop(); o.disconnect(); } catch (e) {}
          });
          if (oldLfo) {
            try { oldLfo.stop(); oldLfo.disconnect(); } catch (e) {}
          }
        }, this.fadeDuration * 1000 + 100);
      }

      this.activeKey = key;
      this.activeOscillators = [];
      this.activeLFO = null;

      // Master Pad Gain node with smooth swell
      const newGain = this.ctx.createGain();
      const targetGain = Math.max(0.0001, this.volume * 0.38);
      newGain.gain.setValueAtTime(0.0001, this.ctx.currentTime);
      newGain.gain.exponentialRampToValueAtTime(targetGain, this.ctx.currentTime + 2.0);
      newGain.connect(this.ctx.destination);
      this.activeGain = newGain;

      // Primary Warm Lowpass Filter
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      let cutoff = 520;
      if (this.tone === 'pentecostal-anointing') cutoff = 360;
      if (this.tone === 'shekinah-choir') cutoff = 680;
      if (this.tone === 'celestial-shimmer') cutoff = 780;
      if (this.tone === 'cathedral-organ') cutoff = 400;
      if (this.tone === 'deep-atmosphere') cutoff = 310;
      filter.frequency.setValueAtTime(cutoff, this.ctx.currentTime);
      filter.Q.setValueAtTime(2.2, this.ctx.currentTime);
      filter.connect(newGain);

      // Slow Breathing LFO (Low-Frequency Oscillator) for Living Congregation Swell
      // Modulates filter frequency gently at ~0.085Hz (11.7s breathing cycle)
      try {
        const lfo = this.ctx.createOscillator();
        const lfoGain = this.ctx.createGain();
        lfo.frequency.setValueAtTime(0.085, this.ctx.currentTime);
        lfoGain.gain.setValueAtTime(55, this.ctx.currentTime);
        lfo.connect(lfoGain);
        lfoGain.connect(filter.frequency);
        lfo.start();
        this.activeLFO = lfo;
      } catch (_) {}

      let octMult = 1.0;
      if (this.octave === 'sub') octMult = 0.5;
      if (this.octave === 'high') octMult = 2.0;

      const root = baseFreq * octMult;
      const sub = root * 0.5;
      const fifth = root * 1.498307;
      const octave = root * 2.0;
      const ninth = root * 2.244924; // Major 9th / Sus2 (Soul of Nigerian Worship)
      const tenth = root * 2.519842; // Major 3rd upper octave
      const highShimmer = root * 4.0;

      // Authentic Nigerian Church Worship Voices (Warm Chord Suspension, Zero Percussion)
      let voices = [];

      if (this.tone === 'naija-worship') {
        voices = [
          { freq: sub, detune: 0, type: 'sine', gain: 0.38 },
          { freq: root, detune: -4, type: 'sawtooth', gain: 0.20 },
          { freq: root, detune: 4, type: 'triangle', gain: 0.32 },
          { freq: fifth, detune: -2, type: 'sawtooth', gain: 0.18 },
          { freq: fifth, detune: 3, type: 'sine', gain: 0.25 },
          { freq: ninth, detune: 0, type: 'triangle', gain: 0.22 },
          { freq: tenth, detune: -3, type: 'sine', gain: 0.16 },
          { freq: octave, detune: 2, type: 'sine', gain: 0.20 },
          { freq: highShimmer, detune: 0, type: 'sine', gain: 0.10 }
        ];
      } else if (this.tone === 'pentecostal-anointing') {
        voices = [
          { freq: sub, detune: -2, type: 'sine', gain: 0.45 },
          { freq: root, detune: 0, type: 'sine', gain: 0.40 },
          { freq: fifth, detune: -3, type: 'triangle', gain: 0.25 },
          { freq: octave, detune: 3, type: 'sine', gain: 0.22 }
        ];
      } else if (this.tone === 'shekinah-choir') {
        voices = [
          { freq: sub, detune: 0, type: 'sine', gain: 0.30 },
          { freq: root, detune: -5, type: 'sawtooth', gain: 0.22 },
          { freq: root, detune: 5, type: 'sawtooth', gain: 0.22 },
          { freq: fifth, detune: -2, type: 'triangle', gain: 0.25 },
          { freq: ninth, detune: 2, type: 'sine', gain: 0.20 },
          { freq: octave, detune: 0, type: 'sine', gain: 0.25 },
          { freq: highShimmer, detune: 0, type: 'sine', gain: 0.14 }
        ];
      } else {
        voices = [
          { freq: root, detune: -4, type: 'sawtooth', gain: 0.28 },
          { freq: root, detune: 4, type: 'sawtooth', gain: 0.28 },
          { freq: root, detune: 0, type: 'sine', gain: 0.45 },
          { freq: fifth, detune: -3, type: 'sawtooth', gain: 0.22 },
          { freq: fifth, detune: 3, type: 'sine', gain: 0.30 },
          { freq: octave, detune: 0, type: 'sine', gain: 0.20 }
        ];
      }

      voices.forEach(v => {
        const osc = this.ctx.createOscillator();
        const vGain = this.ctx.createGain();
        osc.type = v.type;
        osc.frequency.setValueAtTime(v.freq, this.ctx.currentTime);
        osc.detune.setValueAtTime(v.detune, this.ctx.currentTime);
        vGain.gain.setValueAtTime(v.gain, this.ctx.currentTime);

        osc.connect(vGain);
        vGain.connect(filter);
        osc.start();
        this.activeOscillators.push(osc);
      });
    }

    stop() {
      if (!this.activeGain || !this.ctx) {
        this.activeKey = null;
        return;
      }
      const oldGain = this.activeGain;
      const oldOscs = this.activeOscillators;
      const now = this.ctx.currentTime;
      oldGain.gain.setValueAtTime(oldGain.gain.value, now);
      oldGain.gain.exponentialRampToValueAtTime(0.0001, now + 1.8);
      this.activeKey = null;
      this.activeGain = null;
      this.activeOscillators = [];
      setTimeout(() => {
        oldOscs.forEach(o => {
          try { o.stop(); o.disconnect(); } catch (e) {}
        });
      }, 2000);
    }

    setVolume(vol) {
      this.volume = Math.max(0, Math.min(1, vol));
      if (this.activeGain && this.ctx) {
        this.activeGain.gain.setValueAtTime(Math.max(0.0001, this.volume * 0.35), this.ctx.currentTime);
      }
    }

    setTone(tone) {
      this.tone = tone;
      if (this.activeKey) this.playKey(this.activeKey);
    }

    setOctave(octave) {
      this.octave = octave;
      if (this.activeKey) this.playKey(this.activeKey);
    }
  }

  const padSynth = new AmbientPadSynth();

  function initAmbientWorshipPads() {
    const btnOpenPadsModal = document.getElementById('btn-open-pads-modal');
    const modalPads = document.getElementById('modal-pads');
    const nowPlayingText = document.getElementById('pad-now-playing');
    const toneDescText = document.getElementById('pad-tone-desc');
    const selectTone = document.getElementById('pad-select-tone');
    const selectOctave = document.getElementById('pad-select-octave');
    const volumeSlider = document.getElementById('pad-volume-slider');
    const volumeLabel = document.getElementById('pad-volume-label');
    const btnStopPad = document.getElementById('btn-pad-stop');
    const keyButtons = document.querySelectorAll('.pad-key-btn');

    if (btnOpenPadsModal) {
      btnOpenPadsModal.addEventListener('click', () => {
        if (modalPads) modalPads.classList.add('open');
      });
    }

    keyButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.key;
        if (!key) return;

        keyButtons.forEach(b => b.classList.remove('pad-active'));
        btn.classList.add('pad-active');

        padSynth.playKey(key);
        if (nowPlayingText) {
          nowPlayingText.textContent = `▶ Playing: Key of ${key}`;
          nowPlayingText.style.color = '#10b981';
        }
        if (btnOpenPadsModal) {
          btnOpenPadsModal.style.color = '#34d399';
          btnOpenPadsModal.style.borderColor = '#10b981';
        }
      });
    });

    if (btnStopPad) {
      btnStopPad.addEventListener('click', () => {
        padSynth.stop();
        keyButtons.forEach(b => b.classList.remove('pad-active'));
        if (nowPlayingText) {
          nowPlayingText.textContent = 'Pad Silent (Tap a Key Below)';
          nowPlayingText.style.color = '#f59e0b';
        }
        if (btnOpenPadsModal) {
          btnOpenPadsModal.style.color = '#a855f7';
          btnOpenPadsModal.style.borderColor = 'rgba(168, 85, 247, 0.35)';
        }
      });
    }

    if (selectTone) {
      selectTone.addEventListener('change', () => {
        padSynth.setTone(selectTone.value);
        if (toneDescText) {
          toneDescText.textContent = selectTone.options[selectTone.selectedIndex].text;
        }
      });
    }

    if (selectOctave) {
      selectOctave.addEventListener('change', () => {
        padSynth.setOctave(selectOctave.value);
      });
    }

    if (volumeSlider) {
      volumeSlider.addEventListener('input', () => {
        const val = parseInt(volumeSlider.value, 10);
        if (volumeLabel) volumeLabel.textContent = `${val}%`;
        padSynth.setVolume(val / 100);
      });
    }
  }

  // =========================================================================
  // 11h. PARALLEL DUAL-BIBLE SCRIPTURE COMPARISON CONTROLLER
  // =========================================================================
  async function loadSecondaryBibleData(version = 'rsv') {
    const safeVer = ['kjv', 'rsv', 'gnt'].includes(String(version).toLowerCase())
      ? String(version).toLowerCase()
      : 'rsv';

    secondaryBibleVersion = safeVer;

    if (bibleVersionsCache[safeVer]) {
      secondaryBibleDatabase = bibleVersionsCache[safeVer];
      return secondaryBibleDatabase;
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
        console.warn(`Could not load secondary ${safeVer.toUpperCase()} Bible JSON:`, e);
      }
    }

    if (data && data.books) {
      bibleVersionsCache[safeVer] = data;
      secondaryBibleDatabase = data;
    }
    return secondaryBibleDatabase;
  }

  function initDualBibleComparison() {
    const compareToggle = document.getElementById('bible-compare-toggle');
    const secondaryWrap = document.getElementById('bible-compare-secondary-wrap');
    const secondarySelect = document.getElementById('bible-version-secondary');

    if (compareToggle) {
      compareToggle.addEventListener('change', async () => {
        isDualBibleCompare = compareToggle.checked;
        if (secondaryWrap) secondaryWrap.style.display = isDualBibleCompare ? 'flex' : 'none';
        if (isDualBibleCompare) {
          await loadSecondaryBibleData(secondarySelect ? secondarySelect.value : 'rsv');
        }
        doBibleLookup();
      });
    }

    if (secondarySelect) {
      secondarySelect.addEventListener('change', async () => {
        await loadSecondaryBibleData(secondarySelect.value);
        if (isDualBibleCompare) doBibleLookup();
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
    if (serviceOrder.length === 0) return;
    askConfirm('Clear entire Sunday Order of Service?', 'Clear Service Order', 'Clear All').then((yes) => {
      if (yes) {
        serviceOrder = [];
        selectedServiceIndex = -1;
        saveStoredLibrary();
        renderServiceOrderList();
        showToast('Order of Service cleared', 'info');
      }
    });
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
    focusInputSafely(document.getElementById('song-form-title'));
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
      btnFastBlackout.addEventListener('click', toggleBlackout);
    }

    if (btnFastTheme) {
      btnFastTheme.addEventListener('click', toggleThemeOnly);
    }

    if (btnFastClear) {
      btnFastClear.addEventListener('click', toggleClearText);
    }

    // =========================================================================
    // ENHANCED NURSERY & CONGREGATION ALERT BANNER CONTROLS
    // =========================================================================
    const bannerInputText = document.getElementById('banner-input-text');
    const bannerCharCount = document.getElementById('banner-char-count');
    const bannerStatusBadge = document.getElementById('banner-modal-status-badge');
    const bannerModalPreview = document.getElementById('banner-modal-preview-banner');
    const bannerPreviewText = document.getElementById('banner-preview-text');
    const bannerPreviewIcon = document.getElementById('banner-preview-icon');
    const bannerDismissSelect = document.getElementById('banner-auto-dismiss-select');
    const bannerChipButtons = document.querySelectorAll('.banner-chip-btn');
    const bannerStyleButtons = document.querySelectorAll('.banner-style-btn');
    const bannerLayoutButtons = document.querySelectorAll('.banner-layout-btn');

    function updateBannerModalPreview() {
      const text = bannerInputText ? bannerInputText.value.trim() : '';
      if (bannerCharCount && bannerInputText) {
        bannerCharCount.textContent = `${bannerInputText.value.length} / 180`;
      }

      const style = state.bannerStyle || 'urgent-red';
      const layout = state.bannerLayout || 'bar';

      let icon = '📢';
      if (style === 'urgent-red') icon = '🚨';
      else if (style === 'amber-warning') icon = '⚠️';
      else if (style === 'royal-blue') icon = '📢';
      else if (style === 'celebration-green') icon = '🕊️';
      else if (style === 'obsidian-glass') icon = '✨';

      if (bannerPreviewIcon) bannerPreviewIcon.textContent = icon;
      if (bannerPreviewText) bannerPreviewText.textContent = text || 'Sample alert notification text here...';

      if (bannerModalPreview) {
        bannerModalPreview.className = `banner-preview-banner ${style} layout-${layout}`;
      }

      if (bannerStatusBadge) {
        if (state.bannerActive && state.bannerText) {
          bannerStatusBadge.textContent = 'LIVE ON AIR';
          bannerStatusBadge.className = 'badge-status-pill badge-live';
        } else {
          bannerStatusBadge.textContent = 'OFF AIR';
          bannerStatusBadge.className = 'badge-status-pill badge-idle';
        }
      }
    }

    if (bannerInputText) {
      bannerInputText.addEventListener('input', updateBannerModalPreview);
    }

    if (bannerChipButtons) {
      bannerChipButtons.forEach(chip => {
        chip.addEventListener('click', () => {
          const tmpl = chip.dataset.template || '';
          const chipStyle = chip.dataset.style || '';
          if (bannerInputText) bannerInputText.value = tmpl;
          if (chipStyle) {
            state.bannerStyle = chipStyle;
            bannerStyleButtons.forEach(btn => btn.classList.toggle('active', btn.dataset.style === chipStyle));
          }
          updateBannerModalPreview();
          if (bannerInputText) bannerInputText.focus();
        });
      });
    }

    if (bannerStyleButtons) {
      bannerStyleButtons.forEach(btn => {
        btn.addEventListener('click', () => {
          state.bannerStyle = btn.dataset.style || 'urgent-red';
          bannerStyleButtons.forEach(b => b.classList.toggle('active', b === btn));
          updateBannerModalPreview();
        });
      });
    }

    if (bannerLayoutButtons) {
      bannerLayoutButtons.forEach(btn => {
        btn.addEventListener('click', () => {
          state.bannerLayout = btn.dataset.layout || 'bar';
          bannerLayoutButtons.forEach(b => b.classList.toggle('active', b === btn));
          updateBannerModalPreview();
        });
      });
    }

    if (bannerDismissSelect) {
      bannerDismissSelect.addEventListener('change', () => {
        state.bannerAutoDismiss = parseInt(bannerDismissSelect.value, 10) || 0;
      });
    }

    // Alert Banner Modal Open
    if (btnOpenBanner) {
      btnOpenBanner.addEventListener('click', () => {
        if (modalBanner) modalBanner.classList.add('open');
        if (bannerInputText && state.bannerText) {
          bannerInputText.value = state.bannerText;
        }
        if (bannerDismissSelect && state.bannerAutoDismiss !== undefined) {
          bannerDismissSelect.value = String(state.bannerAutoDismiss);
        }
        bannerStyleButtons.forEach(btn => btn.classList.toggle('active', btn.dataset.style === state.bannerStyle));
        bannerLayoutButtons.forEach(btn => btn.classList.toggle('active', btn.dataset.layout === state.bannerLayout));
        updateBannerModalPreview();
        focusInputSafely(bannerInputText);
      });
    }

    const btnPubBanner = document.getElementById('btn-publish-banner');
    if (btnPubBanner) {
      btnPubBanner.addEventListener('click', () => {
        const text = bannerInputText ? bannerInputText.value.trim() : '';
        if (!text) {
          showToast('Please enter alert banner text first.', 'warning');
          flashInvalidInput(bannerInputText);
          return;
        }
        state.bannerText = text;
        state.bannerActive = true;
        if (btnOpenBanner) {
          btnOpenBanner.style.color = 'var(--accent-red)';
          btnOpenBanner.style.borderColor = 'var(--accent-red)';
          btnOpenBanner.style.boxShadow = '0 0 10px rgba(239, 68, 68, 0.4)';
        }
        if (window.zionApi && !state.displayOpen) {
          const targetScreenId = selectTargetScreen ? selectTargetScreen.value : null;
          window.zionApi.launchDisplay(targetScreenId).then(() => {
            updateTvStatusUI(true);
            setTimeout(() => broadcastDisplayState(), 200);
          });
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
        if (bannerInputText) bannerInputText.value = '';
        if (btnOpenBanner) {
          btnOpenBanner.style.color = 'var(--text-main)';
          btnOpenBanner.style.borderColor = 'var(--border-subtle)';
          btnOpenBanner.style.boxShadow = 'none';
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

        // Auto-refresh pane content & auto-focus primary search input when switching tabs
        if (tabId === 'tab-media') {
          renderMediaGallery(mediaSearchInput ? mediaSearchInput.value : '');
        } else if (tabId === 'tab-themes') {
          renderThemesPresetGrid();
        } else if (tabId === 'tab-songs') {
          renderSongsList(songsSearchInput ? songsSearchInput.value : '');
          focusInputSafely(songsSearchInput);
        } else if (tabId === 'tab-bibles') {
          if (!bibleDatabase) loadBibleData();
          focusInputSafely(bibleQuickSearch);
        } else if (tabId === 'tab-camera') {
          enumerateVideoDevices();
        }
      });
    });

    // Search filters
    if (songsSearchInput) songsSearchInput.addEventListener('input', (e) => renderSongsList(e.target.value));
    if (customSearchInput) customSearchInput.addEventListener('input', (e) => renderCustomSlidesList(e.target.value));


    // Camera Studio & Video Switcher Buttons
    
    // Viewfinder Action Buttons: STRICT TV CONTROL
    const btnVfAddPreacher = document.getElementById('btn-vf-add-preacher') || document.getElementById('btn-vf-take-live');
    if (btnVfAddPreacher) {
      btnVfAddPreacher.addEventListener('click', () => {
        const devId = selectedViewfinderDeviceId || state.cameraDeviceId;
        const dev = (state.videoDevices || []).find(d => d.deviceId === devId) || state.videoDevices[0];
        if (dev) {
          switchCameraSource(dev.deviceId, dev.label, 'preacher');
        } else {
          updateCameraMode('preacher');
        }
      });
    }

    const btnVfAddWorship = document.getElementById('btn-vf-add-worship') || document.getElementById('btn-vf-worship-bg');
    if (btnVfAddWorship) {
      btnVfAddWorship.addEventListener('click', () => {
        const devId = selectedViewfinderDeviceId || state.cameraDeviceId;
        const dev = (state.videoDevices || []).find(d => d.deviceId === devId) || state.videoDevices[0];
        if (dev) {
          switchCameraSource(dev.deviceId, dev.label, 'background');
        } else {
          updateCameraMode('background');
        }
      });
    }

    const btnVfRemoveTv = document.getElementById('btn-vf-remove-tv') || document.getElementById('btn-vf-cam-off');
    if (btnVfRemoveTv) {
      btnVfRemoveTv.addEventListener('click', () => {
        updateCameraMode('none');
        showToast('⏹️ Camera removed from congregation TV');
      });
    }

    const btnToggleCamFilter = document.getElementById('btn-toggle-cam-filter');
    if (btnToggleCamFilter) {
      btnToggleCamFilter.addEventListener('click', () => {
        filterConnectedCamerasOnly = !filterConnectedCamerasOnly;
        renderCameraDisplaySection();
        showToast(filterConnectedCamerasOnly ? '🟢 Filter: Showing only connected cameras' : '⚙️ Filter: Showing all hardware drivers');
      });
    }

        const btnOpenCamStudio = document.getElementById('btn-open-camera-studio');
    if (btnOpenCamStudio) {
      btnOpenCamStudio.addEventListener('click', () => {
        if (state.cameraDisplaySectionOpen) {
          closeCameraDisplaySection();
        } else {
          openCameraDisplaySection();
        }
      });
    }

    const btnOpenCamWallLeft = document.getElementById('btn-open-cam-wall-left');
    if (btnOpenCamWallLeft) {
      btnOpenCamWallLeft.addEventListener('click', openCameraDisplaySection);
    }

    const btnCamViewClose = document.getElementById('btn-cam-view-close');
    if (btnCamViewClose) {
      btnCamViewClose.addEventListener('click', closeCameraDisplaySection);
    }

    const btnCamViewRefresh = document.getElementById('btn-cam-view-refresh');
    if (btnCamViewRefresh) {
      btnCamViewRefresh.addEventListener('click', () => {
        enumerateVideoDevices();
        showToast('🔄 Rescanned cameras');
      });
    }

    const btnCamViewPreacher = document.getElementById('btn-cam-view-preacher');
    if (btnCamViewPreacher) {
      btnCamViewPreacher.addEventListener('click', () => updateCameraMode('preacher'));
    }

    const btnCamViewWorship = document.getElementById('btn-cam-view-worship');
    if (btnCamViewWorship) {
      btnCamViewWorship.addEventListener('click', () => updateCameraMode('background'));
    }

    const btnCamViewOff = document.getElementById('btn-cam-view-off');
    if (btnCamViewOff) {
      btnCamViewOff.addEventListener('click', () => updateCameraMode('none'));
    }

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
        const found = state.videoDevices.find(d => d.deviceId === state.cameraDeviceId);
        state.cameraDeviceLabel = found ? (found.label || '') : '';
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

    // Browse custom background file (any video or any image)
    if (btnPickCustomBg) {
      btnPickCustomBg.addEventListener('click', async () => {
        if (window.zionApi && window.zionApi.openFileDialog) {
          const res = await window.zionApi.openFileDialog({
            title: 'Select Background Video or Image',
            filters: [
              { name: 'All Media Files (Images & Videos)', extensions: [...ALL_IMAGE_EXTS, ...ALL_VIDEO_EXTS] },
              { name: 'All Videos', extensions: [...ALL_VIDEO_EXTS] },
              { name: 'All Images', extensions: [...ALL_IMAGE_EXTS] },
              { name: 'All Files (*.*)', extensions: ['*'] }
            ]
          });
          if (res && !res.canceled && res.filePaths.length > 0) {
            const filePath = res.filePaths[0];
            const isVideo = isVideoFile(filePath);
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
            showToast('Service order saved successfully!', 'success');
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
                  showToast(`Loaded "${parsed.title || 'Service Order'}"`, 'success');
                }
              } catch (err) {
                showToast('Failed to parse service file: ' + err.message, 'error');
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
      focusInputSafely(document.getElementById('import-raw-text'));
    });

    const openCustomAnnouncementModal = () => {
      if (modalCustom) modalCustom.classList.add('open');
      focusInputSafely(document.getElementById('custom-form-title'));
    };

    const btnAddCustomModal = document.getElementById('btn-add-custom-modal');
    if (btnAddCustomModal) btnAddCustomModal.addEventListener('click', openCustomAnnouncementModal);

    const btnQuickAnnouncement = document.getElementById('btn-quick-announcement');
    if (btnQuickAnnouncement) btnQuickAnnouncement.addEventListener('click', openCustomAnnouncementModal);

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
          showToast('Please enter a song title.', 'warning');
          flashInvalidInput(document.getElementById('song-form-title'));
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
        showToast(`Imported "${parsed.title}" (${parsed.slides.length} slides)`, 'success');
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
          showToast('Please enter a title for the announcement slide.', 'warning');
          flashInvalidInput(document.getElementById('custom-form-title'));
          return;
        }

        const chunks = content.split(/\n\s*\n/).filter(c => c.trim().length > 0);
        const headerBlock = subtitle ? `${title}\n${subtitle}` : title;
        const slides = chunks.map((chunk, i) => ({
          label: chunks.length > 1 ? `Slide ${i + 1}` : (subtitle || 'Notice'),
          title: title,
          subtitle: subtitle,
          body: `${headerBlock}\n\n${chunk}`
        }));

        const newCustom = {
          id: `custom-${Date.now()}`,
          title,
          subtitle,
          theme,
          slides: slides.length > 0 ? slides : [{
            label: subtitle || 'Notice',
            title: title,
            subtitle: subtitle,
            body: subtitle ? `${title}\n\n${subtitle}` : title
          }]
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
        showToast(`Saved announcement "${title}"`, 'success');
      });
    }

    // Electron display status changes
    if (window.zionApi && window.zionApi.onDisplayStatusUpdate) {
      window.zionApi.onDisplayStatusUpdate((info) => {
        updateTvStatusUI(info.isOpen);
      const btnExt = document.getElementById('btn-extend-displays');
      if (btnExt) {
        btnExt.style.display = (state.displays.length <= 1) ? 'inline-flex' : 'none';
      }
      });
    }

    if (window.zionApi && window.zionApi.onDisplaysChanged) {
      window.zionApi.onDisplaysChanged(() => {
        queryDisplays();
      });
    }

    // Initialize Theme Builder, Upload Media, Camera Studio, YouTube Player, and Mobile Remote
    initThemeBuilderModal();
    initUploadMediaModal();
    initDroidCamStudio();
    initYouTubeModal();
    initRemoteModal();
    initRemoteActionListener();
    initStageModal();
    initCountdownTimer();
    initDualBibleComparison();
    initAmbientWorshipPads();
    if (serviceTitleInput) {
      serviceTitleInput.addEventListener('input', () => {
        triggerAutoSave();
        syncRemoteStatus();
      });
    }
    setTimeout(() => syncRemoteStatus(true), 500);
  }

  // =========================================================================
  // 15. KEYBOARD SHORTCUTS
  // =========================================================================
  function attachKeyboardShortcuts() {
    window.addEventListener('keydown', (e) => {
      // Never intercept Ctrl/Cmd/Alt shortcuts (e.g. Ctrl+C, Ctrl+V, Ctrl+A)
      if (e.ctrlKey || e.metaKey || e.altKey) {
        return;
      }

      // Close topmost open modal on Escape; never fire live presentation hotkeys while a modal is open!
      const openModals = document.querySelectorAll('.modal-overlay.open');
      if (openModals.length > 0) {
        if (e.key === 'Escape') {
          const topModal = openModals[openModals.length - 1];
          if (topModal && topModal.id !== 'modal-confirm-dialog') {
            e.preventDefault();
            topModal.classList.remove('open');
          }
        }
        return;
      }

      // Don't trigger presentation hotkeys while focused inside inputs, textareas, selects, or editable areas
      const activeEl = document.activeElement;
      if (activeEl && (
        activeEl.tagName === 'INPUT' ||
        activeEl.tagName === 'TEXTAREA' ||
        activeEl.tagName === 'SELECT' ||
        activeEl.isContentEditable
      )) {
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

    // =========================================================================
    // AUTOMATIC IN-APP UPDATE CHECKER
    // =========================================================================
    const btnCheckUpdates = document.getElementById('btn-check-updates');
    const updateBadgeIcon = document.getElementById('update-badge-icon');
    const updateBadgeText = document.getElementById('update-badge-text');
    const modalUpdate = document.getElementById('modal-update');
    const updateModalTitle = document.getElementById('update-modal-title');
    const updateModalSubtitle = document.getElementById('update-modal-subtitle');
    const updateModalNotesWrap = document.getElementById('update-modal-notes-wrap');
    const updateModalNotes = document.getElementById('update-modal-notes');
    const btnDownloadUpdate = document.getElementById('btn-download-update');

    async function performUpdateCheck(manual = false) {
      if (!window.zionApi || !window.zionApi.checkForUpdates) return;

      if (manual) {
        if (updateBadgeIcon) updateBadgeIcon.textContent = '⏳';
        if (updateBadgeText) updateBadgeText.textContent = 'Checking...';
        if (modalUpdate) modalUpdate.classList.add('open');
        if (updateModalTitle) updateModalTitle.textContent = 'Checking for updates...';
        if (updateModalSubtitle) updateModalSubtitle.textContent = 'Connecting to GitHub...';
        if (updateModalNotesWrap) updateModalNotesWrap.style.display = 'none';
        if (btnDownloadUpdate) btnDownloadUpdate.style.display = 'none';
      }

      try {
        const res = await window.zionApi.checkForUpdates();
        if (res && res.success) {
          if (res.hasUpdate) {
            if (updateBadgeIcon) updateBadgeIcon.textContent = '🚀';
            if (updateBadgeText) updateBadgeText.textContent = `Update v${res.latestVersion}`;
            if (btnCheckUpdates) {
              btnCheckUpdates.style.color = '#ffffff';
              btnCheckUpdates.style.background = 'linear-gradient(135deg, #d97706, #f59e0b)';
              btnCheckUpdates.style.borderColor = '#fbbf24';
              btnCheckUpdates.style.boxShadow = '0 0 12px rgba(245, 158, 11, 0.5)';
            }

            if (updateModalTitle) updateModalTitle.textContent = `🚀 Update Available: v${res.latestVersion}!`;
            if (updateModalSubtitle) updateModalSubtitle.textContent = `Current installed: v${res.currentVersion} • Latest release: v${res.latestVersion}`;
            if (res.releaseNotes && updateModalNotes) {
              updateModalNotes.textContent = res.releaseNotes;
              if (updateModalNotesWrap) updateModalNotesWrap.style.display = 'block';
            }
            if (btnDownloadUpdate) {
              btnDownloadUpdate.style.display = 'inline-flex';
              btnDownloadUpdate.textContent = '⬇️ Download v' + res.latestVersion;
              btnDownloadUpdate.onclick = () => {
                if (window.zionApi && window.zionApi.openExternalUrl) {
                  window.zionApi.openExternalUrl(res.downloadUrl || res.releaseUrl);
                } else {
                  window.open(res.downloadUrl || res.releaseUrl, '_blank');
                }
              };
            }
          } else {
            if (updateBadgeIcon) updateBadgeIcon.textContent = '✓';
            if (updateBadgeText) updateBadgeText.textContent = `v${res.currentVersion} (Latest)`;
            if (btnCheckUpdates) {
              btnCheckUpdates.style.color = 'var(--accent-gold)';
              btnCheckUpdates.style.background = '';
              btnCheckUpdates.style.boxShadow = 'none';
            }
            if (updateModalTitle) updateModalTitle.textContent = `✓ ZionCast is Up to Date!`;
            if (updateModalSubtitle) updateModalSubtitle.textContent = `You are running the latest version (v${res.currentVersion}).`;
            if (updateModalNotesWrap) updateModalNotesWrap.style.display = 'none';
            if (btnDownloadUpdate) btnDownloadUpdate.style.display = 'none';
          }
        } else {
          if (manual) {
            if (updateModalTitle) updateModalTitle.textContent = 'Could not check for updates';
            if (updateModalSubtitle) updateModalSubtitle.textContent = res?.error || 'Check internet connection and try again.';
            if (btnDownloadUpdate) {
              btnDownloadUpdate.style.display = 'inline-flex';
              btnDownloadUpdate.textContent = '🌐 Open Releases Page';
              btnDownloadUpdate.onclick = () => {
                const url = 'https://github.com/GreatDev14/ZionCast/releases/latest';
                if (window.zionApi && window.zionApi.openExternalUrl) window.zionApi.openExternalUrl(url);
                else window.open(url, '_blank');
              };
            }
          }
          if (updateBadgeIcon) updateBadgeIcon.textContent = '🔄';
          if (updateBadgeText) updateBadgeText.textContent = 'v1.3.5';
        }
      } catch (err) {
        console.warn('Update check warning:', err);
        if (manual && updateModalTitle) {
          updateModalTitle.textContent = 'Update check failed';
          if (updateModalSubtitle) updateModalSubtitle.textContent = err.message;
        }
      }
    }

    if (btnCheckUpdates) {
      btnCheckUpdates.addEventListener('click', () => performUpdateCheck(true));
    }

    // Background check 3 seconds after startup
    setTimeout(() => {
      performUpdateCheck(false);
    }, 3000);
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
