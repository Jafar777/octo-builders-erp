# OCTO fingerprint sync agent

Replaces `OctoSync.py`. Instead of writing to the Access database on the network
drive, it sends the ZKTeco punches to the ERP over HTTPS.

## Install (Damascus office PC, once)

1. Install Python 3 (tick "Add python.exe to PATH").
2. Open a terminal in this folder and run:
   ```
   pip install pyzk
   ```
3. In the dashboard: **HR → Devices → Add**, name it e.g. `ZKTeco — Damascus`, and copy
   the key it shows (it is shown only once).
4. Copy `config.example.json` to `config.json` and fill in:
   - `api_url` — the website address (e.g. `https://octo-builders.com`)
   - `device_key` — the key from step 3
   - `device_ip` — the fingerprint device IP (today `192.168.1.200`)
   - `tz_offset` — the office UTC offset (`+03:00` for Damascus)
5. Test it: `python octo_sync.py` — you should see "sent N punches".

## Run it automatically

Windows Task Scheduler → Create Task:
- Trigger: **At log on** (and/or **At startup**)
- Action: `pythonw.exe` with argument `octo_sync.py`, "Start in" = this folder
- Settings: "If the task fails, restart every 1 minute"

The first run uploads the whole history stored in the device; after that only new
punches. `queue.sqlite3` keeps anything not yet sent, so internet outages lose nothing.
The dashboard shows the device as online while heartbeats arrive (every 30 s).

## Employees

Each employee's **fingerprint ID** (the number enrolled on the device) goes in
**Staff → edit** or **HR → employee → HR profile → Fingerprint ID**.
