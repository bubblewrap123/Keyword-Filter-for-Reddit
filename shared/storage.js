// shared/storage.js - Storage utilities for keyword and profile management

const StorageHelper = {
  PROFILES_KEY: 'profiles',
  MIGRATED_KEY: 'migrated',
  KEYWORDS_KEY: 'filterKeywords',
  STATS_KEY: 'filterStats',
  ENABLED_KEY: 'filterEnabled',
  MAX_KEYWORD_LENGTH: 500,

  // Secure UUID generator using crypto API
  generateUUID() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    // Fallback for older browsers using crypto.getRandomValues
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40; // Version 4
    bytes[8] = (bytes[8] & 0x3f) | 0x80; // Variant
    const hex = [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  },

  // Validate and sanitize a keyword
  validateKeyword(keyword) {
    if (typeof keyword !== 'string') {
      return { valid: false, error: 'Keyword must be a string' };
    }
    const trimmed = keyword.trim();
    if (!trimmed) {
      return { valid: false, error: 'Keyword cannot be empty' };
    }
    if (trimmed.length > this.MAX_KEYWORD_LENGTH) {
      return { valid: false, error: `Keyword exceeds maximum length of ${this.MAX_KEYWORD_LENGTH} characters` };
    }
    // A keyword made only of wildcards would match every post
    if (!/[^*\s]/.test(trimmed)) {
      return { valid: false, error: 'Keyword must contain more than wildcards' };
    }
    return { valid: true, keyword: trimmed };
  },

  // Validate keywords and drop case-insensitive duplicates
  sanitizeKeywords(keywords) {
    const seen = new Set();
    const result = [];
    for (const keyword of keywords) {
      const validation = this.validateKeyword(keyword);
      if (!validation.valid) continue;
      const lower = validation.keyword.toLowerCase();
      if (seen.has(lower)) continue;
      seen.add(lower);
      result.push(validation.keyword);
    }
    return result;
  },

  // Return the name, or "Name (1)", "Name (2)"... if another profile already uses it
  getUniqueName(name, profiles, excludeId = null) {
    const trimmedName = name.trim() || 'New Profile';
    const taken = new Set(
      Object.values(profiles)
        .filter(p => p.id !== excludeId)
        .map(p => p.name.toLowerCase())
    );

    let finalName = trimmedName;
    let counter = 1;
    while (taken.has(finalName.toLowerCase())) {
      finalName = `${trimmedName} (${counter})`;
      counter++;
    }
    return finalName;
  },

  // Migration from old format to profiles
  async ensureMigrated() {
    try {
      const data = await browser.storage.local.get([this.MIGRATED_KEY, this.KEYWORDS_KEY, this.PROFILES_KEY]);

      if (data[this.MIGRATED_KEY]) return true;

      const oldKeywords = data[this.KEYWORDS_KEY] || [];
      const profiles = {};

      if (oldKeywords.length > 0) {
        // Validate and filter old keywords during migration
        const validKeywords = oldKeywords
          .filter(k => this.validateKeyword(k).valid)
          .map(k => this.validateKeyword(k).keyword);

        const defaultProfile = {
          id: this.generateUUID(),
          name: 'Default',
          keywords: validKeywords,
          enabled: true,
          createdAt: Date.now()
        };
        profiles[defaultProfile.id] = defaultProfile;
      }

      await browser.storage.local.set({
        [this.PROFILES_KEY]: profiles,
        [this.MIGRATED_KEY]: true
      });

      return true;
    } catch (error) {
      console.error('StorageHelper: Error during migration', error);
      return false;
    }
  },

  // Profile CRUD operations
  async getProfiles() {
    try {
      await this.ensureMigrated();
      const result = await browser.storage.local.get(this.PROFILES_KEY);
      return result[this.PROFILES_KEY] || {};
    } catch (error) {
      console.error('StorageHelper: Error getting profiles', error);
      return {};
    }
  },

  // Optimized: fetch single profile directly from storage
  async getProfile(profileId) {
    try {
      await this.ensureMigrated();
      const result = await browser.storage.local.get(this.PROFILES_KEY);
      const profiles = result[this.PROFILES_KEY] || {};
      return profiles[profileId] || null;
    } catch (error) {
      console.error('StorageHelper: Error getting profile', error);
      return null;
    }
  },

  async createProfile(name, keywords = []) {
    try {
      const profiles = await this.getProfiles();

      const profile = {
        id: this.generateUUID(),
        name: this.getUniqueName(name, profiles),
        keywords: this.sanitizeKeywords(keywords),
        enabled: false,
        createdAt: Date.now()
      };
      profiles[profile.id] = profile;
      await browser.storage.local.set({ [this.PROFILES_KEY]: profiles });
      return profile;
    } catch (error) {
      console.error('StorageHelper: Error creating profile', error);
      return null;
    }
  },

  async updateProfile(profileId, updates) {
    try {
      const profiles = await this.getProfiles();
      if (!profiles[profileId]) return false;

      // If updating name, check for duplicates
      if (updates.name !== undefined) {
        updates.name = this.getUniqueName(updates.name, profiles, profileId);
      }

      profiles[profileId] = { ...profiles[profileId], ...updates };
      await browser.storage.local.set({ [this.PROFILES_KEY]: profiles });
      return true;
    } catch (error) {
      console.error('StorageHelper: Error updating profile', error);
      return false;
    }
  },

  async deleteProfile(profileId) {
    try {
      const profiles = await this.getProfiles();
      if (!profiles[profileId]) return false;

      delete profiles[profileId];
      await browser.storage.local.set({ [this.PROFILES_KEY]: profiles });
      return true;
    } catch (error) {
      console.error('StorageHelper: Error deleting profile', error);
      return false;
    }
  },

  // Profile keyword operations
  async addKeywordToProfile(profileId, keyword) {
    try {
      const validation = this.validateKeyword(keyword);
      if (!validation.valid) {
        console.warn('StorageHelper: Invalid keyword -', validation.error);
        return { success: false, error: validation.error };
      }

      const profiles = await this.getProfiles();
      const profile = profiles[profileId];
      if (!profile) return { success: false, error: 'Profile not found' };

      const normalizedKeyword = validation.keyword;
      const exists = profile.keywords.some(k =>
        k.toLowerCase() === normalizedKeyword.toLowerCase()
      );
      if (exists) return { success: false, error: 'Keyword already exists' };

      profile.keywords.push(normalizedKeyword);
      await browser.storage.local.set({ [this.PROFILES_KEY]: profiles });
      return { success: true };
    } catch (error) {
      console.error('StorageHelper: Error adding keyword to profile', error);
      return { success: false, error: 'Storage error' };
    }
  },

  async removeKeywordFromProfile(profileId, keyword) {
    try {
      const profiles = await this.getProfiles();
      const profile = profiles[profileId];
      if (!profile) return false;

      const index = profile.keywords.findIndex(k =>
        k.toLowerCase() === keyword.toLowerCase()
      );
      if (index === -1) return false;

      profile.keywords.splice(index, 1);
      await browser.storage.local.set({ [this.PROFILES_KEY]: profiles });
      return true;
    } catch (error) {
      console.error('StorageHelper: Error removing keyword from profile', error);
      return false;
    }
  },

  // Profile state
  async toggleProfile(profileId, enabled) {
    return await this.updateProfile(profileId, { enabled });
  },

  async getActiveProfiles() {
    const profiles = await this.getProfiles();
    return Object.values(profiles).filter(p => p.enabled);
  },

  // Combined keywords from all active profiles
  async getCombinedKeywords() {
    try {
      const profiles = await this.getProfiles();
      const keywords = [];
      const seen = new Set();

      for (const profile of Object.values(profiles)) {
        if (profile.enabled) {
          for (const keyword of profile.keywords) {
            if (!this.validateKeyword(keyword).valid) continue;
            const lower = keyword.toLowerCase();
            if (!seen.has(lower)) {
              seen.add(lower);
              keywords.push(keyword);
            }
          }
        }
      }
      return keywords;
    } catch (error) {
      console.error('StorageHelper: Error getting combined keywords', error);
      return [];
    }
  },

  // Export/Import
  // Version 2 holds any number of profiles; version 1 (single profile) is still accepted on import
  exportProfiles(profiles) {
    return {
      version: 2,
      type: 'reddit-keyword-filter-profiles',
      profiles: profiles.map(profile => ({
        name: profile.name,
        keywords: profile.keywords
      })),
      exportedAt: new Date().toISOString()
    };
  },

  // Read exported JSON into a list of { name, keywords }
  parseImportData(data) {
    if (!data || typeof data !== 'object') {
      return { valid: false, error: 'Invalid JSON' };
    }

    let entries;
    if (data.type === 'reddit-keyword-filter-profiles') {
      if (data.version !== 2) return { valid: false, error: 'Unknown version' };
      entries = data.profiles;
    } else if (data.type === 'reddit-keyword-filter-profile') {
      if (data.version !== 1) return { valid: false, error: 'Unknown version' };
      entries = [data.profile];
    } else {
      return { valid: false, error: 'Not a valid profile export' };
    }

    if (!Array.isArray(entries)) {
      return { valid: false, error: 'Missing profiles' };
    }

    const profiles = entries
      .filter(p => p && typeof p.name === 'string' && Array.isArray(p.keywords))
      .map(p => ({
        name: p.name.trim() || 'Imported Profile',
        keywords: this.sanitizeKeywords(p.keywords)
      }));

    if (profiles.length === 0) {
      return { valid: false, error: 'No profiles found' };
    }
    return { valid: true, profiles };
  },

  // Add parsed profiles in a single storage write; imported profiles start disabled
  async importProfiles(importedProfiles) {
    try {
      const profiles = await this.getProfiles();
      const now = Date.now();

      const created = importedProfiles.map((imported, index) => {
        const profile = {
          id: this.generateUUID(),
          name: this.getUniqueName(imported.name, profiles),
          keywords: this.sanitizeKeywords(imported.keywords),
          enabled: false,
          // Keep the export's order in the newest-first profile list
          createdAt: now - index
        };
        profiles[profile.id] = profile;
        return profile;
      });

      await browser.storage.local.set({ [this.PROFILES_KEY]: profiles });
      return { success: true, profiles: created };
    } catch (error) {
      console.error('StorageHelper: Error importing profiles', error);
      return { success: false, error: 'Import error' };
    }
  },

  // Statistics functions
  async getStats() {
    try {
      const result = await browser.storage.local.get(this.STATS_KEY);
      return result[this.STATS_KEY] || { totalBlocked: 0 };
    } catch (error) {
      console.error('StorageHelper: Error getting stats', error);
      return { totalBlocked: 0 };
    }
  },

  async incrementBlocked(count = 1) {
    try {
      const stats = await this.getStats();
      stats.totalBlocked = (stats.totalBlocked || 0) + count;
      await browser.storage.local.set({ [this.STATS_KEY]: stats });
      return stats;
    } catch (error) {
      console.error('StorageHelper: Error updating stats', error);
      return null;
    }
  },

  async resetStats() {
    try {
      await browser.storage.local.set({ [this.STATS_KEY]: { totalBlocked: 0 } });
      return true;
    } catch (error) {
      console.error('StorageHelper: Error resetting stats', error);
      return false;
    }
  },

  // Enabled state functions
  async isEnabled() {
    try {
      const result = await browser.storage.local.get(this.ENABLED_KEY);
      return result[this.ENABLED_KEY] !== false;
    } catch (error) {
      console.error('StorageHelper: Error getting enabled state', error);
      return true;
    }
  },

  async setEnabled(enabled) {
    try {
      await browser.storage.local.set({ [this.ENABLED_KEY]: enabled });
      return true;
    } catch (error) {
      console.error('StorageHelper: Error setting enabled state', error);
      return false;
    }
  }
};
