Add-Type -AssemblyName System.Drawing

$bgPath = Join-Path $PSScriptRoot '..\src\assets\backgrounds\fondo_oficina.png.png'
$bmp = [System.Drawing.Bitmap]::FromFile($bgPath)
$w = $bmp.Width
$h = $bmp.Height

# Scan lower-left quadrant for brown/wood desk tones (R>G, R>B, mid brightness)
$minX = $w
$minY = $h
$maxX = 0
$maxY = 0
$count = 0
for ($y = [int]($h * 0.45); $y -lt $h; $y += 2) {
  for ($x = 0; $x -lt [int]($w * 0.55); $x += 2) {
    $c = $bmp.GetPixel($x, $y)
    $isWood = ($c.R -gt 90 -and $c.R -lt 200 -and $c.G -gt 50 -and $c.G -lt 140 -and $c.B -gt 30 -and $c.B -lt 120 -and ($c.R - $c.G) -gt 15)
    if ($isWood) {
      $count++
      if ($x -lt $minX) { $minX = $x }
      if ($y -lt $minY) { $minY = $y }
      if ($x -gt $maxX) { $maxX = $x }
      if ($y -gt $maxY) { $maxY = $y }
    }
  }
}
$bmp.Dispose()

[PSCustomObject]@{
  bgW          = $w
  bgH          = $h
  deskMinX     = $minX
  deskMinY     = $minY
  deskMaxX     = $maxX
  deskMaxY     = $maxY
  deskCenterX  = [math]::Round((($minX + $maxX) / 2) / $w, 4)
  deskCenterY  = [math]::Round((($minY + $maxY) / 2) / $h, 4)
  deskFloorY   = [math]::Round($maxY / $h, 4)
  deskSamples  = $count
}
