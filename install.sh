#!/bin/sh
set -eu

REPO="${TWIN_REPO:-https://github.com/GA-MO/twin.git}"
DIR="${TWIN_DIR:-$HOME/my-twin}"
MIN_BUN="1.3"

say() { printf '\n\033[1m%s\033[0m\n' "$1"; }
die() { printf '\n\033[31m%s\033[0m\n' "$1" >&2; exit 1; }
bun_ok() { command -v bun >/dev/null 2>&1 && [ "$(printf '%s\n%s\n' "$MIN_BUN" "$(bun --version)" | sort -V | head -n1)" = "$MIN_BUN" ]; }

export PATH="$HOME/.local/bin:${BUN_INSTALL:-$HOME/.bun}/bin:$PATH"

say "1/4 git"
if ! git --version >/dev/null 2>&1; then
  if [ "$(uname)" = "Darwin" ]; then
    xcode-select --install >/dev/null 2>&1 || true
    die "เครื่องกำลังติดตั้ง git (หน้าต่าง command line developer tools): กด Install รอจนเสร็จ แล้วรันคำสั่งติดตั้ง twin เดิมอีกครั้ง"
  fi
  die "ไม่พบ git: ติดตั้งด้วยตัวจัดการแพ็กเกจของเครื่อง (เช่น sudo apt install git) แล้วรันคำสั่งนี้อีกครั้ง"
fi
git --version

say "2/4 Bun"
bun_ok || curl -fsSL https://bun.sh/install | bash
bun_ok || die "ติดตั้ง Bun $MIN_BUN ขึ้นไปไม่สำเร็จ: ดูข้อความด้านบน แล้วรันคำสั่งนี้อีกครั้ง"
echo "bun $(bun --version)"

say "3/4 Claude Code"
command -v claude >/dev/null 2>&1 || curl -fsSL https://claude.ai/install.sh | bash || true
if command -v claude >/dev/null 2>&1; then
  echo "claude $(claude --version 2>/dev/null || echo พร้อม)"
else
  echo "ติดตั้งคำสั่ง claude ไม่สำเร็จ: ใช้ twin ในแอป Claude Desktop ได้ตามปกติ ยกเว้นการส่งงานไปทำใน project อื่น"
fi

say "4/4 twin ที่ $DIR"
if [ -f "$DIR/twin.ts" ] && [ -d "$DIR/.git" ]; then
  cd "$DIR"
  if [ -f profile/twin.json ]; then
    [ $# -eq 0 ] || echo "ติดตั้งไว้แล้ว จึงอัปเดตแทน ตัวเลือก $* ไม่ได้ใช้: เปลี่ยนภายหลังด้วย cd $DIR && bun twin.ts setup $*"
    exec bun twin.ts update
  fi
elif [ -e "$DIR" ]; then
  die "มี $DIR อยู่แล้วแต่ไม่ใช่ twin: ย้ายออกก่อน หรือเลือกที่อื่นด้วย TWIN_DIR=<path>"
else
  git clone --quiet "$REPO" "$DIR"
  cd "$DIR"
fi
bun install --frozen-lockfile
if (: </dev/tty) 2>/dev/null; then
  exec bun twin.ts setup "$@" </dev/tty
fi
exec bun twin.ts setup "$@"
