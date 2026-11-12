# Gera build/icon.png (512x512) usado pelo electron-builder para o ícone do .exe.
# Desenho simples: quadrado arredondado azul com uma nota musical e uma seta de download.
# Uso: npm run icon
Add-Type -AssemblyName System.Drawing

$size = 512
$bmp = New-Object System.Drawing.Bitmap $size, $size
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
$g.Clear([System.Drawing.Color]::Transparent)

# fundo: quadrado arredondado em degradê
$r = 96
$path = New-Object System.Drawing.Drawing2D.GraphicsPath
$path.AddArc(0, 0, $r * 2, $r * 2, 180, 90)
$path.AddArc($size - $r * 2, 0, $r * 2, $r * 2, 270, 90)
$path.AddArc($size - $r * 2, $size - $r * 2, $r * 2, $r * 2, 0, 90)
$path.AddArc(0, $size - $r * 2, $r * 2, $r * 2, 90, 90)
$path.CloseFigure()
$rect = New-Object System.Drawing.Rectangle 0, 0, $size, $size
$brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush $rect, ([System.Drawing.Color]::FromArgb(255, 14, 165, 233)), ([System.Drawing.Color]::FromArgb(255, 3, 105, 161)), 45
$g.FillPath($brush, $path)

# nota musical
$font = New-Object System.Drawing.Font 'Segoe UI Symbol', 250, ([System.Drawing.FontStyle]::Bold), ([System.Drawing.GraphicsUnit]::Pixel)
$fmt = New-Object System.Drawing.StringFormat
$fmt.Alignment = [System.Drawing.StringAlignment]::Center
$fmt.LineAlignment = [System.Drawing.StringAlignment]::Center
$g.DrawString([string][char]0x266B, $font, [System.Drawing.Brushes]::White, (New-Object System.Drawing.RectangleF -10, -30, $size, $size), $fmt)

# seta de download (canto inferior direito)
$pen = New-Object System.Drawing.Pen ([System.Drawing.Color]::White), 30
$pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
$pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
$pen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
$g.DrawLine($pen, 400, 300, 400, 430)
$g.DrawLines($pen, [System.Drawing.Point[]]@((New-Object System.Drawing.Point 345, 380), (New-Object System.Drawing.Point 400, 435), (New-Object System.Drawing.Point 455, 380)))

$out = Join-Path $PSScriptRoot '..\build\icon.png'
New-Item -ItemType Directory -Force (Split-Path $out) | Out-Null
$bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bmp.Dispose()
Write-Output "ícone gerado: $out"
