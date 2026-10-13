# Installs Sculptured's runner for this Windows user and connects this computer to your account.
#   $env:SCULPTURED_KEY="<one-time key from the Computers page>"; irm __ORIGIN__/install.ps1 | iex
# Downloads the Windows build, checks its SHA-256, installs it to %LOCALAPPDATA%\Programs\Sculptured
# (no admin rights), then runs `sculptured connect __ORIGIN__ --install-service --key <key>`: it
# connects, lets agents work in your home folder, and keeps running in the background (a logon task).
$ErrorActionPreference = 'Stop'
$Origin = '__ORIGIN__'
$Releases = '__RELEASES__'

function Fail($why) { Write-Host "Sculptured install: $why" -ForegroundColor Red; exit 1 }

if ($env:PROCESSOR_ARCHITECTURE -ne 'AMD64') { Fail "this computer is $($env:PROCESSOR_ARCHITECTURE); Sculptured's Windows build is for 64-bit Intel/AMD (x64) for now." }
$target = 'x86_64-pc-windows-gnu'
$asset = "sculptured-$target.tar.gz"
$tmp = Join-Path ([IO.Path]::GetTempPath()) ("sculptured-" + [guid]::NewGuid())
New-Item -ItemType Directory -Path $tmp | Out-Null
try {
  Write-Host "Downloading Sculptured for Windows..."
  try { Invoke-WebRequest -UseBasicParsing "$Releases/$asset" -OutFile "$tmp\$asset" } catch { Fail "there is no Sculptured build for Windows at $Releases yet. Nothing was installed." }
  Invoke-WebRequest -UseBasicParsing "$Releases/$asset.sha256" -OutFile "$tmp\$asset.sha256"
  $want = ((Get-Content "$tmp\$asset.sha256" -Raw).Trim() -split '\s+')[0].ToLower()
  $got = (Get-FileHash -Algorithm SHA256 "$tmp\$asset").Hash.ToLower()
  if ($want -ne $got) { Fail "checksum mismatch for $asset (expected $want, got $got). Nothing was installed." }
  $ErrorActionPreference = 'Continue'
  tar -xzf "$tmp\$asset" -C $tmp
  $ErrorActionPreference = 'Stop'
  if ($LASTEXITCODE -ne 0) { Fail "could not unpack $asset. Nothing was installed." }
  $bin = Join-Path $env:LOCALAPPDATA 'Programs\Sculptured'
  New-Item -ItemType Directory -Force -Path $bin | Out-Null
  # A running runner holds the old files: stop its logon task first. On a first install there is none.
  # (A cmdlet, not schtasks.exe: Windows PowerShell 5.1 turns a native program's error output into a
  # terminating error under ErrorActionPreference Stop.)
  $task = Get-ScheduledTask -TaskName 'Sculptured runner' -ErrorAction SilentlyContinue
  if ($task) { $task | Stop-ScheduledTask -ErrorAction SilentlyContinue }
  # Ending the task can leave the runner itself running (Windows then refuses to replace its files):
  # stop the old runner, only the copies installed in this folder.
  $old = Get-Process -Name 'sculptured', 'sculptured-background' -ErrorAction SilentlyContinue | Where-Object { $_.Path -and $_.Path.StartsWith($bin, [StringComparison]::OrdinalIgnoreCase) }
  if ($old) { Write-Host "Stopping the running Sculptured runner to update it..."; $old | Stop-Process -Force -ErrorAction SilentlyContinue; Start-Sleep -Seconds 1 }
  Copy-Item "$tmp\sculptured.exe", "$tmp\sculptured-background.exe" -Destination $bin -Force
  Write-Host "Installed $bin\sculptured.exe"
  $userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
  if (-not (($userPath -split ';') -contains $bin)) {
    [Environment]::SetEnvironmentVariable('Path', ((@($userPath, $bin) | Where-Object { $_ }) -join ';'), 'User')
    Write-Host "Added $bin to your PATH (new terminals see it)."
  }
} finally {
  Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
}
# From here on, programs may write progress to their error output; that is not a failure.
$ErrorActionPreference = 'Continue'
Write-Host "Connecting this computer to $Origin..."
$connect = @('connect', $Origin, '--install-service')
if ($env:SCULPTURED_KEY) { $connect += @('--key', $env:SCULPTURED_KEY) }
& "$bin\sculptured.exe" @connect
Remove-Item Env:\SCULPTURED_KEY -ErrorAction SilentlyContinue
