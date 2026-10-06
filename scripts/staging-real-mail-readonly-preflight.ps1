# Read-only preparation for PR #168. This file has no mail-send operation.
param(
  [switch]$InternalChild,
  [string]$Nonce,
  [int]$MaxPages = 10
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$expectedTo = 'info@e-bluewave.com'
$expectedSubject = 'SES Navigator SMTP Staging Test'
$expectedBody = "SES Navigator Staging環境からのSMTP送信テストです。`n受信確認用のテストメールです。"
$uuid = '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
$Deployment = 'https://ses-navigator-staging-3y5w7tmtx-ebw-s-projects.vercel.app'
$stagingProjectId = 'prj_gpgM7keccxqbJpZssLH5UOBSb0OU'
$stagingOrgId = 'team_Wd9vCeAN0Q0MZCaqKXtVjRRw'
$scriptFilePath = $PSCommandPath

function Assert-ProjectBinding([string]$Root) {
  $file = Join-Path $Root '.vercel/project.json'
  if (-not (Test-Path -LiteralPath $file -PathType Leaf)) { throw '固定Stagingプロジェクトのリンクがありません。' }
  $binding = Get-Content -LiteralPath $file -Raw -Encoding UTF8 | ConvertFrom-Json
  if ($binding.projectId -cne $stagingProjectId -or $binding.orgId -cne $stagingOrgId) {
    throw 'VercelプロジェクトがStagingと一致しません。'
  }
}

function Assert-StagingEnvironment([string]$Url, [string]$Key, [string]$Provider,
    [string]$HostName, [string]$Port, [string]$Secure) {
  $uri = $null
  if (-not [uri]::TryCreate($Url, [uriKind]::Absolute, [ref]$uri) -or
      $uri.Scheme -cne 'https' -or $uri.UserInfo -or $uri.Query -or $uri.Fragment -or
      $uri.AbsolutePath -ne '/' -or $uri.Host -notmatch '^[a-z0-9-]+\.supabase\.co$') {
    throw 'StagingのSupabase URL形式が不正です。'
  }
  if ([string]::IsNullOrWhiteSpace($Key) -or $Provider -cne 'smtp' -or
      $HostName -cne 'mail.e-bluewave.com' -or $Port -cne '587' -or $Secure -cne 'false') {
    throw 'Staging環境の認証またはSMTP設定が期待値と一致しません。'
  }
  return $Url.TrimEnd('/')
}

function Get-ProtectedJson([string]$Path, [string]$AccessToken) {
  # Vercel CLI authenticates the protected deployment; the bearer token is
  # passed only to this local process, never printed or saved to a file.
  $arguments = @('curl', "$Deployment$Path", '--', '--silent', '--fail')
  if ($AccessToken) { $arguments += @('-H', "Authorization: Bearer $AccessToken") }
  $raw = & vercel @arguments 2>$null
  if ($LASTEXITCODE -ne 0) { throw 'Vercel CLIの保護付きGETに失敗しました。ログイン・アクセス権を確認してください。' }
  try { return ($raw | Out-String | ConvertFrom-Json -ErrorAction Stop) }
  catch { throw '保護付きGETがJSONを返しませんでした。Vercel CLIとDeployment Protectionを確認してください。' }
}

function Invoke-ReadOnlyChild([string]$ExpectedNonce, [int]$PageLimit) {
  $root = $env:SESN_STAGING_PREFLIGHT_ROOT
  if (-not $root -or -not $ExpectedNonce -or $ExpectedNonce -cne $env:SESN_STAGING_PREFLIGHT_NONCE) {
    throw 'Stagingの一括起動から実行してください。'
  }
  Assert-ProjectBinding $root
  if (-not (Get-Command vercel -ErrorAction SilentlyContinue)) { throw 'Vercel CLIが必要です。' }
  $supabaseUrl = Assert-StagingEnvironment $env:SUPABASE_URL $env:SUPABASE_ANON_KEY $env:MESSAGE_DELIVERY_PROVIDER $env:SMTP_HOST $env:SMTP_PORT $env:SMTP_SECURE
  $key = $env:SUPABASE_ANON_KEY
  foreach ($name in @('SMTP_PASSWORD', 'SMTP_USERNAME', 'SMTP_SENDER', 'OPENAI_API_KEY',
      'DATABASE_URL', 'POSTGRES_URL', 'SUPABASE_SERVICE_ROLE_KEY')) {
    [Environment]::SetEnvironmentVariable($name, $null, 'Process')
  }
  try {

  $health = Get-ProtectedJson '/health' ''
  if ($health.status -ne 'ok') { throw 'Staging APIのhealthを確認できません。' }
  Write-Host 'Deployment Protection経由のStaging API GET: 成功'

  $email = Read-Host 'Stagingの権限付きユーザーのメールアドレス'
  $securePassword = Read-Host 'Stagingユーザーのパスワード' -AsSecureString
  if (-not $email -or $securePassword.Length -eq 0) { throw '認証情報が不足しています。' }

  $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
  try { $password = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
  $loginBody = @{ email = $email; password = $password } | ConvertTo-Json -Compress
  $password = $null
  try {
    $session = Invoke-RestMethod -Uri "$supabaseUrl/auth/v1/token?grant_type=password" -Method Post -Headers @{ apikey = $key } -ContentType 'application/json' -Body $loginBody
  } catch { throw 'Staging Supabase Authにログインできませんでした。' }
  finally { $loginBody = $null }
  if (-not $session.access_token) { throw 'Auth応答にアクセストークンがありません。' }
  $accessToken = [string]$session.access_token
  $session = $null

  $candidates = @()
  $cursor = $null
  for ($page = 0; $page -lt $MaxPages; $page++) {
    $path = '/api/v1/proposals?limit=200'
    if ($cursor) { $path += '&cursor=' + [uri]::EscapeDataString($cursor) }
    $list = Get-ProtectedJson $path $accessToken
    if (-not $list.items -or $list.items.Count -eq 0) { break }
    foreach ($proposal in $list.items) {
      if ([string]$proposal.id -notmatch $uuid) { throw 'Proposal IDの形式が不正です。' }
      $draft = Get-ProtectedJson "/api/v1/proposals/$($proposal.id)/ai/message-drafts/latest" $accessToken
      if (-not $draft -or $draft.subject -cne $expectedSubject) { continue }
      $recipients = @($draft.recipients)
      if ($draft.proposalId -ne $proposal.id -or [string]$draft.id -notmatch $uuid -or
          $draft.status -ne 'approved' -or -not $draft.approvedVersionId -or
          $draft.bodyText -cne $expectedBody -or $recipients.Count -ne 1 -or
          [string]$recipients[0].address -ine $expectedTo) {
        throw '同名件名のdraftが承認・本文・宛先条件を満たしません。停止しました。'
      }
      $delivery = Get-ProtectedJson "/api/v1/proposals/$($proposal.id)/messages/$($draft.id)/delivery" $accessToken
      $deliveryRecipients = @($delivery.recipients)
      if ($delivery.proposalId -ne $proposal.id -or $delivery.messageId -ne $draft.id -or
          $delivery.status -ne 'approved' -or $delivery.approvedVersionId -ne $draft.approvedVersionId -or
          $deliveryRecipients.Count -ne 1 -or [string]$deliveryRecipients[0].address -ine $expectedTo -or
          @($deliveryRecipients[0].attempts).Count -ne 0) {
        throw 'Deliveryの承認版・宛先・attempt=0を確認できません。停止しました。'
      }
      $candidates += @{ proposalId = $proposal.id; messageId = $draft.id }
    }
    $cursor = $list.page.nextCursor
    if (-not $cursor) { break }
  }
  if ($cursor) { throw '探索上限に達しました。対象を一意に確認できません。' }
  if ($candidates.Count -ne 1) { throw '一致する承認済みメッセージが一意ではありません。' }
  Write-Host 'Staging認証・proposal.read/message.read: 成功'
  Write-Host 'To/Subject/Body/承認版/attempt=0: 完全一致'
  Write-Host "Proposal ID: $($candidates[0].proposalId)"
  Write-Host "Message ID: $($candidates[0].messageId)"
  Write-Host '読み取り専用preflight完了。実メールは送信していません。'
  } finally {
  $accessToken = $null
  $key = $null
  $securePassword = $null
  }
}

function Invoke-Bootstrap([int]$PageLimit) {
  if (-not (Get-Command vercel -ErrorAction SilentlyContinue)) { throw 'Vercel CLIが必要です。' }
  if (-not (Get-Command curl.exe -ErrorAction SilentlyContinue)) { throw 'curl.exeが必要です。' }
  $root = Join-Path ([IO.Path]::GetTempPath()) ('sesn-staging-readonly-' + [guid]::NewGuid().ToString('N'))
  $linkDir = Join-Path $root '.vercel'
  New-Item -ItemType Directory -Path $linkDir -Force | Out-Null
  $env:SESN_STAGING_PREFLIGHT_NONCE = [guid]::NewGuid().ToString('N')
  $env:SESN_STAGING_PREFLIGHT_ROOT = $root
  try {
    @{ projectId = $stagingProjectId; orgId = $stagingOrgId } |
      ConvertTo-Json -Compress | Set-Content -LiteralPath (Join-Path $linkDir 'project.json') -Encoding UTF8
    Assert-ProjectBinding $root
    Push-Location $root
    try {
      & vercel env run -e production -- powershell.exe -NoProfile -ExecutionPolicy Bypass -File $scriptFilePath -InternalChild -Nonce $env:SESN_STAGING_PREFLIGHT_NONCE -MaxPages $PageLimit
      if ($LASTEXITCODE -ne 0) { throw 'Staging読み取り確認を完了できませんでした。' }
    } finally { Pop-Location }
  } finally {
    $env:SESN_STAGING_PREFLIGHT_NONCE = $null
    $env:SESN_STAGING_PREFLIGHT_ROOT = $null
    Remove-Item -LiteralPath $root -Recurse -Force -ErrorAction SilentlyContinue
  }
}

if ($MyInvocation.InvocationName -ne '.') {
  try {
    if ($MaxPages -lt 1 -or $MaxPages -gt 10) { throw '探索上限は1〜10ページです。' }
    if ($InternalChild) { Invoke-ReadOnlyChild $Nonce $MaxPages }
    else { Invoke-Bootstrap $MaxPages }
  } catch {
    # Never print underlying CLI/HTTP exceptions, which may contain tokens.
    [Console]::Error.WriteLine('読み取り専用preflightは安全確認に失敗し停止しました。メールは送信していません。')
    exit 1
  }
}
