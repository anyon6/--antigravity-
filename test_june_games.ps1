$indexUrl = "https://www.cpbl.com.tw/schedule/index"
$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession

# Get Token and Cookies
$response = Invoke-WebRequest -Uri $indexUrl -SessionVariable sess -UseBasicParsing -UserAgent "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
$html = $response.Content

if ($html -match 'name="__RequestVerificationToken" type="hidden" value="([^"]+)"') {
    $token = $Matches[1]
} else {
    Write-Host "Token not found"
    exit 1
}

if ($html -match "RequestVerificationToken:\s*'([^']+)'") {
    $ajaxToken = $Matches[1]
} else {
    $ajaxToken = $token
}

$body = @{
    "calendar" = "2026/01/01"
    "location" = ""
    "kindCode" = "A"
}

$headers = @{
    "RequestVerificationToken" = $ajaxToken
    "X-Requested-With" = "XMLHttpRequest"
}

try {
    $postResponse = Invoke-WebRequest -Uri "https://www.cpbl.com.tw/schedule/getgamedatas" -Method POST -Body $body -Headers $headers -WebSession $sess -UseBasicParsing -UserAgent "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    $json = $postResponse.Content | ConvertFrom-Json
    if ($json.Success) {
        $games = $json.GameDatas | ConvertFrom-Json
        Write-Host "Total games in season:" $games.Count
        
        $juneGames = $games | Where-Object { $_.GameDate -like "*2026-06-*" }
        Write-Host "Games in June 2026:" $juneGames.Count
        
        # Print first 5 and last 5 of June games
        for ($i = 0; $i -lt $juneGames.Count; $i++) {
            $g = $juneGames[$i]
            Write-Host "GameSno:" $g.GameSno "Date:" $g.GameDate "Time:" $g.PreExeDate "Matchup:" $g.VisitingTeamName "VS" $g.HomeTeamName "Status:" $g.GameResult
        }
    }
} catch {
    Write-Host "Error:" $_
}
