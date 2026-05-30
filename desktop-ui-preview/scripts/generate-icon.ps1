$ErrorActionPreference = "Stop"

$ScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$PrototypeRoot = Split-Path -Parent $ScriptRoot
$AssetsRoot = Join-Path $PrototypeRoot "assets"
$PngPath = Join-Path $AssetsRoot "agents-doctor.png"
$IcoPath = Join-Path $AssetsRoot "agents-doctor.ico"

New-Item -ItemType Directory -Force -Path $AssetsRoot | Out-Null

Add-Type -AssemblyName System.Drawing
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class NativeIconMethods {
  [DllImport("user32.dll", SetLastError = true)]
  public static extern bool DestroyIcon(IntPtr hIcon);
}
"@

function New-RoundedRectanglePath {
  param(
    [float] $X,
    [float] $Y,
    [float] $Width,
    [float] $Height,
    [float] $Radius
  )

  $path = [System.Drawing.Drawing2D.GraphicsPath]::new()
  $diameter = $Radius * 2

  $path.AddArc($X, $Y, $diameter, $diameter, 180, 90)
  $path.AddArc($X + $Width - $diameter, $Y, $diameter, $diameter, 270, 90)
  $path.AddArc($X + $Width - $diameter, $Y + $Height - $diameter, $diameter, $diameter, 0, 90)
  $path.AddArc($X, $Y + $Height - $diameter, $diameter, $diameter, 90, 90)
  $path.CloseFigure()

  return $path
}

$bitmap = [System.Drawing.Bitmap]::new(256, 256)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::ClearTypeGridFit
$graphics.Clear([System.Drawing.Color]::Transparent)

$shadowPath = New-RoundedRectanglePath 27 27 202 202 52
$graphics.FillPath([System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(34, 8, 20, 25)), $shadowPath)

$orbPath = New-RoundedRectanglePath 22 18 210 210 56
$graphics.FillPath([System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(255, 10, 24, 32)), $orbPath)

$innerPath = New-RoundedRectanglePath 42 38 170 170 44
$graphics.FillPath([System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(255, 18, 46, 55)), $innerPath)

$ringPen = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(255, 67, 224, 190), 15)
$ringPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
$ringPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
$graphics.DrawArc($ringPen, 38, 34, 178, 178, 206, 284)

$coolRingPen = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(255, 99, 147, 255), 10)
$coolRingPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
$coolRingPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
$graphics.DrawArc($coolRingPen, 57, 53, 140, 140, 26, 132)

$cutPen = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(255, 10, 24, 32), 20)
$cutPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
$cutPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
$graphics.DrawLine($cutPen, 57, 205, 211, 51)

$scopePen = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(255, 232, 248, 242), 12)
$scopePen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
$scopePen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
$scopePen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
$graphics.DrawBezier($scopePen, 78, 73, 69, 111, 89, 135, 121, 139)
$graphics.DrawBezier($scopePen, 176, 73, 185, 111, 165, 135, 133, 139)
$graphics.DrawLine($scopePen, 127, 139, 127, 168)

$earBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(255, 232, 248, 242))
$graphics.FillEllipse($earBrush, 68, 61, 21, 21)
$graphics.FillEllipse($earBrush, 166, 61, 21, 21)

$tubePen = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(255, 67, 224, 190), 10)
$tubePen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
$tubePen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
$graphics.DrawLine($tubePen, 127, 168, 165, 195)

$chestOuter = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(255, 99, 147, 255))
$chestInner = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(255, 232, 248, 242))
$graphics.FillEllipse($chestOuter, 156, 184, 48, 48)
$graphics.FillEllipse($chestInner, 168, 196, 24, 24)

$bitmap.Save($PngPath, [System.Drawing.Imaging.ImageFormat]::Png)

$hIcon = $bitmap.GetHicon()
try {
  $icon = [System.Drawing.Icon]::FromHandle($hIcon)
  $stream = [System.IO.File]::Create($IcoPath)
  try {
    $icon.Save($stream)
  } finally {
    $stream.Dispose()
    $icon.Dispose()
  }
} finally {
  [NativeIconMethods]::DestroyIcon($hIcon) | Out-Null
  $graphics.Dispose()
  $bitmap.Dispose()
}

Write-Host "Generated icon assets:"
Write-Host "  $PngPath"
Write-Host "  $IcoPath"
