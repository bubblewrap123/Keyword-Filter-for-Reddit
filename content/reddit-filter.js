// content/reddit-filter.js - Main content script orchestrator

(function() {
  'use strict';

  const HIDDEN_ATTR = 'data-kf-hidden';
  const COUNTED_ATTR = 'data-kf-counted';
  const WORD_CHAR = '[\\p{L}\\p{M}\\p{N}_]';
  // Scripts written without spaces between words, where whole-word matching can't work
  const NO_WORD_SPACING = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}]/u;
  const POST_ID_PATTERN = /\/comments\/([a-z0-9]+)/i;

  let keywords = [];
  let keywordPatterns = [];
  let isOldReddit = false;
  let filterTimeout = null;
  let sessionBlocked = 0;
  let filterEnabled = true;
  let observer = null;

  // Detect Reddit version
  function detectRedditVersion() {
    // Old Reddit has specific class on body or uses old.reddit.com
    if (window.location.hostname === 'old.reddit.com' ||
        document.body.classList.contains('listing-page') ||
        document.querySelector('.thing.link')) {
      return 'old';
    }
    // New Reddit uses shreddit-post custom elements or specific data attributes
    if (document.querySelector('shreddit-post') ||
        document.querySelector('[data-testid="post-container"]') ||
        document.querySelector('div[class*="Post"]')) {
      return 'new';
    }
    return 'new'; // Default to new
  }

  // Check if filter is enabled
  async function checkEnabled() {
    try {
      const result = await browser.storage.local.get('filterEnabled');
      filterEnabled = result.filterEnabled !== false;
      return filterEnabled;
    } catch (error) {
      console.error('Reddit Filter: Error checking enabled state', error);
      return true;
    }
  }

  function escapeRegExp(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // Turn a keyword into a case-insensitive regex that matches whole words only.
  // "*" is a wildcard for partial matches: "AI" matches "AI's" but not "said",
  // "crypto*" matches "cryptocurrency", "*coin" matches "bitcoin".
  function compileKeyword(keyword) {
    const body = keyword.trim().split(/\s+/)
      .map(word => word.split('*').map(escapeRegExp).join(`${WORD_CHAR}*`))
      .join('\\s+');

    if (NO_WORD_SPACING.test(keyword)) {
      return new RegExp(body, 'iu');
    }
    return new RegExp(`(?<!${WORD_CHAR})${body}(?!${WORD_CHAR})`, 'iu');
  }

  // Load combined keywords from all active profiles
  async function loadKeywords() {
    try {
      await StorageHelper.ensureMigrated();
      keywords = await StorageHelper.getCombinedKeywords();
      keywordPatterns = keywords.map(compileKeyword);
      return keywords;
    } catch (error) {
      console.error('Reddit Filter: Error loading keywords', error);
      return [];
    }
  }

  // Check if text contains any keyword
  function containsKeyword(text) {
    if (!text) return false;
    return keywordPatterns.some(pattern => pattern.test(text));
  }

  function getPostId(url) {
    return url?.match(POST_ID_PATTERN)?.[1].toLowerCase() ?? null;
  }

  // Decide whether a post should be hidden. The post you have opened is never
  // hidden on its own page, otherwise you'd see its comments with no post above them.
  function shouldHide(title, permalink) {
    const currentPostId = getPostId(window.location.pathname);
    if (currentPostId && getPostId(permalink) === currentPostId) return false;
    return containsKeyword(title);
  }

  // Hide an element; returns 1 the first time an element is hidden so
  // re-filtering after a profile change doesn't count the same post twice
  function hidePost(element) {
    element.setAttribute(HIDDEN_ATTR, '');
    element.style.display = 'none';
    if (element.hasAttribute(COUNTED_ATTR)) return 0;
    element.setAttribute(COUNTED_ATTR, '');
    return 1;
  }

  // Filter all visible posts
  async function filterPosts() {
    if (!filterEnabled || keywordPatterns.length === 0) return;

    isOldReddit = detectRedditVersion() === 'old';

    let blockedCount = 0;
    if (isOldReddit) {
      blockedCount = filterOldRedditPosts(shouldHide, hidePost);
    } else {
      blockedCount = filterNewRedditPosts(shouldHide, hidePost);
    }

    // Update stats if any posts were blocked
    if (blockedCount > 0) {
      sessionBlocked += blockedCount;
      await StorageHelper.incrementBlocked(blockedCount);
      // Notify popup of updated session stats
      browser.runtime.sendMessage({
        action: 'statsUpdated',
        sessionBlocked: sessionBlocked
      }).catch((error) => {
        // Only log if it's not the expected "receiving end does not exist" error
        if (error.message && !error.message.includes('Receiving end does not exist')) {
          console.warn('Reddit Filter: Could not send stats update', error.message);
        }
      });
    }
  }

  // Show all hidden posts and clear markers so every post gets checked again
  function unhideAll() {
    document.querySelectorAll(`[${HIDDEN_ATTR}]`).forEach(el => {
      el.removeAttribute(HIDDEN_ATTR);
      el.style.display = '';
    });
    document.querySelectorAll('[data-filtered]').forEach(el => {
      el.removeAttribute('data-filtered');
    });
  }

  // Reset filtered markers and re-filter
  function resetAndRefilter() {
    unhideAll();
    filterPosts();
  }

  // Set up MutationObserver for dynamic content (infinite scroll)
  function setupObserver() {
    // Disconnect existing observer if any
    if (observer) {
      observer.disconnect();
    }

    const targetNode = document.body;

    observer = new MutationObserver((mutations) => {
      let shouldFilter = false;

      for (const mutation of mutations) {
        if (mutation.addedNodes.length > 0) {
          shouldFilter = true;
          break;
        }
      }

      // Throttle rather than debounce, so constant DOM churn (videos, live
      // timestamps) can't keep pushing filtering back indefinitely
      if (shouldFilter && !filterTimeout) {
        filterTimeout = setTimeout(() => {
          filterTimeout = null;
          filterPosts();
        }, 100);
      }
    });

    observer.observe(targetNode, {
      childList: true,
      subtree: true
    });
  }

  // Load keywords, filter the page and watch for new posts
  async function start() {
    await loadKeywords();
    filterPosts();
    if (!observer) {
      setupObserver();
    }
  }

  // Listen for storage changes (when user updates profiles in popup)
  browser.storage.onChanged.addListener(async (changes, areaName) => {
    if (areaName === 'local') {
      if (changes.profiles) {
        await loadKeywords();
        resetAndRefilter();
      }

      // Listen for enabled state changes
      if (changes.filterEnabled) {
        filterEnabled = changes.filterEnabled.newValue !== false;
        if (!filterEnabled) {
          unhideAll();
        } else {
          await start();
        }
      }
    }
  });

  // Listen for messages from popup
  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'getSessionStats') {
      sendResponse({ sessionBlocked: sessionBlocked });
    }
  });

  // Initialize
  async function init() {
    await checkEnabled();
    if (!filterEnabled) {
      console.log('Keyword Filter for Reddit: Disabled');
      return;
    }
    await start();
    console.log('Keyword Filter for Reddit: Initialized with', keywords.length, 'keywords from active profiles');
  }

  // Run when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
