[Console]::OutputEncoding = [Text.Encoding]::UTF8

& {
  $ErrorActionPreference = "Stop"
  $Repo = if ($env:TWIN_REPO) { $env:TWIN_REPO } else { "https://github.com/GA-MO/twin.git" }
  $Dir = if ($env:TWIN_DIR) { $env:TWIN_DIR } else { Join-Path $HOME "my-twin" }
  $MinBun = [version]"1.3"
  $Session = $env:Path

  function Say($text) { Write-Host "`n$text" -ForegroundColor White }
  function Die($text) { throw $text }
  function Has($name) { [bool](Get-Command $name -ErrorAction SilentlyContinue) }
  function Refresh-Path { $env:Path = (@((Join-Path $HOME ".bun\bin"), (Join-Path $HOME ".local\bin"), [Environment]::GetEnvironmentVariable("Path", "User"), [Environment]::GetEnvironmentVariable("Path", "Machine"), $Session) | Where-Object { $_ }) -join ";" }
  function Bun-Ok { (Has bun) -and ([version]((bun --version) -replace "-.*$", "") -ge $MinBun) }

  Refresh-Path

  Say "1/4 git"
  if (-not (Has git)) {
    if (-not (Has winget)) { Die "ไม่พบ git: ติดตั้งจาก git-scm.com/download/win แล้วรันคำสั่งนี้อีกครั้ง" }
    winget install --id Git.Git -e --source winget --accept-package-agreements --accept-source-agreements
    Refresh-Path
    if (-not (Has git)) { Die "ติดตั้ง git แล้วแต่ PowerShell ยังไม่เห็น: ปิดแล้วเปิด PowerShell ใหม่ แล้วรันคำสั่งนี้อีกครั้ง" }
  }
  git --version

  Say "2/4 Bun"
  if (-not (Bun-Ok)) {
    powershell -NoProfile -c "irm bun.sh/install.ps1 | iex"
    Refresh-Path
  }
  if (-not (Bun-Ok)) { Die "ติดตั้ง Bun $MinBun ขึ้นไปไม่สำเร็จ: ดูข้อความด้านบน แล้วรันคำสั่งนี้อีกครั้ง" }
  Write-Host "bun $(bun --version)"

  Say "3/4 Claude Code"
  if (-not (Has claude)) {
    powershell -NoProfile -c "irm https://claude.ai/install.ps1 | iex"
    Refresh-Path
  }
  if (Has claude) { Write-Host "มีคำสั่ง claude แล้ว" }
  else { Write-Host "ติดตั้งคำสั่ง claude ไม่สำเร็จ: ใช้ twin ในแอป Claude Desktop ได้ตามปกติ ยกเว้นการส่งงานไปทำใน project อื่น" }

  Say "4/4 twin ที่ $Dir"
  $Existing = (Test-Path (Join-Path $Dir "twin.ts")) -and (Test-Path (Join-Path $Dir ".git"))
  if (-not $Existing -and (Test-Path $Dir)) { Die "มี $Dir อยู่แล้วแต่ไม่ใช่ twin: ย้ายออกก่อน หรือเลือกที่อื่นด้วย `$env:TWIN_DIR" }
  if (-not $Existing) {
    git clone --quiet $Repo $Dir
    if ($LASTEXITCODE -ne 0) { Die "clone $Repo ไม่สำเร็จ: ดูข้อความด้านบน แล้วรันคำสั่งนี้อีกครั้ง" }
  }
  Set-Location $Dir
  if (Test-Path "profile\twin.json") {
    if ($args.Count) { Write-Host "ติดตั้งไว้แล้ว จึงอัปเดตแทน ตัวเลือก $args ไม่ได้ใช้: เปลี่ยนภายหลังด้วย bun twin.ts setup $args ในโฟลเดอร์ $Dir" }
    bun twin.ts update
  } else {
    bun install --frozen-lockfile
    if ($LASTEXITCODE -ne 0) { Die "bun install ไม่สำเร็จ: ดูข้อความด้านบน แล้วรันคำสั่งนี้อีกครั้ง" }
    bun twin.ts setup @args
  }
} @args
