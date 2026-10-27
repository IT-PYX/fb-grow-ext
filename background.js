/**
 * Facebook Auto Friend Request Bot - Background Service Worker
 * Manifest V3 compatible
 */

const ALARM_NAME = 'fb_auto_cycle_alarm';

const DEFAULT_SETTINGS = {
  isRunning: false,
  keywords: ['Digital Marketing', 'E-commerce', 'Shopify', 'Real Estate', 'Business Development'],
  currentKeywordIndex: 0,
  intervalMinutes: 60, // 60 mins (1 hr) or 120 mins (2 hrs)
  maxPerCycle: 5,      // safe limit per cycle
  minDelaySec: 8,      // min delay between clicks
  maxDelaySec: 16,     // max delay between clicks
  autoCloseTab: true,  // close tab when done
  // Smart Knowledge/Bio Filter Settings:
  filterByBio: true,           // Verify expertise/knowledge in bio or work, don't just match profile name
  skipNameOnlyMatch: true,     // Skip profile if keyword is only in their name
  expertiseKeywords: [
    'works at', 'worked at', 'studied', 'student', 'specialist',
    'expert', 'consultant', 'freelancer', 'developer', 'marketer',
    'engineer', 'designer', 'manager', 'founder', 'ceo', 'director',
    'intern', 'beginner', 'learner', 'enthusiast', 'academy',
    'institute', 'university', 'certified', 'agency', 'solutions',
    'professional', 'officer', 'lead', 'executive'
  ],
  activeTabId: null,
  isCycleActive: false,
  stats: {
    totalSent: 0,
    lastRunTime: null,
    lastKeyword: null,
    lastSentCount: 0,
    nextRunTime: null
  },
  logs: []
};

// Initialize settings on install
chrome.runtime.onInstalled.addListener(async () => {
  const current = await chrome.storage.local.get(null);
  const toInit = {};
  for (const key in DEFAULT_SETTINGS) {
    if (current[key] === undefined) {
      toInit[key] = DEFAULT_SETTINGS[key];
    }
  }
  if (Object.keys(toInit).length > 0) {
    await chrome.storage.local.set(toInit);
  }
  await addLog('FB Auto Friend Request Bot installed and ready.', 'info');
});

// Helper: Add log entry
async function addLog(message, type = 'info') {
  const data = await chrome.storage.local.get(['logs']);
  let logs = data.logs || [];
  const entry = {
    id: Date.now() + Math.random().toString(36).substr(2, 4),
    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    message,
    type // 'info', 'success', 'warning', 'error'
  };
  logs.unshift(entry);
  if (logs.length > 50) logs = logs.slice(0, 50);
  await chrome.storage.local.set({ logs });

  // Broadcast to popup if open
  chrome.runtime.sendMessage({ action: 'NEW_LOG', log: entry }).catch(() => {});
}

// Helper: Schedule next alarm
async function scheduleNextAlarm(minutes) {
  await chrome.alarms.clear(ALARM_NAME);
  chrome.alarms.create(ALARM_NAME, { delayInMinutes: minutes });
  
  const nextRunTime = Date.now() + minutes * 60 * 1000;
  const data = await chrome.storage.local.get(['stats']);
  const stats = data.stats || {};
  stats.nextRunTime = nextRunTime;
  await chrome.storage.local.set({ stats });

  const nextDateStr = new Date(nextRunTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  await addLog(`Next automatic run scheduled at ${nextDateStr} (in ${minutes} mins).`, 'info');
}

// Alarm Trigger Handler
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === ALARM_NAME) {
    const data = await chrome.storage.local.get(['isRunning', 'isCycleActive']);
    if (data.isRunning && !data.isCycleActive) {
      await addLog('Alarm triggered: Starting scheduled cycle...', 'info');
      await executeRunCycle();
    }
  }
});

// Run Cycle Executor
async function executeRunCycle() {
  const data = await chrome.storage.local.get([
    'isRunning',
    'keywords',
    'currentKeywordIndex',
    'maxPerCycle',
    'minDelaySec',
    'maxDelaySec',
    'isCycleActive',
    'activeTabId',
    'intervalMinutes',
    'filterByBio',
    'skipNameOnlyMatch',
    'expertiseKeywords'
  ]);

  if (data.isCycleActive) {
    await addLog('Cycle is already in progress, skipping trigger.', 'warning');
    return;
  }

  const keywords = (data.keywords && data.keywords.length > 0) ? data.keywords : ['Business'];
  const currentIndex = data.currentKeywordIndex || 0;
  const keyword = keywords[currentIndex % keywords.length].trim();
  const nextIndex = (currentIndex + 1) % keywords.length;

  await chrome.storage.local.set({
    currentKeywordIndex: nextIndex,
    isCycleActive: true
  });

  await addLog(`[Cycle Started] Keyword: "${keyword}". Opening Facebook search...`, 'info');

  const searchUrl = `https://www.facebook.com/search/people/?q=${encodeURIComponent(keyword)}`;

  try {
    // Create new Facebook search tab
    const tab = await chrome.tabs.create({ url: searchUrl, active: true });
    await chrome.storage.local.set({ activeTabId: tab.id });

    // Wait for page to complete loading
    const tabLoaded = await waitForTabLoad(tab.id, 45000);
    if (!tabLoaded) {
      throw new Error('Facebook tab took too long to load.');
    }

    // Wait an extra 4 seconds for Facebook SPA scripts and UI to hydrate
    await sleep(4000);

    // Parse safe numbers for delays
    let minDelaySec = parseInt(data.minDelaySec, 10);
    let maxDelaySec = parseInt(data.maxDelaySec, 10);
    if (isNaN(minDelaySec) || minDelaySec < 1) minDelaySec = 8;
    if (isNaN(maxDelaySec) || maxDelaySec < minDelaySec) maxDelaySec = Math.max(minDelaySec, 16);

    // Send instruction to content script to begin process
    let response = null;
    for (let attempts = 0; attempts < 5; attempts++) {
      try {
        response = await chrome.tabs.sendMessage(tab.id, {
          action: 'START_CYCLE',
          keyword: keyword,
          maxRequests: parseInt(data.maxPerCycle, 10) || 5,
          minDelaySec: minDelaySec,
          maxDelaySec: maxDelaySec,
          filterByBio: data.filterByBio !== undefined ? data.filterByBio : true,
          skipNameOnlyMatch: data.skipNameOnlyMatch !== undefined ? data.skipNameOnlyMatch : true,
          expertiseKeywords: data.expertiseKeywords || DEFAULT_SETTINGS.expertiseKeywords
        });
        if (response && response.received) break;
      } catch (err) {
        // Content script might not be injected yet, retry after 2s
        await sleep(2000);
      }
    }

    if (!response || !response.received) {
      await addLog('Failed to communicate with Facebook tab. Content script might be blocked.', 'error');
      await finishCycle(0, keyword, 'Content script initialization timeout');
    }
  } catch (error) {
    await addLog(`Cycle error: ${error.message}`, 'error');
    await finishCycle(0, keyword, error.message);
  }
}

// Wait until tab finishes loading
function waitForTabLoad(tabId, timeoutMs = 30000) {
  return new Promise((resolve) => {
    let finished = false;

    const listener = (updatedTabId, changeInfo) => {
      if (updatedTabId === tabId && changeInfo.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);
        finished = true;
        resolve(true);
      }
    };

    chrome.tabs.onUpdated.addListener(listener);

    setTimeout(() => {
      if (!finished) {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve(false);
      }
    }, timeoutMs);
  });
}

function sleep(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

// Finish cycle and clean up
async function finishCycle(sentCount, keyword, reason = '') {
  const data = await chrome.storage.local.get([
    'isRunning',
    'stats',
    'autoCloseTab',
    'activeTabId',
    'intervalMinutes'
  ]);

  const stats = data.stats || { totalSent: 0 };
  stats.totalSent = (stats.totalSent || 0) + sentCount;
  stats.lastRunTime = Date.now();
  stats.lastKeyword = keyword;
  stats.lastSentCount = sentCount;

  await chrome.storage.local.set({
    isCycleActive: false,
    stats: stats
  });

  const message = `[Cycle Finished] Sent ${sentCount} friend request(s) for "${keyword}". ${reason ? '(' + reason + ')' : ''}`;
  await addLog(message, sentCount > 0 ? 'success' : 'warning');

  // Close tab if requested
  if (data.autoCloseTab && data.activeTabId) {
    try {
      await sleep(4000);
      await chrome.tabs.remove(data.activeTabId);
    } catch (e) {
      // Tab might have already been closed by user
    }
    await chrome.storage.local.set({ activeTabId: null });
  }

  // If bot is still turned on, schedule next cycle!
  if (data.isRunning) {
    const interval = data.intervalMinutes || 60;
    await scheduleNextAlarm(interval);
  }
}

// Message Listener from Popup and Content Script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'START_BOT') {
    (async () => {
      await chrome.storage.local.set({ isRunning: true });
      await addLog('Bot activated! Preparing first cycle...', 'success');
      // Run first cycle immediately
      await executeRunCycle();
      sendResponse({ success: true });
    })();
    return true;
  }

  if (request.action === 'STOP_BOT') {
    (async () => {
      await chrome.alarms.clear(ALARM_NAME);
      const data = await chrome.storage.local.get(['activeTabId', 'stats']);
      const stats = data.stats || {};
      stats.nextRunTime = null;

      await chrome.storage.local.set({
        isRunning: false,
        isCycleActive: false,
        stats: stats
      });

      // Stop active tab content script if any
      if (data.activeTabId) {
        chrome.tabs.sendMessage(data.activeTabId, { action: 'STOP_IMMEDIATELY' }).catch(() => {});
      }

      await addLog('Bot stopped. Automation paused.', 'warning');
      sendResponse({ success: true });
    })();
    return true;
  }

  if (request.action === 'RUN_NOW') {
    (async () => {
      await addLog('Manual "Run Now" triggered by user.', 'info');
      await executeRunCycle();
      sendResponse({ success: true });
    })();
    return true;
  }

  if (request.action === 'CYCLE_COMPLETED') {
    (async () => {
      await finishCycle(request.sentCount || 0, request.keyword || '', request.reason || '');
      sendResponse({ received: true });
    })();
    return true;
  }

  if (request.action === 'CYCLE_PROGRESS') {
    (async () => {
      await addLog(`[Progress] Sent request ${request.current} of ${request.maxRequests} for "${request.keyword}"`, 'info');
      sendResponse({ received: true });
    })();
    return true;
  }

  if (request.action === 'FACEBOOK_BLOCKED') {
    (async () => {
      await addLog(`⚠️ FACEBOOK LIMIT/WARNING DETECTED: "${request.detail || 'Action restricted'}". Bot safely stopped.`, 'error');
      // Stop bot immediately to protect user's account
      await chrome.alarms.clear(ALARM_NAME);
      await chrome.storage.local.set({ isRunning: false, isCycleActive: false });
      sendResponse({ received: true });
    })();
    return true;
  }

  if (request.action === 'CONTENT_LOG') {
    addLog(request.message, request.type || 'info');
    sendResponse({ received: true });
    return true;
  }
});
