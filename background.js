// Background Service Worker for CPBL Live Tracker

const CPBL_HOST = "https://www.cpbl.com.tw";
const YAHOO_STANDINGS_URL = "https://tw.sports.yahoo.com/cpbl/standings/";

// On installation or startup, check schedules and set up daily alarm
chrome.runtime.onInstalled.addListener(() => {
  console.log("CPBL Live Tracker installed.");
  setupDailyAlarm();
  setupLivePollAlarm();
  checkTodaySchedule();
  
  // Trigger the mock Yu-Cheng Chang HR notification requested by user (commented out to prevent noise on reloads)
  // triggerMockNotification();
});

chrome.runtime.onStartup.addListener(() => {
  console.log("Browser started, checking schedules...");
  setupLivePollAlarm();
  checkTodaySchedule();
});

function setupLivePollAlarm() {
  chrome.alarms.create("live_game_poll", {
    periodInMinutes: 1
  });
}

// Setup daily alarm to fetch schedule precisely at 0:01 AM (midnight rollover)
function setupDailyAlarm() {
  const now = new Date();
  // Target 0:01 AM tomorrow
  const target = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 1, 0);
  const delayMs = target.getTime() - now.getTime();
  
  chrome.alarms.clear("daily_schedule_check", () => {
    chrome.alarms.create("daily_schedule_check", {
      when: Date.now() + delayMs,
      periodInMinutes: 1440 // Every 24 hours
    });
    console.log(`Scheduled daily midnight alarm. First run in ${Math.round(delayMs / 1000 / 60)} minutes.`);
  });
}

// Monitor alarms
chrome.alarms.onAlarm.addListener((alarm) => {
  console.log("Alarm fired:", alarm.name);
  if (alarm.name === "daily_schedule_check") {
    checkTodaySchedule();
  } else if (alarm.name === "live_game_poll") {
    pollLiveGames();
  } else if (alarm.name.startsWith("game_reminder_")) {
    // Format: game_reminder_Year_KindCode_GameSno
    const parts = alarm.name.split("_");
    const year = parts[2];
    const kindCode = parts[3];
    const gameSno = parts[4];
    triggerGameNotification(year, kindCode, gameSno);
  }
});

// Normalize team names to match standings
function normalizeTeamName(name) {
  if (name.includes("兄弟")) return "兄弟";
  if (name.includes("獅") || name.includes("ELEVEn")) return "統一";
  if (name.includes("桃猿") || name.includes("Monkeys")) return "樂天";
  if (name.includes("悍將")) return "富邦";
  if (name.includes("味全") || name.includes("龍")) return "味全";
  if (name.includes("雄鷹") || name.includes("台鋼")) return "台鋼";
  return name;
}

function cleanCPBLTeamName(name) {
  if (!name) return "";
  if (name.includes("7-ELEVEn") || name.includes("7-Eleven") || name.includes("統一")) {
    return "統一獅";
  }
  return name;
}

// Scrape today's schedule and set alarms for today's games
async function checkTodaySchedule() {
  try {
    const todayStr = getTodayDateString(); // "YYYY/MM/DD"
    console.log("Checking schedule for:", todayStr);

    // Daily cleanup of notified games cache and pitcher stats cache
    const lastCheckData = await chrome.storage.local.get(["lastCheckDate"]);
    if (lastCheckData.lastCheckDate !== todayStr) {
      console.log("Date changed. Clearing notified games cache and pitcher stats cache.");
      const allData = await chrome.storage.local.get(null);
      const keysToRemove = Object.keys(allData).filter(key => key.startsWith("pitcher_stats_"));
      if (keysToRemove.length > 0) {
        await chrome.storage.local.remove(keysToRemove);
      }
      await chrome.storage.local.set({
        notifiedPreGameGames: {},
        notifiedPostponedGames: {},
        lastCheckDate: todayStr
      });
    }

    // Retrieve already notified lists
    const storageData = await chrome.storage.local.get(["notifiedPostponedGames"]);
    const notifiedPostponedGames = storageData.notifiedPostponedGames || {};
    let storageUpdated = false;

    // 1. Fetch RequestVerificationToken from schedule index page
    const indexResponse = await fetch(`${CPBL_HOST}/schedule/index`, { credentials: "omit" });
    const indexHtml = await indexResponse.text();
    
    const tokenMatch = indexHtml.match(/name="__RequestVerificationToken" type="hidden" value="([^"]+)"/);
    if (!tokenMatch) {
      console.error("Could not find RequestVerificationToken in schedule page.");
      return;
    }
    const token = tokenMatch[1];
    
    // Also extract the Verification token from the script header if available
    const ajaxTokenMatch = indexHtml.match(/RequestVerificationToken:\s*'([^']+)'/);
    const ajaxToken = ajaxTokenMatch ? ajaxTokenMatch[1] : token;

    // 2. Fetch schedule data using POST request
    const formData = new URLSearchParams();
    formData.append("calendar", todayStr);
    formData.append("location", "");
    formData.append("kindCode", "A"); // Default to main league

    const response = await fetch(`${CPBL_HOST}/schedule/getgamedatas`, {
      method: "POST",
      credentials: "omit",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "RequestVerificationToken": ajaxToken,
        "X-Requested-With": "XMLHttpRequest"
      },
      body: formData.toString()
    });

    const result = await response.json();
    if (!result.Success || !result.GameDatas) {
      console.log("No games or failed to fetch schedule.");
      return;
    }

    const allGames = JSON.parse(result.GameDatas);
    
    // Filter games for today (matching local date)
    const today = new Date();
    const todayYear = today.getFullYear();
    const todayMonth = today.getMonth();
    const todayDate = today.getDate();
    
    const games = allGames.filter(game => {
      const gameTime = new Date(game.PreExeDate);
      return gameTime.getFullYear() === todayYear &&
             gameTime.getMonth() === todayMonth &&
             gameTime.getDate() === todayDate;
    });

    console.log("Fetched games list today:", games.length);

    // Keep track of scheduled games in storage
    chrome.storage.local.set({ todayGames: games });

    // Pre-fetch starting pitcher stats for today's games
    for (const game of games) {
      if (game.VisitingPitcherAcnt) {
        await fetchPitcherStats(game.VisitingPitcherAcnt, ajaxToken);
      }
      if (game.HomePitcherAcnt) {
        await fetchPitcherStats(game.HomePitcherAcnt, ajaxToken);
      }
    }

    const now = Date.now();
    for (const game of games) {
      const gameYear = new Date(game.PreExeDate).getFullYear().toString();
      const alarmName = `game_reminder_${gameYear}_${game.KindCode}_${game.GameSno}`;

      // If the game is postponed (1 or 2), suspended (3), or canceled (4)
      if (game.GameResult === "1" || game.GameResult === "2" || game.GameResult === "3" || game.GameResult === "4") {
        // Cancel the pre-game reminder alarm if any
        await chrome.alarms.clear(alarmName);

        const key = `${gameYear}_${game.KindCode}_${game.GameSno}`;
        if (notifiedPostponedGames[key] !== game.GameResult) {
          triggerPostponedNotification(game);
          notifiedPostponedGames[key] = game.GameResult;
          storageUpdated = true;
        }
        continue; // Skip standard reminder scheduling
      }

      // Normal active game reminder scheduling
      const gameStartTime = new Date(game.PreExeDate).getTime();
      const reminderTime = gameStartTime - 3600000; // 1 hour before (in ms)

      if (reminderTime > now) {
        // Clear old alarm first to avoid duplicates
        await chrome.alarms.clear(alarmName);
        // Create alarm
        chrome.alarms.create(alarmName, { when: reminderTime });
        console.log(`Scheduled alarm for game ${game.GameSno} at ${new Date(reminderTime).toLocaleString()}`);
      } else if (gameStartTime > now) {
        // If within 1 hour before start, trigger reminder immediately
        console.log(`Game ${game.GameSno} starts soon, triggering notification immediately.`);
        triggerGameNotification(gameYear, game.KindCode, game.GameSno);
      }
    }

    if (storageUpdated) {
      await chrome.storage.local.set({ notifiedPostponedGames });
    }
  } catch (error) {
    console.error("Error checking CPBL schedule:", error);
  }
}

// Fetch pitcher statistics (ERA and W-L record) for a given account ID
async function fetchPitcherStats(acnt, token) {
  if (!acnt) return null;
  
  const cacheKey = `pitcher_stats_${acnt}`;
  const cached = await chrome.storage.local.get([cacheKey]);
  if (cached[cacheKey]) {
    console.log(`Using cached stats for pitcher ${acnt}`);
    return cached[cacheKey];
  }

  try {
    console.log(`Fetching stats for pitcher ${acnt}...`);
    const postUrl = `${CPBL_HOST}/team/getpitchscore`;
    const headers = {
      "RequestVerificationToken": token,
      "X-Requested-With": "XMLHttpRequest",
      "Content-Type": "application/x-www-form-urlencoded"
    };
    const body = new URLSearchParams();
    body.append("acnt", acnt);
    body.append("kindCode", "A");

    const response = await fetch(postUrl, {
      method: "POST",
      credentials: "omit",
      headers: headers,
      body: body.toString()
    });

    const result = await response.json();
    if (result.Success && result.PitchScore) {
      const list = JSON.parse(result.PitchScore);
      if (list && list.length > 0) {
        // Find the stats for the current year, or default to the most recent one
        const currentYear = new Date().getFullYear().toString();
        let stats = list.find(item => item.Year === currentYear);
        if (!stats) {
          // Fallback to the latest year in the list
          stats = list[list.length - 1];
        }

        const data = {
          name: stats.Name || "",
          wins: stats.Wins ?? 0,
          loses: stats.Loses ?? 0,
          era: stats.Era != null ? stats.Era.toFixed(2) : "0.00",
          year: stats.Year || currentYear
        };

        // Cache the stats
        await chrome.storage.local.set({ [cacheKey]: data });
        console.log(`Cached stats for pitcher ${acnt}: ERA ${data.era}, ${data.wins}W-${data.loses}L`);
        return data;
      }
    }
  } catch (err) {
    console.error(`Error fetching stats for pitcher ${acnt}:`, err);
  }
  return null;
}

// Fetch Verification Token helper
async function fetchVerificationToken() {
  try {
    const indexResponse = await fetch(`${CPBL_HOST}/schedule/index`, { credentials: "omit" });
    const indexHtml = await indexResponse.text();
    const tokenMatch = indexHtml.match(/name="__RequestVerificationToken" type="hidden" value="([^"]+)"/);
    if (!tokenMatch) return null;
    const token = tokenMatch[1];
    const ajaxTokenMatch = indexHtml.match(/RequestVerificationToken:\s*'([^']+)'/);
    return ajaxTokenMatch ? ajaxTokenMatch[1] : token;
  } catch (e) {
    console.error("Error fetching verification token:", e);
    return null;
  }
}

// Get YYYY/MM/DD format for today
function getTodayDateString() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const r = String(d.getDate()).padStart(2, '0');
  return `${y}/${m}/${r}`;
}

// Fetch standings (win rates) from Yahoo Sports
async function fetchWinRates() {
  const winRates = { "兄弟": "0.500", "統一": "0.500", "樂天": "0.500", "富邦": "0.500", "味全": "0.500", "台鋼": "0.500" };
  try {
    const response = await fetch(YAHOO_STANDINGS_URL);
    const html = await response.text();
    
    const teams = ["兄弟", "統一", "樂天", "富邦", "味全", "台鋼"];
    for (const team of teams) {
      const idx = html.indexOf(team);
      if (idx !== -1) {
        // Look ahead 300 characters to extract the win rate (e.g. 0.583)
        const sub = html.substring(idx, idx + 350);
        const rateMatch = sub.match(/0\.\d{3}/);
        if (rateMatch) {
          winRates[team] = rateMatch[0];
        }
      }
    }
    console.log("Parsed win rates from Yahoo:", winRates);
  } catch (err) {
    console.error("Error fetching win rates from Yahoo, using default values:", err);
  }
  return winRates;
}

// Trigger desktop notification 1 hour before the game
async function triggerGameNotification(year, kindCode, gameSno) {
  try {
    const key = `${year}_${kindCode}_${gameSno}`;
    
    // Deduplicate pre-game notifications
    const storageData = await chrome.storage.local.get(["notifiedPreGameGames"]);
    const notifiedPreGameGames = storageData.notifiedPreGameGames || {};
    if (notifiedPreGameGames[key]) {
      console.log(`Pre-game notification already sent for game ${key}, skipping.`);
      return;
    }

    console.log(`Triggering notification for game: Year=${year}, KindCode=${kindCode}, GameSno=${gameSno}`);
    
    // Fetch today's schedule from storage to retrieve pitchers
    const data = await chrome.storage.local.get("todayGames");
    const games = data.todayGames || [];
    
    // Find the specific game
    const game = games.find(g => g.GameSno.toString() === gameSno.toString() && g.KindCode === kindCode);
    if (!game) {
      console.error("Game details not found in cache.");
      return;
    }

    const awayTeam = cleanCPBLTeamName(game.VisitingTeamName);
    const homeTeam = cleanCPBLTeamName(game.HomeTeamName);
    const awayPitcher = game.VisitingPitcherName || "未定";
    const homePitcher = game.HomePitcherName || "未定";
    const stadium = game.FieldAbbe;
    const startTimeStr = game.PreExeDate.substring(11, 16); // "HH:MM"

    // Fetch latest win rates
    const winRates = await fetchWinRates();
    const awayNorm = normalizeTeamName(awayTeam);
    const homeNorm = normalizeTeamName(homeTeam);
    const awayWinRate = winRates[awayNorm] || "0.000";
    const homeWinRate = winRates[homeNorm] || "0.000";

    // Retrieve pitcher stats
    let awayPitcherStatsStr = "";
    let homePitcherStatsStr = "";
    
    const awayAcnt = game.VisitingPitcherAcnt;
    const homeAcnt = game.HomePitcherAcnt;
    const statsKeys = [];
    if (awayAcnt) statsKeys.push(`pitcher_stats_${awayAcnt}`);
    if (homeAcnt) statsKeys.push(`pitcher_stats_${homeAcnt}`);
    
    let cachedStats = {};
    if (statsKeys.length > 0) {
      cachedStats = await chrome.storage.local.get(statsKeys);
    }
    
    let awayStats = awayAcnt ? cachedStats[`pitcher_stats_${awayAcnt}`] : null;
    let homeStats = homeAcnt ? cachedStats[`pitcher_stats_${homeAcnt}`] : null;
    
    // Fallback: fetch dynamically if not in cache
    if ((awayAcnt && !awayStats) || (homeAcnt && !homeStats)) {
      console.log("Stats missing from cache in notification trigger, fetching now...");
      const token = await fetchVerificationToken();
      if (token) {
        if (awayAcnt && !awayStats) {
          awayStats = await fetchPitcherStats(awayAcnt, token);
        }
        if (homeAcnt && !homeStats) {
          homeStats = await fetchPitcherStats(homeAcnt, token);
        }
      }
    }
    
    if (awayStats && awayPitcher !== "未定") {
      awayPitcherStatsStr = ` (防禦率: ${awayStats.era}, ${awayStats.wins}勝${awayStats.loses}敗)`;
    }
    if (homeStats && homePitcher !== "未定") {
      homePitcherStatsStr = ` (防禦率: ${homeStats.era}, ${homeStats.wins}勝${homeStats.loses}敗)`;
    }

    const title = `⚾ CPBL 開賽前一小時提醒`;
    const message = `${awayTeam} (勝率: ${awayWinRate}) VS ${homeTeam} (勝率: ${homeWinRate})
開賽時間: ${startTimeStr} (${stadium})
先發投手:
- 客隊: ${awayPitcher}${awayPitcherStatsStr}
- 主隊: ${homePitcher}${homePitcherStatsStr}`;

    chrome.notifications.create(`cpbl_game_notify_${gameSno}`, {
      type: "basic",
      iconUrl: "icons/icon128.png",
      title: title,
      message: message,
      priority: 2
    });
    
    // Mark as notified
    notifiedPreGameGames[key] = true;
    await chrome.storage.local.set({ notifiedPreGameGames });
    console.log("Notification sent successfully!");
  } catch (error) {
    console.error("Error sending game notification:", error);
  }
}

// Trigger postponed, suspended, or canceled notification
function triggerPostponedNotification(game) {
  try {
    const awayTeam = cleanCPBLTeamName(game.VisitingTeamName);
    const homeTeam = cleanCPBLTeamName(game.HomeTeamName);
    const gameSno = game.GameSno;
    
    let title = "";
    let message = "";
    
    if (game.GameResult === "1" || game.GameResult === "2") {
      title = `⚠️ CPBL 延賽通知 (場次 ${String(gameSno).padStart(3, '0')})`;
      let reserveStr = "";
      if (game.ReserveDate) {
        try {
          const resDate = new Date(game.ReserveDate);
          const year = resDate.getFullYear();
          const month = resDate.getMonth() + 1;
          const date = resDate.getDate();
          const hours = String(resDate.getHours()).padStart(2, '0');
          const minutes = String(resDate.getMinutes()).padStart(2, '0');
          const dayNames = ["日", "一", "二", "三", "四", "五", "六"];
          const dayName = dayNames[resDate.getDay()];
          reserveStr = `\n將延至: ${year}/${month}/${date} (${dayName}) ${hours}:${minutes} 進行補賽。`;
        } catch (e) {
          reserveStr = `\n補賽時間: ${game.ReserveDate}`;
        }
      } else {
        reserveStr = `\n補賽時間: 未定`;
      }
      message = `${awayTeam} VS ${homeTeam} 今日賽事因故延期。${reserveStr}`;
    } else if (game.GameResult === "3") {
      title = `⚠️ CPBL 保留比賽通知 (場次 ${String(gameSno).padStart(3, '0')})`;
      message = `${awayTeam} VS ${homeTeam} 今日賽事已改為保留比賽。`;
    } else if (game.GameResult === "4") {
      title = `⚠️ CPBL 賽事取消通知 (場次 ${String(gameSno).padStart(3, '0')})`;
      message = `${awayTeam} VS ${homeTeam} 今日賽事已取消。`;
    }
    
    chrome.notifications.create(`cpbl_postponed_notify_${gameSno}_${Date.now()}`, {
      type: "basic",
      iconUrl: "icons/icon128.png",
      title: title,
      message: message,
      priority: 2
    });
    console.log(`Postponed/Canceled notification sent for game ${gameSno}`);
  } catch (error) {
    console.error("Error sending postponed notification:", error);
  }
}

// Background polling for live games to catch key moments (scoring, home runs)
async function pollLiveGames() {
  try {
    const data = await chrome.storage.local.get("todayGames");
    const games = data.todayGames || [];
    if (games.length === 0) return;

    for (const game of games) {
      if (game.GameResult === "1" || game.GameResult === "2" || game.GameResult === "3" || game.GameResult === "4") {
        continue;
      }
      
      const gameStartTime = new Date(game.PreExeDate).getTime();
      const now = Date.now();
      const isTimeWindow = now >= (gameStartTime - 600000) && now <= (gameStartTime + 18000000); // 10 min before to 5 hours after

      if (!isTimeWindow) {
        continue;
      }

      console.log(`Polling live status for game ${game.GameSno}`);
      await pollSingleGameLive(game);
    }
  } catch (error) {
    console.error("Error in pollLiveGames:", error);
  }
}

async function pollSingleGameLive(game) {
  const year = new Date(game.PreExeDate).getFullYear();
  const kindCode = game.KindCode;
  const gameSno = game.GameSno;

  try {
    const indexResponse = await fetch(`${CPBL_HOST}/box/live?year=${year}&kindCode=${kindCode}&gameSno=${gameSno}`, { credentials: "omit" });
    if (indexResponse.status === 404) return;
    const indexHtml = await indexResponse.text();
    
    const tokenMatch = indexHtml.match(/name="__RequestVerificationToken" type="hidden" value="([^"]+)"/);
    if (!tokenMatch) return;
    const token = tokenMatch[1];

    const formData = new URLSearchParams();
    formData.append("GameSno", gameSno.toString());
    formData.append("KindCode", kindCode);
    formData.append("Year", year.toString());
    formData.append("PrevOrNext", "0");
    formData.append("Registration", "");
    formData.append("__RequestVerificationToken", token);

    const response = await fetch(`${CPBL_HOST}/box/getlive`, {
      method: "POST",
      credentials: "omit",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "X-Requested-With": "XMLHttpRequest"
      },
      body: formData.toString()
    });

    const result = await response.json();
    if (!result.Success) return;

    const gameDetail = JSON.parse(result.CurtGameDetailJson);
    const liveLogs = JSON.parse(result.LiveLogJson) || [];

    if (gameDetail.GameStatus !== 2 && gameDetail.GameStatus !== 8 && gameDetail.GameStatus !== 3) {
      return;
    }

    const stateKey = `live_state_${gameSno}`;
    const stateData = await chrome.storage.local.get([stateKey]);
    const cachedState = stateData[stateKey] || { lastEventNo: "" };

    const lastEventNo = cachedState.lastEventNo;

    if (liveLogs.length > 0) {
      const lastPlay = liveLogs[liveLogs.length - 1];
      
      if (!lastEventNo) {
        console.log(`Initializing baseline play log for game ${gameSno}: EventNo=${lastPlay.MainEventNo}`);
        await chrome.storage.local.set({
          [stateKey]: { lastEventNo: lastPlay.MainEventNo }
        });
      } else if (lastPlay.MainEventNo !== lastEventNo) {
        const newPlays = [];
        let foundOld = false;
        for (let i = 0; i < liveLogs.length; i++) {
          const play = liveLogs[i];
          if (play.MainEventNo === lastEventNo) {
            foundOld = true;
            continue;
          }
          if (foundOld) {
            newPlays.push(play);
          }
        }

        if (!foundOld && newPlays.length === 0) {
          newPlays.push(lastPlay);
        }

        for (const play of newPlays) {
          const isHR = play.ActionName && (play.ActionName.includes("全壘打") || play.Content.includes("全壘打"));
          const isScore = play.IsScoreCnt === "1";

          // if (isHR) {
          //   triggerLiveNotification(gameDetail, play, "HR");
          // } else if (isScore) {
          //   triggerLiveNotification(gameDetail, play, "SCORE");
          // }
        }

        await chrome.storage.local.set({
          [stateKey]: { lastEventNo: lastPlay.MainEventNo }
        });
      }
    }
  } catch (error) {
    console.error(`Error polling live status for game ${gameSno}:`, error);
  }
}

function triggerLiveNotification(gameDetail, play, type) {
  try {
    const gameSno = gameDetail.GameSno;
    const awayTeam = cleanCPBLTeamName(gameDetail.VisitingTeamName);
    const homeTeam = cleanCPBLTeamName(gameDetail.HomeTeamName);
    const visitingScore = play.VisitingScore;
    const homeScore = play.HomeScore;
    const inning = play.InningSeq;
    const topBot = play.VisitingHomeType === "1" ? "上" : "下";
    
    let title = "";
    let message = "";
    
    if (type === "HR") {
      title = `🚀 CPBL 全壘打！ (場次 ${String(gameSno).padStart(3, '0')})`;
      message = `${inning}局${topBot} • ${play.HitterName} 擊出全壘打！\n`;
      message += `內容: ${play.Content}\n`;
      message += `目前比數: ${awayTeam} ${visitingScore} : ${homeScore} ${homeTeam}`;
    } else {
      title = `🎉 CPBL 得分！ (場次 ${String(gameSno).padStart(3, '0')})`;
      message = `${inning}局${topBot} • ${play.HitterName} 送回分數！\n`;
      message += `內容: ${play.Content}\n`;
      message += `目前比數: ${awayTeam} ${visitingScore} : ${homeScore} ${homeTeam}`;
    }

    chrome.notifications.create(`cpbl_live_event_${gameSno}_${play.MainEventNo}_${type}`, {
      type: "basic",
      iconUrl: "icons/icon128.png",
      title: title,
      message: message,
      priority: 2
    });
    console.log(`Live ${type} notification sent for game ${gameSno}, event ${play.MainEventNo}`);
  } catch (error) {
    console.error("Error triggering live event notification:", error);
  }
}

// Mock notification for user testing scenario (Yu-Cheng Chang 3-run HR)
function triggerMockNotification() {
  try {
    const title = `🚀 CPBL 全壘打！ (場次 151)`;
    const message = `9局下 • 張育成 擊出全壘打！\n內容: 一二壘有人，球數一好二壞時，擊出中外野三分打點全壘打！\n目前比數: 味全龍 2 : 4 富邦悍將`;
    
    chrome.notifications.create(`cpbl_mock_hr_${Date.now()}`, {
      type: "basic",
      iconUrl: "icons/icon128.png",
      title: title,
      message: message,
      priority: 2
    });
    console.log("Mock notification triggered successfully!");
  } catch (e) {
    console.error("Error triggering mock notification:", e);
  }
}

// Cache verification token in memory to avoid redundant index fetches
let cachedVerificationToken = null;
let tokenFetchTimestamp = 0;

async function getOrFetchVerificationToken() {
  const now = Date.now();
  // Cache token for 10 minutes
  if (cachedVerificationToken && (now - tokenFetchTimestamp < 600000)) {
    return cachedVerificationToken;
  }
  const token = await fetchVerificationToken();
  if (token) {
    cachedVerificationToken = token;
    tokenFetchTimestamp = now;
  }
  return token;
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "fetch_pitcher_stats") {
    getOrFetchVerificationToken().then(token => {
      if (token) {
        fetchPitcherStats(request.acnt, token).then(stats => {
          sendResponse(stats);
        });
      } else {
        sendResponse(null);
      }
    }).catch(err => {
      console.error("Error in background fetch_pitcher_stats listener:", err);
      sendResponse(null);
    });
    return true; // Keep message channel open for async response
  }
});


