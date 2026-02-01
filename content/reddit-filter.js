// content/reddit-filter.js - Main content script orchestrator

(function() {
  'use strict';

  let keywords = [];
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

  // Load combined keywords from all active profiles
  async function loadKeywords() {
    try {
      await StorageHelper.ensureMigrated();
      keywords = await StorageHelper.getCombinedKeywords();
      return keywords;
    } catch (error) {
      console.error('Reddit Filter: Error loading keywords', error);
      return [];
    }
  }

  // Check if text contains any keyword (case-insensitive)
  function containsKeyword(text) {
    if (!text || keywords.length === 0) return false;
    const lowerText = text.toLowerCase();
    return keywords.some(keyword =>
      lowerText.includes(keyword.toLowerCase())
    );
  }

  // Filter all visible posts
  async function filterPosts() {
    if (!filterEnabled || keywords.length === 0) return;

    isOldReddit = detectRedditVersion() === 'old';

    let blockedCount = 0;
    if (isOldReddit) {
      blockedCount = filterOldRedditPosts(containsKeyword);
    } else {
      blockedCount = filterNewRedditPosts(containsKeyword);
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

  // Reset filtered markers and re-filter
  function resetAndRefilter() {
    document.querySelectorAll('[data-filtered]').forEach(el => {
      el.removeAttribute('data-filtered');
      el.style.display = '';
    });
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

      if (shouldFilter) {
        // Debounce filtering to avoid excessive calls
        clearTimeout(filterTimeout);
        filterTimeout = setTimeout(filterPosts, 100);
      }
    });

    observer.observe(targetNode, {
      childList: true,
      subtree: true
    });
  }

  // Cleanup function to disconnect observer
  function cleanup() {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
    clearTimeout(filterTimeout);
  }

  // Listen for storage changes (when user updates profiles in popup)
  browser.storage.onChanged.addListener(async (changes, areaName) => {
    if (areaName === 'local') {
      if (changes.profiles) {
        keywords = await StorageHelper.getCombinedKeywords();
        resetAndRefilter();
      }

      // Listen for enabled state changes
      if (changes.filterEnabled) {
        filterEnabled = changes.filterEnabled.newValue !== false;
        if (!filterEnabled) {
          // Show previously hidden posts
          document.querySelectorAll('[data-filtered]').forEach(el => {
            el.style.display = '';
          });
        } else {
          filterPosts();
        }
      }
    }
  });

  // Listen for messages from popup
  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'getSessionStats') {
      sendResponse({ sessionBlocked: sessionBlocked });
    }
    return true;
  });

  // Cleanup on page unload
  window.addEventListener('beforeunload', cleanup);
  window.addEventListener('pagehide', cleanup);

  // Initialize
  async function init() {
    await checkEnabled();
    if (!filterEnabled) {
      console.log('Keyword Filter for Reddit: Disabled');
      return;
    }
    await loadKeywords();
    filterPosts();
    setupObserver();
    console.log('Keyword Filter for Reddit: Initialized with', keywords.length, 'keywords from active profiles');
  }

  // Run when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
