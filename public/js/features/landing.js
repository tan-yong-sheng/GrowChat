/**
 * Landing page JavaScript — minimal, no dependencies.
 * - GitHub stars API fetch
 * - Smooth scroll for anchor links
 * - Mobile nav toggle
 * - Auth redirect (if user already logged in, go to SPA)
 */

(function () {
  'use strict';

  const GITHUB_API = 'https://api.github.com/repos/tan-yong-sheng/GrowChat';
  const AUTH_STORAGE_KEY = 'growchat_auth';

  // ── Auth redirect ──────────────────────────────────────────────
  // If the user already has a valid access token in localStorage,
  // redirect to the SPA instead of showing the landing page.
  //
  // If a stale auth blob is present (expired access_token, or a value that
  // cannot be parsed at all), clear it so subsequent API calls do not silently
  // attempt with dead credentials and so the next visitor to this device does
  // not inherit a half-session.
  function checkAuthRedirect() {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return;
    let auth;
    try {
      auth = JSON.parse(raw);
    } catch {
      // Boundary: the landing page can safely treat a corrupt blob as
      // "not logged in". Clear it so it does not linger as a dead credential.
      localStorage.removeItem(AUTH_STORAGE_KEY);
      return;
    }
    if (auth?.access_token && isTokenUsable(auth.access_token)) {
      window.location.replace('/chat');
      return;
    }
    // Access token expired (refresh token may or may not be valid). Clear the
    // dead blob — the SPA will redirect to /auth.html via ensureSession().
    localStorage.removeItem(AUTH_STORAGE_KEY);
  }

  function isTokenUsable(token) {
    try {
      const parts = String(token || '').split('.');
      if (parts.length < 2) return false;
      const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      const padded = payload.padEnd(Math.ceil(payload.length / 4) * 4, '=');
      const decoded = JSON.parse(atob(padded));
      const exp = Number(decoded.exp || 0);
      return Number.isFinite(exp) && exp > Math.floor(Date.now() / 1000);
    } catch {
      return false;
    }
  }

  // ── GitHub stars ───────────────────────────────────────────────
  async function fetchGitHubStars() {
    const el = document.getElementById('github-stars');
    if (!el) return;

    try {
      const res = await fetch(GITHUB_API, {
        headers: { Accept: 'application/vnd.github+json' },
      });
      if (!res.ok) return;
      const data = await res.json();
      const stars = data.stargazers_count;
      if (typeof stars === 'number') {
        el.textContent =
          stars >= 1000 ? (stars / 1000).toFixed(1).replace(/\.0$/, '') + 'k' : String(stars);
      }
    } catch {
      // Silently fail — the ★ placeholder remains
    }
  }

  // ── Smooth scroll ──────────────────────────────────────────────
  function initSmoothScroll() {
    document.addEventListener('click', function (e) {
      const link = e.target.closest('a[href^="#"]');
      if (!link) return;

      const id = link.getAttribute('href').slice(1);
      const target = document.getElementById(id);
      if (!target) return;

      e.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });

      // Close mobile menu if open
      closeMobileMenu();
    });
  }

  // ── Mobile nav toggle ──────────────────────────────────────────
  function initMobileNav() {
    const btn = document.getElementById('mobile-menu-btn');
    const menu = document.getElementById('mobile-menu');
    if (!btn || !menu) return;

    btn.addEventListener('click', function () {
      const isOpen = !menu.classList.contains('hidden');
      if (isOpen) {
        closeMobileMenu();
      } else {
        menu.classList.remove('hidden');
        btn.setAttribute('aria-expanded', 'true');
      }
    });
  }

  function closeMobileMenu() {
    const btn = document.getElementById('mobile-menu-btn');
    const menu = document.getElementById('mobile-menu');
    if (menu && !menu.classList.contains('hidden')) {
      menu.classList.add('hidden');
    }
    if (btn) {
      btn.setAttribute('aria-expanded', 'false');
    }
  }

  // ── Init ───────────────────────────────────────────────────────
  checkAuthRedirect();
  fetchGitHubStars();
  initSmoothScroll();
  initMobileNav();
})();
