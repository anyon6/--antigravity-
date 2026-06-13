const fs = require('fs');

const raw = fs.readFileSync('./live_161.json', 'utf8');
const data = JSON.parse(raw);
const liveLogs = JSON.parse(data.LiveLogJson) || [];

console.log(`Total plays in live logs: ${liveLogs.length}`);

// Paste functions from popup_v3.js exactly
function parseCPBLPinchRunner(content, originalHitterName) {
  if (!content || !content.includes("代跑")) return null;
  
  let prName = "";
  let origName = originalHitterName || "";
  
  const match1 = content.match(/([^\s。，、換上由]+)\s*代跑\s*([^\s。，、\uff0c\u3002\uff1b\uff1a]+)/);
  if (match1) {
    prName = match1[1].trim();
    origName = match1[2].trim();
    prName = prName.replace(/^(換上|由|上場)/, "");
    return { prName, origName };
  }
  
  const match2 = content.match(/([^\s。，、]+)\s*由\s*([^\s@。，、]+)\s*代跑/); // Note: regex updated slightly to handle any symbols
  if (match2) {
    origName = match2[1].trim();
    prName = match2[2].trim();
    origName = origName.replace(/^(換上|由|上場)/, "");
    prName = prName.replace(/^(換上|由|上場)/, "");
    return { prName, origName };
  }
  
  const match3 = content.match(/([^\s。，、]+)\s*上場代跑\s*([^\s。，、]+)/);
  if (match3) {
    prName = match3[1].trim();
    origName = match3[2].trim();
    prName = prName.replace(/^(換上|由|上場)/, "");
    return { prName, origName };
  }

  const match4 = content.match(/([^\s。，、換上由]+)\s*代跑/);
  if (match4) {
    prName = match4[1].trim();
    prName = prName.replace(/^(換上|由|上場)/, "");
    return { prName, origName };
  }
  
  return null;
}

function getCPBLRunnerName(liveLogs, lineupNum, baseName) {
  if (!liveLogs || !lineupNum || liveLogs.length === 0) return "";
  const numStr = lineupNum.toString().trim();
  
  const latestPlay = liveLogs[liveLogs.length - 1];
  const currentInningSeq = latestPlay.InningSeq;
  const currentHalf = latestPlay.VisitingHomeType; // 1 = top, 2 = bottom
  
  let originalHitterName = "";
  for (let i = liveLogs.length - 1; i >= 0; i--) {
    const play = liveLogs[i];
    if (play.InningSeq !== currentInningSeq || play.VisitingHomeType !== currentHalf) {
      break;
    }
    if (play.HitterLineup && play.HitterLineup.toString().trim() === numStr) {
      if (play.HitterName) {
        originalHitterName = play.HitterName.trim();
        break;
      }
    }
  }
  
  if (originalHitterName) {
    for (let i = liveLogs.length - 1; i >= 0; i--) {
      const play = liveLogs[i];
      if (play.InningSeq !== currentInningSeq || play.VisitingHomeType !== currentHalf) {
        break;
      }
      if (play.Content && play.Content.includes("代跑") && play.Content.includes(originalHitterName)) {
        const prInfo = parseCPBLPinchRunner(play.Content, originalHitterName);
        if (prInfo && prInfo.prName) {
          return prInfo.prName;
        }
      }
    }
  }
  
  if (originalHitterName) {
    return originalHitterName;
  }
  
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

function simulateCPBLBasesAfterPlay(play, liveLogs) {
  try {
    let bases = {
      "一壘": play.FirstBase && play.FirstBase.trim() !== "" ? getCPBLRunnerName(liveLogs, play.FirstBase, "一壘") : "",
      "二壘": play.SecondBase && play.SecondBase.trim() !== "" ? getCPBLRunnerName(liveLogs, play.SecondBase, "二壘") : "",
      "三壘": play.ThirdBase && play.ThirdBase.trim() !== "" ? getCPBLRunnerName(liveLogs, play.ThirdBase, "三壘") : ""
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

    const clauses = content.split(/[，。、,;；]+/);
    clauses.forEach(clause => {
      if (!clause) return;

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
      first: play.FirstBase && play.FirstBase.trim() !== "" ? getCPBLRunnerName(liveLogs, play.FirstBase, "一壘") : "",
      second: play.SecondBase && play.SecondBase.trim() !== "" ? getCPBLRunnerName(liveLogs, play.SecondBase, "二壘") : "",
      third: play.ThirdBase && play.ThirdBase.trim() !== "" ? getCPBLRunnerName(liveLogs, play.ThirdBase, "三壘") : ""
    };
  }
}

// Trace the simulation for all plays of the 3rd inning top (TSG Hawks batting)
const inning3TopLogs = liveLogs.filter(p => p.InningSeq == 3 && p.VisitingHomeType == 1);

console.log("\n--- SIMULATION FOR 3RD INNING TOP ---");
inning3TopLogs.forEach(play => {
  try {
    const res = simulateCPBLBasesAfterPlay(play, liveLogs);
    console.log(`Hitter: ${play.HitterName.padEnd(4, ' ')} | Pitch: ${play.PitchCnt.toString().padStart(2, ' ')} | Raw Bases: 1st=${(play.FirstBase || '').padEnd(2, ' ')}, 2nd=${(play.SecondBase || '').padEnd(2, ' ')}, 3rd=${(play.ThirdBase || '').padEnd(2, ' ')} | Sim Bases: 1st=${(res.first || '').padEnd(4, ' ')}, 2nd=${(res.second || '').padEnd(4, ' ')}, 3rd=${(res.third || '').padEnd(4, ' ')} | Content: ${play.Content}`);
  } catch (err) {
    console.error(`FAILED on play PitchCount ${play.PitchCnt}:`, err);
  }
});
