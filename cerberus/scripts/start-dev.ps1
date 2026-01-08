$ErrorActionPreference = 'Stop'

# Start Next.js dev server as a detached process and write stdout/stderr to log files
# so we can inspect API route failures.

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$root = Split-Path -Parent $here

$outLog = Join-Path $root 'dev.out.log'
$errLog = Join-Path $root 'dev.err.log'

Remove-Item -Force -ErrorAction SilentlyContinue $outLog
Remove-Item -Force -ErrorAction SilentlyContinue $errLog

$p = Start-Process -FilePath 'npm.cmd' `
    -WorkingDirectory $root `
    -ArgumentList @('run', 'dev') `
    -RedirectStandardOutput $outLog `
    -RedirectStandardError $errLog `
    -PassThru

$p.Id
