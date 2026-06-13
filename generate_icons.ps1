Add-Type -AssemblyName System.Drawing

function Draw-Baseball($size, $filename) {
    $bmp = New-Object System.Drawing.Bitmap $size, $size
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    
    # Enable anti-aliasing for smooth circles
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.Clear([System.Drawing.Color]::Transparent)
    
    # White background circle
    $padding = [math]::Max(1, [int]($size / 16))
    $innerSize = $size - (2 * $padding)
    $brush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(245, 245, 240))
    $g.FillEllipse($brush, $padding, $padding, $innerSize, $innerSize)
    
    # Border outline
    $borderWidth = [math]::Max(1, [int]($size / 24))
    $borderPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(100, 100, 100), $borderWidth)
    $g.DrawEllipse($borderPen, $padding, $padding, $innerSize, $innerSize)
    
    # Red baseball seams
    $seamWidth = [math]::Max(1, [int]($size / 20))
    $seamPen = New-Object System.Drawing.Pen([System.Drawing.Color]::Crimson, $seamWidth)
    
    # Left seam arc
    $leftX = -($size / 2)
    $g.DrawArc($seamPen, $leftX, $padding, $size, $innerSize, -60, 120)
    
    # Right seam arc
    $rightX = $size / 2
    $g.DrawArc($seamPen, $rightX - $padding, $padding, $size, $innerSize, 120, 120)
    
    # Clean up
    $brush.Dispose()
    $borderPen.Dispose()
    $seamPen.Dispose()
    $g.Dispose()
    
    # Save as PNG
    $outputPath = Join-Path $PSScriptRoot $filename
    $bmp.Save($outputPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    Write-Host "Generated: $outputPath"
}

Draw-Baseball 16 "icon16.png"
Draw-Baseball 48 "icon48.png"
Draw-Baseball 128 "icon128.png"
