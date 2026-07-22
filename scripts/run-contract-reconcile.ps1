param(
  [string]$ApiBaseUrl = 'http://localhost:3001',
  [string]$EnvFile = (Join-Path $PSScriptRoot '..\apps\api\.env')
)

$envPath = [System.IO.Path]::GetFullPath($EnvFile)
if (-not (Test-Path -LiteralPath $envPath)) {
  throw "File env tidak ditemukan: $envPath"
}

$secretLine = Get-Content -LiteralPath $envPath |
  Where-Object { $_ -match '^CONTRACT_LIFECYCLE_CRON_SECRET=' } |
  Select-Object -First 1

if (-not $secretLine) {
  throw 'CONTRACT_LIFECYCLE_CRON_SECRET belum diisi pada apps/api/.env.'
}

$secret = $secretLine.Substring('CONTRACT_LIFECYCLE_CRON_SECRET='.Length).Trim()
if ([string]::IsNullOrWhiteSpace($secret)) {
  throw 'CONTRACT_LIFECYCLE_CRON_SECRET kosong.'
}

$response = Invoke-RestMethod `
  -Method Post `
  -Uri "$($ApiBaseUrl.TrimEnd('/'))/api/internal/contracts/reconcile" `
  -Headers @{ 'X-Cron-Secret' = $secret } `
  -TimeoutSec 120

$response | ConvertTo-Json -Depth 12
