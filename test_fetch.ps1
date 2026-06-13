$indexUrl = "https://www.cpbl.com.tw/schedule/index"
$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession

# Get Token and Cookies with basic parsing
$response = Invoke-WebRequest -Uri $indexUrl -SessionVariable sess -UseBasicParsing -UserAgent "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
$html = $response.Content

if ($html -match 'name="__RequestVerificationToken" type="hidden" value="([^"]+)"') {
    $token = $Matches[1]
    Write-Host "Verification Token:" $token
} else {
    Write-Host "Verification Token not found!"
    exit 1
}

# Find Ajax Verification Token
if ($html -match "RequestVerificationToken:\s*'([^']+)'") {
    $ajaxToken = $Matches[1]
    Write-Host "Ajax Token:" $ajaxToken
} else {
    $ajaxToken = $token
    Write-Host "Ajax Token not found, using Form Token"
}

# Post to getgamedatas
$todayStr = (Get-Date).ToString("yyyy/MM/dd")
Write-Host "Querying schedule for date:" $todayStr

$headers = @{
    "RequestVerificationToken" = $ajaxToken
    "X-Requested-With" = "XMLHttpRequest"
}

$body = @{
    "calendar" = $todayStr
    "location" = ""
    "kindCode" = "A"
}

try {
    $postResponse = Invoke-WebRequest -Uri "https://www.cpbl.com.tw/schedule/getgamedatas" -Method POST -Body $body -Headers $headers -WebSession $sess -UseBasicParsing -UserAgent "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    Write-Host "POST Status:" $postResponse.StatusCode
    $json = $postResponse.Content | ConvertFrom-Json
    Write-Host "Success:" $json.Success
    if ($json.Success) {
        $games = $json.GameDatas | ConvertFrom-Json
        Write-Host "Number of games today:" $games.Count
        foreach ($game in $games) {
            Write-Host "GameSno:" $game.GameSno "KindCode:" $game.KindCode "Status:" $game.GameResult "Time:" $game.PreExeDate "Matchup:" $game.VisitingTeamName "VS" $game.HomeTeamName
        }
    } else {
        Write-Host "API returned Success=false"
    }
} catch {
    Write-Host "Error in POST:" $_
}
