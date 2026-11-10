# Step 1 of the legacy import: reads the old Access databases (and the employee sheet of
# the old Excel program) and writes every table as JSON into scripts/legacy/data/.
# Needs the Microsoft Access Database Engine (ACE OLEDB), which comes with Office.
#
#   powershell -ExecutionPolicy Bypass -File scripts\legacy\export-access.ps1
#
# The files hold personal data: data/ is git-ignored.
param(
  [string]$Attendance = "$PSScriptRoot\..\..\olddatabase\Octo_Attendance (1).accdb",
  [string]$Tasks = "$PSScriptRoot\..\..\olddatabase\Tasks-Database (1).accdb",
  [string]$Workbook = "$PSScriptRoot\..\..\picturesForPlan\OCTO_TTD_System.xlsb",
  [string]$Out = "$PSScriptRoot\data"
)
$ErrorActionPreference = "Stop"
New-Item -ItemType Directory -Force $Out | Out-Null
$provider = if ((New-Object System.Data.OleDb.OleDbEnumerator).GetElements() | Where-Object { $_.SOURCES_NAME -eq "Microsoft.ACE.OLEDB.16.0" }) { "Microsoft.ACE.OLEDB.16.0" } else { "Microsoft.ACE.OLEDB.12.0" }

function Convert-Rows($table) {
  foreach ($r in $table.Rows) {
    $o = [ordered]@{}
    foreach ($col in $table.Columns) {
      $v = $r[$col.ColumnName]
      if ($v -is [DBNull]) { $v = $null }
      # Access keeps local (office) time without a zone: written as is, the importer adds the zone.
      elseif ($v -is [DateTime]) { $v = $v.ToString("yyyy-MM-ddTHH:mm:ss") }
      elseif ($v -is [byte[]]) { $v = $null }
      $o[$col.ColumnName] = $v
    }
    [pscustomobject]$o
  }
}

function Write-Json($rows, $file) {
  $json = if (@($rows).Count) { ConvertTo-Json -InputObject @($rows) -Depth 3 -Compress } else { "[]" }
  [System.IO.File]::WriteAllText($file, $json, (New-Object System.Text.UTF8Encoding($false)))
}

foreach ($db in @(@{ name = "attendance"; path = $Attendance }, @{ name = "tasks"; path = $Tasks })) {
  $full = (Resolve-Path $db.path).Path
  $c = New-Object System.Data.OleDb.OleDbConnection("Provider=$provider;Data Source=$full;Mode=Read")
  $c.Open()
  foreach ($t in ($c.GetSchema("Tables") | Where-Object { $_.TABLE_TYPE -eq "TABLE" })) {
    $n = $t.TABLE_NAME
    $dt = New-Object System.Data.DataTable
    [void](New-Object System.Data.OleDb.OleDbDataAdapter("SELECT * FROM [$n]", $c)).Fill($dt)
    $file = Join-Path $Out ("$($db.name).$($n -replace '[^\w]', '_').json")
    Write-Json (Convert-Rows $dt) $file
    "{0,-45} {1,6} rows" -f "$($db.name).$n", $dt.Rows.Count
  }
  $c.Close()
}

# The employee list of the Excel program ("Hidden Data"): name, role, fingerprint ID
# (ZK-ID) and contract dates. Passwords and salaries are NOT exported.
if (Test-Path $Workbook) {
  $full = (Resolve-Path $Workbook).Path
  $c = New-Object System.Data.OleDb.OleDbConnection("Provider=$provider;Data Source=$full;Extended Properties=`"Excel 12.0;HDR=YES;IMEX=1`"")
  $c.Open()
  $dt = New-Object System.Data.DataTable
  [void](New-Object System.Data.OleDb.OleDbDataAdapter("SELECT * FROM [Hidden Data$]", $c)).Fill($dt)
  $c.Close()
  $people = foreach ($r in $dt.Rows) {
    if ($r["Employee"] -is [DBNull] -or "$($r["Employee"])".Trim() -eq "") { continue }
    $get = { param($k) if ($dt.Columns.Contains($k) -and -not ($r[$k] -is [DBNull])) { "$($r[$k])".Trim() } else { "" } }
    [pscustomobject][ordered]@{
      name = & $get "Employee"; role = & $get "Role"; badgeId = & $get "ZK-ID"
      dailyHours = & $get "W-Hours"; annualLeave = & $get "Annual_Leave"
      contractStart = & $get "Start_Date"; contractEnd = & $get "End_Date"; kpiExcluded = (& $get "Exclusion") -eq "Yes"
    }
  }
  Write-Json $people (Join-Path $Out "workbook.employees.json")
  "{0,-45} {1,6} rows" -f "workbook.employees", @($people).Count
} else {
  "Workbook not found ($Workbook): fingerprint IDs must then be set by hand in Staff."
}
