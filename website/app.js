/**
 * ZionCast - Product Marketing & Software Download Website
 * Interactive Client Scripts
 */

document.addEventListener('DOMContentLoaded', () => {
  initNavigation();
  initFaqAccordion();
  initDownloadHandlers();
  initAuthModal();
  initMockUiInteractions();
  checkPersistedAuth();
});

/* ==========================================================================
   Toast Notification System
   ========================================================================== */
function showToast(title, message, type = 'indigo') {
  let container = document.getElementById('toastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toastContainer';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast ${type === 'gold' ? 'toast-gold' : type === 'success' ? 'toast-success' : ''}`;

  let iconSvg = `
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <circle cx="12" cy="12" r="10"></circle>
      <line x1="12" y1="16" x2="12" y2="12"></line>
      <line x1="12" y1="8" x2="12.01" y2="8"></line>
    </svg>
  `;

  if (type === 'success') {
    iconSvg = `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
        <polyline points="22 4 12 14.01 9 11.01"></polyline>
      </svg>
    `;
  } else if (type === 'gold') {
    iconSvg = `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
        <polyline points="7 10 12 15 17 10"></polyline>
        <line x1="12" y1="15" x2="12" y2="3"></line>
      </svg>
    `;
  }

  toast.innerHTML = `
    <div class="toast-icon">${iconSvg}</div>
    <div class="toast-content">
      <div class="toast-title">${title}</div>
      <div class="toast-desc">${message}</div>
    </div>
    <button class="toast-close" aria-label="Close notification">&times;</button>
  `;

  container.appendChild(toast);

  const closeBtn = toast.querySelector('.toast-close');
  closeBtn.addEventListener('click', () => {
    removeToast(toast);
  });

  // Auto remove after 5 seconds
  setTimeout(() => {
    removeToast(toast);
  }, 5000);
}

function removeToast(toast) {
  toast.style.opacity = '0';
  toast.style.transform = 'translateY(12px) scale(0.95)';
  setTimeout(() => {
    if (toast.parentNode) {
      toast.parentNode.removeChild(toast);
    }
  }, 300);
}

/* ==========================================================================
   1. Navigation & Smooth Scrolling
   ========================================================================== */
function initNavigation() {
  const mobileToggle = document.getElementById('mobileMenuToggle');
  const navLinks = document.getElementById('navLinks');

  if (mobileToggle && navLinks) {
    mobileToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      const isExpanded = mobileToggle.getAttribute('aria-expanded') === 'true';
      mobileToggle.setAttribute('aria-expanded', !isExpanded);
      navLinks.classList.toggle('open');
    });

    // Close mobile nav when clicking outside
    document.addEventListener('click', (e) => {
      if (navLinks.classList.contains('open') && 
          !navLinks.contains(e.target) && 
          !mobileToggle.contains(e.target)) {
        navLinks.classList.remove('open');
        mobileToggle.setAttribute('aria-expanded', 'false');
      }
    });
  }

  // Smooth scroll with header offset
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function(e) {
      const targetId = this.getAttribute('href');
      if (targetId === '#') return;

      const targetEl = document.querySelector(targetId);
      if (targetEl) {
        e.preventDefault();
        const headerOffset = 80;
        const elPosition = targetEl.getBoundingClientRect().top;
        const offsetPosition = elPosition + window.pageYOffset - headerOffset;

        window.scrollTo({
          top: offsetPosition,
          behavior: 'smooth'
        });

        // Close mobile nav if open
        if (navLinks && navLinks.classList.contains('open')) {
          navLinks.classList.remove('open');
          if (mobileToggle) mobileToggle.setAttribute('aria-expanded', 'false');
        }
      }
    });
  });
}

/* ==========================================================================
   2. FAQ Accordion
   ========================================================================== */
function initFaqAccordion() {
  const accordionItems = document.querySelectorAll('.accordion-item');

  accordionItems.forEach(item => {
    const trigger = item.querySelector('.accordion-trigger');
    const content = item.querySelector('.accordion-content');

    if (!trigger || !content) return;

    trigger.addEventListener('click', () => {
      const isOpen = item.classList.contains('open');

      // Close all items
      accordionItems.forEach(otherItem => {
        otherItem.classList.remove('open');
        const otherContent = otherItem.querySelector('.accordion-content');
        if (otherContent) otherContent.style.maxHeight = null;
      });

      // If clicked item wasn't open, open it
      if (!isOpen) {
        item.classList.add('open');
        content.style.maxHeight = content.scrollHeight + 'px';
      }
    });
  });

  // Open first accordion item by default for better UX
  if (accordionItems.length > 0) {
    const firstItem = accordionItems[0];
    const firstContent = firstItem.querySelector('.accordion-content');
    firstItem.classList.add('open');
    if (firstContent) {
      firstContent.style.maxHeight = firstContent.scrollHeight + 'px';
    }
  }
}

/* ==========================================================================
   3. Download Click Handlers & Toast Fallback
   ========================================================================== */
const GITHUB_REPO = 'GreatDev14/ZionCast';
const GITHUB_RELEASE_TAG = 'v1.0.0';
const GITHUB_RELEASE_BASE = `https://github.com/${GITHUB_REPO}/releases/download/${GITHUB_RELEASE_TAG}/`;

function initDownloadHandlers() {
  const downloadLinks = document.querySelectorAll('a[download]');
  const isLocal = window.location.hostname === 'localhost' || 
                  window.location.hostname === '127.0.0.1' || 
                  window.location.protocol === 'file:';

  downloadLinks.forEach(link => {
    const filename = link.getAttribute('download') || 'package';
    const localHref = link.getAttribute('href');

    // On live production (e.g. Vercel), route large binaries to GitHub Releases
    if (!isLocal && localHref && !localHref.startsWith('http')) {
      link.setAttribute('href', `${GITHUB_RELEASE_BASE}${filename}`);
    }

    link.addEventListener('click', () => {
      showToast(
        'Download Initiated',
        `Starting download for ${filename}. Thank you for choosing ZionCast!`,
        'gold'
      );
    });
  });
}

/* ==========================================================================
   4. Authentication Modal & State Persistence
   ========================================================================== */
function initAuthModal() {
  const modalOverlay = document.getElementById('authModalOverlay');
  const openModalBtns = document.querySelectorAll('.open-auth-modal');
  const closeModalBtn = document.getElementById('closeAuthModal');
  const tabSignIn = document.getElementById('tabSignIn');
  const tabRegister = document.getElementById('tabRegister');
  const formSignIn = document.getElementById('formSignIn');
  const formRegister = document.getElementById('formRegister');
  const btnGoogleAuth = document.getElementById('btnGoogleAuth');
  const btnGuestContinue = document.getElementById('btnGuestContinue');

  if (!modalOverlay) return;

  function openModal(defaultTab = 'signin') {
    modalOverlay.classList.add('active');
    document.body.style.overflow = 'hidden';
    switchTab(defaultTab);
  }

  function closeModal() {
    modalOverlay.classList.remove('active');
    document.body.style.overflow = '';
  }

  function switchTab(tab) {
    if (tab === 'signin') {
      tabSignIn.classList.add('active');
      tabRegister.classList.remove('active');
      formSignIn.style.display = 'flex';
      formRegister.style.display = 'none';
    } else {
      tabRegister.classList.add('active');
      tabSignIn.classList.remove('active');
      formRegister.style.display = 'flex';
      formSignIn.style.display = 'none';
    }
  }

  openModalBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const tab = btn.dataset.tab || 'signin';
      openModal(tab);
    });
  });

  if (closeModalBtn) {
    closeModalBtn.addEventListener('click', closeModal);
  }

  modalOverlay.addEventListener('click', (e) => {
    if (e.target === modalOverlay) closeModal();
  });

  if (tabSignIn && tabRegister) {
    tabSignIn.addEventListener('click', () => switchTab('signin'));
    tabRegister.addEventListener('click', () => switchTab('register'));
  }

  // Sign In Form Submission
  if (formSignIn) {
    formSignIn.addEventListener('submit', (e) => {
      e.preventDefault();
      const email = document.getElementById('signInEmail').value.trim();
      const password = document.getElementById('signInPassword').value;

      if (!email || !password) {
        showToast('Validation Error', 'Please enter your email and password.', 'indigo');
        return;
      }

      const userName = email.split('@')[0];
      const userData = {
        name: userName.charAt(0).toUpperCase() + userName.slice(1),
        church: 'Grace Community Church',
        email: email
      };

      saveUserAuth(userData);
      closeModal();
      showToast('Welcome back!', `Signed in as ${userData.name}.`, 'success');
    });
  }

  // Register Form Submission
  if (formRegister) {
    formRegister.addEventListener('submit', (e) => {
      e.preventDefault();
      const churchName = document.getElementById('regChurchName').value.trim();
      const fullName = document.getElementById('regFullName').value.trim();
      const email = document.getElementById('regEmail').value.trim();
      const password = document.getElementById('regPassword').value;
      const confirmPassword = document.getElementById('regConfirmPassword').value;

      if (!churchName || !fullName || !email || !password) {
        showToast('Validation Error', 'All fields are required.', 'indigo');
        return;
      }

      if (password !== confirmPassword) {
        showToast('Password Mismatch', 'The passwords you entered do not match.', 'indigo');
        return;
      }

      const userData = {
        name: fullName,
        church: churchName,
        email: email
      };

      saveUserAuth(userData);
      closeModal();
      showToast(
        'Welcome to ZionCast!',
        `Your account for "${churchName}" has been successfully created.`,
        'success'
      );
    });
  }

  // Mock Google Auth
  if (btnGoogleAuth) {
    btnGoogleAuth.addEventListener('click', () => {
      const mockGoogleUser = {
        name: 'Pastor David',
        church: 'Zion City Fellowship',
        email: 'pastor.david@zioncity.org'
      };
      saveUserAuth(mockGoogleUser);
      closeModal();
      showToast('Google Sign In', `Connected as ${mockGoogleUser.name}.`, 'success');
    });
  }

  // Guest Bypass
  if (btnGuestContinue) {
    btnGuestContinue.addEventListener('click', (e) => {
      e.preventDefault();
      closeModal();
      showToast(
        'Guest Mode Active',
        'You can download and use ZionCast directly without an account.',
        'gold'
      );
      const downloadSection = document.getElementById('downloads');
      if (downloadSection) {
        downloadSection.scrollIntoView({ behavior: 'smooth' });
      }
    });
  }
}

function saveUserAuth(user) {
  localStorage.setItem('zioncast_user', JSON.stringify(user));
  updateNavbarUser(user);
}

function checkPersistedAuth() {
  const saved = localStorage.getItem('zioncast_user');
  if (saved) {
    try {
      const user = JSON.parse(saved);
      updateNavbarUser(user);
    } catch (e) {
      console.error('Failed to parse saved user:', e);
    }
  }
}

function updateNavbarUser(user) {
  const containers = [
    document.getElementById('authNavContainer'),
    document.getElementById('mobileAuthNavContainer')
  ].filter(Boolean);

  containers.forEach(container => {
    const isMobile = container.id === 'mobileAuthNavContainer';
    if (user) {
      const initial = user.name ? user.name.charAt(0).toUpperCase() : 'Z';
      container.innerHTML = `
        <div class="user-pill" style="${isMobile ? 'width: 100%; justify-content: center;' : ''}" title="${user.email} (${user.church || 'Church Leader'})">
          <div class="user-avatar">${initial}</div>
          <span>${user.name}</span>
          <button class="btn btn-outline btn-sm btn-signout-trigger" style="padding: 2px 8px; font-size: 0.72rem; margin-left: 6px;" title="Sign Out">Logout</button>
        </div>
      `;
    } else {
      container.innerHTML = `
        <button class="btn btn-glass btn-sm open-auth-modal" data-tab="signin" style="${isMobile ? 'width: 100%;' : ''}">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
            <circle cx="12" cy="7" r="4"></circle>
          </svg>
          ${isMobile ? 'Church Sign In' : 'Sign In'}
        </button>
      `;
    }
  });

  // Re-bind sign out buttons
  document.querySelectorAll('.btn-signout-trigger').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      localStorage.removeItem('zioncast_user');
      updateNavbarUser(null);
      showToast('Signed Out', 'You have been logged out.', 'indigo');
    });
  });

  // Re-bind modal open event
  document.querySelectorAll('.open-auth-modal').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const modal = document.getElementById('authModalOverlay');
      if (modal) {
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
      }
    });
  });
}

/* ==========================================================================
   5. Interactive Mock UI Showcase in Hero
   ========================================================================== */
function initMockUiInteractions() {
  const mockItems = document.querySelectorAll('.mock-list-item');
  const mockPreviewText = document.getElementById('mockPreviewText');
  const mockPreviewTitle = document.getElementById('mockPreviewTitle');
  const mockLiveText = document.getElementById('mockLiveText');
  const mockLiveTitle = document.getElementById('mockLiveTitle');
  const btnGoLive = document.getElementById('btnMockGoLive');
  const fontSlider = document.getElementById('mockFontSlider');
  const fontValDisplay = document.getElementById('mockFontVal');

  if (mockItems.length > 0) {
    mockItems.forEach(item => {
      item.addEventListener('click', () => {
        mockItems.forEach(i => i.classList.remove('selected'));
        item.classList.add('selected');

        const title = item.dataset.title || 'Way Maker';
        const lyric = item.dataset.lyric || 'You are here, moving in our midst...';

        if (mockPreviewTitle) mockPreviewTitle.textContent = title;
        if (mockPreviewText) mockPreviewText.textContent = lyric;
      });
    });
  }

  // Go Live button copies preview to live screen
  if (btnGoLive) {
    btnGoLive.addEventListener('click', () => {
      if (mockPreviewText && mockLiveText) {
        mockLiveText.textContent = mockPreviewText.textContent;
      }
      if (mockPreviewTitle && mockLiveTitle) {
        mockLiveTitle.textContent = mockPreviewTitle.textContent;
      }

      // Pulse animation
      const liveScreen = document.querySelector('.mock-screen-live');
      if (liveScreen) {
        liveScreen.style.transform = 'scale(1.02)';
        liveScreen.style.transition = 'transform 0.2s ease';
        setTimeout(() => {
          liveScreen.style.transform = 'scale(1)';
        }, 200);
      }

      showToast('Projected Live', 'Slide sent to Live TV output.', 'success');
    });
  }

  // Real-time font size slider
  if (fontSlider && fontValDisplay) {
    fontSlider.addEventListener('input', (e) => {
      const size = e.target.value;
      fontValDisplay.textContent = `${size}px`;
      if (mockPreviewText) mockPreviewText.style.fontSize = `${size * 0.024}rem`;
      if (mockLiveText) mockLiveText.style.fontSize = `${size * 0.024}rem`;
    });
  }
}
