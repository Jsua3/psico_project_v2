Add-Type -AssemblyName System.Drawing

function Get-Bounds([string]$path) {
  $bmp = [System.Drawing.Bitmap]::FromFile($path)
  $minX = $bmp.Width
  $minY = $bmp.Height
  $maxX = 0
  $maxY = 0
  for ($y = 0; $y -lt $bmp.Height; $y += 3) {
    for ($x = 0; $x -lt $bmp.Width; $x += 3) {
      $c = $bmp.GetPixel($x, $y)
      if ($c.A -gt 20 -and ($c.R + $c.G + $c.B) -gt 40) {
        if ($x -lt $minX) { $minX = $x }
        if ($y -lt $minY) { $minY = $y }
        if ($x -gt $maxX) { $maxX = $x }
        if ($y -gt $maxY) { $maxY = $y }
      }
    }
  }
  $bmp.Dispose()
  [PSCustomObject]@{
    file    = [IO.Path]::GetFileName($path)
    minX    = $minX
    minY    = $minY
    maxX    = $maxX
    maxY    = $maxY
    width   = ($maxX - $minX)
    height  = ($maxY - $minY)
    normCX  = [math]::Round((($minX + $maxX) / 2) / 1920, 4)
    normCY  = [math]::Round((($minY + $maxY) / 2) / 1080, 4)
    normFeetY = [math]::Round($maxY / 1080, 4)
  }
}

$dir = Join-Path $PSScriptRoot '..\src\assets\sprites\personaje'
Get-Bounds (Join-Path $dir 'idle_1.png')
Get-Bounds (Join-Path $dir 'blink.png')

$bg = Join-Path $PSScriptRoot '..\src\assets\backgrounds\fondo_oficina.png.png'
$bgBmp = [System.Drawing.Bitmap]::FromFile($bg)
Write-Output "background: $($bgBmp.Width)x$($bgBmp.Height)"
$bgBmp.Dispose()
