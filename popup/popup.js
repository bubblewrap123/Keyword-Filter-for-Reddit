// popup/popup.js - Popup UI logic for profile and keyword management

(function() {
  'use strict';

  // Elements - Profile list view
  const profileListView = document.getElementById('profile-list-view');
  const profilesList = document.getElementById('profiles-list');
  const noProfilesMessage = document.getElementById('no-profiles-message');
  const addProfileBtn = document.getElementById('add-profile-btn');
  const importProfileBtn = document.getElementById('import-profile-btn');
  const exportProfilesBtn = document.getElementById('export-profiles-btn');
  const activeKeywordsCount = document.getElementById('active-keywords-count');
  const resetStatsBtn = document.getElementById('reset-stats-btn');
  const sessionBlockedEl = document.getElementById('session-blocked');
  const totalBlockedEl = document.getElementById('total-blocked');

  // Elements - Profile edit view
  const profileEditView = document.getElementById('profile-edit-view');
  const backBtn = document.getElementById('back-btn');
  const profileNameInput = document.getElementById('profile-name-input');
  const exportProfileBtn = document.getElementById('export-profile-btn');
  const profileEnabledToggle = document.getElementById('profile-enabled-toggle');
  const keywordInput = document.getElementById('keyword-input');
  const addKeywordBtn = document.getElementById('add-keyword-btn');
  const keywordsList = document.getElementById('keywords-list');
  const emptyMessage = document.getElementById('empty-message');
  const keywordCount = document.getElementById('keyword-count');
  const deleteProfileBtn = document.getElementById('delete-profile-btn');

  // Elements - Common
  const filterToggle = document.getElementById('filter-toggle');
  const disabledNotice = document.getElementById('disabled-notice');
  const toast = document.getElementById('toast');

  // Elements - Import modal
  const importModal = document.getElementById('import-modal');
  const importPasteStep = document.getElementById('import-paste-step');
  const importSelectStep = document.getElementById('import-select-step');
  const importTextarea = document.getElementById('import-textarea');
  const closeModalBtn = document.getElementById('close-modal-btn');
  const cancelImportBtn = document.getElementById('cancel-import-btn');
  const nextImportBtn = document.getElementById('next-import-btn');
  const backImportBtn = document.getElementById('back-import-btn');
  const confirmImportBtn = document.getElementById('confirm-import-btn');

  // Elements - Confirm modal
  const confirmModal = document.getElementById('confirm-modal');
  const confirmMessage = document.getElementById('confirm-message');
  const confirmOkBtn = document.getElementById('confirm-ok-btn');
  const confirmCancelBtn = document.getElementById('confirm-cancel-btn');

  // Elements - Export modal
  const exportModal = document.getElementById('export-modal');
  const closeExportBtn = document.getElementById('close-export-btn');
  const cancelExportBtn = document.getElementById('cancel-export-btn');
  const confirmExportBtn = document.getElementById('confirm-export-btn');

  // State
  let profiles = {};
  let editingProfileId = null;
  let isEnabled = true;
  let importCandidates = [];
  let exportCandidates = [];
  let resolveConfirm = null;

  // Ask for confirmation inside the popup instead of window.confirm(),
  // so it looks and works the same on desktop and Firefox for Android
  function showConfirm(message, confirmLabel) {
    confirmMessage.textContent = message;
    confirmOkBtn.textContent = confirmLabel;
    confirmModal.classList.remove('hidden');
    return new Promise(resolve => {
      resolveConfirm = resolve;
    });
  }

  function closeConfirm(result) {
    confirmModal.classList.add('hidden');
    if (resolveConfirm) {
      resolveConfirm(result);
      resolveConfirm = null;
    }
  }

  function keywordCountText(count) {
    return count === 1 ? '1 keyword' : `${count} keywords`;
  }

  // Profiles in display order (newest first)
  function getSortedProfiles() {
    return Object.values(profiles).sort((a, b) => b.createdAt - a.createdAt);
  }

  // Checkbox list of profiles with a "Select all" box. The confirm button shows
  // how many profiles are selected and is disabled when none are.
  function createSelectionList(list, selectAll, confirmBtn, verb) {
    const checkboxes = () => [...list.querySelectorAll('input[type="checkbox"]')];

    function getSelectedIndexes() {
      return checkboxes()
        .filter(box => box.checked)
        .map(box => parseInt(box.dataset.index, 10));
    }

    function update() {
      const total = checkboxes().length;
      const count = getSelectedIndexes().length;
      selectAll.checked = total > 0 && count === total;
      selectAll.indeterminate = count > 0 && count < total;
      confirmBtn.disabled = count === 0;
      confirmBtn.textContent = `${verb} ${count === 1 ? '1 profile' : `${count} profiles`}`;
    }

    // items: [{ name, detail, checked }]
    function render(items) {
      list.innerHTML = '';
      items.forEach((item, index) => {
        const li = document.createElement('li');
        const label = document.createElement('label');

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = item.checked;
        checkbox.dataset.index = index;

        const info = document.createElement('span');
        info.className = 'selection-info';

        const name = document.createElement('span');
        name.className = 'selection-name';
        name.textContent = item.name;

        const detail = document.createElement('span');
        detail.className = 'selection-detail';
        detail.textContent = item.detail;

        info.appendChild(name);
        info.appendChild(detail);
        label.appendChild(checkbox);
        label.appendChild(info);
        li.appendChild(label);
        list.appendChild(li);
      });
      update();
    }

    list.addEventListener('change', update);
    selectAll.addEventListener('change', () => {
      checkboxes().forEach(box => {
        box.checked = selectAll.checked;
      });
      update();
    });

    return { render, getSelectedIndexes };
  }

  const importSelection = createSelectionList(
    document.getElementById('import-list'),
    document.getElementById('import-select-all'),
    confirmImportBtn,
    'Import'
  );

  const exportSelection = createSelectionList(
    document.getElementById('export-list'),
    document.getElementById('export-select-all'),
    confirmExportBtn,
    'Copy'
  );

  // Toast notification
  function showToast(message, type = 'success') {
    toast.textContent = message;
    toast.className = 'toast ' + type;
    toast.classList.add('show');
    toast.classList.remove('hidden');

    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.classList.add('hidden'), 300);
    }, 2500);
  }

  // Load enabled state from storage
  async function loadEnabled() {
    try {
      isEnabled = await StorageHelper.isEnabled();
      filterToggle.checked = isEnabled;
      updateDisabledNotice();
    } catch (error) {
      console.error('Error loading enabled state:', error);
    }
  }

  // Toggle filter enabled/disabled
  async function toggleEnabled() {
    isEnabled = filterToggle.checked;
    try {
      await StorageHelper.setEnabled(isEnabled);
      updateDisabledNotice();
    } catch (error) {
      console.error('Error saving enabled state:', error);
    }
  }

  // Show/hide disabled notice
  function updateDisabledNotice() {
    if (isEnabled) {
      disabledNotice.classList.add('hidden');
    } else {
      disabledNotice.classList.remove('hidden');
    }
  }

  // Load profiles from storage
  async function loadProfiles() {
    try {
      profiles = await StorageHelper.getProfiles();
      renderProfiles();
      updateActiveKeywordsCount();
    } catch (error) {
      console.error('Error loading profiles:', error);
    }
  }

  // Calculate total active keywords
  async function updateActiveKeywordsCount() {
    const combined = await StorageHelper.getCombinedKeywords();
    activeKeywordsCount.textContent = combined.length;
  }

  // Render profile list
  function renderProfiles() {
    profilesList.innerHTML = '';
    const profileArray = getSortedProfiles();
    exportProfilesBtn.disabled = profileArray.length === 0;

    if (profileArray.length === 0) {
      noProfilesMessage.classList.remove('hidden');
    } else {
      noProfilesMessage.classList.add('hidden');

      profileArray.forEach(profile => {
        const li = document.createElement('li');
        li.className = 'profile-item' + (profile.enabled ? '' : ' inactive');
        li.dataset.profileId = profile.id;

        // Profile info section
        const profileInfo = document.createElement('div');
        profileInfo.className = 'profile-info';

        const profileName = document.createElement('span');
        profileName.className = 'profile-name';
        profileName.textContent = profile.name;

        const keywordsCount = document.createElement('span');
        keywordsCount.className = 'profile-keywords-count';
        keywordsCount.textContent = keywordCountText(profile.keywords.length);

        profileInfo.appendChild(profileName);
        profileInfo.appendChild(keywordsCount);

        // Profile controls section
        const profileControls = document.createElement('div');
        profileControls.className = 'profile-controls';

        const toggleLabel = document.createElement('label');
        toggleLabel.className = 'toggle-switch small';

        const toggleInput = document.createElement('input');
        toggleInput.type = 'checkbox';
        toggleInput.className = 'profile-toggle';
        toggleInput.checked = profile.enabled;

        const toggleSlider = document.createElement('span');
        toggleSlider.className = 'toggle-slider';

        toggleLabel.appendChild(toggleInput);
        toggleLabel.appendChild(toggleSlider);
        profileControls.appendChild(toggleLabel);

        li.appendChild(profileInfo);
        li.appendChild(profileControls);
        profilesList.appendChild(li);
      });
    }
  }

  // Show profile list view
  function showProfileListView() {
    profileEditView.classList.add('hidden');
    profileListView.classList.remove('hidden');
    editingProfileId = null;
    loadProfiles();
  }

  // Show profile edit view
  async function showProfileEditView(profileId) {
    const profile = profiles[profileId];
    if (!profile) return;

    editingProfileId = profileId;
    profileNameInput.value = profile.name;
    profileEnabledToggle.checked = profile.enabled;

    profileListView.classList.add('hidden');
    profileEditView.classList.remove('hidden');

    renderKeywords(profile.keywords);
  }

  // Render keywords for a profile
  function renderKeywords(keywords) {
    keywordsList.innerHTML = '';

    if (keywords.length === 0) {
      emptyMessage.classList.remove('hidden');
    } else {
      emptyMessage.classList.add('hidden');

      keywords.forEach((keyword, index) => {
        const li = document.createElement('li');

        const keywordText = document.createElement('span');
        keywordText.className = 'keyword-text';
        keywordText.textContent = keyword;

        const removeBtn = document.createElement('button');
        removeBtn.className = 'remove-btn';
        removeBtn.dataset.index = index;
        removeBtn.textContent = 'Remove';

        li.appendChild(keywordText);
        li.appendChild(removeBtn);
        keywordsList.appendChild(li);
      });
    }

    keywordCount.textContent = keywords.length;
  }

  // Create new profile
  async function createProfile() {
    const profile = await StorageHelper.createProfile('New Profile');
    if (profile) {
      profiles[profile.id] = profile;
      showProfileEditView(profile.id);
      profileNameInput.select();
    }
  }

  // Delete current profile
  async function deleteProfile() {
    if (!editingProfileId) return;

    if (await showConfirm('Delete this profile?', 'Delete')) {
      await StorageHelper.deleteProfile(editingProfileId);
      showProfileListView();
    }
  }

  // Save profile name
  async function saveProfileName() {
    if (!editingProfileId) return;

    const name = profileNameInput.value.trim() || 'New Profile';
    await StorageHelper.updateProfile(editingProfileId, { name });

    // Storage may have renamed it (e.g. "Name (1)") to avoid a duplicate
    const saved = await StorageHelper.getProfile(editingProfileId);
    if (saved) {
      profiles[editingProfileId].name = saved.name;
      profileNameInput.value = saved.name;
    }
  }

  // Toggle profile enabled
  async function toggleProfileEnabled() {
    if (!editingProfileId) return;

    const enabled = profileEnabledToggle.checked;
    await StorageHelper.toggleProfile(editingProfileId, enabled);
    profiles[editingProfileId].enabled = enabled;
    updateActiveKeywordsCount();
  }

  // Add keyword to profile
  async function addKeyword() {
    if (!editingProfileId) return;

    const keyword = keywordInput.value.trim();
    if (!keyword) {
      keywordInput.focus();
      return;
    }

    // Check length before sending to storage
    if (keyword.length > StorageHelper.MAX_KEYWORD_LENGTH) {
      showToast(`Keyword exceeds ${StorageHelper.MAX_KEYWORD_LENGTH} characters`, 'error');
      keywordInput.focus();
      return;
    }

    const result = await StorageHelper.addKeywordToProfile(editingProfileId, keyword);
    if (result.success) {
      profiles[editingProfileId].keywords.push(keyword);
      renderKeywords(profiles[editingProfileId].keywords);
      updateActiveKeywordsCount();
      keywordInput.value = '';
    } else {
      showToast(result.error || 'Could not add keyword', 'error');
    }

    keywordInput.focus();
  }

  // Remove keyword from profile
  async function removeKeyword(index) {
    if (!editingProfileId) return;

    const keyword = profiles[editingProfileId].keywords[index];
    const success = await StorageHelper.removeKeywordFromProfile(editingProfileId, keyword);
    if (success) {
      profiles[editingProfileId].keywords.splice(index, 1);
      renderKeywords(profiles[editingProfileId].keywords);
      updateActiveKeywordsCount();
    }
  }

  // Show export modal; all profiles are selected unless one is preselected
  function showExportModal(preselectedId = null) {
    exportCandidates = getSortedProfiles();
    exportSelection.render(exportCandidates.map(profile => ({
      name: profile.name,
      detail: keywordCountText(profile.keywords.length),
      checked: !preselectedId || profile.id === preselectedId
    })));
    exportModal.classList.remove('hidden');
  }

  // Hide export modal
  function hideExportModal() {
    exportModal.classList.add('hidden');
    exportCandidates = [];
  }

  // Copy the selected profiles to the clipboard
  async function exportSelectedProfiles() {
    const selected = exportSelection.getSelectedIndexes().map(i => exportCandidates[i]);
    if (selected.length === 0) return;

    const exportData = StorageHelper.exportProfiles(selected);

    try {
      await navigator.clipboard.writeText(JSON.stringify(exportData, null, 2));
      showToast(`Copied ${selected.length === 1 ? '1 profile' : `${selected.length} profiles`} to clipboard`, 'success');
      hideExportModal();
    } catch (error) {
      console.error('Error exporting profiles:', error);
      showToast('Could not export profiles', 'error');
    }
  }

  // Show import modal
  function showImportModal() {
    importTextarea.value = '';
    showImportStep('paste');
    importModal.classList.remove('hidden');
    importTextarea.focus();
  }

  // Hide import modal
  function hideImportModal() {
    importModal.classList.add('hidden');
    importTextarea.value = '';
    importCandidates = [];
  }

  function showImportStep(step) {
    importPasteStep.classList.toggle('hidden', step !== 'paste');
    importSelectStep.classList.toggle('hidden', step !== 'select');
  }

  // Parse the pasted JSON and list the profiles found in it
  function previewImport() {
    const text = importTextarea.value.trim();

    if (!text) {
      showToast('Please paste exported profiles', 'error');
      importTextarea.focus();
      return;
    }

    let jsonData;
    try {
      jsonData = JSON.parse(text);
    } catch (e) {
      showToast('Invalid JSON format', 'error');
      importTextarea.focus();
      return;
    }

    const result = StorageHelper.parseImportData(jsonData);
    if (!result.valid) {
      showToast(result.error, 'error');
      importTextarea.focus();
      return;
    }

    importCandidates = result.profiles;
    const existingNames = new Set(Object.values(profiles).map(p => p.name.toLowerCase()));

    importSelection.render(importCandidates.map(profile => {
      let detail = keywordCountText(profile.keywords.length);
      if (existingNames.has(profile.name.toLowerCase())) {
        detail += ' · name in use, will be renamed';
      }
      return { name: profile.name, detail, checked: true };
    }));
    showImportStep('select');
  }

  // Import the selected profiles
  async function importSelectedProfiles() {
    const selected = importSelection.getSelectedIndexes().map(i => importCandidates[i]);
    if (selected.length === 0) return;

    const result = await StorageHelper.importProfiles(selected);

    if (result.success) {
      showToast(`Imported ${selected.length === 1 ? '1 profile' : `${selected.length} profiles`}`, 'success');
      hideImportModal();
      loadProfiles();
    } else {
      showToast(result.error, 'error');
    }
  }

  // Toggle profile from list
  async function toggleProfileFromList(profileId, enabled) {
    await StorageHelper.toggleProfile(profileId, enabled);
    profiles[profileId].enabled = enabled;
    updateActiveKeywordsCount();

    // Update visual state
    const li = profilesList.querySelector(`[data-profile-id="${profileId}"]`);
    if (li) {
      if (enabled) {
        li.classList.remove('inactive');
      } else {
        li.classList.add('inactive');
      }
    }
  }

  // Load stats from storage
  async function loadStats() {
    try {
      const stats = await StorageHelper.getStats();
      totalBlockedEl.textContent = stats.totalBlocked;

      // Get session stats from active tab's content script
      const tabs = await browser.tabs.query({ active: true, currentWindow: true });
      if (tabs[0] && tabs[0].url && tabs[0].url.includes('reddit.com')) {
        try {
          const response = await browser.tabs.sendMessage(tabs[0].id, { action: 'getSessionStats' });
          if (response && typeof response.sessionBlocked === 'number') {
            sessionBlockedEl.textContent = response.sessionBlocked;
          }
        } catch (e) {
          sessionBlockedEl.textContent = '0';
        }
      }
    } catch (error) {
      console.error('Error loading stats:', error);
    }
  }

  // Reset stats
  async function resetStats() {
    if (await showConfirm('Reset all statistics?', 'Reset')) {
      await StorageHelper.resetStats();
      totalBlockedEl.textContent = '0';
      sessionBlockedEl.textContent = '0';
    }
  }

  // Event listeners - Profile list view
  addProfileBtn.addEventListener('click', createProfile);
  importProfileBtn.addEventListener('click', showImportModal);
  exportProfilesBtn.addEventListener('click', () => showExportModal());
  resetStatsBtn.addEventListener('click', resetStats);

  // Event listeners - Import modal
  closeModalBtn.addEventListener('click', hideImportModal);
  cancelImportBtn.addEventListener('click', hideImportModal);
  nextImportBtn.addEventListener('click', previewImport);
  backImportBtn.addEventListener('click', () => {
    showImportStep('paste');
    importTextarea.focus();
  });
  confirmImportBtn.addEventListener('click', importSelectedProfiles);
  importModal.addEventListener('click', (e) => {
    if (e.target === importModal) {
      hideImportModal();
    }
  });

  // Event listeners - Confirm modal
  confirmOkBtn.addEventListener('click', () => closeConfirm(true));
  confirmCancelBtn.addEventListener('click', () => closeConfirm(false));
  confirmModal.addEventListener('click', (e) => {
    if (e.target === confirmModal) {
      closeConfirm(false);
    }
  });

  // Event listeners - Export modal
  closeExportBtn.addEventListener('click', hideExportModal);
  cancelExportBtn.addEventListener('click', hideExportModal);
  confirmExportBtn.addEventListener('click', exportSelectedProfiles);
  exportModal.addEventListener('click', (e) => {
    if (e.target === exportModal) {
      hideExportModal();
    }
  });

  profilesList.addEventListener('click', (e) => {
    const profileItem = e.target.closest('.profile-item');
    if (!profileItem) return;

    const profileId = profileItem.dataset.profileId;

    // Handle toggle click
    if (e.target.classList.contains('profile-toggle')) {
      e.stopPropagation();
      toggleProfileFromList(profileId, e.target.checked);
      return;
    }

    // Handle click on toggle label/slider
    if (e.target.closest('.toggle-switch')) {
      return;
    }

    // Click on profile info - open edit view
    if (e.target.closest('.profile-info')) {
      showProfileEditView(profileId);
    }
  });

  // Event listeners - Profile edit view
  backBtn.addEventListener('click', showProfileListView);
  exportProfileBtn.addEventListener('click', () => showExportModal(editingProfileId));
  deleteProfileBtn.addEventListener('click', deleteProfile);

  profileNameInput.addEventListener('blur', saveProfileName);
  profileNameInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      profileNameInput.blur();
    }
  });

  profileEnabledToggle.addEventListener('change', toggleProfileEnabled);

  addKeywordBtn.addEventListener('click', addKeyword);
  keywordInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      addKeyword();
    }
  });

  keywordsList.addEventListener('click', (e) => {
    if (e.target.classList.contains('remove-btn')) {
      const index = parseInt(e.target.dataset.index, 10);
      removeKeyword(index);
    }
  });

  // Common event listeners
  filterToggle.addEventListener('change', toggleEnabled);

  // Listen for stats updates from content script
  browser.runtime.onMessage.addListener((message) => {
    if (message.action === 'statsUpdated') {
      sessionBlockedEl.textContent = message.sessionBlocked;
      loadStats();
    }
  });

  // Initialize
  async function init() {
    await StorageHelper.ensureMigrated();
    await loadEnabled();
    await loadProfiles();
    await loadStats();
  }

  init();
})();
