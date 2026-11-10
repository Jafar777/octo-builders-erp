# Importing the old Excel / Access program

Moves the data of the old program into the system:

| Old (Access / Excel)                                   | New                                                        |
| ------------------------------------------------------ | ---------------------------------------------------------- |
| `Tasks-Database` → **Tasks Records**                   | tasks (R-00, R-01… revisions chained, help, meetings)      |
| `Tasks-Database` → **Project_Status_Registry**         | projects and their stages, "Skip" / manual "Done" cells, redos the board was still waiting for (R+1, with the planned dates and hours) |
| `Octo_Attendance` → **RawLogs**                        | fingerprint punches                                        |
| `Octo_Attendance` → **tbl_ManualOverrides**            | HR attendance corrections                                  |
| `Octo_Attendance` → **tbl_KPI_Archive**                | KPI of the months the Excel scored (kept as those months' official KPI) |
| `OCTO_TTD_System.xlsb` → **Hidden Data**               | each person's fingerprint ID (passwords / salaries are not read) |

`qry_DailyAttendance` is not imported: the system works the days out from the punches.

## 1. Export (Windows, needs Office / the Access Database Engine)

```
powershell -ExecutionPolicy Bypass -File scripts\legacy\export-access.ps1
```

Writes `scripts/legacy/data/*.json` (git-ignored: personal data). Other file locations:
`-Attendance <path> -Tasks <path> -Workbook <path>`.

## 2. Dry run

```
npm run legacy:import
```

Reads the database and prints what it would do, without writing:

- **People**: each name from the old files and the account it goes to. Names are matched
  on the Arabic name (spelling variants and 4-part names too), then the fingerprint ID.
  People with no account get an **inactive** account (`…@octo-builders.invalid`) so their
  history is kept. HR can complete it and activate it.
  If a name goes to the wrong account, or matches several, write
  `scripts/legacy/people.json`:
  ```json
  { "غزل الصالح": "ghazal@example.com" }
  ```
- **Projects**: new, or existing ones (same name) that only get missing stages.
- **Warnings**: e.g. fingerprint IDs with no person (their punches are imported anyway; set
  the ID on the right person in Staff and their attendance shows).

The full plan is saved in `scripts/legacy/data/plan.json`.

## 3. Import

```
npm run legacy:import -- --apply
```

Options: `--actor=<email>` (who the records are "by"; default the CEO), `--renumber`
(when the old task numbers are already used here), `--no-create` (no inactive accounts),
`--kpi-include-current` (also the Excel KPI of the running month).

Running it again only adds what is missing: tasks are recognised by their old ID,
punches and HR corrections by person + time / day (corrections made in the new system
win), and a month closed in the new system keeps its KPI.

Restart `next dev` afterwards (the models got a `legacy` field).

## Undo

```
npm run legacy:import -- --undo
```

Removes the imported tasks, projects, punches, corrections, KPI results and inactive
accounts. Stages added to projects that already existed and fingerprint IDs set on
accounts are left.

## How the old data maps

- **Status**: Head Status *Approved* → approved, *Reject* → rejected, *Pending* → waiting
  for review, Employee Status *On Going* / *ON Hold* / *Cancelled* / *End Meeting* →
  in progress / paused / cancelled / done. *End Help* / *Helping* become help tasks.
- **Times**: start, expected delivery, finish, total and hold time are kept. The review
  time is the Excel's review stamp (or finish + "المدة الزمنية بين الامرين"). The old
  program recorded no reviewer, so the department's head is the reviewer (D-Head for
  interior design and developers, T-Head for the technical office).
- **Rating** (`تقييم رئيس القسم`) → the rating tag of the same name (Settings → Tasks).
  *خطأ من الإدارة* rejections count as management's, every other rejection as the employee's.
- **Stages**: interior design: CAD / MAX / Test / Final render / Shop drawing, with the room
  (BF-02-GAMESAREA…) as the task's name. Developers: their 8 stages. Technical office:
  ShopDrawings, with the drawing (AR-632…) as the task's name. A project's work from
  another department gets that department's stage (e.g. `to_shop_drawings`). Imported
  projects have no stage order (`flow: random`).
- **Times are office time** (Settings → HR time zone, Asia/Damascus).
