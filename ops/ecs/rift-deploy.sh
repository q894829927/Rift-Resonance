#!/usr/bin/env bash
# ECS Rift Resonance deployer (User=rift, branch codex/v2-dual-weapon-foundation).
# Install as /opt/rift/bin/deploy.sh only after manual review.
# Does not modify Game-Portal, Tactics-Game, Nginx, or systemd units.
set -Eeuo pipefail
umask 022
export PATH="/usr/local/bin:$PATH"
export GIT_TERMINAL_PROMPT=0

ROOT=/opt/rift
REPO="$ROOT/source"
RELEASES="$ROOT/releases"
WEB_RELEASES=/var/www/rift/releases
BRANCH=codex/v2-dual-weapon-foundation
PUBLIC_ORIGIN=http://47.119.122.133
INITIAL=0
[[ "${1:-}" == '--initial' ]] && INITIAL=1

# Keep the original Git origin untouched. Read from explicit SSH/HTTPS URLs.
SSH_REMOTE="ssh://git@ssh.github.com:443/q894829927/Rift-Resonance.git"
HTTPS_REMOTE="https://github.com/q894829927/Rift-Resonance.git"
SSH_IDENTITY="$ROOT/ssh/rift_deploy"
SSH_HOSTS="$ROOT/ssh/github_known_hosts"
SSH_COMMAND="ssh -i $SSH_IDENTITY -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=yes -o UserKnownHostsFile=$SSH_HOSTS -o ConnectTimeout=8 -o ConnectionAttempts=1"

# Prevent simultaneous invocations from the timer and manual commands.
exec 9>"$ROOT/deploy.lock"
flock -n 9 || exit 0

log() { printf '[%s] %s\n' "$(date '+%F %T')" "$*"; }
atomic_link() {
  local target="$1" link="$2" temp
  temp="${link}.new.$$"
  ln -s "$target" "$temp"
  mv -Tf "$temp" "$link"
}
restore_old() {
  log 'New server failed health check; restoring previous symlinks.'
  if [[ -n "$old_app" && -d "$old_app" ]]; then
    atomic_link "$old_app" "$ROOT/current"
  else
    rm -f "$ROOT/current"
  fi
  if [[ -n "$old_web" && -d "$old_web" ]]; then
    atomic_link "$old_web" /var/www/rift/current
  else
    rm -f /var/www/rift/current
  fi
  sudo -n /usr/bin/systemctl restart rift-game.service || true
}

ssh_enabled=0
if [[ -f "$SSH_IDENTITY" && -s "$SSH_IDENTITY" &&
      -f "$SSH_HOSTS" && -s "$SSH_HOSTS" &&
      ! -L "$SSH_IDENTITY" && ! -L "$SSH_HOSTS" ]]; then
  command -v ssh >/dev/null || { log "ERROR: SSH credentials installed but ssh is unavailable"; exit 1; }
  ssh_enabled=1
  log "Git transport: SSH 443 primary, HTTPS fallback"
else
  log "Git transport: HTTPS (Rift Deploy Key not installed)"
fi

fetch_branch() {
  if (( ssh_enabled )); then
    if timeout 90 env GIT_SSH_COMMAND="$SSH_COMMAND" \
      git -C "$REPO" fetch -q "$SSH_REMOTE" "refs/heads/$BRANCH"; then
      log "Git branch fetched over SSH 443"
      return 0
    fi
    log "WARN: SSH 443 fetch failed; using HTTPS fallback"
  fi
  timeout 90 git -C "$REPO" fetch -q "$HTTPS_REMOTE" "refs/heads/$BRANCH"
}

# Fetch only the selected development branch. Never pull into live release.
# A failed SSH and failed HTTPS request must leave existing releases intact.
fetch_branch || { log "ERROR: Git branch fetch failed over SSH and HTTPS; previous Rift release unchanged"; exit 1; }
sha="$(git -C "$REPO" rev-parse FETCH_HEAD)"
[[ "$sha" =~ ^[a-f0-9]{40}$ ]] || { log "Unexpected commit SHA: $sha"; exit 1; }
new_app="$RELEASES/$sha"
new_web="$WEB_RELEASES/$sha"
current_app="$(readlink -e "$ROOT/current" 2>/dev/null || true)"
if [[ "$current_app" == "$new_app" ]]; then
  log "Already running $sha"
  exit 0
fi

# Require the matching SHA to have a successful V2 CI workflow.
# This API request is HTTPS and cannot be replaced by Git SSH transport.
api='https://api.github.com/repos/q894829927/Rift-Resonance/actions/workflows/v2-dual-weapon-ci.yml/runs'
response="$(curl --retry 2 --retry-delay 2 --connect-timeout 10 --max-time 25 -fsSL \
  -H 'Accept: application/vnd.github+json' \
  -H 'User-Agent: Rift-Resonance-ECS-Updater' \
  "${api}?branch=codex%2Fv2-dual-weapon-foundation&head_sha=${sha}&event=push&per_page=5")"
conclusion="$(jq -r --arg sha "$sha" '[.workflow_runs[] | select(.head_sha==$sha)][0].conclusion // "pending"' <<<"$response")"
if [[ "$conclusion" != success ]]; then
  log "Skipping $sha: V2 CI = $conclusion"
  (( INITIAL == 0 )) && exit 0 || exit 2
fi

log "CI passed for $sha; preparing independent release."
if [[ ! -f "$new_app/.build-ready" ]]; then
  if [[ -e "$new_app" ]]; then
    git -C "$REPO" worktree remove -f "$new_app" || { rm -rf -- "$new_app"; git -C "$REPO" worktree prune; }
  fi
  git -C "$REPO" worktree add -q --detach "$new_app" "$sha"
  (
    cd "$new_app"
    # Git LFS commonly uses HTTPS transfer endpoints even when Git uses SSH 443.
    # Preserve existing LFS behavior and fail closed if asset download fails.
    git lfs pull
    npm ci --no-audit --no-fund
    VITE_SERVER_URL="$PUBLIC_ORIGIN" npm run build
  )
  test -f "$new_app/apps/server/dist/main.js"
  test -f "$new_app/apps/client/dist/index.html"
  touch "$new_app/.build-ready"
fi

if [[ ! -f "$new_web/index.html" ]]; then
  mkdir -p "$new_web"
  cp -r "$new_app/apps/client/dist/." "$new_web/"
fi

old_app="$current_app"
old_web="$(readlink -e /var/www/rift/current 2>/dev/null || true)"
atomic_link "$new_app" "$ROOT/current"
atomic_link "$new_web" /var/www/rift/current
if ! sudo -n /usr/bin/systemctl restart rift-game.service; then
  restore_old
  exit 1
fi

healthy=0
for i in $(seq 1 25); do
  if curl -fsS --max-time 2 http://127.0.0.1:2567/health 2>/dev/null \
      | jq -e '.status=="ok" and .service=="rift-server"' >/dev/null 2>&1; then
    healthy=1
    break
  fi
  sleep 1
done
if [[ "$healthy" != 1 ]]; then
  restore_old
  exit 1
fi
log "Deployed $sha; health check succeeded."

# Retain the active and two most recently modified previous releases.
mapfile -t all_releases < <(find "$RELEASES" -mindepth 1 -maxdepth 1 -type d -printf '%T@ %p\n' | sort -nr | cut -d' ' -f2-)
kept=0
for path in "${all_releases[@]}"; do
  name="${path##*/}"
  [[ "$name" =~ ^[a-f0-9]{40}$ ]] || continue
  if [[ "$path" == "$new_app" || "$path" == "$old_app" || "$kept" -lt 3 ]]; then
    kept=$((kept + 1))
    continue
  fi
  git -C "$REPO" worktree remove -f "$path" 2>/dev/null || true
  if [[ ! -d "$path" ]]; then rm -rf -- "$WEB_RELEASES/$name"; fi
done
