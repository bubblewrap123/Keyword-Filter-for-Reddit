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

  // Check if a profile name already exists
  async profileNameExists(name, excludeId = null) {
    const profiles = await this.getProfiles();
    const normalizedName = name.trim().toLowerCase();
    return Object.values(profiles).some(p =>
      p.name.toLowerCase() === normalizedName && p.id !== excludeId
    );
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
      const trimmedName = name.trim() || 'New Profile';

      // Check for duplicate name and append number if needed
      let finalName = trimmedName;
      let counter = 1;
      while (await this.profileNameExists(finalName)) {
        finalName = `${trimmedName} (${counter})`;
        counter++;
      }

      // Validate keywords
      const validKeywords = keywords
        .map(k => this.validateKeyword(k))
        .filter(result => result.valid)
        .map(result => result.keyword);

      const profile = {
        id: this.generateUUID(),
        name: finalName,
        keywords: validKeywords,
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
        const trimmedName = updates.name.trim() || 'New Profile';
        if (await this.profileNameExists(trimmedName, profileId)) {
          let finalName = trimmedName;
          let counter = 1;
          while (await this.profileNameExists(finalName, profileId)) {
            finalName = `${trimmedName} (${counter})`;
            counter++;
          }
          updates.name = finalName;
        } else {
          updates.name = trimmedName;
        }
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
  exportProfile(profile) {
    return {
      version: 1,
      type: 'reddit-keyword-filter-profile',
      profile: {
        name: profile.name,
        keywords: profile.keywords
      },
      exportedAt: new Date().toISOString()
    };
  },

  validateImportedProfile(data) {
    if (!data || typeof data !== 'object') {
      return { valid: false, error: 'Invalid JSON' };
    }
    if (data.type !== 'reddit-keyword-filter-profile') {
      return { valid: false, error: 'Not a valid profile' };
    }
    if (data.version !== 1) {
      return { valid: false, error: 'Unknown version' };
    }
    if (!data.profile?.name || typeof data.profile.name !== 'string') {
      return { valid: false, error: 'Missing profile name' };
    }
    if (!Array.isArray(data.profile?.keywords)) {
      return { valid: false, error: 'Missing keywords' };
    }
    // Validate each keyword in the array
    for (let i = 0; i < data.profile.keywords.length; i++) {
      const keyword = data.profile.keywords[i];
      if (typeof keyword !== 'string') {
        return { valid: false, error: `Invalid keyword at index ${i}: must be a string` };
      }
      if (keyword.length > this.MAX_KEYWORD_LENGTH) {
        return { valid: false, error: `Keyword at index ${i} exceeds maximum length of ${this.MAX_KEYWORD_LENGTH}` };
      }
    }
    return { valid: true };
  },

  async importProfile(jsonData) {
    try {
      const validation = this.validateImportedProfile(jsonData);
      if (!validation.valid) {
        return { success: false, error: validation.error };
      }

      // Filter and sanitize keywords
      const validKeywords = jsonData.profile.keywords
        .map(k => this.validateKeyword(k))
        .filter(result => result.valid)
        .map(result => result.keyword);

      const profile = await this.createProfile(
        jsonData.profile.name,
        validKeywords
      );

      if (!profile) {
        return { success: false, error: 'Could not create profile' };
      }

      return { success: true, profile };
    } catch (error) {
      console.error('StorageHelper: Error importing profile', error);
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
