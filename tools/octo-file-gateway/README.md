# OCTO file gateway

Puts the office file server (`\\192.168.1.100\files submitted (ttd)`) inside the ERP:
the **Files** page, task deliveries, project files and chat all work with the real
company share instead of pasted links, from the office or from anywhere.

```
 employee's browser ──https──▶ gateway (office PC) ──SMB──▶ \\192.168.1.100\files submitted (ttd)
        │                          ▲
        └──https──▶ ERP (Vercel) ──┘  signs a 30-minute token: who, which folders, which rights
```

- Files go **straight between the browser and the office**. They never pass through the
  website's server, so there are no size limits from Vercel and nothing is copied to the cloud.
- The gateway trusts nothing on its own. Every request needs a token the ERP signed with
  the shared **connection key**. The token lists the folders that person may open (`r`),
  add to (`w`) or tidy (`m`, for people with *Manage the file server* only).
- Nobody can overwrite or delete by accident. Uploads never replace a file (a second
  `render.jpg` becomes `render (2).jpg`). Delete moves things to `.octo-recycle` on the
  share, where they're kept 30 days.
- Big files work. Uploads go in 16 MB parts, each retried on its own, so a dropped
  connection resumes where it stopped. Downloads resume too, and whole folders download as one `.zip`.
- Every upload, download, rename and delete is logged with the person's name in
  `octo_files_log.txt`.
- It's plain Python 3 with nothing to install, like the fingerprint agent.

## 1. Pick the PC

Use the file server itself if it runs Windows. Otherwise use any always-on office PC
that can open `\\192.168.1.100\files submitted (ttd)` in File Explorer. The PC that runs
the fingerprint agent is fine.

The gateway acts with the rights of the Windows account it runs as. Use an account
that can read and write the share, and give the share by its **network path**
(`\\192.168.1.100\…`), not a mapped drive letter. Drive letters (`Z:`) exist only in a
logged-on session.

## 2. Install

1. Install Python 3 (tick "Add python.exe to PATH").
2. Copy this folder to the PC, e.g. `C:\OCTO\octo-file-gateway`.
3. In the dashboard: **Files → Connection & setup → Create key**. Copy the key; it's shown only once.
4. Copy `config.example.json` to `config.json` and fill in:

| field | what |
|---|---|
| `secret` | the key from step 3 |
| `volumes` | the shares it serves: `{ "ttd": "\\\\192.168.1.100\\files submitted (ttd)" }` (in JSON every `\` is written `\\`). The key (`ttd`) must match the one on the Connection page. |
| `host`, `port` | `127.0.0.1` and `8765` when using a tunnel (step 4), so only the tunnel can reach it |
| `allowed_origins` | the website's address(es), e.g. `["https://octo-builders.com", "https://www.octo-builders.com"]` |
| `max_file_gb` | largest single file (default 50) |
| `zip_max_gb` | largest folder download as a zip (default 20) |
| `recycle_days` | how long deleted items stay in `.octo-recycle` (default 30) |

5. Test it: `python octo_files.py`, then open <http://127.0.0.1:8765/v1/info> on that PC.
   You should see `{"ok": true, … "volumes": ["ttd"]}`.

## 3. Run it automatically

Windows Task Scheduler → **Create Task**:

- General: run as the account from step 1, **Run whether user is logged on or not** (leave *Run with highest privileges* unticked)
- Trigger: **At startup**
- Action: `pythonw.exe`, argument `octo_files.py`, "Start in" = this folder
- Settings: "If the task fails, restart every 1 minute", and untick "Stop the task if it runs longer than…"

## 4. Give it a secure address (https)

The dashboard is served over https, so browsers only let it talk to an **https** gateway.
A plain `http://192.168.1.x` address is blocked as mixed content.

### Recommended: Cloudflare Tunnel (free, no router changes)

This needs the company domain's DNS on Cloudflare. On the gateway PC:

1. Install `cloudflared` (<https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/>).
2. Run:
   ```
   cloudflared tunnel login
   cloudflared tunnel create octo-files
   cloudflared tunnel route dns octo-files files.octo-builders.com
   ```
3. Create `C:\Users\<account>\.cloudflared\config.yml`:
   ```yaml
   tunnel: octo-files
   credentials-file: C:\Users\<account>\.cloudflared\<tunnel-id>.json
   ingress:
     - hostname: files.octo-builders.com
       service: http://127.0.0.1:8765
     - service: http_status:404
   ```
4. `cloudflared service install`. The tunnel now starts with Windows.

The gateway is then at `https://files.octo-builders.com`, reachable from the office and
from anywhere (customers reviewing work, employees at home). The office router stays closed.

### Other options

- **Tailscale Funnel**: gives an `https://<pc>.<tailnet>.ts.net` address without your own domain.
- **Office only**: run the gateway with its own certificate (`tls_cert` / `tls_key` in
  `config.json`, `host` = `0.0.0.0`) and give it a name the office PCs trust. Files then only
  work inside the office, and customers can't open deliveries.

## 5. Connect the dashboard

**Files → Connection & setup**:

1. **Gateway address**: `https://files.octo-builders.com` → **Test connection** (it should show the version and `ttd`).
2. **Shares**: key `ttd`, network path `\\192.168.1.100\files submitted (ttd)`, and the drive
   letters the office PCs map it to (`A, Z, W`). With these, the old delivery links from the
   Excel / Access program (`\\192.168.1.100\…`, `Z:\…`, `#file:///…#`) open through the server too.
3. **Who sees what**: *everyone sees the whole share* (like the network drive today), or
   *each employee sees their department's folders*.
4. **Each department's folder**, e.g. Interior Design → `/01 - قسم التصميم الداخلي`. New
   projects get `"<code> - <name>"` inside it, and each task delivers into
   `"<NN - stage>\R-NN"`, the layout the office already uses. A project can point at a different
   folder (project → Settings → *Project folder on the server*).
5. **Task deliveries**: *server files or a link*, or *server files only*.
6. Switch on **Use the company file server** and save.

## What employees get

- **Files** page: browse the share, open / preview, download files and whole folders,
  drag & drop files or folders to upload, new folder, **copy network path** (paste it in File
  Explorer at the office). Managers also get rename and delete.
- **Handing in a task**: *Upload to the task folder* (made automatically) or *Choose on the
  server*. Reviewers, and the customer when the task is marked for them, open exactly the
  delivered files, read-only.
- **Project → Files**: versions are stored in the project's folder on the server, or picked from it.
- **Chat**: attach → *From the company server* sends a link to a file / folder that stays
  on the server. It isn't deleted after 24 hours like uploads.

## Troubleshooting

| what you see | check |
|---|---|
| "Can't reach the office file server" | Is the PC on, is the task running (`octo_files_log.txt`), is the tunnel up (`cloudflared tunnel info octo-files`)? |
| Test connection fails, but `/v1/info` opens in the browser | The site's address is missing from `allowed_origins` (exact, with `https://`, no trailing `/`) |
| "The gateway's connection key doesn't match" | The `secret` in `config.json` isn't the current key (it changes when you press *Replace key*) |
| "Windows refused access" | The account the task runs as has no rights on that folder |
| A share shows a WARNING at start | That PC can't open the network path; try it in File Explorer as the same account |

## Updating

Copy the new `octo_files.py` over the old one and restart the task. `config.json`,
`uploads.json` and the log stay.
