#!/usr/bin/env bash
# =============================================================================
# Incident forensic collection for the compromised dtfrontend container.
# Cause: CVE-2025-55182 (GHSA-9qr9-h5gf-34mp) — unauthenticated RCE in the
#        Next.js React Flight / RSC protocol (Next.js < 15.5.7). The container
#        was running a Monero cryptominer ("javae") with C2 + persistence.
#
# Run this on the PRODUCTION HOST, as the docker-capable user, BEFORE you destroy
# the container. It is collection-only: it does NOT delete or rebuild anything.
# The destroy + rebuild steps are PRINTED at the end for you to run manually.
#
#   chmod +x 2026-06-16-collect-forensics.sh
#   ./2026-06-16-collect-forensics.sh dtfrontend
# =============================================================================
set -u

CT="${1:-dtfrontend}"
TS="$(date +%Y%m%d-%H%M%S)"
OUT="incident-${CT}-${TS}"
mkdir -p "${OUT}" || { echo "cannot create ${OUT}"; exit 1; }
echo "[*] Collecting evidence for container '${CT}' into ${OUT}/"

# Known indicators of compromise (for reference / grep).
C2_HOSTS="221.156.167.200 141.95.72.59"
# Miner payload locations (confirmed via `docker diff`).
IOC_PATHS="/app/.pm2 /tmp/.ICEi-unix /app/public/config.json /app/public/javae /app/npm start /app/daemon.log /root/.local/bin"
# Persistence the kit installs INSIDE the container layer (wiped on rebuild, but collect as evidence).
PERSIST_PATHS="/etc/systemd/system/.systemd-guard.service /etc/systemd/system/systemd-udevd.service /etc/init.d/systemd-udevd /etc/cron.d/systemd-udevd /etc/crontabs/root /etc/crontabs/cron.update /etc/profile.d/systemd-udevd.sh /root/.config/autostart/systemd-udevd.desktop /root/.ssh/authorized_keys /root/.bashrc /root/.profile /root/.npm/_logs"

# ---- Phase A: volatile state (while the container is still running) ----------
echo "[*] Phase A: volatile state"
docker inspect "${CT}"                              > "${OUT}/inspect.json"        2>&1
docker top "${CT}" -eo pid,ppid,user,etime,args     > "${OUT}/process-tree.txt"    2>&1
docker logs --timestamps "${CT}"                    > "${OUT}/container.log"        2>&1

# Active network connections (the miner pool / C2 beacon) and process/proc links.
docker exec "${CT}" sh -c '
  echo "== netstat =="; (netstat -tpn 2>/dev/null || cat /proc/net/tcp);
  echo; echo "== ps =="; ps -ef 2>/dev/null || ps aux 2>/dev/null;
  echo; echo "== /proc/*/exe (catches deleted/self-erasing implants) ==";
  for p in /proc/[0-9]*; do echo "$p -> $(readlink "$p/exe" 2>/dev/null)"; done | grep -iE "deleted|javae|\.dev|\.pm2|tmp" ;
' > "${OUT}/network-and-procs.txt" 2>&1

# Dropped artifacts: listings, the miner config, and persistence.
docker exec "${CT}" sh -c '
  for d in '"${IOC_PATHS}"'; do echo "== ls $d =="; ls -la "$d" 2>/dev/null; done;
  echo "== miner config (/app/.pm2/config.json) =="; cat /app/.pm2/config.json 2>/dev/null;
  echo "== cron =="; ls -la /var/spool/cron /etc/cron* 2>/dev/null; crontab -l 2>/dev/null;
  echo "== ssh persistence =="; cat /root/.ssh/authorized_keys 2>/dev/null;
' > "${OUT}/artifacts-and-persistence.txt" 2>&1

# ---- Phase B: snapshot the container filesystem to a forensic image ----------
echo "[*] Phase B: committing forensic image forensic/${CT}:${TS}"
docker commit "${CT}" "forensic/${CT}:${TS}" > "${OUT}/commit-id.txt" 2>&1

# ---- Phase C: stop the container (halts mining + C2; keeps it for evidence) ---
echo "[*] Phase C: stopping container (NOT removing it)"
docker stop "${CT}" > /dev/null 2>&1

# ---- Phase D: file-level evidence (works on a stopped container) --------------
echo "[*] Phase D: file diff + copying dropped binaries"
docker diff "${CT}" > "${OUT}/filesystem-diff.txt" 2>&1   # everything added/changed vs image
for d in ${IOC_PATHS} ${PERSIST_PATHS}; do
  docker cp "${CT}:${d}" "${OUT}/$(echo "$d" | tr '/ ' '__')" 2>/dev/null && echo "    copied ${d}"
done

# Hash anything we pulled out, for threat-intel / VirusTotal lookups.
if command -v sha256sum >/dev/null 2>&1; then
  find "${OUT}" -type f -exec sha256sum {} \; > "${OUT}/sha256sums.txt" 2>/dev/null
fi

echo
echo "[✓] Collection complete -> ${OUT}/"
echo "    Block these IOCs at your firewall now: ${C2_HOSTS}"
echo
echo "================ NEXT STEPS (run manually after review) ================"
cat <<EOF
# 1. Confirm nothing else on the host is compromised:
#      docker ps -a                         # any unexpected containers?
#      docker diff dtbackend                 # repeat Phase D for other services
#      grep -R "${C2_HOSTS%% *}" /var/log 2>/dev/null
#      crontab -l ; cat /home/opc/.ssh/authorized_keys 2>/dev/null   # host persistence
#
# 2. Destroy the compromised container and its (tainted) image:
#      docker rm -f ${CT}
#      docker image rm <built dtfrontend image id>
#
# 3. Rebuild CLEAN from the patched source (next>=15.5.7) with the hardened files:
#      docker compose build --no-cache dtfrontend
#      docker compose up -d dtfrontend
#
# 4. ROTATE every secret the container could read (it ran as root):
#      - dtfrontend/.env and any DB / backend API credentials
#      - any tokens reachable from the app process
#
# 5. Verify the fix:
#      docker exec ${CT} node -e "console.log(require('next/package.json').version)"  # >= 15.5.7
#      docker exec ${CT} sh -c 'ps -ef' | grep -i javae   # must be empty
EOF
