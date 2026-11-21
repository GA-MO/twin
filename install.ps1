[Console]::OutputEncoding = [Text.Encoding]::UTF8

& {
  $ErrorActionPreference = "Stop"
  $Repo = if ($env:TWIN_REPO) { $env:TWIN_REPO } else { "https://github.com/GA-MO/twin.git" }
  $Dir = if ($env:TWIN_DIR) { $env:TWIN_DIR } else { Join-Path $HOME "my-twin" }
  $MinBun = [version]"1.3"
  $Session = $env:Path
  if ($env:TWIN_LANG -ne "th" -and $env:TWIN_LANG -ne "en") { $env:TWIN_LANG = if ((Get-UICulture).Name -match "^th" -or (Get-Culture).Name -match "^th|-TH$") { "th" } else { "en" } }

  function T($th, $en) { if ($env:TWIN_LANG -eq "th") { $th } else { $en } }
  function Say($text) { Write-Host "`n$text" -ForegroundColor White }
  function Die($text) { throw $text }
  function Has($name) { [bool](Get-Command $name -ErrorAction SilentlyContinue) }
  function Refresh-Path { $env:Path = (@((Join-Path $HOME ".bun\bin"), (Join-Path $HOME ".local\bin"), [Environment]::GetEnvironmentVariable("Path", "User"), [Environment]::GetEnvironmentVariable("Path", "Machine"), $Session) | Where-Object { $_ }) -join ";" }
  function Bun-Ok { (Has bun) -and ([version]((bun --version) -replace "-.*$", "") -ge $MinBun) }

  Refresh-Path

  Say "1/4 git"
  if (-not (Has git)) {
    if (-not (Has winget)) { Die (T "ไม่พบ git: ติดตั้งจาก git-scm.com/download/win แล้วรันคำสั่งนี้อีกครั้ง" "git is not installed: install it from git-scm.com/download/win, then run this line again") }
    winget install --id Git.Git -e --source winget --accept-package-agreements --accept-source-agreements
    Refresh-Path
    if (-not (Has git)) { Die (T "ติดตั้ง git แล้วแต่ PowerShell ยังไม่เห็น: ปิดแล้วเปิด PowerShell ใหม่ แล้วรันคำสั่งนี้อีกครั้ง" "git is installed but PowerShell does not see it yet: close PowerShell, open it again, then run this line again") }
  }
  git --version

  Say "2/4 Bun"
  if (-not (Bun-Ok)) {
    powershell -NoProfile -c "irm bun.sh/install.ps1 | iex"
    Refresh-Path
  }
  if (-not (Bun-Ok)) { Die (T "ติดตั้ง Bun $MinBun ขึ้นไปไม่สำเร็จ: ดูข้อความด้านบน แล้วรันคำสั่งนี้อีกครั้ง" "Could not install Bun $MinBun or later: read the messages above, then run this line again") }
  Write-Host "bun $(bun --version)"

  Say "3/4 Claude Code"
  if (-not (Has claude)) {
    powershell -NoProfile -c "irm https://claude.ai/install.ps1 | iex"
    Refresh-Path
  }
  if (Has claude) { Write-Host (T "มีคำสั่ง claude แล้ว" "claude command found") }
  else { Write-Host (T "ติดตั้งคำสั่ง claude ไม่สำเร็จ: ใช้ twin ในแอป Claude Desktop ได้ตามปกติ ยกเว้นการส่งงานไปทำใน project อื่น" "Could not install the claude command: twin works in the Claude Desktop app as usual, except sending work to other projects") }

  Say "4/4 twin $(T "ที่" "in") $Dir"
  $Existing = (Test-Path (Join-Path $Dir "twin.ts")) -and (Test-Path (Join-Path $Dir ".git"))
  if (-not $Existing -and (Test-Path $Dir)) { Die (T "มี $Dir อยู่แล้วแต่ไม่ใช่ twin: ย้ายออกก่อน หรือเลือกที่อื่นด้วย `$env:TWIN_DIR" "$Dir exists and is not twin: move it away first, or pick another place with `$env:TWIN_DIR") }
  if (-not $Existing) {
    git clone --quiet $Repo $Dir
    if ($LASTEXITCODE -ne 0) { Die (T "clone $Repo ไม่สำเร็จ: ดูข้อความด้านบน แล้วรันคำสั่งนี้อีกครั้ง" "Could not clone $Repo: read the messages above, then run this line again") }
  }
  Set-Location $Dir
  if (Test-Path "profile\twin.json") {
    if ($args.Count) { Write-Host (T "ติดตั้งไว้แล้ว จึงอัปเดตแทน ตัวเลือก $args ไม่ได้ใช้: เปลี่ยนภายหลังด้วย bun twin.ts setup $args ในโฟลเดอร์ $Dir" "Already installed, so this updates it instead and ignores ${args}: change them later with bun twin.ts setup $args in $Dir") }
    bun twin.ts update
  } else {
    bun install --frozen-lockfile
    if ($LASTEXITCODE -ne 0) { Die (T "bun install ไม่สำเร็จ: ดูข้อความด้านบน แล้วรันคำสั่งนี้อีกครั้ง" "bun install failed: read the messages above, then run this line again") }
    bun twin.ts setup @args
  }
} @args
