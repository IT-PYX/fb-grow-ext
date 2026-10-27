/**
 * Facebook Auto Friend Request Bot - Popup Script
 */

document.addEventListener('DOMContentLoaded', async () => {
  // DOM Elements
  const botStatusBadge = document.getElementById('botStatusBadge');
  const nextRunCountdown = document.getElementById('nextRunCountdown');
  const btnToggleBot = document.getElementById('btnToggleBot');
  const btnToggleText = document.getElementById('btnToggleText');
  const btnRunNow = document.getElementById('btnRunNow');

  // Form Elements
  const keywordsInput = document.getElementById('keywordsInput');
  const intervalSelect = document.getElementById('intervalSelect');
  const maxPerCycleInput = document.getElementById('maxPerCycleInput');
  const minDelayInput = document.getElementById('minDelayInput');
  const maxDelayInput = document.getElementById('maxDelayInput');
  const autoCloseTabInput = document.getElementById('autoCloseTabInput');
  const filterByBioInput = document.getElementById('filterByBioInput');
  const skipNameOnlyMatchInput = document.getElementById('skipNameOnlyMatchInput');
  const expertiseKeywordsInput = document.getElementById('expertiseKeywordsInput');
  const btnSaveSettings = document.getElementById('btnSaveSettings');

  // Stats Elements
  const statTotalSent = document.getElementById('statTotalSent');
  const statLastSent = document.getElementById('statLastSent');
  const statCurrentKeyword = document.getElementById('statCurrentKeyword');
  const statLastRunTime = document.getElementById('statLastRunTime');
  const statSchedulerStatus = document.getElementById('statSchedulerStatus');
  const btnResetStats = document.getElementById('btnResetStats');

  // Logs Elements
  const logsContainer = document.getElementById('logsContainer');
  const btnClearLogs = document.getElementById('btnClearLogs');
  const toast = document.getElementById('toast');

  let countdownInterval = null;

  // Initialize UI with saved settings
  await loadState();

  // Tab switching logic
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach((c) => c.classList.remove('active'));

      btn.classList.add('active');
      const tabId = `tab-${btn.dataset.tab}`;
      const tabContent = document.getElementById(tabId);
      if (tabContent) tabContent.classList.add('active');
    });
  });

  // Toggle Bot (Start / Stop)
  btnToggleBot.addEventListener('click', async () => {
    const data = await chrome.storage.local.get(['isRunning']);
    const currentlyRunning = !!data.isRunning;

    if (currentlyRunning) {
      // Send STOP command
      chrome.runtime.sendMessage({ action: 'STOP_BOT' }, () => {
        updateBotStatusUI(false);
        showToast('Bot Stopped');
      });
    } else {
      // Save any pending settings first, then START
      await saveCurrentFormSettings();
      chrome.runtime.sendMessage({ action: 'START_BOT' }, () => {
        updateBotStatusUI(true);
        showToast('Bot Started! Running 1st cycle...');
      });
    }
  });

  // Run Now button (Immediate single execution)
  btnRunNow.addEventListener('click', async () => {
    await saveCurrentFormSettings();
    btnRunNow.disabled = true;
    btnRunNow.textContent = '⏳ Starting...';

    chrome.runtime.sendMessage({ action: 'RUN_NOW' }, () => {
      setTimeout(() => {
        btnRunNow.disabled = false;
        btnRunNow.textContent = '⚡ Run Now';
        showToast('Cycle started in Facebook tab!');
      }, 1000);
    });
  });

  // Save Settings button
  btnSaveSettings.addEventListener('click', async () => {
    await saveCurrentFormSettings();
    showToast('Settings Saved Successfully!');
  });

  // Reset Stats button
  btnResetStats.addEventListener('click', async () => {
    const resetStats = {
      totalSent: 0,
      lastRunTime: null,
      lastKeyword: null,
      lastSentCount: 0,
      nextRunTime: null
    };
    await chrome.storage.local.set({ stats: resetStats });
    statTotalSent.textContent = '0';
    statLastSent.textContent = '0';
    statLastRunTime.textContent = 'Never';
    showToast('Stats reset!');
  });

  // Clear Logs
  btnClearLogs.addEventListener('click', async () => {
    await chrome.storage.local.set({ logs: [] });
    renderLogs([]);
    showToast('Logs cleared');
  });

  // Listen for logs or status updates from background
  chrome.runtime.onMessage.addListener((request) => {
    if (request.action === 'NEW_LOG') {
      prependLog(request.log);
    }
  });

  // Storage change listener to keep UI reactive
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local') {
      if (changes.isRunning !== undefined) {
        updateBotStatusUI(changes.isRunning.newValue);
      }
      if (changes.stats !== undefined) {
        renderStats(changes.stats.newValue);
      }
      if (changes.logs !== undefined) {
        renderLogs(changes.logs.newValue || []);
      }
    }
  });

  /**
   * Load entire state from storage into UI
   */
  async function loadState() {
    const state = await chrome.storage.local.get(null);

    // Settings
    if (state.keywords && Array.isArray(state.keywords)) {
      keywordsInput.value = state.keywords.join(', ');
    }
    if (state.intervalMinutes !== undefined) {
      intervalSelect.value = state.intervalMinutes;
    }
    if (state.maxPerCycle !== undefined) {
      maxPerCycleInput.value = state.maxPerCycle;
    }
    if (state.minDelaySec !== undefined) {
      minDelayInput.value = state.minDelaySec;
    }
    if (state.maxDelaySec !== undefined) {
      maxDelayInput.value = state.maxDelaySec;
    }
    if (state.autoCloseTab !== undefined) {
      autoCloseTabInput.checked = state.autoCloseTab;
    }
    if (state.filterByBio !== undefined) {
      filterByBioInput.checked = state.filterByBio;
    }
    if (state.skipNameOnlyMatch !== undefined) {
      skipNameOnlyMatchInput.checked = state.skipNameOnlyMatch;
    }
    if (state.expertiseKeywords && Array.isArray(state.expertiseKeywords)) {
      expertiseKeywordsInput.value = state.expertiseKeywords.join(', ');
    } else {
      expertiseKeywordsInput.value = 'works at, studied, student, specialist, expert, consultant, freelancer, developer, marketer, engineer, intern, founder, certified';
    }

    // Status UI
    updateBotStatusUI(!!state.isRunning);

    // Stats
    renderStats(state.stats || {});

    // Active keyword
    const kwList = state.keywords || [];
    const idx = state.currentKeywordIndex || 0;
    statCurrentKeyword.textContent = kwList.length > 0 ? kwList[idx % kwList.length] : '-';

    // Logs
    renderLogs(state.logs || []);

    // Countdown
    startCountdown();
  }

  /**
   * Update Status Badge & Toggle Button UI
   */
  function updateBotStatusUI(isRunning) {
    if (isRunning) {
      botStatusBadge.className = 'status-badge running';
      botStatusBadge.textContent = 'RUNNING';

      btnToggleBot.className = 'btn btn-primary btn-stop';
      btnToggleText.textContent = 'Stop Automation';
      statSchedulerStatus.textContent = 'Active (Auto-Looping)';
    } else {
      botStatusBadge.className = 'status-badge stopped';
      botStatusBadge.textContent = 'STOPPED';

      btnToggleBot.className = 'btn btn-primary';
      btnToggleText.textContent = 'Start Automation';
      statSchedulerStatus.textContent = 'Stopped';
      nextRunCountdown.textContent = 'Paused';
    }
  }

  /**
   * Render Stats Card
   */
  function renderStats(stats) {
    statTotalSent.textContent = stats.totalSent || 0;
    statLastSent.textContent = stats.lastSentCount || 0;

    if (stats.lastRunTime) {
      const d = new Date(stats.lastRunTime);
      statLastRunTime.textContent = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' (' + stats.lastKeyword + ')';
    } else {
      statLastRunTime.textContent = 'Never';
    }
  }

  /**
   * Render Logs list
   */
  function renderLogs(logs) {
    logsContainer.innerHTML = '';
    if (!logs || logs.length === 0) {
      logsContainer.innerHTML = '<div class="log-item empty">No logs yet.</div>';
      return;
    }
    logs.forEach((log) => {
      appendLogElement(log, false);
    });
  }

  function prependLog(log) {
    const empty = logsContainer.querySelector('.log-item.empty');
    if (empty) empty.remove();
    appendLogElement(log, true);
  }

  function appendLogElement(log, prepend = false) {
    const item = document.createElement('div');
    item.className = `log-item ${log.type || 'info'}`;
    item.innerHTML = `
      <span class="log-time">[${log.timestamp}]</span>
      <span class="log-text">${escapeHtml(log.message)}</span>
    `;
    if (prepend) {
      logsContainer.insertBefore(item, logsContainer.firstChild);
    } else {
      logsContainer.appendChild(item);
    }
  }

  /**
   * Next Run Countdown display
   */
  function startCountdown() {
    if (countdownInterval) clearInterval(countdownInterval);

    countdownInterval = setInterval(async () => {
      const data = await chrome.storage.local.get(['isRunning', 'stats', 'isCycleActive']);
      if (!data.isRunning) {
        nextRunCountdown.textContent = 'Paused';
        return;
      }

      if (data.isCycleActive) {
        nextRunCountdown.textContent = 'Active (Cycle in progress...)';
        return;
      }

      const nextTime = data.stats ? data.stats.nextRunTime : null;
      if (!nextTime) {
        nextRunCountdown.textContent = 'Calculating...';
        return;
      }

      const diff = nextTime - Date.now();
      if (diff <= 0) {
        nextRunCountdown.textContent = 'Triggering cycle now...';
      } else {
        const totalSecs = Math.floor(diff / 1000);
        const mins = Math.floor(totalSecs / 60);
        const secs = totalSecs % 60;
        nextRunCountdown.textContent = `${mins}m ${secs < 10 ? '0' : ''}${secs}s`;
      }
    }, 1000);
  }

  /**
   * Save form inputs into chrome.storage.local
   */
  async function saveCurrentFormSettings() {
    const rawKeywords = keywordsInput.value;
    const keywords = rawKeywords
      .split(/[\n,]+/)
      .map((k) => k.trim())
      .filter((k) => k.length > 0);

    const intervalMinutes = parseInt(intervalSelect.value, 10) || 60;
    const maxPerCycle = Math.min(30, Math.max(1, parseInt(maxPerCycleInput.value, 10) || 5));
    const minDelaySec = Math.max(4, parseInt(minDelayInput.value, 10) || 8);
    const maxDelaySec = Math.max(minDelaySec + 2, parseInt(maxDelayInput.value, 10) || 16);
    const autoCloseTab = autoCloseTabInput.checked;
    const filterByBio = filterByBioInput.checked;
    const skipNameOnlyMatch = skipNameOnlyMatchInput.checked;

    const rawExpertise = expertiseKeywordsInput.value;
    const expertiseKeywords = rawExpertise
      .split(/[\n,]+/)
      .map((k) => k.trim())
      .filter((k) => k.length > 0);

    await chrome.storage.local.set({
      keywords: keywords.length > 0 ? keywords : ['Digital Marketing'],
      intervalMinutes,
      maxPerCycle,
      minDelaySec,
      maxDelaySec,
      autoCloseTab,
      filterByBio,
      skipNameOnlyMatch,
      expertiseKeywords: expertiseKeywords.length > 0 ? expertiseKeywords : ['works at', 'studied', 'expert']
    });
  }

  function showToast(msg) {
    toast.textContent = msg;
    toast.classList.add('show');
    setTimeout(() => {
      toast.classList.remove('show');
    }, 2500);
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>"']/g, function (m) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m];
    });
  }
});
