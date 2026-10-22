# ESPN Fantasy Basketball Data Exporter

A lightweight, zero-dependency Chrome extension (Manifest V3) that exports complete ESPN Fantasy Basketball league data into a structured JSON bundle (`espn_fba_bundle_v1`) and connects seamlessly to local and cloud-hosted Fantasy Sports Optimizers.

---

## Features

- **Context Detection**: Automatically extracts the active `leagueId` and `seasonId` from your current ESPN Fantasy Basketball browser tab.
- **Comprehensive League Bundle**:
  - **League Settings**: Scoring categories, roster requirements, lineup slot definitions, and schedule settings.
  - **Teams & Rosters**: Team rosters, lineup slots, player acquisition info, and injury statuses.
  - **Player Valuations**: Winning auction draft bids and FAAB waiver transaction values.
  - **Free Agent Pool**: Available players with ownership percentages and eligibility slots.
  - **NBA Pro Schedule**: 30-team NBA schedule indexed by weekly matchup periods and daily scoring periods.
- **Zero-Friction Optimizer Bridge**:
  - **Sync to Optimizer**: Automatically extracts your active ESPN league ID and session cookies (`espn_s2`, `SWID`), connects to the deployed Optimizer app, and populates the platform connection settings with zero user typing or cookie inspection.
  - **Download Bundle (JSON)**: Preserved as a manual offline backup that saves `espn_fba_<leagueId>_<seasonId>_p<scoringPeriodId>.json` directly to your downloads.
  - **Configurable Target**: Configurable to your local dev instance (`http://localhost:8501`, `http://localhost:8080`) or any cloud-hosted optimizer deployment (`https://*.streamlit.app`, `https://*.run.app`). The URL is saved across sessions in local extension storage.
- **Privacy & Security First**:
  - Runs 100% locally in your browser popup.
  - Zero external tracking, analytics, or third-party servers.
  - Network requests leverage browser-level ambient session credentials directly with ESPN's read endpoints.
  - Direct local JSON file download or client-side bridge injection.

---

## Installation

1. Clone or download this repository to your local machine:
   ```sh
   git clone <repository-url>
   ```
2. In Google Chrome, navigate to:
   ```
   chrome://extensions/
   ```
3. Enable **Developer mode** using the toggle switch in the upper-right corner.
4. Click **Load unpacked** in the top-left toolbar.
5. Select the folder containing this extension (`espn-fba-exporter`).

---

## Usage

1. In Chrome, navigate to your ESPN Fantasy Basketball league (e.g., `https://fantasy.espn.com/basketball/league?leagueId=...`).
2. Click the **ESPN Fantasy Basketball Data Exporter** icon in your browser extensions toolbar.
3. The popup will automatically detect your league name and team count.
4. Choose your action:
   - Click **Sync to Optimizer** to send your league data directly to the optimizer web app.
   - Click **Download Bundle (JSON)** to save the offline `.json` file to your computer.
5. Keep the popup open while the exporter compiles league data and player pools.

---

## Extension Structure

```
├── .gitignore          # Git ignore rules
├── css/
│   └── popup.css       # Extension popup styling
├── html/
│   └── popup.html      # Extension popup markup
├── images/
│   ├── icon16.png      # 16x16 icon (favicon / toolbar list)
│   ├── icon32.png      # 32x32 icon (Windows high-DPI display)
│   ├── icon48.png      # 48x48 icon (Extensions management page)
│   └── icon128.png     # 128x128 icon (Web Store / installation)
├── js/
│   ├── content_streamlit.js # Automated Cloud Run & FastAPI/Uvicorn optimizer bridge
│   └── popup.js            # Data fetch orchestration & bundle assembly
├── LICENSE             # MIT License
├── manifest.json       # Chrome Manifest V3 configuration
└── README.md           # Extension documentation
```

---

## License

This project is open-source under the [MIT License](LICENSE).
