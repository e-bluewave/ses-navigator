$ErrorActionPreference = 'Stop'
$preflight = Join-Path $PSScriptRoot 'staging-real-mail-readonly-preflight.ps1'
$tokens = $null
$errors = $null
[System.Management.Automation.Language.Parser]::ParseFile($preflight, [ref]$tokens, [ref]$errors) | Out-Null
if ($errors.Count -ne 0) { throw 'PowerShell parser rejected the preflight script.' }
. $preflight

function Assert-Throws([scriptblock]$Action) {
  $threw = $false
  try { & $Action | Out-Null } catch { $threw = $true }
  if (-not $threw) { throw 'Expected the staging guard to stop.' }
}

$root = Join-Path ([IO.Path]::GetTempPath()) ('sesn-readonly-test-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path (Join-Path $root '.vercel') -Force | Out-Null
try {
  @{ projectId = $stagingProjectId; orgId = $stagingOrgId } | ConvertTo-Json |
    Set-Content -LiteralPath (Join-Path $root '.vercel/project.json') -Encoding UTF8
  Assert-ProjectBinding $root
  Assert-Throws { $bad = @{ projectId = 'prj_wrong'; orgId = $stagingOrgId } | ConvertTo-Json; $bad | Set-Content -LiteralPath (Join-Path $root '.vercel/project.json') -Encoding UTF8; Assert-ProjectBinding $root }
  @{ projectId = $stagingProjectId; orgId = $stagingOrgId } | ConvertTo-Json |
    Set-Content -LiteralPath (Join-Path $root '.vercel/project.json') -Encoding UTF8

  $valid = @('https://staging-example.supabase.co', 'test-publishable', 'smtp', 'mail.e-bluewave.com', '587', 'false')
  if ((Assert-StagingEnvironment @valid) -cne $valid[0]) { throw 'Staging URL validation failed.' }
  Assert-Throws { Assert-StagingEnvironment 'http://localhost:54321' $valid[1] $valid[2] $valid[3] $valid[4] $valid[5] }
  Assert-Throws { Assert-StagingEnvironment $valid[0] $valid[1] 'fake' $valid[3] $valid[4] $valid[5] }
  Assert-Throws { Assert-StagingEnvironment $valid[0] $valid[1] $valid[2] $valid[3] '55321' $valid[5] }

  $env:SESN_STAGING_PREFLIGHT_ROOT = $root
  $env:SESN_STAGING_PREFLIGHT_NONCE = 'test-nonce'
  $env:SUPABASE_URL = $valid[0]
  $env:SUPABASE_ANON_KEY = $valid[1]
  $env:MESSAGE_DELIVERY_PROVIDER = $valid[2]
  $env:SMTP_HOST = $valid[3]
  $env:SMTP_PORT = $valid[4]
  $env:SMTP_SECURE = $valid[5]
  $env:SMTP_PASSWORD = 'synthetic-value-never-output'
  $proposalId = '11111111-1111-4111-8111-111111111111'
  $messageId = '22222222-2222-4222-8222-222222222222'
  $script:mode = 'valid'
  $script:requests = @()
  $script:bootstrapMode = $false
  $script:bootstrapVerified = $false

  function vercel {
    if ($script:bootstrapMode) {
      Write-Host "Bootstrap synthetic argv: first5=$($args[0..4] -join ',') child=$($args -contains '-InternalChild') file=$($args -contains '-File') count=$($args.Count)"
      if (($args[0..4] -join ' ') -cne 'env run -e production --' -or
          -not ($args -contains '-InternalChild') -or -not ($args -contains '-File')) {
        throw 'Bootstrap selected the wrong Vercel target or child command.'
      }
      Assert-ProjectBinding (Get-Location).Path
      $fileIndex = [array]::IndexOf($args, '-File')
      if ([string]$args[$fileIndex + 1] -cne $preflight) { throw 'Bootstrap did not execute the pinned script.' }
      $script:bootstrapVerified = $true
      $global:LASTEXITCODE = 0
      return
    }
    if ($args[0] -cne 'curl' -or ($args -join ' ') -match '(^| )(-X|--request|-d|--data)( |$)') {
      throw 'A non-GET API operation was attempted.'
    }
    $script:requests += [string]$args[1]
    $global:LASTEXITCODE = 0
    $url = [string]$args[1]
    if ($url.EndsWith('/health')) { return '{"status":"ok"}' }
    if ($url.Contains('/ai/message-drafts/latest')) {
      return (@{ id = $messageId; proposalId = $proposalId; status = 'approved'; approvedVersionId = 'v1'; subject = $expectedSubject; bodyText = $(if ($script:mode -eq 'wrong-body') { 'wrong' } else { $expectedBody }); recipients = @(@{ address = $expectedTo }) } | ConvertTo-Json -Depth 8 -Compress)
    }
    if ($url.EndsWith('/delivery')) {
      $attemptsJson = if ($script:mode -eq 'attempted') { '[{"status":"accepted"}]' } else { '[]' }
      return ('{"proposalId":"' + $proposalId + '","messageId":"' + $messageId + '","status":"approved","approvedVersionId":"v1","recipients":[{"address":"' + $expectedTo + '","attempts":' + $attemptsJson + '}]}')
    }
    if ($url.Contains('/api/v1/proposals?')) {
      return (@{ items = @(@{ id = $proposalId }); page = @{ nextCursor = $null } } | ConvertTo-Json -Depth 8 -Compress)
    }
    throw 'Unknown API path.'
  }
  function Read-Host {
    param([string]$Prompt, [switch]$AsSecureString)
    if ($AsSecureString) { return (ConvertTo-SecureString 'synthetic-password' -AsPlainText -Force) }
    return 'staging-test@example.invalid'
  }
  function Invoke-RestMethod {
    param([string]$Uri, [string]$Method, $Headers, [string]$ContentType, [string]$Body)
    if ($Uri -cne 'https://staging-example.supabase.co/auth/v1/token?grant_type=password' -or $Method -cne 'Post') {
      throw 'Unexpected auth operation.'
    }
    return @{ access_token = 'synthetic-token' }
  }

  Assert-Throws { Invoke-ReadOnlyChild 'incorrect-nonce' 1 }
  Invoke-ReadOnlyChild 'test-nonce' 1 | Out-Null
  if ($script:requests.Count -ne 4) { throw 'Unexpected number of read-only GET requests.' }
  if ($script:requests[-1] -notmatch [regex]::Escape($messageId)) { throw 'Valid read-only candidate was not identified.' }
  if ($env:SMTP_PASSWORD) { throw 'Unrelated secret remained in the child process.' }
  $script:mode = 'attempted'
  Assert-Throws { Invoke-ReadOnlyChild 'test-nonce' 1 }
  $script:mode = 'wrong-body'
  Assert-Throws { Invoke-ReadOnlyChild 'test-nonce' 1 }
  $script:bootstrapMode = $true
  Invoke-Bootstrap 1
  if (-not $script:bootstrapVerified) { throw 'Bootstrap was not exercised.' }
  Write-Host 'Windows PowerShell read-only preflight tests passed.'
} finally {
  Remove-Item -LiteralPath $root -Recurse -Force -ErrorAction SilentlyContinue
  foreach ($name in @('SESN_STAGING_PREFLIGHT_ROOT', 'SESN_STAGING_PREFLIGHT_NONCE', 'SUPABASE_URL',
      'SUPABASE_ANON_KEY', 'MESSAGE_DELIVERY_PROVIDER', 'SMTP_HOST', 'SMTP_PORT', 'SMTP_SECURE', 'SMTP_PASSWORD')) {
    [Environment]::SetEnvironmentVariable($name, $null, 'Process')
  }
}
