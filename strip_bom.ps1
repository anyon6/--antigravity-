$utf8NoBom = New-Object System.Text.UTF8Encoding $false
$files = @("manifest.json", "background.js", "popup.html", "popup.css", "popup.js")
$srcDir = "C:\Users\chche\cpbl_extension"
$dstDir = "C:\Users\chche\.gemini\antigravity\scratch\cpbl_extension"

if (!(Test-Path $dstDir)) {
    New-Item -ItemType Directory -Force -Path $dstDir
}

foreach ($f in $files) {
    $srcPath = Join-Path $srcDir $f
    $dstPath = Join-Path $dstDir $f
    if (Test-Path $srcPath) {
        Copy-Item -Path $srcPath -Destination $dstPath -Force
        
        # Strip BOM in source
        $content = [System.IO.File]::ReadAllText($srcPath)
        [System.IO.File]::WriteAllText($srcPath, $content, $utf8NoBom)
        
        # Strip BOM in destination
        $content = [System.IO.File]::ReadAllText($dstPath)
        [System.IO.File]::WriteAllText($dstPath, $content, $utf8NoBom)
        
        Write-Host "Synced and stripped BOM:" $f
    }
}
