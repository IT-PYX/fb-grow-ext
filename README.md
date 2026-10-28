# Facebook Auto Friend Request Bot (Chrome Extension - Manifest V3)

A powerful, automated **Chrome Extension (Manifest V3)** designed to help you organically grow your Facebook network. It automatically searches for people based on targeted keywords, selects everyone appearing in the search results, sends friend requests with human-like randomized delays, and runs on a recurring schedule (every 30 minutes, 1 hour, or 2 hours) without manual intervention.

---

## 🚀 Key Features

1. **Automated Scheduler & Background Runner:**
   - Automatically opens a Facebook search tab at configured intervals (e.g., every 30 mins, 1 hour, or 2 hours).
   - Sends the target number of friend requests and automatically closes the tab once the run is complete.
   - Schedules the next cycle seamlessly in the background using Chrome Alarms.

2. **Keyword Rotation:**
   - Define multiple target keywords or niches (e.g., `Digital Marketing, Real Estate, E-commerce, Software Engineer`).
   - Automatically rotates to the next keyword on each run to ensure diverse and balanced audience expansion.

3. **Direct People Targeting:**
   - **All-inclusive Matching:** Automatically targets and sends friend requests directly to all people returned by Facebook for your selected keywords without restrictive bio filters.
   - **Seamless Audience Growth:** Ensures no relevant profile in your search results is skipped.

4. **Anti-Ban & Account Protection:**
   - **Human-like Delays:** Randomized intervals (8 to 16 seconds) between consecutive friend requests.
   - **Configurable Limits:** Set safe batch limits per run (e.g., 5 to 10 requests per session).
   - **Detection Safeguards:** Automatically pauses automation immediately if Facebook displays a limit warning or temporary block.

5. **On-Screen Floating Status Badge:**
   - Displays a non-intrusive floating HUD at the bottom-right corner of the Facebook page.
   - Shows live progress, request counter, status messages, and an instant **Stop** button.

6. **Live Statistics & Activity Logs:**
   - Track total friend requests sent.
   - Real-time countdown timer showing when the next automated run will trigger.
   - Detailed activity logs for full transparency.

---

## 🛠️ How to Install in Chrome / Edge / Brave

1. Open your Chromium-based browser (**Google Chrome**, **Brave**, or **Microsoft Edge**).
2. Navigate to:  
   ```text
   chrome://extensions/
   ```
3. Enable **Developer mode** using the toggle switch in the top-right corner:
   ```text
   [ Developer mode  ● ]
   ```
4. Click the **Load unpacked** button in the top-left corner.
5. Select the extension directory:
   ```text
   C:\Users\fatim\Desktop\fb extenstion
   ```
6. The extension is now installed!
7. Click the Chrome Extensions icon (puzzle piece) in the toolbar and **pin** **FB Auto Friend Request Bot** for quick access.

---

## 📖 How to Use

1. Click the extension icon in your browser toolbar to open the control popup.
2. **Enter Keywords:**  
   Provide comma-separated keywords or niches (e.g., `Digital Marketing, Graphic Designer, Real Estate, Karachi`).
3. **Select Repeat Interval:**  
   Choose your preferred scheduling frequency (e.g., `1 Hour` or `2 Hours`).
4. **Set Requests per Run:**  
   Recommended: `5` to `8` requests per session to keep your account safe.
5. Click **💾 Save Settings**.
6. Click **▶ Start Automation**.
7. The bot will initiate its first run immediately, add the targeted profiles, close the tab, and schedule subsequent runs automatically.

> **Note:** As long as Chrome remains open (even minimized or running in the background), the extension will continue to execute scheduled cycles on time.

---

## 📁 Project Structure

```text
├── manifest.json       # Chrome Extension Manifest V3 configuration & permissions
├── background.js       # Background service worker (Chrome alarms, lifecycle & scheduling)
├── content.js          # In-page script (DOM interaction, bio filtering & button clicks)
├── content.css         # Styles for the floating on-screen badge HUD
├── popup.html          # Extension control panel popup UI
├── popup.css           # Modern Facebook-themed styling for popup
├── popup.js            # Popup logic, settings storage, timer, and logging
├── icons/              # Extension icons (16x16, 48x48, 128x128)
└── README.md           # Project documentation
```

---

## ⚠️ Safety Guidelines & Best Practices

- **Daily Limits:** We recommend keeping total daily friend requests under 50–70 requests per day for aged accounts, and 20–30 per day for newer accounts.
- **Natural Delays:** Keep delays between 8 to 16 seconds to emulate genuine user interaction.
- **Account State:** Ensure you are actively logged into your Facebook account in Chrome before starting the bot.
- **Gradual Warm-Up:** If your account is new, start with 3–5 requests per run and gradually increase over time.

---

## 📄 License & Disclaimer

This project is intended strictly for educational and productivity purposes. Automated interaction with Facebook is subject to Meta's Terms of Service. Use responsibly and adhere to platform rate limits.
