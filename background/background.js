// background/background.js - Background script for extension lifecycle
// Note: storage.js is loaded via manifest.json scripts array for Firefox compatibility

(function() {
  'use strict';

  // Initialize extension on install or update
  browser.runtime.onInstalled.addListener(async (details) => {
    if (details.reason === 'install') {
      // Fresh install - set up empty profile structure
      await browser.storage.local.set({
        profiles: {},
        migrated: true,
        filterStats: { totalBlocked: 0 },
        filterEnabled: true
      });
      console.log('Keyword Filter for Reddit: Extension installed');
    } else if (details.reason === 'update') {
      // Update - run migration from old format if needed
      await StorageHelper.ensureMigrated();
      console.log('Keyword Filter for Reddit: Extension updated, migration complete');
    }
  });
})();
