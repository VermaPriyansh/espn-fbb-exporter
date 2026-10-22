// Copyright 2026 ESPN Fantasy Basketball Data Exporter
// Manifest V3 Vanilla JS implementation of espn_fba_bundle_v1 contract

'use strict';

const API_BASE_READS = 'https://lm-api-reads.fantasy.espn.com/apis/v3/games/fba';
const API_BASE_FALLBACK = 'https://fantasy.espn.com/apis/v3/games/fba';

const BASE_SLOT_TO_POS = {
  0: 'PG',
  1: 'SG',
  2: 'SF',
  3: 'PF',
  4: 'C'
};

const DEFAULT_POS_ID_TO_POS = {
  1: 'PG',
  2: 'SG',
  3: 'SF',
  4: 'PF',
  5: 'C'
};

const SLOT_DEFINITIONS = {
  0: { name: 'PG', is_starter: true, eligible_positions: ['PG'] },
  1: { name: 'SG', is_starter: true, eligible_positions: ['SG'] },
  2: { name: 'SF', is_starter: true, eligible_positions: ['SF'] },
  3: { name: 'PF', is_starter: true, eligible_positions: ['PF'] },
  4: { name: 'C', is_starter: true, eligible_positions: ['C'] },
  5: { name: 'G', is_starter: true, eligible_positions: ['PG', 'SG'] },
  6: { name: 'F', is_starter: true, eligible_positions: ['SF', 'PF'] },
  7: { name: 'SG/SF', is_starter: true, eligible_positions: ['SG', 'SF'] },
  8: { name: 'G/F', is_starter: true, eligible_positions: ['PG', 'SG', 'SF', 'PF'] },
  9: { name: 'PF/C', is_starter: true, eligible_positions: ['PF', 'C'] },
  10: { name: 'F/C', is_starter: true, eligible_positions: ['SF', 'PF', 'C'] },
  11: { name: 'UTIL', is_starter: true, eligible_positions: ['PG', 'SG', 'SF', 'PF', 'C'] },
  12: { name: 'BE', is_starter: false, eligible_positions: [] },
  13: { name: 'IR', is_starter: false, eligible_positions: [] }
};

const STAT_NAMES = {
  0: 'PTS', 1: 'BLK', 2: 'STL', 3: 'AST', 4: 'OREB', 5: 'DREB', 6: 'REB',
  7: 'EJ', 8: 'FF', 9: 'PF', 10: 'TF', 11: 'TO', 12: 'DQ',
  13: 'FGM', 14: 'FGA', 15: 'FTM', 16: 'FTA', 17: '3PM', 18: '3PA',
  19: 'FG%', 20: 'FT%', 21: '3PT%', 22: 'AFG%', 35: 'A/TO', 40: 'MIN', 41: 'GS', 42: 'GP'
};

const leagueNameEl = document.getElementById('league-name');
const teamCountEl = document.getElementById('team-count');
const btnSync = document.getElementById('btn-sync');
const btnDownload = document.getElementById('btn-download');
const targetUrlInput = document.getElementById('target-url');
const progressLineEl = document.getElementById('progress-line');
const errorLineEl = document.getElementById('error-line');

let activeLeagueId = null;
let activeSeasonHint = null;

function setButtonsDisabled(disabled) {
  if (btnSync) btnSync.disabled = disabled;
  if (btnDownload) btnDownload.disabled = disabled;
}

function setProgress(msg) {
  progressLineEl.textContent = msg;
  errorLineEl.textContent = '';
}

function setError(msg) {
  errorLineEl.textContent = msg;
  progressLineEl.textContent = '';
}

function parseLeagueContextFromUrl(urlString) {
  if (!urlString) return { leagueId: null, seasonId: null };
  try {
    const url = new URL(urlString);
    let leagueId = url.searchParams.get('leagueId');
    if (!leagueId) {
      const match = url.pathname.match(/leagues?\/(\d+)/i);
      if (match) leagueId = match[1];
    }
    const seasonId = url.searchParams.get('seasonId');
    return { leagueId, seasonId };
  } catch (e) {
    const mId = urlString.match(/leagueId=(\d+)/i);
    const mSeason = urlString.match(/seasonId=(\d+)/i);
    return {
      leagueId: mId ? mId[1] : null,
      seasonId: mSeason ? mSeason[1] : null
    };
  }
}

async function espnFetch(path, options = {}) {
  // Always include credentials to send ambient espn_s2 & SWID cookies.
  // Never access, read, or log cookie values.
  const fetchOptions = {
    method: 'GET',
    credentials: 'include',
    headers: {
      'Accept': 'application/json',
      ...(options.headers || {})
    }
  };

  const primaryUrl = `${API_BASE_READS}${path}`;
  try {
    const res = await fetch(primaryUrl, fetchOptions);
    if (res.ok) {
      return await res.json();
    }
    if (res.status === 401 || res.status === 404) {
      // Try fallback host
      const fallbackUrl = `${API_BASE_FALLBACK}${path}`;
      const fallbackRes = await fetch(fallbackUrl, fetchOptions);
      if (fallbackRes.ok) {
        return await fallbackRes.json();
      }
      throw new Error(`ESPN API returned HTTP ${fallbackRes.status} on fallback host`);
    }
    throw new Error(`ESPN API returned HTTP ${res.status}`);
  } catch (err) {
    // If network failed on primary host, try fallback host
    const fallbackUrl = `${API_BASE_FALLBACK}${path}`;
    try {
      const fallbackRes = await fetch(fallbackUrl, fetchOptions);
      if (fallbackRes.ok) {
        return await fallbackRes.json();
      }
    } catch (_) {
      // ignore secondary network failure and throw original error
    }
    throw err;
  }
}

function deriveEligiblePositions(eligibleSlots, defaultPositionId) {
  const positions = [];
  if (Array.isArray(eligibleSlots)) {
    for (const slotId of eligibleSlots) {
      if (BASE_SLOT_TO_POS[slotId] && !positions.includes(BASE_SLOT_TO_POS[slotId])) {
        positions.push(BASE_SLOT_TO_POS[slotId]);
      }
    }
  }
  if (positions.length === 0 && defaultPositionId && DEFAULT_POS_ID_TO_POS[defaultPositionId]) {
    positions.push(DEFAULT_POS_ID_TO_POS[defaultPositionId]);
  }
  return positions;
}

function sanitizeStatValue(val) {
  if (val === null || val === undefined) return null;
  if (val === 'Infinity' || val === '-Infinity' || val === 'NaN') return null;
  if (typeof val === 'number') {
    if (!Number.isFinite(val)) return null;
    return val;
  }
  const parsed = Number(val);
  if (!Number.isFinite(parsed)) return null;
  return parsed;
}

function extractPlayerStats(playerStatsArray, seasonId) {
  const seasonKey = String(seasonId);
  const seasonIdNum = Number(seasonId);
  const splits = [];
  const splitsDict = {
    season: null,
    last_7: null,
    last_15: null,
    projected: null
  };
  if (!Array.isArray(playerStatsArray)) return { list: splits, dict: splitsDict };

  for (const s of playerStatsArray) {
    if (!s) continue;
    const id = s.id || '';
    const sYear = s.seasonId || (id.length >= 4 ? Number(id.slice(-4)) : null);
    // Ignore stats from previous or other seasons (e.g. 2026 stats like 002026)
    if (sYear && sYear !== seasonIdNum) continue;

    let splitName = null;
    if (id === `00${seasonKey}` || (s.statSourceId === 0 && s.statSplitTypeId === 0 && s.scoringPeriodId === 0)) {
      splitName = 'season';
    } else if (id === `01${seasonKey}` || (s.statSourceId === 0 && s.statSplitTypeId === 1 && s.scoringPeriodId === 0)) {
      splitName = 'last_7';
    } else if (id === `02${seasonKey}` || (s.statSourceId === 0 && s.statSplitTypeId === 2 && s.scoringPeriodId === 0)) {
      splitName = 'last_15';
    } else if (id === `10${seasonKey}` || (s.statSourceId === 1 && s.statSplitTypeId === 0 && s.scoringPeriodId === 0)) {
      splitName = 'projected';
    }

    if (splitName) {
      const cleanValues = {};
      if (s.stats && typeof s.stats === 'object') {
        for (const [k, v] of Object.entries(s.stats)) {
          const cleanVal = sanitizeStatValue(v);
          if (cleanVal !== null) {
            cleanValues[k] = cleanVal;
          }
        }
      }
      const cleanAvg = {};
      if (s.averageStats && typeof s.averageStats === 'object') {
        for (const [k, v] of Object.entries(s.averageStats)) {
          const cleanVal = sanitizeStatValue(v);
          if (cleanVal !== null) {
            cleanAvg[k] = cleanVal;
          }
        }
      }
      const appliedTotalClean = sanitizeStatValue(s.appliedTotal);
      splits.push({
        split: splitName,
        values: cleanValues,
        applied_total: appliedTotalClean
      });
      splitsDict[splitName] = {
        stats: cleanValues,
        average_stats: Object.keys(cleanAvg).length > 0 ? cleanAvg : null,
        applied_total: appliedTotalClean
      };
    }
  }
  return { list: splits, dict: splitsDict };
}

function extractFlattenedStats(statsArray) {
  let pts_avg = null;
  let reb_avg = null;
  let ast_avg = null;
  let stl_avg = null;
  let blk_avg = null;
  let fg_pct = null;
  let ft_pct = null;
  let threes_avg = null;
  let to_avg = null;
  let projected_pts = null;
  let projected_avg = null;

  if (Array.isArray(statsArray)) {
    const seasonSplit = statsArray.find(s => s.split === 'season');
    const projSplit = statsArray.find(s => s.split === 'projected');

    if (projSplit && projSplit.values) {
      projected_pts = projSplit.values['0'] !== undefined ? projSplit.values['0'] : null;
      const gp = projSplit.values['42'] || 70;
      if (projected_pts !== null && gp > 0) {
        projected_avg = Number((projected_pts / gp).toFixed(1));
      }
    }

    if (seasonSplit && seasonSplit.values) {
      const gp = seasonSplit.values['42'] || 1;
      pts_avg = seasonSplit.values['0'] !== undefined ? Number((seasonSplit.values['0'] / gp).toFixed(1)) : null;
      reb_avg = seasonSplit.values['6'] !== undefined ? Number((seasonSplit.values['6'] / gp).toFixed(1)) : null;
      ast_avg = seasonSplit.values['3'] !== undefined ? Number((seasonSplit.values['3'] / gp).toFixed(1)) : null;
      stl_avg = seasonSplit.values['2'] !== undefined ? Number((seasonSplit.values['2'] / gp).toFixed(1)) : null;
      blk_avg = seasonSplit.values['1'] !== undefined ? Number((seasonSplit.values['1'] / gp).toFixed(1)) : null;
      fg_pct = seasonSplit.values['19'] !== undefined ? seasonSplit.values['19'] : null;
      ft_pct = seasonSplit.values['20'] !== undefined ? seasonSplit.values['20'] : null;
      threes_avg = seasonSplit.values['17'] !== undefined ? Number((seasonSplit.values['17'] / gp).toFixed(1)) : null;
      to_avg = seasonSplit.values['11'] !== undefined ? Number((seasonSplit.values['11'] / gp).toFixed(1)) : null;
    }
  }

  return {
    pts_avg,
    reb_avg,
    ast_avg,
    stl_avg,
    blk_avg,
    fg_pct,
    ft_pct,
    threes_avg,
    to_avg,
    projected_pts,
    projected_avg
  };
}

function buildCalendarMap(proTeams) {
  const spDates = {};
  for (const t of (proTeams || [])) {
    if (!t || !t.proGamesByScoringPeriod) continue;
    for (const [sp, games] of Object.entries(t.proGamesByScoringPeriod)) {
      if (!spDates[sp] && games && games[0]) {
        spDates[sp] = games[0].date;
      }
    }
  }

  const spKeys = Object.keys(spDates).map(Number).sort((a, b) => a - b);
  const maxSp = spKeys.length > 0 ? spKeys[spKeys.length - 1] : 174;

  const spToDateMap = {};
  let lastDate = new Date('2026-10-20T12:00:00-04:00');
  for (let sp = 1; sp <= maxSp; sp++) {
    if (spDates[sp]) {
      spToDateMap[sp] = new Date(spDates[sp]);
      lastDate = new Date(spDates[sp]);
    } else {
      const d = new Date(lastDate);
      d.setDate(d.getDate() + 1);
      spToDateMap[sp] = d;
      lastDate = d;
    }
  }

  let currentMp = 1;
  const spToMp = {};
  const mpToSps = {};

  for (let sp = 1; sp <= maxSp; sp++) {
    const d = spToDateMap[sp];
    const dayOfWeek = d.toLocaleDateString('en-US', { timeZone: 'America/New_York', weekday: 'short' });
    if (dayOfWeek === 'Mon' && sp > 1 && spToMp[sp - 1] === currentMp) {
      currentMp++;
    }
    spToMp[sp] = currentMp;
    if (!mpToSps[currentMp]) mpToSps[currentMp] = [];
    mpToSps[currentMp].push(sp);
  }

  return { spToMp, mpToSps };
}

async function fetchCompletePlayerPool(seasonId, leagueId, scoringPeriodId) {
  const allPlayers = [];
  const pageSize = 200;
  let offset = 0;

  while (true) {
    setProgress(`Fetching player pool (loaded ${allPlayers.length} players)...`);
    const filter = {
      players: {
        filterStatus: { value: ['FREEAGENT', 'WAIVERS'] },
        limit: pageSize,
        offset: offset,
        sortPercOwned: { sortPriority: 1, sortAsc: false }
      }
    };

    const path = `/seasons/${seasonId}/segments/0/leagues/${leagueId}?view=kona_player_info&scoringPeriodId=${scoringPeriodId}`;
    let data;
    try {
      data = await espnFetch(path, {
        headers: {
          'x-fantasy-filter': JSON.stringify(filter)
        }
      });
    } catch (e) {
      // If filtering fails, break to avoid an infinite loop
      break;
    }

    const batch = Array.isArray(data?.players) ? data.players : [];
    if (batch.length === 0) {
      break;
    }

    for (const wrap of batch) {
      const p = wrap.player || wrap;
      const statsInfo = extractPlayerStats(p.stats, seasonId);
      const ownPct = p.ownership ? p.ownership.percentOwned : 0;
      const eligPos = deriveEligiblePositions(p.eligibleSlots, p.defaultPositionId);
      const pStatus = wrap.status || (wrap.onTeamId ? 'ONTEAM' : 'FREEAGENT');
      const flatStats = extractFlattenedStats(statsInfo.list);

      allPlayers.push({
        player_id: p.id,
        full_name: p.fullName || `${p.firstName || ''} ${p.lastName || ''}`.trim(),
        default_position_id: p.defaultPositionId || null,
        eligible_positions: eligPos,
        eligible_slots: p.eligibleSlots || [],
        pro_team_id: p.proTeamId || 0,
        ownership_pct: ownPct,
        ownership_percent: ownPct, // backward-compatible alias
        injury_status: p.injuryStatus || 'NORMAL',
        is_injured: Boolean(p.injured),
        status: pStatus,
        droppable: p.droppable !== undefined ? p.droppable : true,
        ...flatStats,
        stats: statsInfo.list
      });
    }

    if (batch.length < pageSize) {
      // Reached the final page
      break;
    }
    offset += pageSize;
  }

  return allPlayers;
}

async function buildBundle() {
  try {
    // Determine seasonId dynamically (do not hardcode).
    let initialSeason = activeSeasonHint;
    if (!initialSeason) {
      const now = new Date();
      // NBA season starts in Oct (month 9) and wraps into the next calendar year
      initialSeason = now.getMonth() >= 9 ? now.getFullYear() + 1 : now.getFullYear();
    }

    // ── Fetch 1: Core League Data ──────────────────────────────────────────
    setProgress('[1/5] Fetching league settings, teams, rosters, and schedule...');
    const corePath = `/seasons/${initialSeason}/segments/0/leagues/${activeLeagueId}?view=mSettings&view=mTeam&view=mRoster&view=mMatchup&view=mStandings`;
    const coreData = await espnFetch(corePath);

    // Read real seasonId, scoringPeriodId, and matchupPeriodId from the response — hardcode none.
    const seasonId = coreData.seasonId || initialSeason;
    const scoringPeriodId = coreData.scoringPeriodId;
    const matchupPeriodId = coreData.status?.currentMatchupPeriod;

    // Display UX values: League Name + Team Count immediately after Fetch 1
    const leagueName = coreData.settings?.name || `League ${activeLeagueId}`;
    const teamsList = coreData.teams || [];
    leagueNameEl.textContent = leagueName;
    teamCountEl.textContent = `${teamsList.length} Teams`;

    // ── Fetch 2: Auction Draft Detail (Winning Player Bids / Salaries) ─────
    setProgress('[2/5] Fetching draft auction bids and player salaries...');
    let draftDetailData = null;
    const draftBidMap = new Map(); // playerId -> bidAmount
    try {
      const draftPath = `/seasons/${seasonId}/segments/0/leagues/${activeLeagueId}?view=mDraftDetail`;
      draftDetailData = await espnFetch(draftPath);
      const picks = draftDetailData?.draftDetail?.picks || [];
      for (const pick of picks) {
        if (pick.playerId && pick.bidAmount !== undefined) {
          draftBidMap.set(pick.playerId, pick.bidAmount);
        }
      }
    } catch (_) {
      // Draft details might not be present for non-auction leagues
    }

    // ── Fetch 3: In-Season Transactions (FAAB Waiver Bids) ─────────────────
    setProgress('[3/5] Fetching in-season transaction bids...');
    const txBidMap = new Map(); // playerId -> bidAmount
    try {
      const txFilter = {
        transactions: {
          filterType: { value: ['FREEAGENT', 'WAIVER'] }
        }
      };
      const txPath = `/seasons/${seasonId}/segments/0/leagues/${activeLeagueId}?view=mTransactions2`;
      const txData = await espnFetch(txPath, {
        headers: { 'x-fantasy-filter': JSON.stringify(txFilter) }
      });
      const txList = txData?.transactions || [];
      for (const tx of txList) {
        if (tx.bidAmount !== undefined && tx.bidAmount > 0 && Array.isArray(tx.items)) {
          for (const it of tx.items) {
            if (it.type === 'ADD' && it.playerId) {
              txBidMap.set(it.playerId, tx.bidAmount);
            }
          }
        }
      }
    } catch (_) {
      // Non-fatal if transaction history is empty
    }

    // ── Fetch 4: Complete Free Agent Player Pool (Paginated) ───────────────
    setProgress('[4/5] Paginating complete free agent player pool...');
    const freeAgentsList = await fetchCompletePlayerPool(seasonId, activeLeagueId, scoringPeriodId);

    // ── Fetch 5: NBA Pro Team Schedule (30 Teams) ──────────────────────────
    setProgress('[5/5] Fetching NBA pro team schedule calendar...');
    let proScheduleData = null;
    try {
      const proPath = `/seasons/${seasonId}?view=proTeamSchedules_wl`;
      proScheduleData = await espnFetch(proPath);
    } catch (_) {
      // Pro schedule endpoint might fail if season is not populated
    }

    // ── Assemble espn_fba_bundle_v1 ───────────────────────────────────────
    setProgress('Assembling espn_fba_bundle_v1 export...');

    // Calendar bridge: Map scoring periods 1..174 to weekly matchup periods
    const rawProTeams = proScheduleData?.settings?.proTeams || proScheduleData || [];
    const { spToMp, mpToSps } = buildCalendarMap(rawProTeams);

    // Process rosters: Create flat roster records and unified players list
    const flatRosters = [];
    const unifiedPlayers = [];
    const seenPlayerIds = new Set();

    const teamsRostersExport = teamsList.map(team => {
      const rawEntries = team.roster?.entries || [];
      const mappedEntries = rawEntries.map(entry => {
        const ppe = entry.playerPoolEntry || {};
        const p = ppe.player || {};
        const statsInfo = extractPlayerStats(p.stats, seasonId);
        const eligPos = deriveEligiblePositions(p.eligibleSlots, p.defaultPositionId);

        // Resolve player valuation / salary
        let playerSalary = null;
        if (draftBidMap.has(entry.playerId) && draftBidMap.get(entry.playerId) > 0) {
          playerSalary = draftBidMap.get(entry.playerId);
        } else if (txBidMap.has(entry.playerId) && txBidMap.get(entry.playerId) > 0) {
          playerSalary = txBidMap.get(entry.playerId);
        } else if (ppe.keeperValue !== undefined && ppe.keeperValue > 0) {
          playerSalary = ppe.keeperValue;
        } else if (ppe.keeperValueFuture !== undefined && ppe.keeperValueFuture > 0) {
          playerSalary = ppe.keeperValueFuture;
        } else if (coreData.settings?.draftSettings?.type === 'AUCTION') {
          playerSalary = p.draftRanksByRankType?.STANDARD?.auctionValue || 0;
        } else {
          playerSalary = 0;
        }

        const flatStats = extractFlattenedStats(statsInfo.list);
        const rosterRow = {
          team_id: team.id,
          player_id: entry.playerId,
          full_name: p.fullName || `${p.firstName || ''} ${p.lastName || ''}`.trim(),
          lineup_slot_id: entry.lineupSlotId,
          pro_team_id: p.proTeamId || 0,
          default_position_id: p.defaultPositionId || null,
          eligible_positions: eligPos,
          eligible_slots: p.eligibleSlots || [],
          acquisition_type: entry.acquisitionType || null,
          acquisition_date: entry.acquisitionDate || null,
          injury_status: p.injuryStatus || entry.injuryStatus || 'NORMAL',
          is_injured: Boolean(p.injured),
          keeper_value: ppe.keeperValue !== undefined ? ppe.keeperValue : null,
          keeper_value_future: ppe.keeperValueFuture !== undefined ? ppe.keeperValueFuture : null,
          salary: playerSalary,
          contract_years: null,
          ...flatStats
        };

        flatRosters.push(rosterRow);

        if (!seenPlayerIds.has(entry.playerId)) {
          seenPlayerIds.add(entry.playerId);
          const ownPct = p.ownership ? p.ownership.percentOwned : 0;
          unifiedPlayers.push({
            player_id: entry.playerId,
            full_name: rosterRow.full_name,
            pro_team_id: rosterRow.pro_team_id,
            default_position_id: rosterRow.default_position_id,
            eligible_positions: eligPos,
            eligible_slots: rosterRow.eligible_slots,
            injury_status: rosterRow.injury_status,
            is_injured: rosterRow.is_injured,
            ownership_pct: ownPct,
            ownership_percent: ownPct,
            status: 'ONTEAM',
            droppable: p.droppable !== undefined ? p.droppable : true,
            ...flatStats,
            stats: statsInfo.list
          });
        }

        return {
          ...rosterRow,
          stats_splits: statsInfo.dict
        };
      });

      return {
        team_id: team.id,
        entries: mappedEntries
      };
    });

    // Append free agents into unified players list
    const freeAgentIds = [];
    for (const fa of freeAgentsList) {
      if (!seenPlayerIds.has(fa.player_id)) {
        seenPlayerIds.add(fa.player_id);
        freeAgentIds.push(fa.player_id);
        const faFlatStats = extractFlattenedStats(fa.stats);
        unifiedPlayers.push({
          player_id: fa.player_id,
          full_name: fa.full_name,
          pro_team_id: fa.pro_team_id || 0,
          default_position_id: fa.default_position_id || null,
          eligible_positions: fa.eligible_positions || [],
          eligible_slots: fa.eligible_slots || [],
          injury_status: fa.injury_status || 'NORMAL',
          is_injured: Boolean(fa.is_injured),
          ownership_pct: fa.ownership_pct !== undefined ? fa.ownership_pct : 0,
          ownership_percent: fa.ownership_percent !== undefined ? fa.ownership_percent : 0,
          status: fa.status || 'FREEAGENT',
          droppable: fa.droppable !== undefined ? fa.droppable : true,
          ...faFlatStats,
          stats: fa.stats || []
        });
      }
    }

    // Transform schedule
    const scheduleExport = (coreData.schedule || []).map(match => ({
      matchup_id: match.id,
      matchup_period_id: match.matchupPeriodId,
      home_team_id: match.home?.teamId || null,
      away_team_id: match.away?.teamId || null,
      winner: match.winner || 'UNDECIDED',
      home_cumulative_score: match.home?.cumulativeScore || null,
      away_cumulative_score: match.away?.cumulativeScore || null,
      home_total_points: match.home?.totalPoints !== undefined ? match.home.totalPoints : null,
      away_total_points: match.away?.totalPoints !== undefined ? match.away.totalPoints : null
    }));

    // Transform teams metadata
    const teamsExport = teamsList.map(team => ({
      team_id: team.id,
      name: team.name || `${team.location || ''} ${team.nickname || ''}`.trim(),
      abbrev: team.abbrev || '',
      division_id: team.divisionId,
      owners: team.owners || [],
      primary_owner: team.primaryOwner || null,
      playoff_seed: team.playoffSeed || 0,
      record: team.record?.overall || null,
      acquisitions_spent: team.transactionCounter?.acquisitionBudgetSpent || 0,
      waiver_rank: team.waiverRank || null
    }));

    // Transform league settings with lineup_slots and scoring_items labels
    const settings = coreData.settings || {};
    const rawSlotCounts = settings.rosterSettings?.lineupSlotCounts || {};
    const lineupSlots = [];
    for (const [slotIdStr, count] of Object.entries(rawSlotCounts)) {
      const slotId = Number(slotIdStr);
      if (count <= 0) continue;
      const def = SLOT_DEFINITIONS[slotId] || { name: `SLOT_${slotId}`, is_starter: slotId < 12, eligible_positions: [] };
      lineupSlots.push({
        slot_id: slotId,
        name: def.name,
        count: count,
        is_starter: def.is_starter,
        eligible_positions: def.eligible_positions
      });
    }

    const scoringItems = (settings.scoringSettings?.scoringItems || []).map(item => ({
      stat_id: item.statId,
      name: STAT_NAMES[item.statId] || `STAT_${item.statId}`,
      points: item.points,
      is_reverse_item: Boolean(item.isReverseItem)
    }));

    const leagueSettingsExport = {
      name: settings.name || '',
      size: settings.size || teamsList.length,
      scoring_type: settings.scoringSettings?.scoringType || 'UNKNOWN',
      lineup_slots: lineupSlots,
      roster_slots: lineupSlots, // alias for optimizer
      lineup_slot_counts: rawSlotCounts,
      position_limits: settings.rosterSettings?.positionLimits || {},
      lineup_lock_type: settings.rosterSettings?.lineupLocktimeType || null,
      roster_lock_type: settings.rosterSettings?.rosterLocktimeType || null,
      scoring_items: scoringItems,
      matchup_periods: mpToSps,
      scoring_period_to_matchup_period: spToMp,
      matchup_period_count: settings.scheduleSettings?.matchupPeriodCount || null,
      playoff_team_count: settings.scheduleSettings?.playoffTeamCount || null,
      draft_type: settings.draftSettings?.type || null,
      auction_budget: settings.draftSettings?.auctionBudget || null,
      minimum_bid: settings.acquisitionSettings?.minimumBid !== undefined ? settings.acquisitionSettings.minimumBid : null
    };

    // Enrich pro_schedule with matchupPeriodId and proGamesByMatchupPeriod
    const proScheduleEnriched = Array.isArray(rawProTeams)
      ? rawProTeams.map(team => {
          if (!team || !team.proGamesByScoringPeriod) return team;
          const gamesMap = {};
          const gamesByMatchupMap = {};
          for (const [spStr, games] of Object.entries(team.proGamesByScoringPeriod)) {
            const mPeriodId = spToMp[spStr] || null;
            const mappedGames = (games || []).map(g => ({
              ...g,
              matchupPeriodId: mPeriodId
            }));
            gamesMap[spStr] = mappedGames;
            if (mPeriodId) {
              if (!gamesByMatchupMap[mPeriodId]) gamesByMatchupMap[mPeriodId] = [];
              gamesByMatchupMap[mPeriodId].push(...mappedGames);
            }
          }
          return {
            ...team,
            proGamesByScoringPeriod: gamesMap,
            proGamesByMatchupPeriod: gamesByMatchupMap
          };
        })
      : rawProTeams;

    // Assemble dual-compatible bundle (both root-level loader contract and legacy bundle_version)
    const bundle = {
      schema_version: 1,
      game: 'fba',
      league_id: Number(activeLeagueId),
      season_id: Number(seasonId),
      scoring_period_id: Number(scoringPeriodId),
      metadata: {
        bundle_version: 'espn_fba_bundle_v1',
        exported_at: new Date().toISOString(),
        serving_host: API_BASE_READS.replace('https://', '').split('/')[0],
        league_id: Number(activeLeagueId),
        season_id: Number(seasonId),
        current_scoring_period_id: Number(scoringPeriodId),
        current_matchup_period_id: Number(matchupPeriodId),
        first_scoring_period: Number(coreData.status?.firstScoringPeriod || 1),
        final_scoring_period: Number(coreData.status?.finalScoringPeriod || 153),
        is_active: Boolean(coreData.status?.isActive)
      },
      league: {
        id: Number(activeLeagueId),
        name: leagueName,
        season_id: Number(seasonId),
        settings: leagueSettingsExport
      },
      league_settings: leagueSettingsExport,
      teams: teamsExport,
      players: unifiedPlayers,
      rosters: flatRosters,
      teams_rosters: teamsRostersExport,
      free_agents: freeAgentsList,
      free_agent_player_ids: freeAgentIds,
      schedule: scheduleExport,
      pro_schedule: proScheduleEnriched
    };

    return { bundle, seasonId, scoringPeriodId };
  } catch (err) {
    throw err;
  }
}

// ── Manual File Download Backup ──────────────────────────────────────────────
async function handleDownload() {
  if (!activeLeagueId) {
    setError('No league ID detected. Please open an ESPN Fantasy Basketball league page.');
    return;
  }

  setButtonsDisabled(true);
  setError('');

  try {
    const { bundle, seasonId, scoringPeriodId } = await buildBundle();
    const fileName = `espn_fba_${activeLeagueId}_${seasonId}_p${scoringPeriodId}.json`;
    const jsonString = JSON.stringify(bundle, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const blobUrl = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(blobUrl);

    setProgress(`Complete! Downloaded ${fileName} (${(blob.size / 1024).toFixed(1)} KB)`);
  } catch (err) {
    setError(`Download failed: ${err.message}`);
  } finally {
    setButtonsDisabled(false);
  }
}

// ── Automated Optimizer Sync ────────────────────────────────────────────────

async function handleSync() {
  if (!activeLeagueId) {
    setError('No league ID detected. Please open an ESPN Fantasy Basketball league page.');
    return;
  }

  const targetUrl = (targetUrlInput.value || '').trim();
  if (!targetUrl) {
    setError('Please enter your Optimizer URL below before syncing.');
    return;
  }

  let targetUrlObj;
  try {
    targetUrlObj = new URL(targetUrl);
  } catch (e) {
    setError('Invalid Optimizer URL format. Please include http:// or https://');
    return;
  }

  setButtonsDisabled(true);
  setError('');

  try {
    const { bundle, seasonId, scoringPeriodId } = await buildBundle();
    setProgress('Saving bundle & connecting to Optimizer...');

    // Extract ambient ESPN session cookies if available
    let espnS2 = null;
    let swid = null;
    try {
      if (chrome.cookies && chrome.cookies.get) {
        const c1 = await chrome.cookies.get({ url: 'https://fantasy.espn.com', name: 'espn_s2' });
        if (c1) espnS2 = c1.value;
        const c2 = await chrome.cookies.get({ url: 'https://fantasy.espn.com', name: 'SWID' });
        if (c2) swid = c2.value;
      }
    } catch (_) {}

    await chrome.storage.local.set({
      pending_streamlit_bundle: bundle,
      pending_optimizer_sync: {
        league_id: String(activeLeagueId),
        season_id: String(seasonId),
        scoring_period_id: String(scoringPeriodId),
        league_url: `https://fantasy.espn.com/basketball/league?leagueId=${activeLeagueId}&seasonId=${seasonId}`,
        espn_s2: espnS2,
        swid: swid,
        bundle: bundle,
        timestamp: Date.now()
      },
      bundle_timestamp: Date.now()
    });

    const allTabs = await chrome.tabs.query({});
    const matchingTab = allTabs.find(t => {
      if (!t.url) return false;
      try {
        const u = new URL(t.url);
        return (u.hostname === targetUrlObj.hostname && (u.port === targetUrlObj.port || (!u.port && !targetUrlObj.port))) ||
               (u.hostname.endsWith('.streamlit.app') && targetUrlObj.hostname.endsWith('.streamlit.app')) ||
               (u.hostname.endsWith('.run.app') && targetUrlObj.hostname.endsWith('.run.app'));
      } catch (_) {
        return false;
      }
    });

    if (matchingTab) {
      setProgress('Optimizer tab found. Focusing and syncing...');
      await chrome.tabs.update(matchingTab.id, { active: true });
      if (matchingTab.windowId !== undefined) {
        await chrome.windows.update(matchingTab.windowId, { focused: true });
      }
      try {
        chrome.tabs.sendMessage(matchingTab.id, { action: 'STREAMLIT_SYNC_TRIGGER' }, () => {
          if (chrome.runtime.lastError) {}
        });
      } catch (_) {}
      setProgress(`Synced to Optimizer! (League #${activeLeagueId}, Period ${scoringPeriodId})`);
    } else {
      setProgress('Opening Optimizer tab...');
      await chrome.tabs.create({ url: targetUrl });
      setProgress(`Synced! Opened ${targetUrl}`);
    }
  } catch (err) {
    setError(`Sync failed: ${err.message}`);
  } finally {
    setButtonsDisabled(false);
  }
}

// ── Initialize Popup ─────────────────────────────────────────────────────────
async function init() {
  try {
    // Restore saved Optimizer URL preference
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      const stored = await chrome.storage.local.get(['streamlit_target_url']);
      if (stored && stored.streamlit_target_url) {
        targetUrlInput.value = stored.streamlit_target_url;
      }

      targetUrlInput.addEventListener('input', () => {
        chrome.storage.local.set({ streamlit_target_url: targetUrlInput.value.trim() });
      });
    }

    if (typeof chrome === 'undefined' || !chrome.tabs || !chrome.tabs.query) {
      setError('Please open in Chrome extension context.');
      return;
    }

    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tabs || tabs.length === 0) {
      setError('Cannot access active browser tab.');
      return;
    }

    const currentTab = tabs[0];
    const { leagueId, seasonId } = parseLeagueContextFromUrl(currentTab.url);

    if (!leagueId) {
      setError('Please open an ESPN Fantasy Basketball league page.');
      setButtonsDisabled(true);
      return;
    }

    activeLeagueId = leagueId;
    activeSeasonHint = seasonId;
    leagueNameEl.textContent = `ESPN League #${activeLeagueId}`;
    teamCountEl.textContent = 'Ready to export or sync';
    setButtonsDisabled(false);
    btnSync.onclick = handleSync;
    btnDownload.onclick = handleDownload;
  } catch (e) {
    setError(`Initialization error: ${e.message}`);
  }
}

document.addEventListener('DOMContentLoaded', init);
