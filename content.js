/**
 * Facebook Auto Friend Request Bot - Content Script
 * Executes on Facebook pages (specifically search/people pages)
 */

let isCycleRunning = false;
let shouldStop = false;
let currentOverlay = null;

// Listen for commands from background worker
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'START_CYCLE') {
    sendResponse({ received: true });
    if (!isCycleRunning) {
      runFriendAddCycle(request);
    }
    return true;
  }

  if (request.action === 'STOP_IMMEDIATELY') {
    shouldStop = true;
    updateOverlayStatus('Stopped by user.', 'error');
    sendResponse({ received: true });
    return true;
  }
});

/**
 * Main cycle execution
 */
async function runFriendAddCycle(config) {
  const {
    keyword,
    maxRequests = 5,
    minDelaySec = 8,
    maxDelaySec = 16
  } = config;

  let minSec = parseInt(minDelaySec, 10);
  let maxSec = parseInt(maxDelaySec, 10);
  if (isNaN(minSec) || minSec < 1) minSec = 8;
  if (isNaN(maxSec) || maxSec < minSec) maxSec = minSec;

  isCycleRunning = true;
  shouldStop = false;

  createOrUpdateOverlay(keyword, 0, maxRequests, 'Initializing search...');

  try {
    // Wait for page to settle
    await sleep(2500);

    let sentCount = 0;
    let scrollAttempts = 0;
    const maxScrollAttempts = 20;

    while (sentCount < maxRequests && !shouldStop) {
      // 1. Check for any Facebook restriction or block modal first
      if (checkFacebookBlockOrWarning()) {
        chrome.runtime.sendMessage({
          action: 'FACEBOOK_BLOCKED',
          detail: 'Facebook action restriction or warning detected on screen.'
        });
        updateOverlayStatus('⚠️ Action blocked by Facebook! Aborting for safety.', 'error');
        break;
      }

      // 2. Find eligible "Add friend" buttons
      const buttons = findEligibleAddButtons();

      if (buttons.length === 0) {
        if (scrollAttempts >= maxScrollAttempts) {
          updateOverlayStatus('No more people found for this keyword.', 'warning');
          break;
        }

        updateOverlayStatus(`Searching for people (scroll ${scrollAttempts + 1}/${maxScrollAttempts})...`);
        window.scrollBy({ top: 850, behavior: 'smooth' });
        scrollAttempts++;
        await sleep(3000);
        continue;
      }

      // Reset scroll attempts once we have buttons
      scrollAttempts = 0;

      // 3. Process candidate buttons one by one and send friend requests directly
      for (const targetBtn of buttons) {
        if (sentCount >= maxRequests || shouldStop) break;

        // Mark processed immediately so it's not repeatedly checked
        targetBtn.setAttribute('data-fb-bot-processed', 'true');

        // Extract profile name for clean logging
        const profileName = extractProfileName(targetBtn);
        updateOverlayStatus(`Sending request to ${profileName}...`);

        // Scroll smoothly into view
        targetBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
        await sleep(1500 + Math.random() * 1000);

        if (shouldStop) break;

        // Perform realistic human click
        const clickSuccess = simulateHumanClick(targetBtn);
        if (clickSuccess) {
          sentCount++;
          updateOverlayProgress(sentCount, maxRequests);
          updateOverlayStatus(`Request sent to ${profileName}!`);

          // Notify background progress
          chrome.runtime.sendMessage({
            action: 'CYCLE_PROGRESS',
            current: sentCount,
            maxRequests: maxRequests,
            keyword: `${keyword} (${profileName})`
          });

          chrome.runtime.sendMessage({
            action: 'CONTENT_LOG',
            message: `[Sent] Friend request sent to ${profileName}`,
            type: 'success'
          });

          // Check if a modal popped up (e.g. "Do you know this person?")
          await sleep(1500);
          handlePostClickModals();

          // If target reached, finish
          if (sentCount >= maxRequests) {
            updateOverlayStatus(`Target of ${maxRequests} requests reached!`);
            break;
          }

          // 4. Random human-like delay between requests
          try {
            const liveSettings = await chrome.storage.local.get(['minDelaySec', 'maxDelaySec']);
            if (liveSettings.minDelaySec !== undefined) {
              const liveMin = parseInt(liveSettings.minDelaySec, 10);
              if (!isNaN(liveMin) && liveMin >= 1) minSec = liveMin;
            }
            if (liveSettings.maxDelaySec !== undefined) {
              const liveMax = parseInt(liveSettings.maxDelaySec, 10);
              if (!isNaN(liveMax) && liveMax >= minSec) maxSec = liveMax;
            }
          } catch (e) {
            // Keep current values on storage read error
          }

          if (maxSec < minSec) maxSec = minSec;

          const delaySeconds = (minSec === maxSec)
            ? minSec
            : Math.floor(minSec + Math.random() * (maxSec - minSec + 1));

          chrome.runtime.sendMessage({
            action: 'CONTENT_LOG',
            message: `[Delay] Waiting ${delaySeconds}s before next request (Range: ${minSec}s - ${maxSec}s)`,
            type: 'info'
          });

          await countdownDelay(delaySeconds, minSec, maxSec);
        } else {
          await sleep(2000);
        }
      }

      // If we processed all visible buttons but still need more, scroll down to load more
      if (sentCount < maxRequests && !shouldStop) {
        window.scrollBy({ top: 850, behavior: 'smooth' });
        await sleep(2500);
      }
    }

    const reason = shouldStop ? 'Stopped by user' : (sentCount >= maxRequests ? 'Target reached' : 'No more people found');
    updateOverlayStatus(`Finished: ${reason}. Total sent: ${sentCount}`);

    // Report back to background service worker
    chrome.runtime.sendMessage({
      action: 'CYCLE_COMPLETED',
      sentCount: sentCount,
      keyword: keyword,
      reason: reason
    });

  } catch (err) {
    updateOverlayStatus(`Error: ${err.message}`, 'error');
    chrome.runtime.sendMessage({
      action: 'CYCLE_COMPLETED',
      sentCount: 0,
      keyword: keyword,
      reason: `Error: ${err.message}`
    });
  } finally {
    isCycleRunning = false;
  }
}

/**
 * Identify all valid "Add Friend" buttons on modern Facebook UI
 */
function findEligibleAddButtons() {
  const candidates = document.querySelectorAll('div[role="button"], button, a[role="button"]');
  const addButtons = [];

  for (const el of candidates) {
    // Skip if already processed or invisible
    if (el.getAttribute('data-fb-bot-processed') === 'true') continue;
    if (el.offsetParent === null) continue; // element not visible

    const ariaLabel = (el.getAttribute('aria-label') || '').trim().toLowerCase();
    const innerText = (el.innerText || el.textContent || '').trim().toLowerCase();

    // Match keywords for "Add friend" across languages
    const isAddFriend =
      ariaLabel.includes('add friend') ||
      innerText === 'add friend' ||
      innerText.startsWith('add friend') ||
      ariaLabel.includes('دوست بنائیں') || // Urdu
      innerText.includes('دوست بنائیں') ||
      ariaLabel.includes('दोस्त जोड़ें') || // Hindi
      innerText.includes('दोست जोड़ें') ||
      ariaLabel.includes('agregar a amigos') || // Spanish
      innerText.includes('agregar a amigos');

    // Reject buttons that represent other actions or already sent requests
    const isExcluded =
      ariaLabel.includes('cancel request') || innerText.includes('cancel request') ||
      ariaLabel.includes('request sent') || innerText.includes('request sent') ||
      ariaLabel.includes('remove') || innerText.includes('remove') ||
      ariaLabel.includes('message') || innerText.includes('message') ||
      ariaLabel.includes('friends') || innerText === 'friends' ||
      ariaLabel.includes('منسوخ') || innerText.includes('منسوخ');

    if (isAddFriend && !isExcluded) {
      addButtons.push(el);
    }
  }

  return addButtons;
}

/**
 * Traverse upward from button to find the parent profile card element
 */
function findCardContainer(buttonEl) {
  // Check standard ARIA card or listitem roles
  const standardCard = buttonEl.closest('[role="article"], [role="listitem"]');
  if (standardCard) return standardCard;

  // Modern Facebook often nests search cards in nested divs without role="article"
  let curr = buttonEl.parentElement;
  for (let depth = 0; depth < 10 && curr && curr !== document.body; depth++) {
    // A card usually contains user profile link(s) or images
    const hasProfileLink = curr.querySelector('a[role="presentation"], a[role="link"], a[href*="/"]');
    const hasAvatar = curr.querySelector('image, img, svg');
    const buttonCount = curr.querySelectorAll('div[role="button"], button').length;

    if (hasProfileLink && hasAvatar && buttonCount >= 1 && buttonCount <= 4) {
      const rect = curr.getBoundingClientRect();
      if (rect.height > 50 && rect.height < 600) {
        return curr;
      }
    }
    curr = curr.parentElement;
  }
  return buttonEl.parentElement?.parentElement?.parentElement || buttonEl;
}

/**
 * Extract profile name from card for activity logs
 */
function extractProfileName(buttonEl) {
  const card = findCardContainer(buttonEl);
  if (!card) return 'Facebook User';

  const links = card.querySelectorAll('a[role="link"], a[href*="facebook.com/"], a[href^="/"], strong, h2, h3');
  for (const link of links) {
    if (buttonEl.contains(link) || link.contains(buttonEl)) continue;
    const txt = (link.innerText || link.textContent || '').trim();
    // Exclude button texts or meaningless noise
    if (txt.length > 1 && !/^(add friend|message|remove|cancel|friend|دوست)/i.test(txt)) {
      return txt.split('\n')[0].trim();
    }
  }

  return 'Facebook User';
}

/**
 * Simulate human click on element
 */
function simulateHumanClick(element) {
  try {
    element.focus();
    const mouseEvents = ['mouseover', 'mousedown', 'mouseup', 'click'];
    for (const evt of mouseEvents) {
      const event = new MouseEvent(evt, {
        bubbles: true,
        cancelable: true,
        view: window
      });
      element.dispatchEvent(event);
    }
    return true;
  } catch (err) {
    return false;
  }
}

/**
 * Handle confirmation modals that Facebook occasionally shows
 */
function handlePostClickModals() {
  // Check for "Do you know this person outside of Facebook?" modal
  const dialogs = document.querySelectorAll('div[role="dialog"]');
  for (const dialog of dialogs) {
    const text = (dialog.innerText || '').toLowerCase();

    // Check for "Send request" / "Confirm" inside the dialog
    if (text.includes('know this person') || text.includes('confirm')) {
      const buttons = dialog.querySelectorAll('div[role="button"], button');
      for (const btn of buttons) {
        const btnText = (btn.innerText || '').toLowerCase();
        if (btnText.includes('send request') || btnText.includes('confirm') || btnText.includes('yes')) {
          simulateHumanClick(btn);
          break;
        }
      }
    }
  }
}

/**
 * Detect Facebook block/restriction warnings
 */
function checkFacebookBlockOrWarning() {
  const dialogs = document.querySelectorAll('div[role="dialog"], div[role="alert"]');
  for (const dialog of dialogs) {
    const text = (dialog.innerText || '').toLowerCase();
    if (
      text.includes('temporarily blocked') ||
      text.includes('you cannot use this feature') ||
      text.includes('misusing this feature') ||
      text.includes('try again later') ||
      text.includes('account restricted')
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Countdown timer with visual seconds updates
 */
async function countdownDelay(seconds, minSec = null, maxSec = null) {
  if (seconds <= 0) return;
  const rangeInfo = (minSec !== null && maxSec !== null) ? ` (${minSec}s - ${maxSec}s)` : '';
  for (let s = seconds; s > 0; s--) {
    if (shouldStop) break;
    updateOverlayStatus(`Waiting ${s}s before next request${rangeInfo}...`);
    await sleep(1000);
  }
  if (!shouldStop) {
    updateOverlayStatus('Delay finished. Searching next candidate...');
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * In-Page Floating Overlay UI
 */
function createOrUpdateOverlay(keyword, current, max, statusText) {
  if (!currentOverlay) {
    const container = document.createElement('div');
    container.id = 'fb-auto-bot-overlay';
    container.innerHTML = `
      <div id="fb-auto-bot-header">
        <div class="fb-bot-brand">
          <div class="fb-bot-pulse"></div>
          <span>FB Auto Friend Bot</span>
        </div>
        <span style="font-size:11px; opacity:0.8;">Active</span>
      </div>
      <div id="fb-auto-bot-body">
        <div class="fb-bot-row">
          <span class="fb-bot-label">Keyword:</span>
          <span class="fb-bot-val" id="fb-bot-overlay-keyword">${escapeHtml(keyword)}</span>
        </div>
        <div class="fb-bot-row">
          <span class="fb-bot-label">Requests:</span>
          <span class="fb-bot-val" id="fb-bot-overlay-count">${current} / ${max}</span>
        </div>
        <div class="fb-bot-progress-track">
          <div class="fb-bot-progress-bar" id="fb-bot-overlay-bar" style="width: ${(current / max) * 100}%"></div>
        </div>
        <div class="fb-bot-status-msg" id="fb-bot-overlay-status">${escapeHtml(statusText)}</div>
        <div class="fb-bot-footer">
          <button class="fb-bot-btn-stop" id="fb-bot-overlay-stop">Stop Bot</button>
        </div>
      </div>
    `;

    document.body.appendChild(container);
    currentOverlay = container;

    document.getElementById('fb-bot-overlay-stop').addEventListener('click', () => {
      shouldStop = true;
      updateOverlayStatus('Stopping immediately...', 'error');
      chrome.runtime.sendMessage({ action: 'STOP_BOT' });
    });
  } else {
    document.getElementById('fb-bot-overlay-keyword').textContent = keyword;
    document.getElementById('fb-bot-overlay-count').textContent = `${current} / ${max}`;
    document.getElementById('fb-bot-overlay-bar').style.width = `${(current / max) * 100}%`;
    document.getElementById('fb-bot-overlay-status').textContent = statusText;
  }
}

function updateOverlayProgress(current, max) {
  const countEl = document.getElementById('fb-bot-overlay-count');
  const barEl = document.getElementById('fb-bot-overlay-bar');
  if (countEl) countEl.textContent = `${current} / ${max}`;
  if (barEl) barEl.style.width = `${Math.min(100, (current / max) * 100)}%`;
}

function updateOverlayStatus(message, type = 'normal') {
  const statusEl = document.getElementById('fb-bot-overlay-status');
  if (statusEl) {
    statusEl.textContent = message;
    if (type === 'error') {
      statusEl.style.borderLeftColor = '#e41e3f';
      statusEl.style.color = '#ff6b81';
    } else if (type === 'warning') {
      statusEl.style.borderLeftColor = '#f59e0b';
      statusEl.style.color = '#fbbf24';
    } else {
      statusEl.style.borderLeftColor = '#1877f2';
      statusEl.style.color = '#a8abaf';
    }
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>"']/g, function (m) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m];
  });
}
