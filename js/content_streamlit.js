// Copyright 2026 ESPN Fantasy Basketball Data Exporter
// Optimizer Content Script Bridge (Cloud Run Optimizer + Streamlit st.file_uploader)

'use strict';

(function () {
  let isInjecting = false;

  function showSyncBadge(message) {
    const existing = document.getElementById('espn-fba-sync-badge');
    if (existing) existing.remove();

    const badge = document.createElement('div');
    badge.id = 'espn-fba-sync-badge';
    badge.innerText = message;
    badge.style.cssText = `
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 999999;
      background: linear-gradient(135deg, #0f766e, #065f46);
      color: #ffffff;
      padding: 12px 20px;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 600;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.3), 0 8px 10px -6px rgba(0, 0, 0, 0.2);
      border: 1px solid rgba(255, 255, 255, 0.2);
      transition: opacity 0.4s ease-out, transform 0.4s ease-out;
      transform: translateY(0);
      opacity: 1;
    `;
    document.body.appendChild(badge);

    setTimeout(() => {
      badge.style.opacity = '0';
      badge.style.transform = 'translateY(10px)';
      setTimeout(() => badge.remove(), 450);
    }, 4500);
  }

  function waitForElement(selectors, timeout = 20000) {
    return new Promise((resolve, reject) => {
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el) return resolve(el);
      }

      const observer = new MutationObserver(() => {
        for (const sel of selectors) {
          const el = document.querySelector(sel);
          if (el) {
            observer.disconnect();
            return resolve(el);
          }
        }
      });

      observer.observe(document.body, { childList: true, subtree: true });

      setTimeout(() => {
        observer.disconnect();
        reject(new Error(`Timeout waiting for (${selectors.join(', ')})`));
      }, timeout);
    });
  }

  async function injectIntoCloudRunApp(syncData) {
    // 1. Open League Settings sidebar if collapsed
    const details = document.querySelector('summary')?.closest('details') || document.querySelector('details');
    if (details && !details.open) details.open = true;

    // 2. Select Season Mode if mode selector exists
    const modeWrapper = document.querySelector('[data-testid="ls-mode-wrapper"]');
    const modeInput = document.getElementById('ls-mode');
    if (modeWrapper && modeInput && modeInput.value !== 'Season Mode') {
      const modeSearch = modeWrapper.querySelector('.cs-search-input');
      modeSearch?.dispatchEvent(new Event('focus'));
      modeSearch?.dispatchEvent(new Event('click'));
      const seasonOpt = Array.from(modeWrapper.querySelectorAll('.cs-option') || []).find(o => o.textContent?.includes('Season'));
      if (seasonOpt) {
        seasonOpt.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      }
    }

    // 3. Select 'Retrieve from ESPN' platform
    const platformWrapper = document.querySelector('[data-testid="ls-platform-wrapper"]');
    const platformInput = document.getElementById('ls-platform');
    if (platformWrapper && platformInput && platformInput.value !== 'Retrieve from ESPN') {
      const platformSearch = platformWrapper.querySelector('.cs-search-input');
      platformSearch?.dispatchEvent(new Event('focus'));
      platformSearch?.dispatchEvent(new Event('click'));
      const espnOpt = Array.from(platformWrapper.querySelectorAll('.cs-option') || []).find(o => o.textContent?.includes('ESPN'));
      if (espnOpt) {
        espnOpt.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      } else {
        platformInput.value = 'Retrieve from ESPN';
        platformWrapper.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }

    // 4. Fill in League ID
    const leagueIdInput = document.getElementById('ls-espn-league-id');
    if (leagueIdInput && syncData.league_id) {
      leagueIdInput.value = syncData.league_url || syncData.league_id;
      leagueIdInput.dispatchEvent(new Event('input', { bubbles: true }));
      leagueIdInput.dispatchEvent(new Event('change', { bubbles: true }));
    }

    // 5. Fill in ambient ESPN cookies if present
    const s2Input = document.getElementById('ls-espn-s2');
    const swidInput = document.getElementById('ls-espn-swid');
    let credentialsSaved = false;

    if (s2Input && syncData.espn_s2) {
      s2Input.value = syncData.espn_s2;
      s2Input.dispatchEvent(new Event('input', { bubbles: true }));
      s2Input.dispatchEvent(new Event('change', { bubbles: true }));
    }
    if (swidInput && syncData.swid) {
      swidInput.value = syncData.swid;
      swidInput.dispatchEvent(new Event('input', { bubbles: true }));
      swidInput.dispatchEvent(new Event('change', { bubbles: true }));
    }

    // If both cookies populated, click 'Save credentials'
    if (syncData.espn_s2 && syncData.swid) {
      const saveBtn = document.querySelector('#ls-espn-wrap button.section-apply-btn');
      if (saveBtn) {
        saveBtn.click();
        credentialsSaved = true;
      }
    }

    const msg = credentialsSaved
      ? `Synced ESPN League #${syncData.league_id} & credentials to Optimizer!`
      : `Synced ESPN League #${syncData.league_id} to Optimizer!`;

    showSyncBadge(msg);
  }

  async function injectIntoStreamlitApp(bundle) {
    const selectors = [
      'div[data-testid="stFileUploader"] input[type="file"]',
      'div[data-testid="stFileUploaderDropzoneInput"] input[type="file"]',
      'input[type="file"]'
    ];

    const fileInput = await waitForElement(selectors);

    const leagueId = bundle.league_id || (bundle.metadata && bundle.metadata.league_id) || 'league';
    const seasonId = bundle.season_id || (bundle.metadata && bundle.metadata.season_id) || '2027';
    const periodId = bundle.scoring_period_id || (bundle.metadata && bundle.metadata.scoring_period_id) || '0';
    const fileName = `espn_fba_${leagueId}_${seasonId}_p${periodId}.json`;

    // Construct File and DataTransfer
    const jsonString = JSON.stringify(bundle, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const file = new File([blob], fileName, { type: 'application/json' });

    const dt = new DataTransfer();
    dt.items.add(file);
    fileInput.files = dt.files;

    fileInput.dispatchEvent(new Event('change', { bubbles: true }));
    fileInput.dispatchEvent(new Event('input', { bubbles: true }));

    showSyncBadge(`Synced ${fileName} to Optimizer!`);
  }

  async function checkAndInjectBundle() {
    if (isInjecting) return;

    try {
      const data = await chrome.storage.local.get([
        'pending_streamlit_bundle',
        'pending_optimizer_sync',
        'bundle_timestamp'
      ]);

      const bundle = data.pending_streamlit_bundle;
      const syncData = data.pending_optimizer_sync || (bundle ? {
        league_id: bundle.league_id || bundle.metadata?.league_id,
        season_id: bundle.season_id || bundle.metadata?.season_id,
        bundle
      } : null);

      const timestamp = data.bundle_timestamp || syncData?.timestamp;

      if (!syncData && !bundle) return;

      // Only inject fresh bundles created within the last 60 seconds
      if (!timestamp || (Date.now() - timestamp > 60000)) {
        await chrome.storage.local.remove(['pending_streamlit_bundle', 'pending_optimizer_sync', 'bundle_timestamp']);
        return;
      }

      isInjecting = true;

      // Detect if we are on the Cloud Run Fantasy Sports Optimizer app
      const isCloudRunApp = Boolean(
        document.getElementById('ls-espn-wrap') ||
        document.querySelector('[data-testid="ls-platform-wrapper"]') ||
        window.location.hostname.includes('run.app')
      );

      if (isCloudRunApp) {
        await injectIntoCloudRunApp(syncData);
      } else {
        await injectIntoStreamlitApp(bundle || syncData.bundle);
      }

      // Clean up storage so subsequent page reloads don't re-upload stale bundle
      await chrome.storage.local.remove(['pending_streamlit_bundle', 'pending_optimizer_sync', 'bundle_timestamp']);
    } catch (err) {
      console.warn('[ESPN Exporter Bridge] Injection error:', err.message);
    } finally {
      isInjecting = false;
    }
  }

  // 1. Check on initial page load (idle)
  checkAndInjectBundle();

  // 2. Listen for runtime messages from popup (when tab is already open)
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg && msg.action === 'STREAMLIT_SYNC_TRIGGER') {
      checkAndInjectBundle();
      sendResponse({ status: 'started' });
    }
  });

  // 3. Listen for storage changes in real-time
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && (changes.pending_streamlit_bundle?.newValue || changes.pending_optimizer_sync?.newValue)) {
      checkAndInjectBundle();
    }
  });
})();
