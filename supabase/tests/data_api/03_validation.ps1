# SES Navigator Data API validation
# Target: e-bluewave/ses-navigator, branch ddl-initial, migrations 001-117
#
# Validates the six limited public views through the real Supabase Data API.
# Secrets are read interactively, kept only in process memory, and never
# included in the result. Business-data requests are GET-only; password mode
# uses the Auth token endpoint solely to obtain each user's short-lived JWT.

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$ProjectRef = "zsgauwmkvvezdxvmcmdf"
$SupabaseUrl = "https://$ProjectRef.supabase.co"

Add-Type -AssemblyName System.Net.Http
$HttpClient = [System.Net.Http.HttpClient]::new()
$HttpClient.Timeout = [TimeSpan]::FromSeconds(30)

function ConvertFrom-SecureText {
    param(
        [Parameter(Mandatory = $true)]
        [Security.SecureString]$SecureValue
    )

    $Pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($SecureValue)
    try {
        return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($Pointer)
    }
    finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($Pointer)
    }
}

function Invoke-SesnHttp {
    param(
        [Parameter(Mandatory = $true)]
        [ValidateSet("GET", "POST")]
        [string]$Method,

        [Parameter(Mandatory = $true)]
        [string]$Uri,

        [Parameter(Mandatory = $true)]
        [hashtable]$Headers,

        [AllowNull()]
        [object]$Body
    )

    $HttpMethod = [System.Net.Http.HttpMethod]::new($Method)
    $Request = [System.Net.Http.HttpRequestMessage]::new(
        $HttpMethod,
        $Uri
    )

    try {
        foreach ($HeaderName in $Headers.Keys) {
            [void]$Request.Headers.TryAddWithoutValidation(
                $HeaderName,
                [string]$Headers[$HeaderName]
            )
        }

        if ($null -ne $Body) {
            $JsonBody = $Body | ConvertTo-Json -Compress -Depth 10
            $Request.Content = [System.Net.Http.StringContent]::new(
                $JsonBody,
                [Text.Encoding]::UTF8,
                "application/json"
            )
        }

        $Response = $HttpClient.SendAsync($Request).GetAwaiter().GetResult()
        try {
            $ResponseText =
                $Response.Content.ReadAsStringAsync().GetAwaiter().GetResult()

            return [pscustomobject]@{
                StatusCode = [int]$Response.StatusCode
                Content = $ResponseText
            }
        }
        finally {
            $Response.Dispose()
        }
    }
    finally {
        $Request.Dispose()
    }
}

function Get-PasswordSession {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Label,

        [Parameter(Mandatory = $true)]
        [string]$ApiKey
    )

    $Email = (Read-Host "$Label email").Trim().ToLowerInvariant()
    $SecurePassword = Read-Host "$Label password" -AsSecureString
    $Password = ConvertFrom-SecureText -SecureValue $SecurePassword

    try {
        $Response = Invoke-SesnHttp `
            -Method "POST" `
            -Uri "$SupabaseUrl/auth/v1/token?grant_type=password" `
            -Headers @{
                apikey = $ApiKey
                Accept = "application/json"
            } `
            -Body @{
                email = $Email
                password = $Password
            }

        if ($Response.StatusCode -ne 200) {
            throw "$Label sign-in failed (HTTP $($Response.StatusCode))."
        }

        $Payload = $Response.Content | ConvertFrom-Json
        if ([string]::IsNullOrWhiteSpace([string]$Payload.access_token) -or
            [string]::IsNullOrWhiteSpace([string]$Payload.user.id)) {
            throw "$Label sign-in returned an incomplete session."
        }

        return [pscustomobject]@{
            AccessToken = [string]$Payload.access_token
            UserId = [string]$Payload.user.id
        }
    }
    finally {
        $Password = $null
        $SecurePassword = $null
        $Email = $null
    }
}

function Get-JwtSession {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Label,

        [Parameter(Mandatory = $true)]
        [string]$ApiKey
    )

    $SecureJwt = Read-Host "$Label access token (JWT)" -AsSecureString
    $Jwt = ConvertFrom-SecureText -SecureValue $SecureJwt

    try {
        $Response = Invoke-SesnHttp `
            -Method "GET" `
            -Uri "$SupabaseUrl/auth/v1/user" `
            -Headers @{
                apikey = $ApiKey
                Authorization = "Bearer $Jwt"
                Accept = "application/json"
            } `
            -Body $null

        if ($Response.StatusCode -ne 200) {
            throw "$Label JWT validation failed (HTTP $($Response.StatusCode))."
        }

        $Payload = $Response.Content | ConvertFrom-Json
        if ([string]::IsNullOrWhiteSpace([string]$Payload.id)) {
            throw "$Label JWT validation did not return a user."
        }

        return [pscustomobject]@{
            AccessToken = $Jwt
            UserId = [string]$Payload.id
        }
    }
    finally {
        $Jwt = $null
        $SecureJwt = $null
    }
}

function Invoke-ViewRead {
    param(
        [Parameter(Mandatory = $true)]
        [string]$ViewName,

        [Parameter(Mandatory = $true)]
        [string]$ApiKey,

        [AllowNull()]
        [string]$AccessToken
    )

    $Headers = @{
        apikey = $ApiKey
        Accept = "application/json"
        "Cache-Control" = "no-store"
    }

    if (-not [string]::IsNullOrWhiteSpace($AccessToken)) {
        $Headers.Authorization = "Bearer $AccessToken"
    }

    return Invoke-SesnHttp `
        -Method "GET" `
        -Uri "$SupabaseUrl/rest/v1/$ViewName`?select=*" `
        -Headers $Headers `
        -Body $null
}

function ConvertTo-RowArray {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Json
    )

    if ([string]::IsNullOrWhiteSpace($Json)) {
        return @()
    }

    $Parsed = $Json | ConvertFrom-Json
    if ($null -eq $Parsed) {
        return @()
    }

    return @($Parsed)
}

function Test-ColumnSet {
    param(
        [Parameter(Mandatory = $true)]
        [object]$Row,

        [Parameter(Mandatory = $true)]
        [string[]]$ExpectedColumns
    )

    $ActualColumns = @(
        $Row.PSObject.Properties.Name | Sort-Object
    )
    $ExpectedSorted = @($ExpectedColumns | Sort-Object)
    $Difference = @(
        Compare-Object `
            -ReferenceObject $ExpectedSorted `
            -DifferenceObject $ActualColumns
    )

    return $Difference.Count -eq 0
}

$ViewSpecs = @(
    [pscustomobject]@{
        Name = "engineer_private_summaries"
        IdColumn = "engineer_id"
        TenantAId = "7a220000-0000-4000-8000-000000000001"
        TenantBId = "7a220000-0000-4000-8000-000000000002"
        Columns = @(
            "engineer_id", "birth_date", "gender", "prefecture", "city",
            "updated_at"
        )
    },
    [pscustomobject]@{
        Name = "contract_summaries"
        IdColumn = "id"
        TenantAId = "7a310000-0000-4000-8000-000000000001"
        TenantBId = "7a310000-0000-4000-8000-000000000002"
        Columns = @(
            "id", "contract_no", "project_id", "proposal_id", "engineer_id",
            "contract_type", "status", "title", "start_date", "end_date",
            "auto_renew", "currency", "updated_at", "row_version"
        )
    },
    [pscustomobject]@{
        Name = "finance_invoice_summaries"
        IdColumn = "id"
        TenantAId = "7a420000-0000-4000-8000-000000000001"
        TenantBId = "7a420000-0000-4000-8000-000000000002"
        Columns = @(
            "id", "invoice_no", "invoice_type", "contract_id",
            "billing_company_id", "billing_period_start",
            "billing_period_end", "issue_date", "due_date", "status",
            "currency", "subtotal", "tax_amount", "total_amount",
            "paid_amount", "sent_at", "updated_at", "row_version"
        )
    },
    [pscustomobject]@{
        Name = "finance_expense_summaries"
        IdColumn = "id"
        TenantAId = "7a450000-0000-4000-8000-000000000001"
        TenantBId = "7a450000-0000-4000-8000-000000000002"
        Columns = @(
            "id", "contract_id", "work_log_id", "engineer_id",
            "expense_date", "expense_type", "description", "amount",
            "tax_amount", "currency", "status", "billable", "invoice_id",
            "approved_at", "updated_at", "row_version"
        )
    },
    [pscustomobject]@{
        Name = "ai_execution_summaries"
        IdColumn = "id"
        TenantAId = "7a510000-0000-4000-8000-000000000001"
        TenantBId = "7a510000-0000-4000-8000-000000000002"
        Columns = @(
            "id", "job_id", "execution_type", "provider", "model_name",
            "prompt_version", "status", "requested_by", "requested_at",
            "started_at", "completed_at", "input_tokens", "output_tokens",
            "estimated_cost", "currency", "error_code", "created_at",
            "updated_at", "row_version"
        )
    },
    [pscustomobject]@{
        Name = "audit_event_summaries"
        IdColumn = "id"
        TenantAId = "7a610000-0000-4000-8000-000000000001"
        TenantBId = "7a610000-0000-4000-8000-000000000002"
        Columns = @(
            "id", "occurred_at", "actor_user_id", "actor_type", "action",
            "resource_type", "resource_id", "request_id", "created_at"
        )
    }
)

$ResultDetails = [Collections.Generic.List[object]]::new()
$ApiKey = $null
$UserASession = $null
$UserBSession = $null

try {
    $SecureApiKey = Read-Host `
        "Supabase publishable key or legacy anon key" `
        -AsSecureString
    $ApiKey = ConvertFrom-SecureText -SecureValue $SecureApiKey
    $SecureApiKey = $null

    $AuthMode = (Read-Host `
        "Authentication mode: password or jwt [password]").Trim().ToLower()
    if ([string]::IsNullOrWhiteSpace($AuthMode)) {
        $AuthMode = "password"
    }

    if ($AuthMode -eq "password") {
        $UserASession = Get-PasswordSession -Label "User A" -ApiKey $ApiKey
        $UserBSession = Get-PasswordSession -Label "User B" -ApiKey $ApiKey
    }
    elseif ($AuthMode -eq "jwt") {
        $UserASession = Get-JwtSession -Label "User A" -ApiKey $ApiKey
        $UserBSession = Get-JwtSession -Label "User B" -ApiKey $ApiKey
    }
    else {
        throw "Authentication mode must be password or jwt."
    }

    if ($UserASession.UserId -eq $UserBSession.UserId) {
        throw "User A and User B resolved to the same Auth user."
    }

    foreach ($Spec in $ViewSpecs) {
        $AnonResponse = Invoke-ViewRead `
            -ViewName $Spec.Name `
            -ApiKey $ApiKey `
            -AccessToken $null

        $AnonPassed = $AnonResponse.StatusCode -eq 401
        $ResultDetails.Add([pscustomobject][ordered]@{
            actor = "anon"
            view = $Spec.Name
            http_status = $AnonResponse.StatusCode
            row_count = $null
            expected = "HTTP 401"
            tenant_boundary = "not_applicable"
            columns = "not_applicable"
            result = $(if ($AnonPassed) { "PASS" } else { "FAIL" })
        })

        $UserAResponse = Invoke-ViewRead `
            -ViewName $Spec.Name `
            -ApiKey $ApiKey `
            -AccessToken $UserASession.AccessToken

        $UserARows = @()
        $UserAJsonValid = $false
        if ($UserAResponse.StatusCode -eq 200) {
            try {
                $UserARows = @(
                    ConvertTo-RowArray -Json $UserAResponse.Content
                )
                $UserAJsonValid = $true
            }
            catch {
                $UserARows = @()
            }
        }

        $TenantASeen = $false
        $TenantBSeen = $false
        $ColumnsPassed = $false

        if ($UserAJsonValid) {
            foreach ($Row in $UserARows) {
                $RowId = [string]$Row.($Spec.IdColumn)
                if ($RowId -eq $Spec.TenantAId) {
                    $TenantASeen = $true
                }
                if ($RowId -eq $Spec.TenantBId) {
                    $TenantBSeen = $true
                }
            }

            if ($UserARows.Count -eq 1) {
                $ColumnsPassed = Test-ColumnSet `
                    -Row $UserARows[0] `
                    -ExpectedColumns $Spec.Columns
            }
        }

        $UserAPassed = (
            $UserAResponse.StatusCode -eq 200 -and
            $UserAJsonValid -and
            $UserARows.Count -eq 1 -and
            $TenantASeen -and
            -not $TenantBSeen -and
            $ColumnsPassed
        )

        $ResultDetails.Add([pscustomobject][ordered]@{
            actor = "user_a"
            view = $Spec.Name
            http_status = $UserAResponse.StatusCode
            row_count = $UserARows.Count
            expected = "HTTP 200, rows 1"
            tenant_boundary = $(
                if ($TenantASeen -and -not $TenantBSeen) {
                    "PASS"
                }
                else {
                    "FAIL"
                }
            )
            columns = $(if ($ColumnsPassed) { "PASS" } else { "FAIL" })
            result = $(if ($UserAPassed) { "PASS" } else { "FAIL" })
        })

        $UserBResponse = Invoke-ViewRead `
            -ViewName $Spec.Name `
            -ApiKey $ApiKey `
            -AccessToken $UserBSession.AccessToken

        $UserBRows = @()
        $UserBJsonValid = $false
        if ($UserBResponse.StatusCode -eq 200) {
            try {
                $UserBRows = @(
                    ConvertTo-RowArray -Json $UserBResponse.Content
                )
                $UserBJsonValid = $true
            }
            catch {
                $UserBRows = @()
            }
        }

        $UserBPassed = (
            $UserBResponse.StatusCode -eq 200 -and
            $UserBJsonValid -and
            $UserBRows.Count -eq 0
        )

        $ResultDetails.Add([pscustomobject][ordered]@{
            actor = "user_b"
            view = $Spec.Name
            http_status = $UserBResponse.StatusCode
            row_count = $UserBRows.Count
            expected = "HTTP 200, rows 0"
            tenant_boundary = $(if ($UserBRows.Count -eq 0) {
                "PASS"
            } else {
                "FAIL"
            })
            columns = "not_applicable"
            result = $(if ($UserBPassed) { "PASS" } else { "FAIL" })
        })
    }

    $PassedCount = @(
        $ResultDetails | Where-Object result -eq "PASS"
    ).Count
    $FailedChecks = @(
        $ResultDetails |
            Where-Object result -eq "FAIL" |
            Select-Object actor, view, http_status, row_count,
                expected, tenant_boundary, columns
    )

    $ByActor = [ordered]@{}
    foreach ($Actor in @("anon", "user_a", "user_b")) {
        $ActorChecks = @($ResultDetails | Where-Object actor -eq $Actor)
        $ByActor[$Actor] = [ordered]@{
            passed = @($ActorChecks | Where-Object result -eq "PASS").Count
            total = $ActorChecks.Count
        }
    }

    $Summary = [ordered]@{
        status = $(if ($FailedChecks.Count -eq 0) {
            "VALIDATION_PASSED"
        } else {
            "VALIDATION_FAILED"
        })
        read_only = $true
        service_role_tested = $false
        rpc_tested = $false
        total_checks = $ResultDetails.Count
        passed = $PassedCount
        failed = $FailedChecks.Count
        by_actor = $ByActor
        failures = $FailedChecks
        checks = @($ResultDetails)
    }

    $Summary | ConvertTo-Json -Depth 8
}
finally {
    if ($null -ne $UserASession) {
        $UserASession.AccessToken = $null
    }
    if ($null -ne $UserBSession) {
        $UserBSession.AccessToken = $null
    }
    $ApiKey = $null
    $HttpClient.Dispose()
}
