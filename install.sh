#!/usr/bin/env bash
set -euo pipefail

# ─── Radionica: instalacija ─────────────────────────────────────────────────
# Upotreba na Ubuntu serveru:
#   curl -fsSL https://raw.githubusercontent.com/krajcara/radionica/main/install.sh | sudo bash
# ili, ako je repozitorijum na drugom nalogu:
#   curl -fsSL https://raw.githubusercontent.com/NALOG/radionica/main/install.sh | sudo REPO_OWNER=NALOG bash
#
# Ponovno pokretanje je bezbedno: ne dira podatke ni .env, samo povuče
# najnoviji kod, ponovo izgradi aplikaciju i restartuje servis.
REPO_OWNER="${REPO_OWNER:-krajcara}"
REPO_NAME="${REPO_NAME:-radionica}"
INSTALL_DIR="/opt/radionica"
SERVICE_NAME="radionica"
NODE_VERSION="22"
APP_PORT="${APP_PORT:-8080}"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
info()    { echo -e "${BLUE}[INFO]${NC} $1"; }
success() { echo -e "${GREEN}[OK]${NC} $1"; }
warn()    { echo -e "${YELLOW}[PAŽNJA]${NC} $1"; }
error()   { echo -e "${RED}[GREŠKA]${NC} $1"; exit 1; }

[[ $EUID -ne 0 ]] && error "Pokreni kao root: sudo bash install.sh"

CLONE_URL="${CLONE_URL:-https://github.com/${REPO_OWNER}/${REPO_NAME}.git}"

echo ""
echo "  Radionica: instalacija"
echo "  Repozitorijum: ${CLONE_URL}"
echo ""

# ─── Sistemski paketi ────────────────────────────────────────────────────────
info "Instaliram sistemske pakete (curl, git, sqlite3)..."
apt-get update -qq || warn "apt-get update nije potpuno uspeo, nastavljam."
apt-get install -y -qq curl git ca-certificates sqlite3 >/dev/null
success "Sistemski paketi su instalirani."

# ─── Node.js preko nvm ───────────────────────────────────────────────────────
# Potreban je Node.js 22.16 ili noviji (ugrađen SQLite).
node_ok() {
  command -v node >/dev/null 2>&1 || return 1
  node -e 'const [a,b]=process.versions.node.split(".").map(Number);process.exit(a>22||(a===22&&b>=16)?0:1)'
}
if ! node_ok; then
  info "Instaliram Node.js ${NODE_VERSION} preko nvm..."
  export NVM_DIR="/usr/local/nvm"
  mkdir -p "$NVM_DIR"
  curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash >/dev/null 2>&1
  # shellcheck disable=SC1091
  source "$NVM_DIR/nvm.sh"
  nvm install "$NODE_VERSION" >/dev/null
  nvm alias default "$NODE_VERSION" >/dev/null
  ln -sf "$NVM_DIR/versions/node/$(nvm version "$NODE_VERSION")/bin/node" /usr/bin/node
  ln -sf "$NVM_DIR/versions/node/$(nvm version "$NODE_VERSION")/bin/npm" /usr/bin/npm
  node_ok || error "Node.js nije ispravno instaliran."
  success "Node.js $(node -v) je instaliran."
else
  success "Node.js $(node -v) je već instaliran."
fi

# ─── Kod iz repozitorijuma ───────────────────────────────────────────────────
if [ -d "$INSTALL_DIR/.git" ]; then
  info "Postojeća instalacija u ${INSTALL_DIR}, povlačim najnoviji kod..."
  git -C "$INSTALL_DIR" fetch origin
  git -C "$INSTALL_DIR" reset --hard origin/main
else
  [ -e "$INSTALL_DIR" ] && error "${INSTALL_DIR} već postoji, a nije git repozitorijum. Skloni ga pa pokreni ponovo."
  info "Preuzimam ${REPO_NAME} u ${INSTALL_DIR}..."
  git clone "$CLONE_URL" "$INSTALL_DIR"
fi
success "Kod je spreman u ${INSTALL_DIR}."

cd "$INSTALL_DIR"

# ─── .env ────────────────────────────────────────────────────────────────────
if [ ! -f "$INSTALL_DIR/.env" ]; then
  info "Pravim .env..."
  cp "$INSTALL_DIR/.env.example" "$INSTALL_DIR/.env"
  sed -i "s|^RADIONICA_PORT=.*|RADIONICA_PORT=${APP_PORT}|" "$INSTALL_DIR/.env"
  chmod 600 "$INSTALL_DIR/.env"
  success ".env je napravljen."
else
  info ".env već postoji, ne diram ga."
fi
mkdir -p "$INSTALL_DIR/data"
chmod 700 "$INSTALL_DIR/data"
APP_PORT=$(grep -E '^RADIONICA_PORT=' "$INSTALL_DIR/.env" | cut -d= -f2- | tr -d '"' | tr -d "'" || echo "8080")

# NAPOMENA: namerno ne učitavamo .env ovde. NODE_ENV=production bi naterao npm
# da preskoči devDependencies (vite, svelte), pa izgradnja prikaza ne bi uspela.

# ─── Zavisnosti i izgradnja ──────────────────────────────────────────────────
info "Instaliram zavisnosti (može da potraje minut)..."
unset NODE_ENV
npm ci --no-fund --no-audit --include=dev
success "Zavisnosti su instalirane."

info "Gradim prikaz..."
npm run build
success "Prikaz je izgrađen."

# ─── Baza i admin nalog ──────────────────────────────────────────────────────
info "Pripremam bazu..."
INIT_OUT=$(node --disable-warning=ExperimentalWarning server/src/cli.js init)
ADMIN_PASSWORD=$(printf '%s\n' "$INIT_OUT" | sed -n 's/^ADMIN_PASSWORD=//p')
success "Baza je spremna."

# ─── Komanda radionica ───────────────────────────────────────────────────────
install -m 0755 "$INSTALL_DIR/bin/radionica" /usr/local/bin/radionica

# ─── systemd servis ──────────────────────────────────────────────────────────
info "Instaliram systemd servis..."
cp "$INSTALL_DIR/radionica.service" "/etc/systemd/system/${SERVICE_NAME}.service"
systemctl daemon-reload
systemctl enable "$SERVICE_NAME" >/dev/null
systemctl restart "$SERVICE_NAME"

ok=""
for _ in $(seq 1 20); do
  if curl -sf "http://localhost:${APP_PORT}/api/health" >/dev/null 2>&1; then
    ok=1
    break
  fi
  sleep 1
done
[ -n "$ok" ] || error "Servis se nije podigao. Pogledaj: sudo journalctl -u ${SERVICE_NAME} -n 50"
success "Servis radionica radi."

SERVER_IP="$(hostname -I | awk '{print $1}')"
echo ""
echo "════════════════════════════════════════════════════════════"
echo "  Radionica je instalirana."
echo "  Adresa   : http://${SERVER_IP}:${APP_PORT}"
if [ -n "$ADMIN_PASSWORD" ]; then
  echo "  Korisnik : admin"
  echo "  Lozinka  : ${ADMIN_PASSWORD}"
  echo ""
  echo "  Lozinka je privremena. Pri prvoj prijavi biraš svoju."
else
  echo "  Korisnici već postoje. Zaboravljena lozinka: sudo radionica reset-admin"
fi
echo "════════════════════════════════════════════════════════════"
echo ""
