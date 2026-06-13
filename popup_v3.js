// popup.js - CPBL Live Tracker popup script

const CPBL_HOST = "https://www.cpbl.com.tw";
let updateInterval = null;
let currentSelectedGameKey = null;
let todayGamesList = [];
let currentDate = new Date();
let allGamesList = [];
let lastSeenEventNo = null;
let toastTimeout = null;
let userSelectedManually = false;
let loadedMonthYear = "";
let currentSelectedGameLiveResult = null;

function cleanCPBLTeamName(name) {
  if (!name) return "";
  if (name.includes("7-ELEVEn") || name.includes("7-Eleven") || name.includes("統一")) {
    return "統一獅";
  }
  return name;
}

document.addEventListener("DOMContentLoaded", () => {
  initPopup();
});

async function initPopup() {
  const selectEl = document.getElementById("game-selector");
  const reloadBtn = document.getElementById("reload-btn");
  const prevBtn = document.getElementById("prev-date-btn");
  const nextBtn = document.getElementById("next-date-btn");

  // Add reload listener
  reloadBtn.addEventListener("click", async () => {
    updateStatusText("手動載入中...");
    await refreshScheduleData();
    fetchSelectedGameLive();
  });

  // Toast close button listener
  const toastCloseBtn = document.getElementById("toast-close-btn");
  if (toastCloseBtn) {
    toastCloseBtn.addEventListener("click", hideScoreToast);
  }

  // Dropdown change listener
  selectEl.addEventListener("change", (e) => {
    userSelectedManually = true;
    currentSelectedGameKey = e.target.value;
    lastSeenEventNo = null;
    hideScoreToast();
    if (isSameDay(currentDate, new Date())) {
      chrome.storage.local.set({ lastSelectedGameKey: currentSelectedGameKey });
    }
    fetchSelectedGameLive();
  });

  // Date Navigation listeners
  prevBtn.addEventListener("click", async () => {
    userSelectedManually = false;
    currentDate.setDate(currentDate.getDate() - 1);
    await updateDateView();
  });

  nextBtn.addEventListener("click", async () => {
    userSelectedManually = false;
    currentDate.setDate(currentDate.getDate() + 1);
    await updateDateView();
  });

  const dateDisplayBtn = document.getElementById("date-display-btn");
  const datePickerInput = document.getElementById("date-picker-input");

  if (dateDisplayBtn && datePickerInput) {
    dateDisplayBtn.addEventListener("click", () => {
      const offset = currentDate.getTimezoneOffset();
      const localDate = new Date(currentDate.getTime() - (offset * 60 * 1000));
      datePickerInput.value = localDate.toISOString().split('T')[0];
      datePickerInput.showPicker();
    });

    datePickerInput.addEventListener("change", async (e) => {
      if (e.target.value) {
        userSelectedManually = false;
        const parts = e.target.value.split('-');
        currentDate = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
        await updateDateView();
      }
    });
  }



  // Initial load
  updateStatusText("載入賽程中...");
  await refreshScheduleData();
  updateDateView();
}

// Show friendly UI when there are no games today
function showEmptyState() {
  document.getElementById("scoreboard-card").style.display = "none";
  document.getElementById("matchup-section").style.display = "none";
  document.getElementById("ticker-section").style.display = "none";
  document.getElementById("no-games-card").style.display = "block";
}

// Get CPBL team logo URL statically
function getCPBLTeamLogoUrl(teamName) {
  if (!teamName) return null;
  if (teamName.includes("兄弟") || teamName.includes("Brothers")) {
    return "/files/file_pool/1/0l109765752552535770/logo_brothers_large.png";
  }
  if (teamName.includes("獅") || teamName.includes("Lions") || teamName.includes("ELEVEn")) {
    return "/files/file_pool/1/0l109765751918656742/logo_lions_large.png";
  }
  if (teamName.includes("桃猿") || teamName.includes("Monkeys") || teamName.includes("樂天")) {
    return "/files/file_pool/1/0o012550226923298142/2024_cpbl%e5%85%ad%e9%9a%8alogo_r_%e5%ae%98%e7%b6%b2.png";
  }
  if (teamName.includes("悍將") || teamName.includes("Guardians") || teamName.includes("富邦")) {
    return "/files/file_pool/1/0l109765750739708798/logo_fubon_large.png";
  }
  if (teamName.includes("龍") || teamName.includes("Dragons") || teamName.includes("味全")) {
    return "/files/file_pool/1/0l109765750195839770/logo_dragon_large.png";
  }
  if (teamName.includes("雄鷹") || teamName.includes("Hawks") || teamName.includes("台鋼")) {
    return "/files/file_pool/1/0n255385839510091777/tsg-logo0912.png";
  }
  return null;
}

// Normalize team name to 2 characters for logo/abbr
function getTeamAbbr(name) {
  if (name.includes("兄弟")) return "兄弟";
  if (name.includes("獅") || name.includes("ELEVEn")) return "統一";
  if (name.includes("桃猿") || name.includes("Monkeys")) return "樂天";
  if (name.includes("悍將")) return "富邦";
  if (name.includes("味全") || name.includes("龍")) return "味全";
  if (name.includes("雄鷹") || name.includes("台鋼")) return "台鋼";
  return name.substring(0, 2);
}

function updateStatusText(text, isOffline = false) {
  const statusEl = document.getElementById("sync-status");
  statusEl.textContent = text;
  if (isOffline) {
    statusEl.classList.add("offline");
  } else {
    statusEl.classList.remove("offline");
  }
}

async function refreshScheduleData() {
  try {
    const targetMonthYear = `${currentDate.getFullYear()}_${currentDate.getMonth()}`;
    if (targetMonthYear !== loadedMonthYear || !allGamesList || allGamesList.length === 0) {
      const games = await fetchAllSeasonGames(currentDate);
      if (games) {
        allGamesList = games;
        loadedMonthYear = targetMonthYear;
      }
    }
  } catch (e) {
    console.error("Error refreshing schedule:", e);
  }
}

async function updateDateView() {
  lastSeenEventNo = null;
  hideScoreToast();
  const selectEl = document.getElementById("game-selector");
  const dateDisplay = document.getElementById("current-date-display");

  dateDisplay.textContent = formatDateWithWeekday(currentDate);

  updateStatusText("載入賽事中...");
  await refreshScheduleData();

  const games = fetchGamesForDate(currentDate);
  todayGamesList = games || [];
  if (!games || games.length === 0) {
    selectEl.innerHTML = '<option value="">當日無比賽</option>';
    currentSelectedGameKey = null;
    showEmptyState();
    updateStatusText("當日無比賽");
    setupPolling(false);
    return;
  }

  // Populate dropdown
  selectEl.innerHTML = "";
  document.getElementById("scoreboard-card").style.display = "block";
  document.getElementById("no-games-card").style.display = "none";
  games.forEach((game) => {
    const key = `${new Date(game.PreExeDate).getFullYear()}_${game.KindCode}_${game.GameSno}`;
    const option = document.createElement("option");
    option.value = key;
    const visitingClean = cleanCPBLTeamName(game.VisitingTeamName);
    const homeClean = cleanCPBLTeamName(game.HomeTeamName);
    option.textContent = `${visitingClean} VS ${homeClean} (${game.FieldAbbe})`;
    selectEl.appendChild(option);
  });

  // Determine which game to select by default
  let fubonGame = games.find(g => 
    (g.VisitingTeamName && g.VisitingTeamName.includes("富邦")) || 
    (g.HomeTeamName && g.HomeTeamName.includes("富邦"))
  );
  
  const isFubonPostponed = fubonGame && (fubonGame.GameResult === "1" || fubonGame.GameResult === "2" || fubonGame.GameResult === "3" || fubonGame.GameResult === "4");
  
  const isCPBLGameLive = (g) => {
    const isPostponed = g.GameResult === "1" || g.GameResult === "2" || g.GameResult === "3" || g.GameResult === "4";
    if (isPostponed) return false;
    const isFinished = g.WinningPitcherName && g.WinningPitcherName.trim() !== "";
    if (isFinished) return false;
    const start = new Date(g.PreExeDate);
    return new Date() >= start;
  };
  
  let liveGame = games.find(g => isCPBLGameLive(g));
  
  if (isSameDay(currentDate, new Date())) {
    chrome.storage.local.get(["lastSelectedGameKey"], (storageData) => {
      const savedKey = storageData.lastSelectedGameKey;
      let savedExists = games.some(g => `${new Date(g.PreExeDate).getFullYear()}_${g.KindCode}_${g.GameSno}` === savedKey);
      
      let keyToSelect;
      if (userSelectedManually && savedKey && savedExists) {
        keyToSelect = savedKey;
      } else if (fubonGame && !isFubonPostponed) {
        keyToSelect = `${new Date(fubonGame.PreExeDate).getFullYear()}_${fubonGame.KindCode}_${fubonGame.GameSno}`;
      } else if (liveGame) {
        keyToSelect = `${new Date(liveGame.PreExeDate).getFullYear()}_${liveGame.KindCode}_${liveGame.GameSno}`;
      } else if (savedKey && savedExists) {
        keyToSelect = savedKey;
      } else {
        keyToSelect = `${new Date(games[0].PreExeDate).getFullYear()}_${games[0].KindCode}_${games[0].GameSno}`;
      }
      
      selectEl.value = keyToSelect;
      currentSelectedGameKey = keyToSelect;
      fetchSelectedGameLive();
      setupPolling(true);
    });
  } else {
    let keyToSelect;
    if (fubonGame && !isFubonPostponed) {
      keyToSelect = `${new Date(fubonGame.PreExeDate).getFullYear()}_${fubonGame.KindCode}_${fubonGame.GameSno}`;
    } else if (liveGame) {
      keyToSelect = `${new Date(liveGame.PreExeDate).getFullYear()}_${liveGame.KindCode}_${liveGame.GameSno}`;
    } else {
      keyToSelect = `${new Date(games[0].PreExeDate).getFullYear()}_${games[0].KindCode}_${games[0].GameSno}`;
    }
    selectEl.value = keyToSelect;
    currentSelectedGameKey = keyToSelect;
    fetchSelectedGameLive();
    setupPolling(false);
  }
}

function setupPolling(shouldPoll) {
  if (updateInterval) clearInterval(updateInterval);
  if (shouldPoll) {
    updateInterval = setInterval(fetchSelectedGameLive, 15000);
  }
}

function isSameDay(d1, d2) {
  return d1.getFullYear() === d2.getFullYear() &&
         d1.getMonth() === d2.getMonth() &&
         d1.getDate() === d2.getDate();
}

function formatDateWithWeekday(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const dayNames = ["日", "一", "二", "三", "四", "五", "六"];
  const dayName = dayNames[date.getDay()];
  return `${y}/${m}/${d} (${dayName})`;
}

function fetchGamesForDate(date) {
  if (!allGamesList || allGamesList.length === 0) return [];
  const year = date.getFullYear();
  const month = date.getMonth();
  const day = date.getDate();
  
  return allGamesList.filter(game => {
    const gameTime = new Date(game.PreExeDate);
    return gameTime.getFullYear() === year &&
           gameTime.getMonth() === month &&
           gameTime.getDate() === day;
  });
}

// Scrape list of all season games
async function fetchAllSeasonGames(dateToQuery) {
  try {
    const queryDate = dateToQuery || currentDate;
    const queryStr = `${queryDate.getFullYear()}/${String(queryDate.getMonth() + 1).padStart(2, '0')}/${String(queryDate.getDate()).padStart(2, '0')}`;

    // 1. Fetch RequestVerificationToken from schedule index page
    const indexResponse = await fetch(`${CPBL_HOST}/schedule/index`, { credentials: "omit" });
    const indexHtml = await indexResponse.text();
    
    const tokenMatch = indexHtml.match(/name="__RequestVerificationToken" type="hidden" value="([^"]+)"/);
    if (!tokenMatch) return null;
    const token = tokenMatch[1];
    
    const ajaxTokenMatch = indexHtml.match(/RequestVerificationToken:\s*'([^']+)'/);
    const ajaxToken = ajaxTokenMatch ? ajaxTokenMatch[1] : token;

    // 2. Fetch schedule data using POST request
    const formData = new URLSearchParams();
    formData.append("calendar", queryStr);
    formData.append("location", "");
    formData.append("kindCode", "A");

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

    const text = await response.text();
    let result = null;
    try {
      result = JSON.parse(text);
    } catch (e) {
      console.warn("Schedule response was not valid JSON:", text.substring(0, 200));
      return null;
    }

    if (result && result.Success && result.GameDatas) {
      return JSON.parse(result.GameDatas);
    }
  } catch (err) {
    console.error("Error fetching season schedule:", err);
  }
  return null;
}

// Fetch live game state
async function fetchSelectedGameLive() {
  currentSelectedGameLiveResult = null;
  if (!currentSelectedGameKey) return;
  const parts = currentSelectedGameKey.split("_");
  const year = parts[0];
  const kindCode = parts[1];
  const gameSno = parts[2];

  try {
    // Refresh schedule data to get latest postponements/results
    const games = await fetchAllSeasonGames();
    if (games) {
      allGamesList = games;
      todayGamesList = fetchGamesForDate(currentDate);
    }

    const gameSchedule = todayGamesList.find(g => 
      `${new Date(g.PreExeDate).getFullYear()}_${g.KindCode}_${g.GameSno}` === currentSelectedGameKey
    );

    // If the game is postponed, suspended, or canceled, we update UI directly from schedule and do NOT fetch live log API!
    if (gameSchedule && (gameSchedule.GameResult === "1" || gameSchedule.GameResult === "2" || gameSchedule.GameResult === "3" || gameSchedule.GameResult === "4")) {
      console.log("Game is postponed/suspended/canceled. Skipping live API fetch.");
      updateUIForPostponed(gameSchedule);
      return;
    }

    const isFinishedGame = gameSchedule && gameSchedule.WinningPitcherName && gameSchedule.WinningPitcherName.trim() !== "";

    // 1. Fetch verification token from /box/live
    let liveIndexResponse;
    try {
      liveIndexResponse = await fetch(`${CPBL_HOST}/box/live?year=${year}&kindCode=${kindCode}&gameSno=${gameSno}`, { credentials: "omit" });
    } catch (e) {
      if (isFinishedGame) {
        console.log("Network error fetching live page. Falling back to finished UI.");
        updateUIForFinished(gameSchedule);
      } else {
        updateStatusText("連線失敗，請檢查網路", true);
      }
      return;
    }

    if (liveIndexResponse.status === 404) {
      if (isFinishedGame) {
        console.log("Live page returned 404. Falling back to finished UI.");
        updateUIForFinished(gameSchedule);
      } else {
        updateStatusText("查無此賽事頁面", true);
      }
      return;
    }
    const liveIndexHtml = await liveIndexResponse.text();

    const tokenMatch = liveIndexHtml.match(/name="__RequestVerificationToken" type="hidden" value="([^"]+)"/);
    if (!tokenMatch) {
      if (isFinishedGame) {
        console.log("Token missing. Falling back to finished UI.");
        updateUIForFinished(gameSchedule);
      } else {
        updateStatusText("讀取安全憑證失敗", true);
      }
      return;
    }
    const token = tokenMatch[1];

    // 2. POST to getlive API
    const formData = new URLSearchParams();
    formData.append("GameSno", gameSno);
    formData.append("KindCode", kindCode);
    formData.append("Year", year);
    formData.append("PrevOrNext", "0");
    formData.append("__RequestVerificationToken", token);

    let response;
    try {
      response = await fetch(`${CPBL_HOST}/box/getlive`, {
        method: "POST",
        credentials: "omit",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "X-Requested-With": "XMLHttpRequest"
        },
        body: formData.toString()
      });
    } catch (e) {
      if (isFinishedGame) {
        console.log("Network error on getlive POST. Falling back to finished UI.");
        updateUIForFinished(gameSchedule);
      } else {
        updateStatusText("連線失敗，請檢查網路", true);
      }
      return;
    }

    const text = await response.text();
    let result = null;
    try {
      result = JSON.parse(text);
    } catch (e) {
      console.warn("Live status response was not valid JSON:", text.substring(0, 200));
      if (isFinishedGame) {
        updateUIForFinished(gameSchedule);
      } else {
        updateStatusText("無法取得即時數據 (格式錯誤)", true);
      }
      return;
    }

    if (!result || !result.Success) {
      if (isFinishedGame) {
        updateUIForFinished(gameSchedule);
      } else {
        updateStatusText("無法取得即時數據", true);
      }
      return;
    }

    currentSelectedGameLiveResult = result;

    const gameDetail = JSON.parse(result.CurtGameDetailJson);
    const liveLogs = JSON.parse(result.LiveLogJson) || [];
    const scoreboards = JSON.parse(result.ScoreboardJson) || [];
    const battingList = JSON.parse(result.BattingJson) || [];
    const pitchingList = JSON.parse(result.PitchingJson) || [];

    // Update UI elements with game status
    updateUI(gameDetail, liveLogs, scoreboards, gameSchedule, battingList, pitchingList);
    
    const timeStr = new Date().toLocaleTimeString('zh-TW', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    updateStatusText(`最後同步: ${timeStr}`);
  } catch (error) {
    console.error("Error fetching live game stats:", error);
    const gameSchedule = todayGamesList.find(g => 
      `${new Date(g.PreExeDate).getFullYear()}_${g.KindCode}_${g.GameSno}` === currentSelectedGameKey
    );
    if (gameSchedule && gameSchedule.WinningPitcherName && gameSchedule.WinningPitcherName.trim() !== "") {
      updateUIForFinished(gameSchedule);
    } else {
      updateStatusText("連線失敗，請檢查網路", true);
    }
  }
}

// Update DOM elements with live game data
function updateUI(gameDetail, liveLogs, scoreboards, gameSchedule, battingList, pitchingList) {
  // Hide runners panel by default
  const runnersPanel = document.getElementById("runners-panel");
  if (runnersPanel) {
    runnersPanel.style.display = "none";
    runnersPanel.innerHTML = "";
  }

  // 1. Basic Scoreboard
  const awayName = cleanCPBLTeamName(gameDetail.VisitingTeamName);
  const homeName = cleanCPBLTeamName(gameDetail.HomeTeamName);
  
  document.getElementById("away-name").textContent = awayName;
  document.getElementById("home-name").textContent = homeName;
  
  const awayLogoImg = document.getElementById("away-logo-img");
  const awayLogoAbbr = document.getElementById("away-logo-abbr");
  const awayStaticLogoPath = getCPBLTeamLogoUrl(awayName);
  if (awayStaticLogoPath) {
    awayLogoImg.src = `${CPBL_HOST}${awayStaticLogoPath}`;
    awayLogoImg.style.display = "block";
    awayLogoAbbr.style.display = "none";
  } else if (gameDetail.VisitingClubSmallImgPath) {
    awayLogoImg.src = `${CPBL_HOST}${gameDetail.VisitingClubSmallImgPath}`;
    awayLogoImg.style.display = "block";
    awayLogoAbbr.style.display = "none";
  } else {
    awayLogoImg.style.display = "none";
    awayLogoAbbr.textContent = getTeamAbbr(awayName);
    awayLogoAbbr.style.display = "flex";
  }

  const homeLogoImg = document.getElementById("home-logo-img");
  const homeLogoAbbr = document.getElementById("home-logo-abbr");
  const homeStaticLogoPath = getCPBLTeamLogoUrl(homeName);
  if (homeStaticLogoPath) {
    homeLogoImg.src = `${CPBL_HOST}${homeStaticLogoPath}`;
    homeLogoImg.style.display = "block";
    homeLogoAbbr.style.display = "none";
  } else if (gameDetail.HomeClubSmallImgPath) {
    homeLogoImg.src = `${CPBL_HOST}${gameDetail.HomeClubSmallImgPath}`;
    homeLogoImg.style.display = "block";
    homeLogoAbbr.style.display = "none";
  } else {
    homeLogoImg.style.display = "none";
    homeLogoAbbr.textContent = getTeamAbbr(homeName);
    homeLogoAbbr.style.display = "flex";
  }
  
  document.getElementById("game-stadium").textContent = gameDetail.FieldAbbe || "球場";
  document.getElementById("game-number").textContent = `場次 ${String(gameDetail.GameSno).padStart(3, '0')}`;

  if (gameSchedule && gameSchedule.PreExeDate) {
    const timePart = gameSchedule.PreExeDate.substring(11, 16);
    document.getElementById("game-time").textContent = `開賽 ${timePart}`;
  } else {
    document.getElementById("game-time").textContent = "開賽 --:--";
  }

  // Set starting pitcher subtexts under team names
  const awayPitcherSub = document.getElementById("away-pitcher-sub");
  const homePitcherSub = document.getElementById("home-pitcher-sub");
  
  const status = gameDetail.GameStatus;
  const isFinished = gameSchedule && gameSchedule.WinningPitcherName && gameSchedule.WinningPitcherName.trim() !== "";
  const isLiveOrFinished = status === 2 || status === 8 || status === 3 || isFinished;

  const vW = gameDetail.VisitingGameResultWCnt ?? 0;
  const vL = gameDetail.VisitingGameResultLCnt ?? 0;
  const vT = gameDetail.VisitingGameResultTCnt ?? 0;
  const hW = gameDetail.HomeGameResultWCnt ?? 0;
  const hL = gameDetail.HomeGameResultLCnt ?? 0;
  const hT = gameDetail.HomeGameResultTCnt ?? 0;
  const awayRecordStr = `${vW}-${vL}-${vT}`;
  const homeRecordStr = `${hW}-${hL}-${hT}`;

  if (isLiveOrFinished) {
    awayPitcherSub.innerHTML = awayRecordStr;
    homePitcherSub.innerHTML = homeRecordStr;
  } else {
    if (gameSchedule) {
      let awayPName = gameSchedule.VisitingPitcherName || "";
      let homePName = gameSchedule.HomePitcherName || "";
      
      // Trim spaces
      if (awayPName.trim() === "") awayPName = "未定";
      if (homePName.trim() === "") homePName = "未定";
      
      awayPitcherSub.innerHTML = `${awayRecordStr}<br>先發: ${awayPName}`;
      homePitcherSub.innerHTML = `${homeRecordStr}<br>先發: ${homePName}`;
      
      // Fetch and display pitcher stats
      const awayAcnt = gameSchedule.VisitingPitcherAcnt;
      const homeAcnt = gameSchedule.HomePitcherAcnt;
      
      if (awayAcnt || homeAcnt) {
        getPitcherStatsWithFallback(awayAcnt).then(awayStats => {
          if (awayStats) {
            const name = awayStats.name || awayPName;
            awayPitcherSub.innerHTML = `${awayRecordStr}<br>先發: ${name}<br>(${awayStats.era}, ${awayStats.wins}-${awayStats.loses})`;
          }
        });
        getPitcherStatsWithFallback(homeAcnt).then(homeStats => {
          if (homeStats) {
            const name = homeStats.name || homePName;
            homePitcherSub.innerHTML = `${homeRecordStr}<br>先發: ${name}<br>(${homeStats.era}, ${homeStats.wins}-${homeStats.loses})`;
          }
        });
      }
    } else {
      awayPitcherSub.innerHTML = "";
      homePitcherSub.innerHTML = "";
    }
  }

  const statusBadge = document.getElementById("game-inning");
  const matchupSection = document.getElementById("matchup-section");

  const gameResult = gameSchedule ? gameSchedule.GameResult : "";

  // Check schedule postponement/suspension/cancellation first
  if (gameResult === "1" || gameResult === "2" || gameResult === "3" || gameResult === "4") {
    updateUIForPostponed(gameSchedule);
    return;
  }

  // GameStatus: 1=Not started, 2=Live, 3=Final, 4=Starting lineup, 5=Canceled, 6=Postponed, 7=Suspended, 8=Interrupted
  // status is already declared at line 533
  
  if (status === 1 || status === 4) {
    // Game not started
    
    lastSeenEventNo = null; // Reset live toast tracking
    document.getElementById("away-score").textContent = "-";
    document.getElementById("home-score").textContent = "-";
    statusBadge.textContent = status === 4 ? "先發打序" : "未開始";
    statusBadge.className = "game-status-badge";
    
    // Reset matchup title
    const matchupTitle = document.getElementById("matchup-title");
    if (matchupTitle) {
      matchupTitle.textContent = "投打對決 - 局";
    }
    
    // Show matchup card center in disabled state
    matchupSection.style.display = "block";
    const liveStatusMiddle = document.getElementById("live-status-middle");
    if (liveStatusMiddle) {
      liveStatusMiddle.style.display = "flex";
      liveStatusMiddle.classList.add("disabled");
    }
    
    // Clear SBO & Bases
    updateSBODots(0, 0, 0);
    updateBases("", "", "");

    // Restore role tags
    const pRole = document.querySelector(".pitcher-side .role-tag");
    const bRole = document.querySelector(".batter-side .role-tag");
    if (pRole) pRole.textContent = "PITCHER";
    if (bRole) bRole.textContent = "BATTER";
    
    // Left side: 投手 - 用球數 0 • ERA 0.00 (split into two lines)
    document.getElementById("pitcher-name").textContent = "-";
    document.getElementById("pitch-count").innerHTML = "用球數 0<br>ERA 0.00";

    // Right side: 打者 - 0-0 • AVG .000 (split into two lines)
    document.getElementById("batter-name").textContent = "-";
    document.getElementById("batter-desc").innerHTML = "0-0<br>AVG .000";
    
    // Ticker update
    const tickerSection = document.getElementById("ticker-section");
    tickerSection.style.display = "block";
    document.getElementById("latest-play-text").textContent = "等待賽事進行...";
    
  } else if (status === 3) {
    // Game Finished
    
    lastSeenEventNo = null; // Reset live toast tracking
    document.getElementById("away-score").textContent = gameDetail.VisitingTotalScore || 0;
    document.getElementById("home-score").textContent = gameDetail.HomeTotalScore || 0;
    statusBadge.textContent = "已結束";
    statusBadge.className = "game-status-badge final-status";
    
    // Show matchup card center in disabled state
    matchupSection.style.display = "block";
    const liveStatusMiddle = document.getElementById("live-status-middle");
    if (liveStatusMiddle) {
      liveStatusMiddle.style.display = "flex";
      liveStatusMiddle.classList.add("disabled");
    }
    
    // Clear SBO & Bases
    updateSBODots(0, 0, 0);
    updateBases("", "", "");
    
    // Hide role tags for finished games
    const pRole = document.querySelector(".pitcher-side .role-tag");
    const bRole = document.querySelector(".batter-side .role-tag");
    if (pRole) pRole.textContent = "";
    if (bRole) bRole.textContent = "";

    const visScore = parseInt(gameDetail.VisitingTotalScore || 0, 10);
    const homeScore = parseInt(gameDetail.HomeTotalScore || 0, 10);
    
    let winPName = gameDetail.WinningPitcherName || "無";
    let winPAcnt = gameDetail.WinningPitcherAcnt;
    let losePName = gameDetail.LosePitcherName || "無";
    let losePAcnt = gameDetail.LosePitcherAcnt || gameDetail.LoserPitcherAcnt;

    function getRecordFromList(acnt) {
      if (!acnt || !pitchingList) return null;
      const p = pitchingList.find(item => item.PitcherAcnt === acnt);
      if (p) {
        return { wins: p.TotalWins ?? 0, loses: p.TotalLoses ?? 0 };
      }
      return null;
    }

    const winRecord = getRecordFromList(winPAcnt);
    const loseRecord = getRecordFromList(losePAcnt);

    const pitcherNameEl = document.getElementById("pitcher-name");
    const pitchCountEl = document.getElementById("pitch-count");
    const batterNameEl = document.getElementById("batter-name");
    const batterDescEl = document.getElementById("batter-desc");

    if (visScore > homeScore) {
      // Away team won: Left is Winning Pitcher, Right is Losing Pitcher
      pitcherNameEl.textContent = winPName;
      batterNameEl.textContent = losePName;
      displayPitcherStats(pitchCountEl, winPAcnt, true, winRecord);
      displayPitcherStats(batterDescEl, losePAcnt, false, loseRecord);
    } else if (homeScore > visScore) {
      // Home team won: Left is Losing Pitcher, Right is Winning Pitcher
      pitcherNameEl.textContent = losePName;
      batterNameEl.textContent = winPName;
      displayPitcherStats(pitchCountEl, losePAcnt, false, loseRecord);
      displayPitcherStats(batterDescEl, winPAcnt, true, winRecord);
    } else {
      // Tie
      pitcherNameEl.textContent = "-";
      pitchCountEl.innerHTML = "";
      batterNameEl.textContent = "-";
      batterDescEl.innerHTML = "";
    }
    
    // Reset matchup title
    const matchupTitle = document.getElementById("matchup-title");
    if (matchupTitle) {
      matchupTitle.textContent = "勝敗投";
    }

    // Ticker update
    const tickerSection = document.getElementById("ticker-section");
    tickerSection.style.display = "block";
    document.getElementById("latest-play-text").textContent = "比賽結束";
    
  } else if (status === 2 || status === 8) {
    // Game Live or Suspended temporarily
    
    document.getElementById("away-score").textContent = gameDetail.VisitingTotalScore ?? 0;
    document.getElementById("home-score").textContent = gameDetail.HomeTotalScore ?? 0;
    
    statusBadge.className = "game-status-badge live-status";

    matchupSection.style.display = "block";
    const liveStatusMiddle = document.getElementById("live-status-middle");
    if (liveStatusMiddle) {
      liveStatusMiddle.style.display = "flex";
      liveStatusMiddle.classList.remove("disabled");
    }

    // Extract current play info
    if (liveLogs.length > 0) {
      const lastPlay = liveLogs[liveLogs.length - 1];
      
      // Calculate display out count (resolve out lag)
      let displayOuts = (lastPlay.OutCnt || 0) + getCPBLPlayOutCount(lastPlay);
      if (displayOuts > 3) displayOuts = 3;
      
      // Inning description
      const inningSeq = lastPlay.InningSeq;
      const topBot = lastPlay.VisitingHomeType == 1 ? "上" : "下";
      let inningStr = `${inningSeq}局${topBot}`;
      if (displayOuts === 3) {
        inningStr += "(局中)";
      }
      statusBadge.textContent = inningStr;

      // Update matchup title with inning
      const matchupTitle = document.getElementById("matchup-title");
      if (matchupTitle) {
        matchupTitle.textContent = `投打對決 - ${inningStr}`;
      }

      // Determine offensive team color for occupied bases
      const baseColor = getOffensiveTeamColor(gameDetail, lastPlay);

      // Simulate bases after the play to resolve lag
      const simulatedBases = simulateCPBLBasesAfterPlay(lastPlay, liveLogs);
      
      // Update Bases Status
      updateBases(simulatedBases.first, simulatedBases.second, simulatedBases.third, baseColor);

      // Update runners detail panel
      const activeRunners = [];

      // Update SBO Dots
      updateSBODots(lastPlay.StrikeCnt, lastPlay.BallCnt, displayOuts);

      if (displayOuts !== 3) {
        if (simulatedBases.first) {
          const method = getCPBLRunnerOnBaseMethod(liveLogs, simulatedBases.first, "一壘", lastPlay);
          activeRunners.push({ base: "一壘", name: simulatedBases.first, method: method });
        }
        if (simulatedBases.second) {
          const method = getCPBLRunnerOnBaseMethod(liveLogs, simulatedBases.second, "二壘", lastPlay);
          activeRunners.push({ base: "二壘", name: simulatedBases.second, method: method });
        }
        if (simulatedBases.third) {
          const method = getCPBLRunnerOnBaseMethod(liveLogs, simulatedBases.third, "三壘", lastPlay);
          activeRunners.push({ base: "三壘", name: simulatedBases.third, method: method });
        }
      }
      if (runnersPanel && activeRunners.length > 0) {
        runnersPanel.style.display = "flex";
        runnersPanel.innerHTML = activeRunners.map(r => `
          <div class="runner-line">
            <span class="runner-base-badge">${r.base}</span>
            <span class="runner-name">${r.name}</span>
            ${r.method ? `<span class="runner-method">(${r.method})</span>` : ""}
          </div>
        `).join("");
      }

      // Update Matchup / Due Up
      const isDueUp = (displayOuts === 3);

      if (isDueUp) {
        // 1. Display Due Up batters
        const nextOffenseType = (lastPlay.VisitingHomeType == 1) ? 2 : 1;
        
        let lastSlot = 0;
        for (let i = liveLogs.length - 1; i >= 0; i--) {
          if (liveLogs[i].VisitingHomeType == nextOffenseType && liveLogs[i].HitterLineup) {
            lastSlot = parseInt(liveLogs[i].HitterLineup, 10);
            break;
          }
        }
        
        const slot1 = (lastSlot % 9) + 1;
        const slot2 = ((lastSlot + 1) % 9) + 1;
        const slot3 = ((lastSlot + 2) % 9) + 1;
        
        const lineupMap = {};
        if (battingList && battingList.length > 0) {
          let orderCount = 0;
          battingList.forEach(player => {
            if (player.VisitingHomeType == nextOffenseType) {
              orderCount++;
              if (orderCount <= 9) {
                lineupMap[orderCount] = player.HitterName;
              }
            }
          });
        }
        liveLogs.forEach(play => {
          if (play.VisitingHomeType == nextOffenseType && play.HitterLineup && play.HitterName) {
            lineupMap[play.HitterLineup] = play.HitterName;
          }
        });
        
        const name1 = lineupMap[slot1] || `第${slot1}棒`;
        const name2 = lineupMap[slot2] || `第${slot2}棒`;
        const name3 = lineupMap[slot3] || `第${slot3}棒`;
        
        const pRole = document.querySelector(".pitcher-side .role-tag");
        const bRole = document.querySelector(".batter-side .role-tag");
        if (pRole) pRole.textContent = "PITCHER";
        if (bRole) bRole.textContent = "DUE UP";
        document.getElementById("batter-name").innerHTML = `${slot1}. ${name1}<br>${slot2}. ${name2}<br>${slot3}. ${name3}`;
        document.getElementById("batter-desc").innerHTML = "";

        // 2. Display the pitcher who is about to pitch (upcoming defensive team)
        const nextDefenseType = lastPlay.VisitingHomeType;
        let nextPitcherName = "--";
        let nextPitcherAcnt = null;
        
        for (let i = liveLogs.length - 1; i >= 0; i--) {
          if (liveLogs[i].VisitingHomeType == nextOffenseType && liveLogs[i].PitcherName) {
            nextPitcherName = liveLogs[i].PitcherName;
            nextPitcherAcnt = liveLogs[i].PitcherAcnt;
            break;
          }
        }
        
        document.getElementById("pitcher-name").textContent = nextPitcherName;
        
        let liveEraStr = "0.00";
        let hasEra = false;
        let upcomingPitchCnt = 0;
        if (pitchingList && pitchingList.length > 0 && nextPitcherAcnt) {
          const pitcherItem = pitchingList.find(p => p.PitcherAcnt === nextPitcherAcnt);
          if (pitcherItem) {
            const totalInningsBeforeToday = (pitcherItem.TotalInningPitched || 0) + ((pitcherItem.TotalInningPitchedDiv3 || 0) / 3);
            const inningsToday = (pitcherItem.InningPitchedCnt || 0) + ((pitcherItem.InningPitchedDiv3Cnt || 0) / 3);
            const totalInnings = totalInningsBeforeToday + inningsToday;
            const totalER = (pitcherItem.TotalEarnedRunCnt || 0) + (pitcherItem.EarnedRunCnt || 0);
            if (totalInnings > 0) {
              liveEraStr = ((totalER * 9) / totalInnings).toFixed(2);
              hasEra = true;
            }
            upcomingPitchCnt = pitcherItem.PitchCnt || 0;
          }
        }
        if (hasEra) {
          document.getElementById("pitch-count").innerHTML = `用球數 ${upcomingPitchCnt}<br>ERA ${liveEraStr}<br>準備上場`;
        } else {
          document.getElementById("pitch-count").innerHTML = `用球數 ${upcomingPitchCnt}<br>準備上場`;
        }
      } else {
        const pRole = document.querySelector(".pitcher-side .role-tag");
        const bRole = document.querySelector(".batter-side .role-tag");
        if (pRole) pRole.textContent = "PITCHER";
        if (bRole) bRole.textContent = "BATTER";
        
        const currentPitcherName = lastPlay.PitcherName || "--";
        document.getElementById("pitcher-name").textContent = currentPitcherName;
        
        const pitchCountVal = lastPlay.PitchCnt || 0;
        let liveEraStr = "0.00";
        
        if (pitchingList && pitchingList.length > 0 && lastPlay.PitcherAcnt) {
          const pitcherItem = pitchingList.find(p => p.PitcherAcnt === lastPlay.PitcherAcnt);
          if (pitcherItem) {
            const totalInningsBeforeToday = (pitcherItem.TotalInningPitched || 0) + ((pitcherItem.TotalInningPitchedDiv3 || 0) / 3);
            const inningsToday = (pitcherItem.InningPitchedCnt || 0) + ((pitcherItem.InningPitchedDiv3Cnt || 0) / 3);
            const totalInnings = totalInningsBeforeToday + inningsToday;
            const totalER = (pitcherItem.TotalEarnedRunCnt || 0) + (pitcherItem.EarnedRunCnt || 0);
            if (totalInnings > 0) {
              liveEraStr = ((totalER * 9) / totalInnings).toFixed(2);
            }
          }
        }
        document.getElementById("pitch-count").innerHTML = `用球數 ${pitchCountVal}<br>ERA ${liveEraStr}`;
        
        const currentHitterName = lastPlay.HitterName || "--";
        document.getElementById("batter-name").textContent = currentHitterName;
        
        let batterHitsStr = "0-0";
        let batterAvgStr = "AVG .000";
        if (battingList && battingList.length > 0 && lastPlay.HitterAcnt) {
          const batterItem = battingList.find(b => b.HitterAcnt === lastPlay.HitterAcnt);
          if (batterItem) {
            const atBats = batterItem.HitCnt ?? 0;
            const hits = batterItem.HittingCnt ?? 0;
            const totalAB = (batterItem.TotalHitCnt || 0) + atBats;
            const totalHits = (batterItem.TotalHittingCnt || 0) + hits;
            let liveAvgStr = ".000";
            if (totalAB > 0) {
              liveAvgStr = formatAVG(totalHits / totalAB);
            }
            batterHitsStr = `${hits}-${atBats}`;
            batterAvgStr = `AVG ${liveAvgStr}`;
          }
        }
        const outMethod = getCPBLOutMethod(lastPlay);
        if (outMethod) {
          document.getElementById("batter-desc").innerHTML = `${batterHitsStr}<br>${batterAvgStr}<br><span class="out-method" style="color: #FF5252; font-weight: 500;">${outMethod}</span>`;
        } else {
          document.getElementById("batter-desc").innerHTML = `${batterHitsStr}<br>${batterAvgStr}`;
        }
      }

      // Ticker update
      const tickerSection = document.getElementById("ticker-section");
      tickerSection.style.display = "block";
      const lastScorePlay = findLastScoringPlay(liveLogs);
      if (lastScorePlay) {
        document.getElementById("latest-play-text").textContent = getCPBLScoringInfo(lastScorePlay);
      } else {
        document.getElementById("latest-play-text").textContent = "尚無得分紀錄";
      }

      // Toast notification trigger for live scoring events
      const eventNo = lastPlay.MainEventNo;
      if (lastSeenEventNo && eventNo !== lastSeenEventNo) {
        const isHR = lastPlay.ActionName && (lastPlay.ActionName.includes("全壘打") || lastPlay.Content.includes("全壘打"));
        const isScore = lastPlay.IsScoreCnt == 1;
        if (isHR || isScore) {
          let runs = 0;
          const currentVis = parseInt(lastPlay.VisitingScore, 10) || 0;
          const currentHome = parseInt(lastPlay.HomeScore, 10) || 0;
          if (liveLogs.length > 1) {
            const prevPlay = liveLogs[liveLogs.length - 2];
            const prevVis = parseInt(prevPlay.VisitingScore, 10) || 0;
            const prevHome = parseInt(prevPlay.HomeScore, 10) || 0;
            runs = (currentVis - prevVis) + (currentHome - prevHome);
          } else {
            runs = currentVis + currentHome;
          }
          // showScoreToast(gameDetail, lastPlay, isHR, runs);
        }
      }
      lastSeenEventNo = eventNo;
    } else {
      statusBadge.textContent = "比賽中";
      lastSeenEventNo = null; // Reset live toast tracking

      const matchupTitle = document.getElementById("matchup-title");
      if (matchupTitle) {
        matchupTitle.textContent = "投打對決 - 局";
      }

      // Clear SBO & Bases if logs are empty, use blank template format
      updateSBODots(0, 0, 0);
      updateBases("", "", "");
      document.getElementById("pitcher-name").textContent = "-";
      document.getElementById("pitch-count").innerHTML = "ERA 0.00";
      document.getElementById("batter-name").textContent = "-";
      document.getElementById("batter-desc").innerHTML = "0-0<br>AVG .000";
      
      const tickerSection = document.getElementById("ticker-section");
      tickerSection.style.display = "block";
      document.getElementById("latest-play-text").textContent = "尚無得分紀錄";
    }
  } else {
    // Canceled, Postponed, or Suspended
    const matchupTitle = document.getElementById("matchup-title");
    if (matchupTitle) {
      matchupTitle.textContent = "投打對決 - 局";
    }
    if (gameSchedule) {
      updateUIForPostponed(gameSchedule);
    } else {
      lastSeenEventNo = null;
      hideScoreToast();
      document.getElementById("away-score").textContent = "-";
      document.getElementById("home-score").textContent = "-";
      statusBadge.className = "game-status-badge";
      
      if (status === 5) {
        statusBadge.textContent = "取消";
        statusBadge.className = "game-status-badge canceled-status";
      } else if (status === 6) {
        statusBadge.textContent = "延賽";
        statusBadge.className = "game-status-badge postponed-status";
      } else if (status === 7) {
        statusBadge.textContent = "保留";
        statusBadge.className = "game-status-badge suspended-status";
      } else {
        statusBadge.textContent = "中斷";
      }

      matchupSection.style.display = "block";
      const liveStatusMiddle = document.getElementById("live-status-middle");
      if (liveStatusMiddle) {
        liveStatusMiddle.style.display = "flex";
        liveStatusMiddle.classList.add("disabled");
      }
      updateSBODots(0, 0, 0);
      updateBases("", "", "");
      document.getElementById("pitcher-name").textContent = "-";
      document.getElementById("pitch-count").innerHTML = "用球數 0<br>ERA 0.00";
      document.getElementById("batter-name").textContent = "-";
      document.getElementById("batter-desc").innerHTML = "0-0<br>AVG .000";
      
      document.getElementById("ticker-section").style.display = "none";
    }
  }
}

// Light up SBO count lights
function updateSBODots(strikes, balls, outs) {
  const strikeDots = document.querySelectorAll("#strike-dots .dot");
  const ballDots = document.querySelectorAll("#ball-dots .dot");
  const outDots = document.querySelectorAll("#out-dots .dot");

  strikeDots.forEach((dot, idx) => {
    if (idx < strikes) dot.classList.add("active");
    else dot.classList.remove("active");
  });

  ballDots.forEach((dot, idx) => {
    if (idx < balls) dot.classList.add("active");
    else dot.classList.remove("active");
  });

  outDots.forEach((dot, idx) => {
    if (idx < outs) dot.classList.add("active");
    else dot.classList.remove("active");
  });

  const strikeStatus = document.getElementById("strike-status");
  const ballStatus = document.getElementById("ball-status");
  const outStatus = document.getElementById("out-status");

  if (strikeStatus) strikeStatus.textContent = "";
  if (ballStatus) ballStatus.textContent = "";
  if (outStatus) outStatus.textContent = "";
}

// Light up occupied bases with team colors
function updateBases(first, second, third, baseColor) {
  const base1 = document.getElementById("base-1st");
  const base2 = document.getElementById("base-2nd");
  const base3 = document.getElementById("base-3rd");

  const color = baseColor || "var(--accent-orange)";

  if (first && String(first).trim() !== "") {
    base1.classList.add("occupied");
    base1.style.backgroundColor = color;
    base1.style.boxShadow = `0 0 8px ${color}`;
    base1.setAttribute("title", `一壘: ${first}`);
  } else {
    base1.classList.remove("occupied");
    base1.style.backgroundColor = "";
    base1.style.boxShadow = "";
    base1.setAttribute("title", "一壘");
  }

  if (second && String(second).trim() !== "") {
    base2.classList.add("occupied");
    base2.style.backgroundColor = color;
    base2.style.boxShadow = `0 0 8px ${color}`;
    base2.setAttribute("title", `二壘: ${second}`);
  } else {
    base2.classList.remove("occupied");
    base2.style.backgroundColor = "";
    base2.style.boxShadow = "";
    base2.setAttribute("title", "二壘");
  }

  if (third && String(third).trim() !== "") {
    base3.classList.add("occupied");
    base3.style.backgroundColor = color;
    base3.style.boxShadow = `0 0 8px ${color}`;
    base3.setAttribute("title", `三壘: ${third}`);
  } else {
    base3.classList.remove("occupied");
    base3.style.backgroundColor = "";
    base3.style.boxShadow = "";
    base3.setAttribute("title", "三壘");
  }
}

// Retrieve pitcher stats from cache, with API fetch fallback
async function getPitcherStatsWithFallback(acnt) {
  if (!acnt) return null;
  const cacheKey = `pitcher_stats_${acnt}`;
  
  // Try reading from cache
  const cached = await chrome.storage.local.get([cacheKey]);
  if (cached[cacheKey]) {
    return cached[cacheKey];
  }
  
  // Delegate the fetch to the background script
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ action: "fetch_pitcher_stats", acnt: acnt }, (response) => {
      if (chrome.runtime.lastError) {
        console.error("Error communicating with background:", chrome.runtime.lastError);
        resolve(null);
      } else {
        resolve(response);
      }
    });
  });
}

function displayPitcherStats(element, acnt, isWin, record) {
  const label = isWin ? "勝投" : "敗投";
  const wins = record ? record.wins : null;
  const loses = record ? record.loses : null;
  
  if (wins !== null && loses !== null) {
    element.innerHTML = `${label}(${wins}-${loses})`;
  } else {
    element.innerHTML = isWin ? "勝投(W)" : "敗投(L)";
  }
  
  if (acnt) {
    getPitcherStatsWithFallback(acnt).then(stats => {
      const era = stats ? stats.era : "0.00";
      const finalWins = wins !== null ? wins : (stats ? stats.wins : 0);
      const finalLoses = loses !== null ? loses : (stats ? stats.loses : 0);
      element.innerHTML = `${label}(${era}, ${finalWins}-${finalLoses})`;
    });
  }
}

function formatAVG(avg) {
  if (isNaN(avg) || avg === null || avg === undefined || avg < 0) return ".000";
  if (avg >= 1) return avg.toFixed(3);
  const str = avg.toFixed(3);
  return str.substring(1);
}

function getOffensiveTeamColor(gameDetail, lastPlay) {
  if (!lastPlay || !gameDetail) return "var(--accent-orange)";
  
  const isVisitingBatting = (lastPlay.VisitingHomeType == 1);
  const teamName = isVisitingBatting ? gameDetail.VisitingTeamName : gameDetail.HomeTeamName;
  
  if (!teamName) return "var(--accent-orange)";
  
  if (teamName.includes("龍") || teamName.includes("味全")) {
    return "#FF1744"; // Red (龍)
  }
  if (teamName.includes("鷹") || teamName.includes("台鋼")) {
    return "#00E676"; // Green (鷹)
  }
  if (teamName.includes("邦") || teamName.includes("富邦")) {
    return "#2979FF"; // Blue (邦)
  }
  if (teamName.includes("獅") || teamName.includes("統一")) {
    return "#FF9100"; // Orange (獅)
  }
  if (teamName.includes("猿") || teamName.includes("樂天")) {
    return "#800020"; // Wine Red / Maroon (猿)
  }
  if (teamName.includes("兄弟") || teamName.includes("中信")) {
    return "#FFD600"; // Yellow (象)
  }
  
  return "var(--accent-orange)";
}

function showScoreToast(gameDetail, play, isHR, runs) {
  const toast = document.getElementById("score-toast");
  const logo = document.getElementById("toast-team-logo");
  const titleEl = document.getElementById("toast-title");
  const descEl = document.getElementById("toast-desc");

  if (!toast || !gameDetail || !play) return;

  // 1. Set logo image
  const isVisitingBatting = (play.VisitingHomeType == 1);
  const teamName = isVisitingBatting ? gameDetail.VisitingTeamName : gameDetail.HomeTeamName;
  const staticLogoPath = getCPBLTeamLogoUrl(teamName);
  if (staticLogoPath) {
    logo.src = `${CPBL_HOST}${staticLogoPath}`;
    logo.style.display = "block";
  } else {
    const logoPath = isVisitingBatting ? gameDetail.VisitingClubSmallImgPath : gameDetail.HomeClubSmallImgPath;
    if (logoPath) {
      logo.src = `${CPBL_HOST}${logoPath}`;
      logo.style.display = "block";
    } else {
      logo.style.display = "none";
    }
  }

  // Parse play type
  const isHit = play.ActionName && (play.ActionName.includes("安打") || play.Content.includes("安打"));
  let eventText = "得分打擊";
  if (isHR) {
    eventText = "擊出全壘打";
  } else if (isHit) {
    eventText = "擊出安打";
  } else if (play.Content.includes("犧牲飛球") || play.Content.includes("高飛犧牲打")) {
    eventText = "高飛犧牲打";
  } else if (play.Content.includes("保送") || play.Content.includes("四壞")) {
    eventText = "保送得分";
  } else if (play.Content.includes("滾地球") || play.Content.includes("滾地")) {
    eventText = "內野滾地";
  } else if (play.Content.includes("失誤")) {
    eventText = "對方失誤";
  } else if (play.Content.includes("野手選擇")) {
    eventText = "野手選擇";
  } else if (play.Content.includes("暴投")) {
    eventText = "暴投得分";
  } else if (play.Content.includes("捕逸")) {
    eventText = "捕逸得分";
  }

  // 2. Set title (hitter name + action)
  const hitter = play.HitterName || "打者";
  titleEl.textContent = `${hitter} ${eventText}！`;
  if (isHR) {
    titleEl.className = "toast-title hr-event";
  } else {
    titleEl.className = "toast-title";
  }

  // 3. Set description
  const awayName = cleanCPBLTeamName(gameDetail.VisitingTeamName || "客隊");
  const homeName = cleanCPBLTeamName(gameDetail.HomeTeamName || "主隊");
  const visitingScore = play.VisitingScore ?? 0;
  const homeScore = play.HomeScore ?? 0;
  
  const runsText = runs > 0 ? `進來 ${runs} 分！` : "得分！";
  descEl.innerHTML = `${runsText}目前比數: ${awayName} ${visitingScore} : ${homeScore} ${homeName}<br><span style="font-size: 0.68rem; color: #FFFFFF; font-weight: 500;">${play.Content}</span>`;

  // 4. Show toast
  toast.classList.add("show");

  // 5. Clear old timeout and set auto-hide after 8 seconds
  if (toastTimeout) clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    hideScoreToast();
  }, 8000);
}

function hideScoreToast() {
  const toast = document.getElementById("score-toast");
  if (toast) {
    toast.classList.remove("show");
  }
}

// Render the default unstarted matchup card template for postponed/canceled/suspended games
function updateUIForPostponed(gameSchedule) {
  if (!gameSchedule) return;
  
  
  const runnersPanel = document.getElementById("runners-panel");
  if (runnersPanel) {
    runnersPanel.style.display = "none";
    runnersPanel.innerHTML = "";
  }
  
  const awayName = cleanCPBLTeamName(gameSchedule.VisitingTeamName || "客隊");
  const homeName = cleanCPBLTeamName(gameSchedule.HomeTeamName || "主隊");
  
  document.getElementById("away-name").textContent = awayName;
  document.getElementById("home-name").textContent = homeName;
  
  const awayLogoImg = document.getElementById("away-logo-img");
  const awayLogoAbbr = document.getElementById("away-logo-abbr");
  const awayStaticLogoPath = getCPBLTeamLogoUrl(awayName);
  if (awayStaticLogoPath) {
    awayLogoImg.src = `${CPBL_HOST}${awayStaticLogoPath}`;
    awayLogoImg.style.display = "block";
    awayLogoAbbr.style.display = "none";
  } else {
    awayLogoImg.style.display = "none";
    awayLogoAbbr.textContent = getTeamAbbr(awayName);
    awayLogoAbbr.style.display = "flex";
  }

  const homeLogoImg = document.getElementById("home-logo-img");
  const homeLogoAbbr = document.getElementById("home-logo-abbr");
  const homeStaticLogoPath = getCPBLTeamLogoUrl(homeName);
  if (homeStaticLogoPath) {
    homeLogoImg.src = `${CPBL_HOST}${homeStaticLogoPath}`;
    homeLogoImg.style.display = "block";
    homeLogoAbbr.style.display = "none";
  } else {
    homeLogoImg.style.display = "none";
    homeLogoAbbr.textContent = getTeamAbbr(homeName);
    homeLogoAbbr.style.display = "flex";
  }
  
  document.getElementById("game-stadium").textContent = gameSchedule.FieldAbbe || "球場";
  document.getElementById("game-number").textContent = `場次 ${String(gameSchedule.GameSno).padStart(3, '0')}`;

  if (gameSchedule && gameSchedule.PreExeDate) {
    const timePart = gameSchedule.PreExeDate.substring(11, 16);
    document.getElementById("game-time").textContent = `開賽 ${timePart}`;
  } else {
    document.getElementById("game-time").textContent = "開賽 --:--";
  }

  // Set starting pitcher subtexts under team names
  const awayPitcherSub = document.getElementById("away-pitcher-sub");
  const homePitcherSub = document.getElementById("home-pitcher-sub");
  
  let awayPName = gameSchedule.VisitingPitcherName || "未定";
  let homePName = gameSchedule.HomePitcherName || "未定";
  if (awayPName.trim() === "") awayPName = "未定";
  if (homePName.trim() === "") homePName = "未定";
  
  awayPitcherSub.textContent = `先發: ${awayPName}`;
  homePitcherSub.textContent = `先發: ${homePName}`;

  document.getElementById("away-score").textContent = "-";
  document.getElementById("home-score").textContent = "-";

  const statusBadge = document.getElementById("game-inning");
  const gameResult = gameSchedule.GameResult;
  if (gameResult === "1" || gameResult === "2") {
    statusBadge.textContent = "延賽";
    statusBadge.className = "game-status-badge postponed-status";
  } else if (gameResult === "3") {
    statusBadge.textContent = "保留";
    statusBadge.className = "game-status-badge suspended-status";
  } else if (gameResult === "4") {
    statusBadge.textContent = "取消";
    statusBadge.className = "game-status-badge canceled-status";
  }

  // Show matchup section with default template
  const matchupSection = document.getElementById("matchup-section");
  matchupSection.style.display = "block";
  
  const liveStatusMiddle = document.getElementById("live-status-middle");
  if (liveStatusMiddle) {
    liveStatusMiddle.style.display = "flex";
    liveStatusMiddle.classList.add("disabled");
  }
  
  // Clear SBO & Bases
  updateSBODots(0, 0, 0);
  updateBases("", "", "");
  
  // Restore role tags
  const pRole = document.querySelector(".pitcher-side .role-tag");
  const bRole = document.querySelector(".batter-side .role-tag");
  if (pRole) pRole.textContent = "PITCHER";
  if (bRole) bRole.textContent = "BATTER";
  
  // Left side: 投手 - 用球數 0 • ERA 0.00
  document.getElementById("pitcher-name").textContent = "-";
  document.getElementById("pitch-count").innerHTML = "用球數 0<br>ERA 0.00";

  // Right side: 打者 - 0-0 • AVG .000
  document.getElementById("batter-name").textContent = "-";
  document.getElementById("batter-desc").innerHTML = "0-0<br>AVG .000";

  // Reset live toast tracking
  lastSeenEventNo = null;
  hideScoreToast();
  document.getElementById("ticker-section").style.display = "none";

  const timeStr = new Date().toLocaleTimeString('zh-TW', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
  updateStatusText(`最後更新: ${timeStr}`);
}

// Render the completed game matchup decisions directly from schedule data without live logs
function updateUIForFinished(gameSchedule) {
  if (!gameSchedule) return;
  
  
  const runnersPanel = document.getElementById("runners-panel");
  if (runnersPanel) {
    runnersPanel.style.display = "none";
    runnersPanel.innerHTML = "";
  }
  
  const awayName = cleanCPBLTeamName(gameSchedule.VisitingTeamName || "客隊");
  const homeName = cleanCPBLTeamName(gameSchedule.HomeTeamName || "主隊");
  
  document.getElementById("away-name").textContent = awayName;
  document.getElementById("home-name").textContent = homeName;
  
  const awayLogoImg = document.getElementById("away-logo-img");
  const awayLogoAbbr = document.getElementById("away-logo-abbr");
  const awayStaticLogoPath = getCPBLTeamLogoUrl(awayName);
  if (awayStaticLogoPath) {
    awayLogoImg.src = `${CPBL_HOST}${awayStaticLogoPath}`;
    awayLogoImg.style.display = "block";
    awayLogoAbbr.style.display = "none";
  } else {
    awayLogoImg.style.display = "none";
    awayLogoAbbr.textContent = getTeamAbbr(awayName);
    awayLogoAbbr.style.display = "flex";
  }

  const homeLogoImg = document.getElementById("home-logo-img");
  const homeLogoAbbr = document.getElementById("home-logo-abbr");
  const homeStaticLogoPath = getCPBLTeamLogoUrl(homeName);
  if (homeStaticLogoPath) {
    homeLogoImg.src = `${CPBL_HOST}${homeStaticLogoPath}`;
    homeLogoImg.style.display = "block";
    homeLogoAbbr.style.display = "none";
  } else {
    homeLogoImg.style.display = "none";
    homeLogoAbbr.textContent = getTeamAbbr(homeName);
    homeLogoAbbr.style.display = "flex";
  }
  
  document.getElementById("game-stadium").textContent = gameSchedule.FieldAbbe || "球場";
  document.getElementById("game-number").textContent = `場次 ${String(gameSchedule.GameSno).padStart(3, '0')}`;

  if (gameSchedule.PreExeDate) {
    const timePart = gameSchedule.PreExeDate.substring(11, 16);
    document.getElementById("game-time").textContent = `開賽 ${timePart}`;
  } else {
    document.getElementById("game-time").textContent = "開賽 --:--";
  }

  // Set starting pitcher subtexts under team names (clear on finished games)
  const awayPitcherSub = document.getElementById("away-pitcher-sub");
  const homePitcherSub = document.getElementById("home-pitcher-sub");
  awayPitcherSub.innerHTML = "";
  homePitcherSub.innerHTML = "";

  document.getElementById("away-score").textContent = gameSchedule.VisitingScore || 0;
  document.getElementById("home-score").textContent = gameSchedule.HomeScore || 0;

  const statusBadge = document.getElementById("game-inning");
  statusBadge.textContent = "已結束";
  statusBadge.className = "game-status-badge final-status";

  // Show matchup section with default template
  const matchupSection = document.getElementById("matchup-section");
  matchupSection.style.display = "block";
  
  const liveStatusMiddle = document.getElementById("live-status-middle");
  if (liveStatusMiddle) {
    liveStatusMiddle.style.display = "flex";
    liveStatusMiddle.classList.add("disabled");
  }
  
  // Clear SBO & Bases
  updateSBODots(0, 0, 0);
  updateBases("", "", "");
  
  // Restore role tags
  const pRole = document.querySelector(".pitcher-side .role-tag");
  const bRole = document.querySelector(".batter-side .role-tag");
  if (pRole) pRole.textContent = "";
  if (bRole) bRole.textContent = "";

  const visScore = parseInt(gameSchedule.VisitingScore || 0, 10);
  const homeScore = parseInt(gameSchedule.HomeScore || 0, 10);
  
  let winPName = gameSchedule.WinningPitcherName || "無";
  let winPAcnt = gameSchedule.WinningPitcherAcnt;
  let losePName = gameSchedule.LoserPitcherName || "無";
  let losePAcnt = gameSchedule.LoserPitcherAcnt;

  const pitcherNameEl = document.getElementById("pitcher-name");
  const pitchCountEl = document.getElementById("pitch-count");
  const batterNameEl = document.getElementById("batter-name");
  const batterDescEl = document.getElementById("batter-desc");

  if (visScore > homeScore) {
    // Away team won: Left is Winning Pitcher, Right is Losing Pitcher
    pitcherNameEl.textContent = winPName;
    batterNameEl.textContent = losePName;
    displayPitcherStats(pitchCountEl, winPAcnt, true, null);
    displayPitcherStats(batterDescEl, losePAcnt, false, null);
  } else if (homeScore > visScore) {
    // Home team won: Left is Losing Pitcher, Right is Winning Pitcher
    pitcherNameEl.textContent = losePName;
    batterNameEl.textContent = winPName;
    displayPitcherStats(pitchCountEl, losePAcnt, false, null);
    displayPitcherStats(batterDescEl, winPAcnt, true, null);
  } else {
    // Tie
    pitcherNameEl.textContent = "-";
    pitchCountEl.innerHTML = "";
    batterNameEl.textContent = "-";
    batterDescEl.innerHTML = "";
  }

  // Reset matchup title
  const matchupTitle = document.getElementById("matchup-title");
  if (matchupTitle) {
    matchupTitle.textContent = "勝敗投";
  }

  // Reset live toast tracking and scoring play ticker
  lastSeenEventNo = null;
  hideScoreToast();
  
  const tickerSection = document.getElementById("ticker-section");
  tickerSection.style.display = "block";
  document.getElementById("latest-play-text").textContent = "比賽結束";

  const timeStr = new Date().toLocaleTimeString('zh-TW', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
  updateStatusText(`最後更新: ${timeStr}`);
}

function findLastScoringPlay(liveLogs) {
  if (!liveLogs || liveLogs.length === 0) return null;
  for (let i = liveLogs.length - 1; i >= 0; i--) {
    if (liveLogs[i].IsScoreCnt == 1) {
      return liveLogs[i];
    }
  }
  return null;
}

function getCPBLScoringInfo(play) {
  if (!play || !play.Content) return "尚無得分紀錄";
  
  const inningSeq = play.InningSeq || "";
  const half = play.VisitingHomeType == 1 ? "上" : "下";
  const inningStr = inningSeq ? `${inningSeq}局${half}` : "";
  
  const name = play.HitterName || "";
  
  const action = (play.ActionName || "").trim();
  const battingAction = (play.BattingActionName || "").trim();
  const content = play.Content || "";
  
  let eventType = "得分";
  if (action.includes("全壘打") || battingAction.includes("全壘打") || content.includes("全壘打")) {
    eventType = "全壘打";
  } else if (action.includes("安打") || battingAction.includes("安") || content.includes("安打")) {
    eventType = "安打";
  } else if (action.includes("保送") || action.includes("四壞") || battingAction.includes("保送") || battingAction.includes("四壞") || content.includes("保送") || content.includes("四壞")) {
    eventType = "保送";
  } else if (action.includes("犧牲") || battingAction.includes("犧") || content.includes("犧牲")) {
    eventType = "犧牲打";
  } else if (action.includes("失誤") || battingAction.includes("E") || content.includes("失誤")) {
    eventType = "失誤";
  } else if (action.includes("野手選擇") || action.includes("野選") || battingAction.includes("野選") || content.includes("野手選擇") || content.includes("野選")) {
    eventType = "野選";
  } else if (action.includes("滾地") || action.includes("飛球") || action.includes("高飛") || content.includes("滾地") || content.includes("飛球") || content.includes("高飛") || content.includes("三振")) {
    eventType = "打擊";
  }
  
  let rbi = 0;
  const rbiMatch = content.match(/(一|二|三|四|1|2|3|4)分打點/);
  if (rbiMatch) {
    const numStr = rbiMatch[1];
    if (numStr === "一" || numStr === "1") rbi = 1;
    else if (numStr === "二" || numStr === "2") rbi = 2;
    else if (numStr === "三" || numStr === "3") rbi = 3;
    else if (numStr === "四" || numStr === "4") rbi = 4;
  } else {
    rbi = 1;
  }
  
  return `${inningStr} ${name} ${eventType} ${rbi}打點`;
}

function getCPBLRunnerOnBaseMethod(liveLogs, runnerName, baseName, contextPlay) {
  if (!liveLogs || liveLogs.length === 0 || !runnerName) return "";
  
  const cleanName = runnerName.trim();
  
  // Find current inning from the context play or latest play
  const refPlay = contextPlay || liveLogs[liveLogs.length - 1];
  const currentInningSeq = refPlay.InningSeq;
  const currentHalf = refPlay.VisitingHomeType; // 1 = top (visiting batting), 2 = bottom (home batting)
  
  let stolen = false;
  let originalMethod = "";
  let advancedMethod = "";
  
  for (let i = liveLogs.length - 1; i >= 0; i--) {
    const play = liveLogs[i];
    if (String(play.InningSeq) !== String(currentInningSeq) || String(play.VisitingHomeType) !== String(currentHalf)) {
      const targetTimeIndex = liveLogs.findIndex(p => String(p.InningSeq) === String(currentInningSeq) && String(p.VisitingHomeType) === String(currentHalf));
      if (targetTimeIndex !== -1 && i < targetTimeIndex) {
        break;
      }
      continue;
    }
    
    if (!play.Content) continue;
    
    const isRunnerOnBase = 
      (play.FirstBase && getCPBLRunnerName(liveLogs, play.FirstBase, "一壘", play) === cleanName) ||
      (play.SecondBase && getCPBLRunnerName(liveLogs, play.SecondBase, "二壘", play) === cleanName) ||
      (play.ThirdBase && getCPBLRunnerName(liveLogs, play.ThirdBase, "三壘", play) === cleanName);
      
    // Check if the runner stole a base
    if ((play.Content.includes(cleanName) || isRunnerOnBase) && (play.Content.includes("盜壘") || (play.ActionName && play.ActionName.includes("盜壘")))) {
      stolen = true;
    }
    
    const isHitter = play.HitterName && play.HitterName.trim() === cleanName;
    
    if (isHitter) {
      if (!originalMethod) {
        const action = (play.ActionName || "").trim();
        const battingAction = (play.BattingActionName || "").trim();
        const content = play.Content || "";
        
        if (action.includes("一壘安打") || battingAction.includes("一安") || action === "安打" ||
            content.includes("一壘安打") || content.includes("內野安打") || (content.includes("安打") && !content.includes("二壘安打") && !content.includes("三壘安打") && !content.includes("全壘打"))) {
          originalMethod = "一壘安打";
        }
        else if (action.includes("二壘安打") || battingAction.includes("二安") || content.includes("二壘安打")) {
          originalMethod = "二壘安打";
        }
        else if (action.includes("三壘安打") || battingAction.includes("三安") || content.includes("三壘安打")) {
          originalMethod = "三壘安打";
        }
        else if (action.includes("全壘打") || battingAction.includes("全壘打") || battingAction.includes("全打") || content.includes("全壘打")) {
          originalMethod = "全壘打";
        }
        else if (action.includes("故意四壞") || action.includes("敬遠") || battingAction.includes("IBB") ||
                 content.includes("故意四壞") || content.includes("敬遠")) {
          originalMethod = "敬遠保送";
        }
        else if (action.includes("保送") || action.includes("四壞") || battingAction.includes("保送") || battingAction.includes("四壞") || battingAction.includes("BB") ||
                 content.includes("四壞") || content.includes("保送")) {
          originalMethod = "四壞保送";
        }
        else if (action.includes("觸身") || action.includes("死球") || battingAction.includes("觸身") || battingAction.includes("HBP") ||
                 content.includes("觸身") || content.includes("死球")) {
          originalMethod = "觸身球";
        }
        else if (action.includes("失誤") || battingAction.includes("失誤") || battingAction.includes("E") || content.includes("失誤")) {
          originalMethod = "對方失誤";
        }
        else if (action.includes("野手選擇") || action.includes("野選") || battingAction.includes("野選") || battingAction.includes("FC") ||
                 content.includes("野手選擇") || content.includes("野選") ||
                 action.includes("趁傳") || content.includes("趁傳上壘") ||
                 action.includes("雙殺打上壘") || content.includes("雙殺打上壘")) {
          originalMethod = "野手選擇";
        }
        else if (action.includes("不死三振") || battingAction.includes("不死") || content.includes("不死三振") || content.includes("不死")) {
          originalMethod = "不死三振";
        }

        if (originalMethod) {
          const isHit = originalMethod.includes("安打") || originalMethod.includes("全壘打");
          const isFC = originalMethod === "野手選擇";
          if (!isHit && !isFC) {
            const reason = getCPBLReachBaseReason(content, originalMethod);
            if (reason) {
              originalMethod = `${originalMethod} (${reason})`;
            }
          }
          if (isHitter) {
            const up3 = new RegExp(cleanName + "[^。，]*?(?:上|到|進佔)三壘");
            const up2 = new RegExp(cleanName + "[^。，]*?(?:上|到|進佔)二壘");
            if (up3.test(content)) {
              originalMethod += "上三壘";
            } else if (up2.test(content)) {
              originalMethod += "上二壘";
            }
          }
        }
      }
    } else if (play.Content.includes(cleanName) || isRunnerOnBase) {
      if ((play.Content.includes("代跑") || (play.ActionName && play.ActionName.includes("代跑"))) && !originalMethod) {
        let origName = "";
        const prInfo = parseCPBLPinchRunner(play.Content);
        if (prInfo && prInfo.origName) {
          origName = prInfo.origName;
        }
        
        let hitterOnBaseMethod = "";
        if (origName) {
          for (let j = 0; j < liveLogs.length; j++) {
            const p = liveLogs[j];
            if (String(p.InningSeq) !== String(currentInningSeq) || String(p.VisitingHomeType) !== String(currentHalf)) {
              continue;
            }
            if (p.HitterName && p.HitterName.trim() === origName) {
              const pContent = p.Content || "";
              const pAction = (p.ActionName || "").trim();
              const pBattingAction = (p.BattingActionName || "").trim();
              
              const isSingle = pAction.includes("一壘安打") || pBattingAction.includes("一安") || pAction === "安打" ||
                              pContent.includes("一壘安打") || pContent.includes("內野安打") || 
                              (pContent.includes("安打") && !pContent.includes("二壘安打") && !pContent.includes("三壘安打") && !pContent.includes("全壘打"));
              const isDouble = pAction.includes("二壘安打") || pBattingAction.includes("二安") || pContent.includes("二壘安打");
              const isTriple = pAction.includes("三壘安打") || pBattingAction.includes("三安") || pContent.includes("三壘安打");
              const isHR = pAction.includes("全壘打") || pBattingAction.includes("全壘打") || pBattingAction.includes("全打") || pContent.includes("全壘打");
              
              if (isSingle) hitterOnBaseMethod = "一壘安打";
              else if (isDouble) hitterOnBaseMethod = "二壘安打";
              else if (isTriple) hitterOnBaseMethod = "三壘安打";
              else if (isHR) hitterOnBaseMethod = "全壘打";
              else {
                if (pAction.includes("故意四壞") || pAction.includes("敬遠") || pBattingAction.includes("IBB") ||
                    pContent.includes("故意四壞") || pContent.includes("敬遠")) {
                  hitterOnBaseMethod = "敬遠保送";
                }
                else if (pAction.includes("保送") || pAction.includes("四壞") || pBattingAction.includes("保送") || pBattingAction.includes("四壞") || pBattingAction.includes("BB") ||
                    pContent.includes("四壞") || pContent.includes("保送")) {
                  hitterOnBaseMethod = "四壞球";
                }
                else if (pAction.includes("觸身") || pAction.includes("死球") || pBattingAction.includes("觸身") || pBattingAction.includes("HBP") || pContent.includes("觸身") || pContent.includes("死球")) {
                  hitterOnBaseMethod = "觸身球";
                }
                else if (pAction.includes("失誤") || pBattingAction.includes("失誤") || pBattingAction.includes("E") || pContent.includes("失誤")) {
                  hitterOnBaseMethod = "對方失誤";
                }
                else if (pAction.includes("野手選擇") || pAction.includes("野選") || pBattingAction.includes("野選") || pBattingAction.includes("FC") ||
                         pContent.includes("野手選擇") || pContent.includes("野選") ||
                         pAction.includes("趁傳") || pContent.includes("趁傳上壘") ||
                         pAction.includes("雙殺打上壘") || pContent.includes("雙殺打上壘")) {
                  hitterOnBaseMethod = "野手選擇";
                }
                else if (pAction.includes("不死三振") || pBattingAction.includes("不死") || pContent.includes("不死三振") || pContent.includes("不死")) {
                  hitterOnBaseMethod = "不死三振";
                }
              }

              if (hitterOnBaseMethod) {
                const isHit = hitterOnBaseMethod.includes("安打") || hitterOnBaseMethod.includes("全壘打");
                const isFC = hitterOnBaseMethod === "野手選擇";
                if (!isHit && !isFC) {
                  const reason = getCPBLReachBaseReason(pContent, hitterOnBaseMethod);
                  if (reason) {
                    hitterOnBaseMethod = `${hitterOnBaseMethod} (${reason})`;
                  }
                }
                const up3 = new RegExp(origName + "[^。，]*?(?:上|到|進佔)三壘");
                const up2 = new RegExp(origName + "[^。，]*?(?:上|到|進佔)二壘");
                if (up3.test(pContent)) {
                  hitterOnBaseMethod += "上三壘";
                } else if (up2.test(pContent)) {
                  hitterOnBaseMethod += "上二壘";
                }
              }
              break;
            }
          }
        }
        
        if (origName) {
          if (hitterOnBaseMethod) {
            originalMethod = `代跑${origName}(${hitterOnBaseMethod})`;
          } else {
            originalMethod = `代跑${origName}`;
          }
        } else {
          originalMethod = "代跑";
        }
      }
      
      const content = play.Content || "";
      const isStealing = content.includes("盜") && !content.includes("雙盜壘") && (content.includes(cleanName) || isRunnerOnBase);
      const hasMoved = content.includes(cleanName + "上") || 
                       content.includes(cleanName + "進") || 
                       content.includes(cleanName + "到") || 
                       content.includes(cleanName + "回") || 
                       content.includes(cleanName + "得分") || 
                       (isRunnerOnBase && (
                         content.includes(cleanName) ||
                         content.includes("雙盜壘") ||
                         content.includes("投手犯規")
                       ));

      if (hasMoved && !isStealing && !advancedMethod) {
        const action = (play.ActionName || "").trim();
        const battingAction = (play.BattingActionName || "").trim();
        
        const isSingle = action.includes("一壘安打") || battingAction.includes("一安") || action === "安打" ||
                        content.includes("一壘安打") || content.includes("內野安打") || 
                        (content.includes("安打") && !content.includes("二壘安打") && !content.includes("三壘安打") && !content.includes("全壘打"));
        const isDouble = action.includes("二壘安打") || battingAction.includes("二安") || content.includes("二壘安打");
        const isTriple = action.includes("三壘安打") || battingAction.includes("三安") || content.includes("三壘安打");
        const isHR = action.includes("全壘打") || battingAction.includes("全壘打") || battingAction.includes("全打") || content.includes("全壘打");
        
        const isWalk = action.includes("保送") || action.includes("四壞") || battingAction.includes("保送") || battingAction.includes("四壞") || battingAction.includes("BB") ||
                       content.includes("四壞") || content.includes("保送") || action.includes("觸身") || battingAction.includes("觸身") || battingAction.includes("HBP") || content.includes("觸身");
        
        const isError = action.includes("失誤") || battingAction.includes("失誤") || battingAction.includes("E") || content.includes("失誤");
        
        const isFC = action.includes("野手選擇") || action.includes("野選") || battingAction.includes("野選") || battingAction.includes("FC") ||
                     content.includes("野手選擇") || content.includes("野選");
                     
        if (isSingle || isDouble || isTriple || isHR) {
          advancedMethod = "安打推進";
        } else if (isWalk) {
          advancedMethod = "保送推進";
        } else if (isError) {
          advancedMethod = "失誤推進";
        } else if (isFC) {
          advancedMethod = "野選推進";
        } else if (content.includes("雙盜壘")) {
          advancedMethod = "雙盜壘";
        } else if (content.includes("投手犯規")) {
          advancedMethod = "投手犯規進壘";
        } else if (content.includes("暴投")) {
          advancedMethod = "暴投進壘";
        } else if (content.includes("捕逸")) {
          advancedMethod = "捕逸進壘";
        } else if (content.includes("滾地")) {
          advancedMethod = "滾地推進";
        } else if (content.includes("飛球") || content.includes("高飛") || content.includes("犧牲打")) {
          advancedMethod = "飛球推進";
        } else if (content.includes("推進") || content.includes("進佔") || content.includes("進壘")) {
          advancedMethod = "推進";
        }
      }
    }
  }
  if (!originalMethod) {
    if (currentInningSeq >= 10) {
      originalMethod = "突破僵局跑者";
    } else {
      originalMethod = "上壘";
    }
  }

  let parts = [];
  if (originalMethod) {
    parts.push(originalMethod);
  }
  
  let showAdvanced = false;
  if (advancedMethod) {
    if (advancedMethod === "雙盜壘") {
      showAdvanced = true;
    } else if (baseName !== "二壘") {
      showAdvanced = true;
    }
  }
  
  if (showAdvanced) {
    parts.push(advancedMethod);
  }
  
  if (stolen && advancedMethod !== "雙盜壘") {
    parts.push("盜壘");
  }
  
  return parts.join(" + ");
}

function parseCPBLPinchRunner(content, originalHitterName) {
  if (!content || !content.includes("代跑")) return null;
  
  let prName = "";
  let origName = originalHitterName || "";
  
  // 1. [A]代跑[B]
  const match1 = content.match(/([^\s。，、換上由]+)\s*代跑\s*([^\s。，、\uff0c\u3002\uff1b\uff1a]+)/);
  if (match1) {
    prName = match1[1].trim();
    origName = match1[2].trim();
    prName = prName.replace(/^(換上|由|上場)/, "");
    return { prName, origName };
  }
  
  // 2. [B]由[A]代跑
  const match2 = content.match(/([^\s。，、]+)\s*由\s*([^\s。，、]+)\s*代跑/);
  if (match2) {
    origName = match2[1].trim();
    prName = match2[2].trim();
    origName = origName.replace(/^(換上|由|上場)/, "");
    prName = prName.replace(/^(換上|由|上場)/, "");
    return { prName, origName };
  }
  
  // 3. [A]上場代跑[B]
  const match3 = content.match(/([^\s。，、]+)\s*上場代跑\s*([^\s。，、]+)/);
  if (match3) {
    prName = match3[1].trim();
    origName = match3[2].trim();
    prName = prName.replace(/^(換上|由|上場)/, "");
    return { prName, origName };
  }

  // 4. [A]代跑
  const match4 = content.match(/([^\s。，、換上由]+)\s*代跑/);
  if (match4) {
    prName = match4[1].trim();
    prName = prName.replace(/^(換上|由|上場)/, "");
    return { prName, origName };
  }
  
  return null;
}

function getCPBLRunnerName(liveLogs, lineupNum, baseName, contextPlay) {
  if (!liveLogs || !lineupNum || liveLogs.length === 0) return "";
  const numStr = lineupNum.toString().trim();
  
  // Use contextPlay to determine the target inning/half, falling back to latest play in logs
  const refPlay = contextPlay || liveLogs[liveLogs.length - 1];
  const currentInningSeq = refPlay.InningSeq;
  const currentHalf = refPlay.VisitingHomeType; // 1 = top (visiting batting), 2 = bottom (home batting)
  
  // 1. 找出該棒次在這半局的原始打者名字
  let originalHitterName = "";
  for (let i = liveLogs.length - 1; i >= 0; i--) {
    const play = liveLogs[i];
    if (String(play.InningSeq) !== String(currentInningSeq) || String(play.VisitingHomeType) !== String(currentHalf)) {
      const targetTimeIndex = liveLogs.findIndex(p => String(p.InningSeq) === String(currentInningSeq) && String(p.VisitingHomeType) === String(currentHalf));
      if (targetTimeIndex !== -1 && i < targetTimeIndex) {
        break;
      }
      continue;
    }
    if (play.HitterLineup && play.HitterLineup.toString().trim() === numStr) {
      if (play.HitterName) {
        originalHitterName = play.HitterName.trim();
        break;
      }
    }
  }
  
  // 2. 掃描是否有代跑 originalHitterName 的 play
  if (originalHitterName) {
    for (let i = liveLogs.length - 1; i >= 0; i--) {
      const play = liveLogs[i];
      if (String(play.InningSeq) !== String(currentInningSeq) || String(play.VisitingHomeType) !== String(currentHalf)) {
        continue;
      }
      if (play.Content && play.Content.includes("代跑") && play.Content.includes(originalHitterName)) {
        const prInfo = parseCPBLPinchRunner(play.Content, originalHitterName);
        if (prInfo && prInfo.prName) {
          return prInfo.prName;
        }
      }
    }
  }
  
  // 3. Fallback: 找這半局最後一次出現在該棒次的打者名字
  if (originalHitterName) {
    return originalHitterName;
  }
  
  // 4. 超級 Fallback: 掃描所有 logs
  for (let i = liveLogs.length - 1; i >= 0; i--) {
    const play = liveLogs[i];
    if (play.HitterLineup && play.HitterLineup.toString().trim() === numStr) {
      if (play.HitterName) {
        return play.HitterName.trim();
      }
    }
  }
  
  return lineupNum.toString();
}

function getCPBLPlayOutCount(play) {
  if (!play || !play.Content) return 0;
  const content = play.Content;
  
  if (content.includes("三殺")) {
    return 3;
  }
  if (content.includes("雙殺") && !content.includes("雙殺打上壘")) {
    return 2;
  }
  
  // Split content by punctuation
  const clauses = content.split(/[，。、；;！!：:\s,]+/);
  let outs = 0;
  
  const hasUncaughtStrikeout = content.includes("不死三振") || content.includes("不死");
  
  // Out keywords to check in each clause
  const outKeywords = ["出局", "刺殺", "封殺", "觸殺", "接殺", "三振", "回壘不及", "阻殺"];
  
  clauses.forEach(clause => {
    if (!clause) return;
    
    // If it's an uncaught strikeout play, ignore the word "三振" for out counting
    let checkClause = clause;
    if (hasUncaughtStrikeout) {
      checkClause = clause.replace("三振", "");
    }
    
    const isOut = outKeywords.some(keyword => checkClause.includes(keyword));
    if (isOut) {
      outs++;
    }
  });
  
  return outs;
}

function getCPBLOutMethod(play) {
  if (!play || !play.Content) return "";
  const content = play.Content;
  const action = (play.ActionName || "").trim();
  const battingAction = (play.BattingActionName || "").trim();
  
  if (content.includes("壞球") || content.includes("界外") || content.includes("好球")) {
    return "";
  }

  const playOuts = getCPBLPlayOutCount(play);
  if (playOuts === 3) {
    return "三殺出局";
  }
  if (playOuts === 2) {
    return "雙殺出局";
  }
  if (playOuts === 0) {
    return "";
  }
  
  // If playOuts is 1, check if the batter reached base safely.
  // If so, the out was on a runner, so the batter has no out method.
  if (getCPBLReachBaseMethod(play)) {
    return "";
  }
  
  // 優先排除非出局事件（安打、保送、失誤）
  const isSingle = action.includes("一壘安打") || battingAction.includes("一安") || action === "安打" ||
                  content.includes("一壘安打") || content.includes("內野安打") || 
                  (content.includes("安打") && !content.includes("二壘安打") && !content.includes("三壘安打") && !content.includes("全壘打"));
  const isDouble = action.includes("二壘安打") || battingAction.includes("二安") || content.includes("二壘安打");
  const isTriple = action.includes("三壘安打") || battingAction.includes("三安") || content.includes("三壘安打");
  const isHR = action.includes("全壘打") || battingAction.includes("全壘打") || battingAction.includes("全打") || content.includes("全壘打");
  
  const isWalk = action.includes("保送") || action.includes("四壞") || battingAction.includes("保送") || battingAction.includes("四壞") || battingAction.includes("BB") ||
                 content.includes("四壞") || content.includes("保送") || action.includes("觸身") || battingAction.includes("觸身") || battingAction.includes("HBP") || content.includes("觸身");
  
  const isError = action.includes("失誤") || battingAction.includes("失誤") || battingAction.includes("E") || content.includes("失誤");
  
  if (isSingle || isDouble || isTriple || isHR || isWalk || isError) {
    return "";
  }
  
  if (content.includes("三振")) {
    if (content.includes("不死三振") || content.includes("不死")) return "";
    return "三振出局";
  }
  if (content.includes("犧牲")) {
    return "犧牲打出局";
  }
  if (content.includes("野手選擇") || content.includes("野選")) {
    if (content.includes("出局") || content.includes("刺殺") || content.includes("封殺")) {
      return "野選出局";
    }
    return "";
  }
  if (content.includes("滾地")) {
    return "滾地球出局";
  }
  if (content.includes("飛球") || content.includes("高飛") || content.includes("接殺")) {
    return "飛球出局";
  }
  if (content.includes("刺殺")) {
    return "刺殺出局";
  }
  if (content.includes("封殺")) {
    return "封殺出局";
  }
  if (content.includes("出局")) {
    return "出局";
  }
  return "";
}

function getCPBLReachBaseMethod(play) {
  if (!play || !play.Content) return "";
  const content = play.Content;
  const action = play.ActionName || "";
  const battingAction = play.BattingActionName || "";

  // 1. Hits
  if (action.includes("全壘打") || content.includes("全壘打")) {
    return "全壘打";
  }
  if (action.includes("三壘安打") || content.includes("三壘安打")) {
    return "三壘安打";
  }
  if (action.includes("二壘安打") || content.includes("二壘安打")) {
    return "二壘安打";
  }
  if (action.includes("一壘安打") || content.includes("一壘安打") || content.includes("內野安打") || 
      (content.includes("安打") && !content.includes("二壘") && !content.includes("三壘") && !content.includes("全壘打"))) {
    return "一壘安打";
  }

  // 2. Walks / HBP
  if (action.includes("四壞") || content.includes("四壞") || content.includes("保送")) {
    return "四壞保送";
  }
  if (action.includes("觸身") || content.includes("觸身")) {
    return "觸身球";
  }

  // 3. Fielder's Choice / Reach on throw
  if (action.includes("雙殺打上壘") || content.includes("雙殺打上壘")) {
    return "雙殺打上壘";
  }
  if (action.includes("趁傳") || content.includes("趁傳上壘")) {
    return "趁傳上壘";
  }
  if (action.includes("野手選擇") || action.includes("野選") || content.includes("野手選擇上壘") || content.includes("野選上壘")) {
    return "野手選擇";
  }
  
  // 4. Error
  if (action.includes("失誤") || battingAction.includes("失誤") || battingAction.includes("E") || content.includes("失誤上壘")) {
    return "對方失誤";
  }

  // 5. Uncaught Strikeout (不死三振)
  if (action.includes("不死三振") || content.includes("不死三振")) {
    return "不死三振";
  }

  return "";
}

function getCPBLReachBaseReason(content, reachMethod) {
  if (!content) return "";
  
  const parts = content.split(/[，。]/);
  let reasonParts = [];

  for (let part of parts) {
    part = part.trim();
    if (!part) continue;

    // Check force outs / tag outs
    if (part.includes("封殺") || part.includes("刺殺") || part.includes("觸殺")) {
      const clean = part.replace(/\d+人出局/, "").trim();
      if (clean && !clean.includes("雙殺打上壘") && !clean.includes("趁傳上壘") && !clean.includes("野手選擇")) {
        reasonParts.push(clean);
      }
    }
    // Check Errors
    else if (part.includes("失誤")) {
      const clean = part.replace(/上壘$/, "").trim();
      if (clean) {
        reasonParts.push(clean);
      }
    }
    // Check Hit trajectories (e.g. 中外野平飛球)
    else if (part.includes("平飛") || part.includes("高飛") || part.includes("滾地") || part.includes("強襲") || part.includes("飛球")) {
      const clean = part.replace(/^擊出/, "").trim();
      if (clean) {
        reasonParts.push(clean);
      }
    }
  }

  return reasonParts.join("、");
}



function simulateCPBLBasesAfterPlay(play, liveLogs) {
  try {
    let bases = {
      "一壘": play.FirstBase && String(play.FirstBase).trim() !== "" ? getCPBLRunnerName(liveLogs, play.FirstBase, "一壘", play) : "",
      "二壘": play.SecondBase && String(play.SecondBase).trim() !== "" ? getCPBLRunnerName(liveLogs, play.SecondBase, "二壘", play) : "",
      "三壘": play.ThirdBase && String(play.ThirdBase).trim() !== "" ? getCPBLRunnerName(liveLogs, play.ThirdBase, "三壘", play) : ""
    };

    const content = play.Content || "";
    if (!content || content.includes("壞球") || content.includes("界外") || content.includes("好球")) {
      const isWalkOrHBP = content.includes("四壞") || content.includes("保送") || content.includes("觸身") || content.includes("上壘");
      if (!isWalkOrHBP) {
        return bases;
      }
    }

    const first = bases["一壘"];
    const second = bases["二壘"];
    const third = bases["三壘"];
    const hitter = play.HitterName || "";

    function removeRunner(name) {
      if (!name) return;
      if (bases["一壘"] === name) bases["一壘"] = "";
      if (bases["二壘"] === name) bases["二壘"] = "";
      if (bases["三壘"] === name) bases["三壘"] = "";
    }

    function moveRunner(name, targetBase) {
      if (!name) return;
      removeRunner(name);
      bases[targetBase] = name;
    }

    // Split play content by clauses (do not split on spaces)
    const clauses = content.split(/[，。、,;；]+/);
    clauses.forEach(clause => {
      if (!clause) return;

      // 1. Explicit runner name checks
      const allRunners = [first, second, third].filter(x => x !== "");
      allRunners.forEach(runner => {
        if (clause.includes(runner)) {
          if (clause.includes("回本壘") || clause.includes("得分") || clause.includes("回壘得分")) {
            removeRunner(runner);
          } else if (clause.includes("上三壘") || clause.includes("到三壘") || clause.includes("至三壘") || clause.includes("進佔三壘") || clause.includes("盜三壘") || clause.includes("盜壘上三壘")) {
            moveRunner(runner, "三壘");
          } else if (clause.includes("上二壘") || clause.includes("到二壘") || clause.includes("至二壘") || clause.includes("進佔二壘") || clause.includes("盜二壘") || clause.includes("盜壘上二壘")) {
            moveRunner(runner, "二壘");
          } else if (clause.includes("出局") || clause.includes("封殺") || clause.includes("刺殺") || clause.includes("觸殺") || clause.includes("夾殺") || clause.includes("回壘不及")) {
            removeRunner(runner);
          }
        }
      });

      // 2. Fallbacks based on base roles
      if (first && (clause.includes("一壘跑者") || clause.includes("一壘的跑者") || clause.includes("一壘上的跑者"))) {
        if (clause.includes("回本壘") || clause.includes("得分") || clause.includes("回壘得分") ||
            clause.includes("出局") || clause.includes("封殺") || clause.includes("刺殺") || clause.includes("觸殺") || clause.includes("夾殺") || clause.includes("回壘不及")) {
          removeRunner(first);
        } else if (clause.includes("上三壘") || clause.includes("到三壘") || clause.includes("至三壘") || clause.includes("進佔三壘") || clause.includes("盜三壘") || clause.includes("盜壘上三壘")) {
          moveRunner(first, "三壘");
        } else if (clause.includes("上二壘") || clause.includes("到二壘") || clause.includes("至二壘") || clause.includes("進佔二壘") || clause.includes("盜二壘") || clause.includes("盜壘上二壘")) {
          moveRunner(first, "二壘");
        }
      }

      if (second && (clause.includes("二壘跑者") || clause.includes("二壘的跑者") || clause.includes("二壘上的跑者"))) {
        if (clause.includes("回本壘") || clause.includes("得分") || clause.includes("回壘得分") ||
            clause.includes("出局") || clause.includes("封殺") || clause.includes("刺殺") || clause.includes("觸殺") || clause.includes("夾殺") || clause.includes("回壘不及")) {
          removeRunner(second);
        } else if (clause.includes("上三壘") || clause.includes("到三壘") || clause.includes("至三壘") || clause.includes("進佔三壘") || clause.includes("盜三壘") || clause.includes("盜壘上三壘")) {
          moveRunner(second, "三壘");
        }
      }

      if (third && (clause.includes("三壘跑者") || clause.includes("三壘的跑者") || clause.includes("三壘上的跑者"))) {
        if (clause.includes("回本壘") || clause.includes("得分") || clause.includes("回壘得分") ||
            clause.includes("出局") || clause.includes("封殺") || clause.includes("刺殺") || clause.includes("觸殺") || clause.includes("夾殺") || clause.includes("回壘不及")) {
          removeRunner(third);
        }
      }
    });

    // Hitter base assignment
    const action = (play.ActionName || "").trim();
    const battingAction = (play.BattingActionName || "").trim();

    let hitterBase = "";
    if (action.includes("一壘安打") || battingAction.includes("一安") || action === "安打" ||
        content.includes("一壘安打") || content.includes("內野安打") || (content.includes("安打") && !content.includes("二壘安打") && !content.includes("三壘安打") && !content.includes("全壘打"))) {
      hitterBase = "一壘";
    } else if (action.includes("二壘安打") || battingAction.includes("二安") || content.includes("二壘安打")) {
      hitterBase = "二壘";
    } else if (action.includes("三壘安打") || battingAction.includes("三安") || content.includes("三壘安打")) {
      hitterBase = "三壘";
    } else if (action.includes("全壘打") || battingAction.includes("全壘打") || content.includes("全壘打")) {
      bases["一壘"] = "";
      bases["二壘"] = "";
      bases["三壘"] = "";
      hitterBase = "";
    } else if (action.includes("保送") || action.includes("四壞") || content.includes("四壞") || content.includes("保送") || content.includes("觸身")) {
      hitterBase = "一壘";
      if (first) {
        moveRunner(first, "二壘");
        if (second) {
          moveRunner(second, "三壘");
          if (third) {
            removeRunner(third);
          }
        }
      }
    } else if (action.includes("野手選擇") || action.includes("野選") || content.includes("野手選擇") || content.includes("野選") ||
               action.includes("趁傳") || content.includes("趁傳") || action.includes("雙殺") || content.includes("雙殺打上壘")) {
      if (!content.includes("打者出局") && !content.includes("打者在") && !content.includes("一壘被刺殺") && !content.includes("一壘出局")) {
        hitterBase = "一壘";
      }
    } else if (action.includes("失誤") || content.includes("失誤")) {
      hitterBase = "一壘";
    } else if (action.includes("不死三振") || content.includes("不死")) {
      hitterBase = "一壘";
    }

    if (hitterBase) {
      moveRunner(hitter, hitterBase);
    }

    return {
      first: bases["一壘"] || "",
      second: bases["二壘"] || "",
      third: bases["三壘"] || ""
    };
  } catch (error) {
    console.error("Error inside simulateCPBLBasesAfterPlay:", error);
    return {
      first: play.FirstBase && String(play.FirstBase).trim() !== "" ? getCPBLRunnerName(liveLogs, play.FirstBase, "一壘", play) : "",
      second: play.SecondBase && String(play.SecondBase).trim() !== "" ? getCPBLRunnerName(liveLogs, play.SecondBase, "二壘", play) : "",
      third: play.ThirdBase && String(play.ThirdBase).trim() !== "" ? getCPBLRunnerName(liveLogs, play.ThirdBase, "三壘", play) : ""
    };
  }
}
