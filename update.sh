#!/usr/bin/env bash
set -euo pipefail

# ─── Radionica: ažuriranje ──────────────────────────────────────────────────
# Proverava da li na GitHubu ima novih izmena na grani main. Ako ima: pravi
# rezervnu kopiju baze, povlači kod, instalira zavisnosti, gradi prikaz i
# restartuje servis. Ako servis posle toga ne proradi, vraća prethodnu verziju
# i bazu.
#
# Pokreće ga aplikacija (Podešavanja › Ažuriranje) ili ručno:
#   sudo radionica update
INSTALL_DIR="/opt/radionica"
SERVICE_NAME="radionica"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
info()    { echo -e "${BLUE}[INFO]${NC} $1"; }
success() { echo -e "${GREEN}[OK]${NC} $1"; }
warn()    { echo -e "${YELLOW}[PAŽNJA]${NC} $1"; }

PROGRESS_FILE="$INSTALL_DIR/data/update-progress.json"
# progress <korak> [running|done|error] [poruka]
progress() {
  local status="${2:-running}" message="${3:-}"
  message=${message//\"/\'}
  printf '{"step":"%s","status":"%s","message":"%s","updatedAt":"%s"}\n' \
    "$1" "$status" "$message" "$(date -u +%FT%TZ)" >"$PROGRESS_FILE.tmp"
  mv "$PROGRESS_FILE.tmp" "$PROGRESS_FILE"
}
fail() {
  progress "Greška" error "$1"
  echo -e "${RED}[GREŠKA]${NC} $1"
  exit 1
}

[[ $EUID -ne 0 ]] && { echo "Pokreni kao root: sudo radionica update"; exit 1; }
[ -d "$INSTALL_DIR/.git" ] || { echo "Radionica nije instalirana u ${INSTALL_DIR}."; exit 1; }
mkdir -p "$INSTALL_DIR/data"

progress "Pokrećem ažuriranje"
cd "$INSTALL_DIR"

APP_PORT=$(grep -E '^RADIONICA_PORT=' .env 2>/dev/null | cut -d= -f2- | tr -d '"' | tr -d "'" || true)
APP_PORT=${APP_PORT:-8080}
CURRENT_VERSION=$(node -p "require('./package.json').version" 2>/dev/null || echo "?")
info "Instalirana verzija: ${CURRENT_VERSION} ($(git rev-parse --short HEAD))"

# ─── Provera ─────────────────────────────────────────────────────────────────
progress "Proveravam da li ima novih izmena"
git fetch origin main --quiet || fail "GitHub nije dostupan. Proveri internet vezu servera."
OLD_SHA=$(git rev-parse HEAD)
NEW_SHA=$(git rev-parse origin/main)
if [ "$OLD_SHA" = "$NEW_SHA" ]; then
  success "Već imaš najnoviju verziju (${CURRENT_VERSION})."
  progress "Već imaš najnoviju verziju" "done"
  exit 0
fi
NEW_VERSION=$(git show origin/main:package.json | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).version))')
info "Nova verzija: ${NEW_VERSION} ($(git rev-parse --short origin/main))"

# ─── Rezervna kopija ─────────────────────────────────────────────────────────
progress "Pravim rezervnu kopiju baze"
BACKUP_OUT=$(node --disable-warning=ExperimentalWarning server/src/cli.js backup pre-azuriranja) ||
  fail "Rezervna kopija nije uspela, ažuriranje je prekinuto."
BACKUP_NAME=$(printf '%s\n' "$BACKUP_OUT" | sed -n 's/^Napravljena kopija: //p')
success "Rezervna kopija: ${BACKUP_NAME}"

# Pomoćne komande se pokreću sa nižim prioritetom, da aplikacija ne uspori dok radi.
NICE_CMD="nice -n 15"
command -v ionice >/dev/null 2>&1 && NICE_CMD="ionice -c2 -n7 nice -n 15"
unset NODE_ENV

build() {
  progress "Instaliram zavisnosti"
  $NICE_CMD npm ci --no-fund --no-audit --include=dev 2>&1 | tail -5
  progress "Gradim prikaz"
  $NICE_CMD npm run build 2>&1 | tail -3
  [ -f web/dist/index.html ] || return 1
  progress "Pripremam bazu"
  node --disable-warning=ExperimentalWarning server/src/cli.js init >/dev/null
}

healthy() {
  for _ in $(seq 1 20); do
    if curl -sf "http://localhost:${APP_PORT}/api/health" >/dev/null 2>&1; then
      return 0
    fi
    sleep 2
  done
  return 1
}

rollback() {
  warn "$1 Vraćam prethodnu verziju..."
  progress "Vraćam prethodnu verziju"
  git reset --hard "$OLD_SHA" --quiet
  systemctl stop "$SERVICE_NAME" || true
  if [ -n "$BACKUP_NAME" ]; then
    node --disable-warning=ExperimentalWarning server/src/cli.js restore "$BACKUP_NAME" --zadrzi-sesije >/dev/null || true
  fi
  build || true
  install -m 0755 bin/radionica /usr/local/bin/radionica
  systemctl start "$SERVICE_NAME" || true
  fail "$1 Vraćena je verzija ${CURRENT_VERSION} i baza pre ažuriranja. Detalji: sudo journalctl -u ${SERVICE_NAME} -n 50"
}

# ─── Novi kod ────────────────────────────────────────────────────────────────
progress "Preuzimam novu verziju"
git reset --hard origin/main --quiet
success "Kod je ažuriran."

build || rollback "Izgradnja nove verzije nije uspela."
install -m 0755 bin/radionica /usr/local/bin/radionica
if ! cmp -s radionica.service "/etc/systemd/system/${SERVICE_NAME}.service"; then
  cp radionica.service "/etc/systemd/system/${SERVICE_NAME}.service"
  systemctl daemon-reload
fi

# ─── Restart ─────────────────────────────────────────────────────────────────
progress "Restartujem servis"
systemctl restart "$SERVICE_NAME"
progress "Čekam da server proradi"
healthy || rollback "Nova verzija se nije podigla."

success "Radionica ${NEW_VERSION} radi na portu ${APP_PORT}."
progress "Gotovo" "done" "Radionica je ažurirana na verziju ${NEW_VERSION}."
