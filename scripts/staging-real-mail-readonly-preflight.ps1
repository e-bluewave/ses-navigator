# Read-only preparation for PR #168. This file has no mail-send operation.
param(
  [string]$Deployment = 'https://ses-navigator-staging-green.vercel.app',
  [int]$MaxPages = 10
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$expectedTo = 'info@e-bluewave.com'
$expectedSubject = 'SES Navigator SMTP Staging Test'
$expectedBody = "SES Navigator Staging環境からのSMTP送信テストです。`n受信確認用のテストメールです。"
$uuid = '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'

function Assert-SafeEndpoint([string]$Url) {
  $uri = [uri]$Url
  if ($uri.Scheme -ne 'https' -or $uri.UserInfo -or $uri.Query -or $uri.Fragment) {
    throw 'HTTPSのURLのみ指定してください。'
  }
  return $uri.AbsoluteUri.TrimEnd('/')
}

function Get-ProtectedJson([string]$Path, [string]$AccessToken) {
  # Vercel CLI authenticates the protected deployment; the bearer token is
  # passed only to this local process, never printed or saved to a file.
  $arguments = @('curl', "$Deployment$Path", '--', '--silent', '--show-error')
  if ($AccessToken) { $arguments += @('-H', "Authorization: Bearer $AccessToken") }
  $raw = & vercel @arguments 2>$null
  if ($LASTEXITCODE -ne 0) { throw 'Vercel CLIの保護付きGETに失敗しました。ログイン・アクセス権を確認してください。' }
  try { return ($raw | Out-String | ConvertFrom-Json -ErrorAction Stop) }
  catch { throw '保護付きGETがJSONを返しませんでした。Vercel CLIとDeployment Protectionを確認してください。' }
}

try {
  if ($Deployment -ne 'https://ses-navigator-staging-green.vercel.app' -or $MaxPages -lt 1 -or $MaxPages -gt 10) {
    throw 'Stagingの固定URLと1〜10ページの範囲で実行してください。'
  }
  if (-not (Get-Command vercel -ErrorAction SilentlyContinue)) { throw 'Vercel CLIが必要です。' }
  $supabaseUrl = Assert-SafeEndpoint (Read-Host 'Staging Supabase URL (HTTPS)')
  $key = Read-Host 'Staging Supabase publishable/anon key'
  $email = Read-Host 'Stagingの権限付きユーザーのメールアドレス'
  $securePassword = Read-Host 'Stagingユーザーのパスワード' -AsSecureString
  if (-not $key -or -not $email -or $securePassword.Length -eq 0) { throw '認証情報が不足しています。' }

  $health = Get-ProtectedJson '/health' ''
  if ($health.status -ne 'ok') { throw 'Staging APIのhealthを確認できません。' }
  Write-Host 'Deployment Protection経由のStaging API GET: 成功'

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

  $matches = @()
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
      $matches += @{ proposalId = $proposal.id; messageId = $draft.id }
    }
    $cursor = $list.page.nextCursor
    if (-not $cursor) { break }
  }
  if ($cursor) { throw '探索上限に達しました。対象を一意に確認できません。' }
  if ($matches.Count -ne 1) { throw "一致する承認済みメッセージが一意ではありません（件数: $($matches.Count)）。" }
  Write-Host 'Staging認証・proposal.read/message.read: 成功'
  Write-Host 'To/Subject/Body/承認版/attempt=0: 完全一致'
  Write-Host "Proposal ID: $($matches[0].proposalId)"
  Write-Host "Message ID: $($matches[0].messageId)"
  Write-Host '読み取り専用preflight完了。実メールは送信していません。'
} catch {
  # Never print the original exception: CLI/HTTP errors may contain credentials.
  Write-Error '読み取り専用preflightは安全確認に失敗し停止しました。画面の直前の状態を確認してください。' -ErrorAction Continue
  exit 1
} finally {
  $accessToken = $null
  $key = $null
  $securePassword = $null
}
