// Copyright 2026 ESPN Fantasy Basketball Data Exporter
// Optimizer Content Script Bridge (Native FastAPI/Uvicorn Stack)

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

  async function injectIntoCloudRunApp(syncData) {
    let bundleIngested = false;

    // 1. Post the complete extracted bundle JSON directly to the backend API endpoint
    if (syncData.bundle) {
      try {
        const resp = await fetch('/platforms/espn/bundle', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(syncData.bundle),
          credentials: 'include'
        });
        if (resp.ok) {
          bundleIngested = true;
          const result = await resp.json();
          console.log('[ESPN Exporter] Ingested bundle into backend:', result);
        }
      } catch (e) {
        console.warn('[ESPN Exporter] Bundle POST error, falling back to DOM inputs:', e);
      }
    }

    // 2. Also populate the ambient credentials inputs in the sidebar if present
    const s2Input = document.getElementById('ls-espn-s2');
    const swidInput = document.getElementById('ls-espn-swid');
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

    // 3. Dispatch a window message so the frontend UI immediately selects the synced league
    window.postMessage({
      type: 'ESPN_BUNDLE_SYNCED',
      league_id: String(syncData.league_id),
      league_name: syncData.bundle?.league?.name || `ESPN League #${syncData.league_id}`,
      season_id: String(syncData.season_id)
    }, '*');

    const msg = bundleIngested
      ? `Synced ESPN League #${syncData.league_id} to Optimizer!`
      : `Synced ESPN credentials for League #${syncData.league_id}!`;

    showSyncBadge(msg);
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
      await injectIntoCloudRunApp(syncData);

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
    if (msg && (msg.action === 'STREAMLIT_SYNC_TRIGGER' || msg.action === 'OPTIMIZER_SYNC_TRIGGER')) {
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
