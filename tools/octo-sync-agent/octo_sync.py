"""
OCTO fingerprint sync agent (replaces OctoSync.py).

Runs on an always-on PC in the Damascus office. Every 30 seconds it:
  1. reads the attendance log (and the clock) of the ZKTeco device on the office
     network (pyzk),
  2. queues punches it hasn't sent yet in a local SQLite file (nothing is lost if
     the internet is down),
  3. sends them over HTTPS to the ERP  (POST /api/attendance/ingest), and marks them
     sent only once the server confirms it stored them,
  4. sends a heartbeat even when there's nothing new (with the device clock, so HR can
     see the device is online and its time is right).

Setup: see README.md in this folder.
"""

import json
import os
import sqlite3
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timedelta

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
# Set the device clock from this PC's clock (kept right by Windows) when they differ by
# more than a minute. Off by default; HR can switch it on from the dashboard
# (HR → Fingerprint), which wins over this file.
STATE = {"sync_clock": bool(CONFIG.get("sync_device_clock", False)), "set_clock_now": False}
BATCH = 500
VERSION = "2"

DB = sqlite3.connect(os.path.join(HERE, "queue.sqlite3"))
DB.execute("CREATE TABLE IF NOT EXISTS punches (badge TEXT, time TEXT, sent INTEGER DEFAULT 0, PRIMARY KEY (badge, time))")
DB.commit()

LOG_FILE = os.path.join(HERE, "octo_sync_log.txt")
LOG_MAX = 2 * 1024 * 1024  # then the log moves to octo_sync_log.old.txt


def log(message):
    line = f"{datetime.now():%Y-%m-%d %H:%M:%S} - {message}"
    print(line)
    try:
        if os.path.exists(LOG_FILE) and os.path.getsize(LOG_FILE) > LOG_MAX:
            os.replace(LOG_FILE, os.path.join(HERE, "octo_sync_log.old.txt"))
        with open(LOG_FILE, "a", encoding="utf-8") as f:
            f.write(line + "\n")
    except OSError:
        pass


def office_now():
    """This PC's clock in office time (the device's zone), without a zone."""
    sign = -1 if TZ_OFFSET.startswith("-") else 1
    hours, minutes = TZ_OFFSET.lstrip("+-").split(":")
    return datetime.utcnow() + sign * timedelta(hours=int(hours), minutes=int(minutes))


def read_device():
    """Returns ([(badge, iso_time)], the device clock as ISO or None), or raises."""
    zk = ZK(ZK_IP, port=ZK_PORT, timeout=10)
    conn = zk.connect()
    device_time = None
    try:
        records = conn.get_attendance()
        try:
            clock = conn.get_time()
            if STATE["set_clock_now"] or (STATE["sync_clock"] and abs((clock - office_now()).total_seconds()) > 60):
                conn.set_time(office_now())
                log(f"device clock was {clock:%Y-%m-%d %H:%M:%S}: set to this PC's time")
                clock = conn.get_time()
                STATE["set_clock_now"] = False
            device_time = clock.strftime("%Y-%m-%dT%H:%M:%S") + TZ_OFFSET
        except Exception as e:
            log(f"could not read the device clock: {e}")
    finally:
        try:
            conn.disconnect()
        except Exception:
            pass
    punches = [(str(r.user_id).strip(), r.timestamp.strftime("%Y-%m-%dT%H:%M:%S") + TZ_OFFSET) for r in records]
    return punches, device_time


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


def send_pending(error="", device_time=None):
    rows = DB.execute("SELECT badge, time FROM punches WHERE sent = 0 ORDER BY time LIMIT ?", (BATCH,)).fetchall()
    payload = {"punches": [{"badgeId": b, "time": t} for b, t in rows], "error": error, "agent": VERSION}
    if device_time:
        payload["deviceTime"] = device_time
    result = post(payload)  # an HTTP error raises: the punches stay queued
    if rows and result.get("ok"):
        DB.executemany("UPDATE punches SET sent = 1 WHERE badge = ? AND time = ?", rows)
        DB.commit()
    apply_remote(result)
    return len(rows), result


def apply_remote(result):
    """Settings and one-off commands HR sent from the dashboard (HR → Fingerprint)."""
    config = result.get("config") or {}
    if "syncClock" in config and bool(config["syncClock"]) != STATE["sync_clock"]:
        STATE["sync_clock"] = bool(config["syncClock"])
        log(f"dashboard: keep the device clock synced = {STATE['sync_clock']}")
    for command in result.get("commands") or []:
        if command == "set_clock":
            STATE["set_clock_now"] = True  # done at the next device read
            log("dashboard: set the device clock now")
        elif command == "resend_all":
            DB.execute("UPDATE punches SET sent = 0")
            DB.commit()
            log("dashboard: sending every punch again (the ones already in the system are ignored)")


def main():
    log(f"OCTO sync agent v{VERSION} started — device {ZK_IP}:{ZK_PORT} → {API_URL}")
    while True:
        device_error = ""
        device_time = None
        try:
            records, device_time = read_device()
            new = queue(records)
            if new:
                log(f"{new} new punches read from the device")
        except Exception as e:  # device unreachable: keep sending what's queued + report it
            device_error = f"device: {e}"
            log(f"ERROR reading device: {e}")

        try:
            # Drain the queue in batches (first run may have months of history).
            while True:
                sent, result = send_pending(device_error, device_time)
                if sent:
                    log(f"sent {sent} punches (server stored {result.get('inserted')} new, {result.get('duplicates', 0)} already there)")
                if result.get("future"):
                    log(f"WARNING: {result['future']} punches are dated in the future — the device clock is wrong")
                if sent < BATCH:
                    break
        except urllib.error.HTTPError as e:
            if e.code in (401, 403):
                log(f"ERROR from server: HTTP {e.code} — check api_url and device_key in config.json (is the device still active in HR → Devices?)")
            else:
                log(f"ERROR from server: HTTP {e.code} — the punches stay queued and are sent again")
        except Exception as e:
            log(f"ERROR sending (will retry): {e}")

        time.sleep(INTERVAL)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit(0)
