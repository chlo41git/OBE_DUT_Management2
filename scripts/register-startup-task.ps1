<#
  Registers the Task Scheduler task that runs scripts\obe-startup.ps1 (docs\DEPLOYMENT.md step 8).
  Run it in PowerShell as administrator, signed in as the account that runs PM2 (the one that did `pm2 save`).

    -Mode Logon    run when this account logs on. No password needed; pair it with Windows
                   auto-logon so a reboot still brings the system up without anyone typing.
    -Mode Startup  run at boot whether or not anyone logs on. The account MUST have a password
                   (Task Scheduler stores it); you will be prompted for it.

  Examples:
    powershell -ExecutionPolicy Bypass -File .\scripts\register-startup-task.ps1 -Mode Logon
    powershell -ExecutionPolicy Bypass -File .\scripts\register-startup-task.ps1 -Mode Startup

  Re-running replaces the task. Remove it with:
    Unregister-ScheduledTask -TaskName 'OBE DUT - Startup' -Confirm:$false
#>
param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('Logon', 'Startup')]
  [string]$Mode,
  [string]$TaskName = 'OBE DUT - Startup'
)

$ErrorActionPreference = 'Stop'
$Root   = Split-Path -Parent $PSScriptRoot
$Script = Join-Path $PSScriptRoot 'obe-startup.ps1'
if (-not (Test-Path $Script)) { throw "Not found: $Script" }
$Me = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name

# Same task name, or the older manual task from DEPLOYMENT.md: remove so PM2 is not restored twice
foreach ($old in @($TaskName, 'OBE DUT - PM2 resurrect')) {
  if (Get-ScheduledTask -TaskName $old -ErrorAction SilentlyContinue) {
    Unregister-ScheduledTask -TaskName $old -Confirm:$false
    Write-Host "Removed existing task '$old'"
  }
}

$action = New-ScheduledTaskAction -Execute 'powershell.exe' `
  -Argument "-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$Script`"" `
  -WorkingDirectory $Root
# No time limit: never let Task Scheduler stop the task (and with it PM2) after 3 days
$settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) `
  -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -MultipleInstances IgnoreNew

# RunLevel Limited: PM2 must run with the same rights as the terminal you use for `pm2 status`,
# otherwise that terminal cannot reach the daemon (connect EPERM \\.\pipe\rpc.sock).
if ($Mode -eq 'Logon') {
  $trigger = New-ScheduledTaskTrigger -AtLogOn -User $Me
  $trigger.Delay = 'PT30S'
  $principal = New-ScheduledTaskPrincipal -UserId $Me -LogonType Interactive -RunLevel Limited
  Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger `
    -Settings $settings -Principal $principal | Out-Null
} else {
  $trigger = New-ScheduledTaskTrigger -AtStartup
  $trigger.Delay = 'PT1M'
  $cred = Get-Credential -UserName $Me -Message 'Windows password of this account (stored by Task Scheduler)'
  Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings `
    -User $cred.UserName -Password $cred.GetNetworkCredential().Password -RunLevel Limited | Out-Null
}

Write-Host ""
Write-Host "Registered task '$TaskName' (Mode $Mode) for $Me"
Write-Host "Script : $Script"
Write-Host "Log    : $(Join-Path $Root 'logs\obe-startup.log')"
Write-Host "Test   : Start-ScheduledTask -TaskName '$TaskName'"
