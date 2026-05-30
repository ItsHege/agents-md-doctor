param(
  [switch] $Desktop
)

$ErrorActionPreference = "Stop"

if ($IsWindows -eq $false) {
  throw "Windows shortcuts can only be created on Windows."
}

$ScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$PrototypeRoot = Split-Path -Parent $ScriptRoot
$ShortcutPath = Join-Path $PrototypeRoot "AGENTS.md Doctor.lnk"
$LauncherPath = Join-Path $PrototypeRoot "Launch-AGENTS-Doctor-UI.vbs"
$IconPath = Join-Path $PrototypeRoot "assets\agents-doctor.ico"
$WScriptPath = Join-Path $env:SystemRoot "System32\wscript.exe"

if (-not (Test-Path -LiteralPath $LauncherPath)) {
  throw "Launcher script is missing: $LauncherPath"
}

if (-not (Test-Path -LiteralPath $IconPath)) {
  throw "Icon file is missing: $IconPath"
}

if (-not (Test-Path -LiteralPath $WScriptPath)) {
  throw "Windows Script Host is missing: $WScriptPath"
}

function New-AppShortcut {
  param(
    [string] $Path
  )

  $shell = New-Object -ComObject WScript.Shell
  $shortcut = $shell.CreateShortcut($Path)
  $shortcut.TargetPath = $WScriptPath
  $shortcut.Arguments = "`"$LauncherPath`""
  $shortcut.WorkingDirectory = $PrototypeRoot
  $shortcut.IconLocation = "$IconPath,0"
  $shortcut.WindowStyle = 7
  $shortcut.Description = "Launch AGENTS.md Doctor desktop prototype"
  $shortcut.Save()

  $saved = $shell.CreateShortcut($Path)

  if ($saved.TargetPath -ne $WScriptPath) {
    throw "Shortcut target was not saved correctly: $Path"
  }

  if ($saved.IconLocation -ne "$IconPath,0") {
    throw "Shortcut icon was not saved correctly: $Path"
  }

  Write-Host "Launcher shortcut ready: $Path"
}

New-AppShortcut -Path $ShortcutPath

if ($Desktop) {
  $desktopPath = [Environment]::GetFolderPath("Desktop")
  New-AppShortcut -Path (Join-Path $desktopPath "AGENTS.md Doctor.lnk")
}
