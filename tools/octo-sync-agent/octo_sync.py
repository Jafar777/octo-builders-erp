"""
OCTO fingerprint sync agent (replaces OctoSync.py).

Runs on an always-on PC in the Damascus office. Every 30 seconds it:
  1. reads the attendance log from the ZKTeco device on the office network (pyzk),
  2. queues punches it hasn't sent yet in a local SQLite file (nothing is lost if
     the internet is down),
  3. sends them over HTTPS to the ERP  (POST /api/attendance/ingest),
  4. sends a heartbeat even when there's nothing new, so HR can see the device is online.

Setup: see README.md in this folder.
"""

import json
import os
import sqlite3
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime

from zk import ZK  # pip install pyzk

HERE = os.path.dirname(os.path.abspath(__file__))
CONFIG = json.load(open(os.path.join(HERE, "config.json"), encoding="utf-8"))

ZK_IP = CONFIG.get("device_ip", "192.168.1.200")
ZK_PORT = int(CONFIG.get("device_port", 4370))
API_URL = CONFIG["api_url"].rstrip("/") + "/api/attendance/ingest"
DEVICE_KEY = CONFIG["device_key"]
# The device clock has no time zone; this is the office's UTC offset (Damascus = +03:00).
TZ_OFFSET = CONFIG.get("tz_offset", "+03:00")
INTERVAL = int(CONFIG.get("interval_seconds", 30))
BATCH = 500

DB = sqlite3.connect(os.path.join(HERE, "queue.sqlite3"))
DB.execute("CREATE TABLE IF NOT EXISTS punches (badge TEXT, time TEXT, sent INTEGER DEFAULT 0, PRIMARY KEY (badge, time))")
DB.commit()

LOG_FILE = os.path.join(HERE, "octo_sync_log.txt")


def log(message):
    line = f"{datetime.now():%Y-%m-%d %H:%M:%S} - {message}"
    print(line)
    with open(LOG_FILE, "a", encoding="utf-8") as f:
        f.write(line + "\n")


def read_device():
    """Returns [(badge, iso_time)] from the device, or raises."""
    zk = ZK(ZK_IP, port=ZK_PORT, timeout=10)
    conn = zk.connect()
    try:
        records = conn.get_attendance()
    finally:
        try:
            conn.disconnect()
        except Exception:
            pass
    return [(str(r.user_id), r.timestamp.strftime("%Y-%m-%dT%H:%M:%S") + TZ_OFFSET) for r in records]


def queue(records):
    before = DB.total_changes
    DB.executemany("INSERT OR IGNORE INTO punches (badge, time) VALUES (?, ?)", records)
    DB.commit()
    return DB.total_changes - before


def post(payload):
    req = urllib.request.Request(
        API_URL,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json", "X-Device-Key": DEVICE_KEY},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=30) as res:
        return json.loads(res.read().decode("utf-8"))


def send_pending(error=""):
    rows = DB.execute("SELECT badge, time FROM punches WHERE sent = 0 ORDER BY time LIMIT ?", (BATCH,)).fetchall()
    result = post({"punches": [{"badgeId": b, "time": t} for b, t in rows], "error": error})
    if rows:
        DB.executemany("UPDATE punches SET sent = 1 WHERE badge = ? AND time = ?", rows)
        DB.commit()
    return len(rows), result


def main():
    log(f"OCTO sync agent started — device {ZK_IP}:{ZK_PORT} → {API_URL}")
    while True:
        device_error = ""
        try:
            new = queue(read_device())
            if new:
                log(f"{new} new punches read from the device")
        except Exception as e:  # device unreachable: keep sending what's queued + report it
            device_error = f"device: {e}"
            log(f"ERROR reading device: {e}")

        try:
            # Drain the queue in batches (first run may have months of history).
            while True:
                sent, result = send_pending(device_error)
                if sent:
                    log(f"sent {sent} punches (server inserted {result.get('inserted')})")
                if sent < BATCH:
                    break
        except urllib.error.HTTPError as e:
            log(f"ERROR from server: HTTP {e.code} — check api_url and device_key in config.json")
        except Exception as e:
            log(f"ERROR sending (will retry): {e}")

        time.sleep(INTERVAL)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit(0)
