/**
 * Landing page JavaScript — minimal.
 * - GitHub stars API fetch
 * - Smooth scroll for anchor links
 * - Mobile nav toggle
 * - Auth redirect (if user already logged in, go to SPA)
 */
import { decodeJwtPayload } from '../shared/api/auth.js';

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
  function parseAuthOrClear(raw) {
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      // Boundary: the landing page can safely treat a corrupt blob as
      // "not logged in". Clear it so it does not linger as a dead credential.
      localStorage.removeItem(AUTH_STORAGE_KEY);
      return null;
    }
  }

  function redirectToChat() {
    window.location.replace('/chat');
  }

  function hasUsableAccessToken(auth) {
    return Boolean(auth?.access_token && isTokenUsable(auth.access_token));
  }

  function shouldRedirectToChat(auth) {
    if (!auth) return false;
    return hasUsableAccessToken(auth) || Boolean(auth?.refresh_token);
  }

  function checkAuthRedirect() {
    const auth = parseAuthOrClear(localStorage.getItem(AUTH_STORAGE_KEY));
    if (shouldRedirectToChat(auth)) {
      redirectToChat();
      return;
    }
    // No refresh_token and the access_token is expired/unusable (or missing) —
    // the blob is truly unrecoverable. Clear it so the next visitor to this
    // device does not inherit a dead credential.
    localStorage.removeItem(AUTH_STORAGE_KEY);
  }

  function isJwtExpired(decoded) {
    const exp = Number(decoded?.exp || 0);
    return !Number.isFinite(exp) || exp <= Math.floor(Date.now() / 1000);
  }

  function isTokenUsable(token) {
    const decoded = decodeJwtPayload(token);
    return decoded !== null && !isJwtExpired(decoded);
  }

  // ── GitHub stars ───────────────────────────────────────────────
  function formatStarCount(count) {
    if (count >= 1000) {
      return `${(count / 1000).toFixed(1).replace(/\.0$/, '')}k`;
    }
    return String(count);
  }

  async function fetchStarCount() {
    const res = await fetch(GITHUB_API, {
      headers: { Accept: 'application/vnd.github+json' },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data?.stargazers_count === 'number' ? data.stargazers_count : null;
  }

  async function fetchGitHubStars() {
    const el = document.getElementById('github-stars');
    if (!el) return;

    try {
      const stars = await fetchStarCount();
      if (stars !== null) {
        el.textContent = formatStarCount(stars);
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
