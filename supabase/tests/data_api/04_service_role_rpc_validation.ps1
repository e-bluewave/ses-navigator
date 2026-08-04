# SES Navigator service_role and limited RPC validation
# Target: e-bluewave/ses-navigator, branch ddl-initial, migrations 001-117
#
# Stage 1 proves that service_role cannot read the six user-facing views.
# Stage 2 validates the allow-listed service_get_sensitive_record RPC.
# Secrets are read interactively, kept only in process memory, and never
# included in the JSON result. The RPC is STABLE and this script creates,
# updates, or deletes no database data.

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$ProjectRef = "zsgauwmkvvezdxvmcmdf"
$SupabaseUrl = "https://$ProjectRef.supabase.co"
$TenantAId = "7a110000-0000-4000-8000-000000000001"
$TenantBId = "7a110000-0000-4000-8000-000000000002"
$MissingResourceId = "7affffff-ffff-4fff-8fff-ffffffffffff"

Add-Type -AssemblyName System.Net.Http
$HttpClient = [System.Net.Http.HttpClient]::new()
$HttpClient.Timeout = [TimeSpan]::FromSeconds(30)
$HttpClient.DefaultRequestHeaders.UserAgent.ParseAdd(
    "SESN-Data-API-Validation/1.0"
)

function ConvertFrom-SecureText {
    param(
        [Parameter(Mandatory = $true)]
        [Security.SecureString]$SecureValue
    )

    $Pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR(
        $SecureValue
    )
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
    $Request = [System.Net.Http.HttpRequestMessage]::new($HttpMethod, $Uri)

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

function Get-ServiceHeaders {
    param(
        [Parameter(Mandatory = $true)]
        [string]$ServiceKey
    )

    $Headers = @{
        apikey = $ServiceKey
        Accept = "application/json"
        "Cache-Control" = "no-store"
    }

    # Opaque sb_secret keys are translated by the Supabase gateway. Legacy
    # service_role keys are JWTs and are also supplied as the bearer token.
    if (-not $ServiceKey.StartsWith(
        "sb_secret_",
        [StringComparison]::Ordinal
    )) {
        $Headers.Authorization = "Bearer $ServiceKey"
    }

    return $Headers
}

function Get-PublicHeaders {
    param(
        [Parameter(Mandatory = $true)]
        [string]$PublicKey,

        [AllowNull()]
        [string]$AccessToken
    )

    $Headers = @{
        apikey = $PublicKey
        Accept = "application/json"
        "Cache-Control" = "no-store"
    }

    if (-not [string]::IsNullOrWhiteSpace($AccessToken)) {
        $Headers.Authorization = "Bearer $AccessToken"
    }

    return $Headers
}

function Get-PasswordSession {
    param(
        [Parameter(Mandatory = $true)]
        [string]$ApiKey
    )

    $Email = (Read-Host "User A email").Trim().ToLowerInvariant()
    $SecurePassword = Read-Host "User A password" -AsSecureString
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
            throw "User A sign-in failed (HTTP $($Response.StatusCode))."
        }

        $Payload = $Response.Content | ConvertFrom-Json
        if ([string]::IsNullOrWhiteSpace([string]$Payload.access_token)) {
            throw "User A sign-in returned an incomplete session."
        }

        return [string]$Payload.access_token
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
        [string]$ApiKey
    )

    $SecureJwt = Read-Host "User A access token (JWT)" -AsSecureString
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
            throw "User A JWT validation failed (HTTP $($Response.StatusCode))."
        }

        return $Jwt
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
        [hashtable]$Headers
    )

    return Invoke-SesnHttp `
        -Method "GET" `
        -Uri "$SupabaseUrl/rest/v1/$ViewName`?select=*" `
        -Headers $Headers `
        -Body $null
}

function Invoke-LimitedRpc {
    param(
        [Parameter(Mandatory = $true)]
        [hashtable]$Headers,

        [Parameter(Mandatory = $true)]
        [string]$TenantId,

        [Parameter(Mandatory = $true)]
        [string]$ResourceType,

        [Parameter(Mandatory = $true)]
        [string]$ResourceId
    )

    return Invoke-SesnHttp `
        -Method "POST" `
        -Uri "$SupabaseUrl/rest/v1/rpc/service_get_sensitive_record" `
        -Headers $Headers `
        -Body @{
            p_tenant_id = $TenantId
            p_resource_type = $ResourceType
            p_resource_id = $ResourceId
        }
}

function Test-PropertySet {
    param(
        [Parameter(Mandatory = $true)]
        [object]$Value,

        [Parameter(Mandatory = $true)]
        [string[]]$ExpectedProperties
    )

    $Actual = @($Value.PSObject.Properties.Name | Sort-Object)
    $Expected = @($ExpectedProperties | Sort-Object)
    return @(
        Compare-Object `
            -ReferenceObject $Expected `
            -DifferenceObject $Actual
    ).Count -eq 0
}

function Add-Check {
    param(
        [Parameter(Mandatory = $true)]
        [AllowEmptyCollection()]
        [Collections.Generic.List[object]]$Target,

        [Parameter(Mandatory = $true)]
        [string]$Stage,

        [Parameter(Mandatory = $true)]
        [string]$Actor,

        [Parameter(Mandatory = $true)]
        [string]$TargetName,

        [Parameter(Mandatory = $true)]
        [int]$HttpStatus,

        [Parameter(Mandatory = $true)]
        [string]$Expected,

        [Parameter(Mandatory = $true)]
        [bool]$Passed,

        [string]$Shape = "not_applicable",

        [string]$TenantBoundary = "not_applicable",

        [string]$Redaction = "not_applicable"
    )

    [void]$Target.Add([pscustomobject][ordered]@{
        stage = $Stage
        actor = $Actor
        target = $TargetName
        http_status = $HttpStatus
        expected = $Expected
        shape = $Shape
        tenant_boundary = $TenantBoundary
        redaction = $Redaction
        result = $(if ($Passed) { "PASS" } else { "FAIL" })
    })
}

$Views = @(
    "engineer_private_summaries",
    "contract_summaries",
    "finance_invoice_summaries",
    "finance_expense_summaries",
    "ai_execution_summaries",
    "audit_event_summaries"
)

$ResourceSpecs = @(
    [pscustomobject]@{
        Type = "engineer_private"
        IdProperty = "engineer_id"
        TenantAResourceId = "7a220000-0000-4000-8000-000000000001"
        TenantBResourceId = "7a220000-0000-4000-8000-000000000002"
        Properties = @(
            "resource_type", "tenant_id", "engineer_id", "birth_date",
            "gender", "prefecture", "city", "updated_at"
        )
    },
    [pscustomobject]@{
        Type = "contract"
        IdProperty = "id"
        TenantAResourceId = "7a310000-0000-4000-8000-000000000001"
        TenantBResourceId = "7a310000-0000-4000-8000-000000000002"
        Properties = @(
            "resource_type", "tenant_id", "id", "contract_no", "project_id",
            "proposal_id", "engineer_id", "contract_type", "status", "title",
            "start_date", "end_date", "auto_renew", "currency", "updated_at",
            "row_version"
        )
    },
    [pscustomobject]@{
        Type = "invoice"
        IdProperty = "id"
        TenantAResourceId = "7a420000-0000-4000-8000-000000000001"
        TenantBResourceId = "7a420000-0000-4000-8000-000000000002"
        Properties = @(
            "resource_type", "tenant_id", "id", "invoice_no",
            "invoice_type", "contract_id", "billing_company_id",
            "billing_period_start", "billing_period_end", "issue_date",
            "due_date", "status", "currency", "subtotal", "tax_amount",
            "total_amount", "paid_amount", "sent_at", "updated_at",
            "row_version"
        )
    },
    [pscustomobject]@{
        Type = "ai_execution"
        IdProperty = "id"
        TenantAResourceId = "7a510000-0000-4000-8000-000000000001"
        TenantBResourceId = "7a510000-0000-4000-8000-000000000002"
        Properties = @(
            "resource_type", "tenant_id", "id", "job_id", "execution_type",
            "provider", "model_name", "prompt_version", "status",
            "requested_by", "requested_at", "started_at", "completed_at",
            "input_tokens", "output_tokens", "estimated_cost", "currency",
            "error_code", "created_at", "updated_at", "row_version"
        )
    },
    [pscustomobject]@{
        Type = "audit_event"
        IdProperty = "id"
        TenantAResourceId = "7a610000-0000-4000-8000-000000000001"
        TenantBResourceId = "7a610000-0000-4000-8000-000000000002"
        Properties = @(
            "resource_type", "tenant_id", "id", "occurred_at",
            "actor_user_id", "actor_type", "action", "resource_type_name",
            "resource_id", "request_id", "before_data", "after_data",
            "metadata", "created_at"
        )
    }
)

$Checks = [Collections.Generic.List[object]]::new()
$PublicKey = $null
$ServiceKey = $null
$UserAJwt = $null

try {
    $SecurePublicKey = Read-Host `
        "Supabase publishable key or legacy anon key" `
        -AsSecureString
    $PublicKey = ConvertFrom-SecureText -SecureValue $SecurePublicKey
    $SecurePublicKey = $null

    $SecureServiceKey = Read-Host `
        "Supabase secret key or legacy service_role key" `
        -AsSecureString
    $ServiceKey = ConvertFrom-SecureText -SecureValue $SecureServiceKey
    $SecureServiceKey = $null

    if ($ServiceKey.StartsWith(
        "sb_publishable_",
        [StringComparison]::Ordinal
    )) {
        throw "A publishable key was entered as the service key."
    }

    $AuthMode = (Read-Host `
        "User A authentication mode: password or jwt [password]"
    ).Trim().ToLowerInvariant()
    if ([string]::IsNullOrWhiteSpace($AuthMode)) {
        $AuthMode = "password"
    }

    if ($AuthMode -eq "password") {
        $UserAJwt = Get-PasswordSession -ApiKey $PublicKey
    }
    elseif ($AuthMode -eq "jwt") {
        $UserAJwt = Get-JwtSession -ApiKey $PublicKey
    }
    else {
        throw "Authentication mode must be password or jwt."
    }

    $ServiceHeaders = Get-ServiceHeaders -ServiceKey $ServiceKey

    # Gate 1: service_role must be rejected by all user-facing views. HTTP 401
    # is not accepted because it could mean the supplied key is invalid.
    foreach ($View in $Views) {
        $Response = Invoke-ViewRead `
            -ViewName $View `
            -Headers $ServiceHeaders
        $Passed = $Response.StatusCode -eq 403
        Add-Check `
            -Target $Checks `
            -Stage "service_role_view_denial" `
            -Actor "service_role" `
            -TargetName $View `
            -HttpStatus $Response.StatusCode `
            -Expected "HTTP 403" `
            -Passed $Passed
    }

    $ViewDenialFailed = @(
        $Checks |
            Where-Object stage -eq "service_role_view_denial" |
            Where-Object result -eq "FAIL"
    )

    if ($ViewDenialFailed.Count -eq 0) {
        $AnonResponse = Invoke-LimitedRpc `
            -Headers (Get-PublicHeaders `
                -PublicKey $PublicKey `
                -AccessToken $null) `
            -TenantId $TenantAId `
            -ResourceType "contract" `
            -ResourceId $ResourceSpecs[1].TenantAResourceId
        Add-Check `
            -Target $Checks `
            -Stage "rpc_role_boundary" `
            -Actor "anon" `
            -TargetName "service_get_sensitive_record" `
            -HttpStatus $AnonResponse.StatusCode `
            -Expected "HTTP 401" `
            -Passed ($AnonResponse.StatusCode -eq 401)

        $AuthenticatedResponse = Invoke-LimitedRpc `
            -Headers (Get-PublicHeaders `
                -PublicKey $PublicKey `
                -AccessToken $UserAJwt) `
            -TenantId $TenantAId `
            -ResourceType "contract" `
            -ResourceId $ResourceSpecs[1].TenantAResourceId
        Add-Check `
            -Target $Checks `
            -Stage "rpc_role_boundary" `
            -Actor "authenticated" `
            -TargetName "service_get_sensitive_record" `
            -HttpStatus $AuthenticatedResponse.StatusCode `
            -Expected "HTTP 403" `
            -Passed ($AuthenticatedResponse.StatusCode -eq 403)

        foreach ($Spec in $ResourceSpecs) {
            $Response = Invoke-LimitedRpc `
                -Headers $ServiceHeaders `
                -TenantId $TenantAId `
                -ResourceType $Spec.Type `
                -ResourceId $Spec.TenantAResourceId

            $JsonValid = $false
            $ShapePassed = $false
            $TenantPassed = $false
            $RedactionPassed = $true

            if ($Response.StatusCode -eq 200) {
                try {
                    $Payload = $Response.Content | ConvertFrom-Json
                    $JsonValid = $null -ne $Payload
                    if ($JsonValid) {
                        $ShapePassed = Test-PropertySet `
                            -Value $Payload `
                            -ExpectedProperties $Spec.Properties
                        $TenantPassed = (
                            [string]$Payload.tenant_id -eq $TenantAId -and
                            [string]$Payload.resource_type -eq $Spec.Type -and
                            [string]$Payload.($Spec.IdProperty) -eq
                                $Spec.TenantAResourceId
                        )
                    }

                    if ($Spec.Type -eq "audit_event") {
                        $ForbiddenAuditValues = @(
                            "private-a@example.invalid",
                            "secret-token-a",
                            "secret-api-key-a",
                            "PRIVATE USER AGENT A",
                            "192.0.2.1"
                        )
                        foreach ($Forbidden in $ForbiddenAuditValues) {
                            if ($Response.Content.IndexOf(
                                $Forbidden,
                                [StringComparison]::Ordinal
                            ) -ge 0) {
                                $RedactionPassed = $false
                            }
                        }
                    }
                }
                catch {
                    $JsonValid = $false
                }
            }

            $Passed = (
                $Response.StatusCode -eq 200 -and
                $JsonValid -and
                $ShapePassed -and
                $TenantPassed -and
                $RedactionPassed
            )
            Add-Check `
                -Target $Checks `
                -Stage "rpc_allowed_resources" `
                -Actor "service_role" `
                -TargetName $Spec.Type `
                -HttpStatus $Response.StatusCode `
                -Expected "HTTP 200, exact reviewed shape" `
                -Passed $Passed `
                -Shape $(if ($ShapePassed) { "PASS" } else { "FAIL" }) `
                -TenantBoundary $(if ($TenantPassed) {
                    "PASS"
                } else {
                    "FAIL"
                }) `
                -Redaction $(if ($Spec.Type -ne "audit_event") {
                    "not_applicable"
                } elseif ($RedactionPassed) {
                    "PASS"
                } else {
                    "FAIL"
                })
        }

        $MissingResponse = Invoke-LimitedRpc `
            -Headers $ServiceHeaders `
            -TenantId $TenantAId `
            -ResourceType "contract" `
            -ResourceId $MissingResourceId
        Add-Check `
            -Target $Checks `
            -Stage "rpc_not_found" `
            -Actor "service_role" `
            -TargetName "absent_resource" `
            -HttpStatus $MissingResponse.StatusCode `
            -Expected "HTTP 404" `
            -Passed ($MissingResponse.StatusCode -eq 404)

        foreach ($Spec in $ResourceSpecs) {
            $Response = Invoke-LimitedRpc `
                -Headers $ServiceHeaders `
                -TenantId $TenantAId `
                -ResourceType $Spec.Type `
                -ResourceId $Spec.TenantBResourceId
            Add-Check `
                -Target $Checks `
                -Stage "rpc_tenant_mismatch" `
                -Actor "service_role" `
                -TargetName $Spec.Type `
                -HttpStatus $Response.StatusCode `
                -Expected "HTTP 404" `
                -Passed ($Response.StatusCode -eq 404) `
                -TenantBoundary $(if ($Response.StatusCode -eq 404) {
                    "PASS"
                } else {
                    "FAIL"
                })
        }
    }

    $Failures = @($Checks | Where-Object result -eq "FAIL")
    $PassedCount = @($Checks | Where-Object result -eq "PASS").Count
    $ViewChecks = @(
        $Checks | Where-Object stage -eq "service_role_view_denial"
    )
    $RpcChecks = @(
        $Checks | Where-Object stage -ne "service_role_view_denial"
    )
    $ViewDenialPassed = (
        $ViewChecks.Count -eq 6 -and
        @($ViewChecks | Where-Object result -eq "FAIL").Count -eq 0
    )
    $RpcTested = $RpcChecks.Count -gt 0
    $RpcPassed = (
        $RpcChecks.Count -eq 13 -and
        @($RpcChecks | Where-Object result -eq "FAIL").Count -eq 0
    )

    $Status = if (-not $ViewDenialPassed) {
        "SERVICE_ROLE_VIEW_DENIAL_FAILED"
    }
    elseif (-not $RpcPassed) {
        "LIMITED_RPC_VALIDATION_FAILED"
    }
    else {
        "SERVICE_ROLE_AND_RPC_VALIDATION_PASSED"
    }

    [ordered]@{
        status = $Status
        database_changes = $false
        response_bodies_exposed = $false
        service_role_view_denial_tested = $true
        service_role_view_denial_passed = $ViewDenialPassed
        rpc_tested = $RpcTested
        rpc_passed = $RpcPassed
        total_checks = $Checks.Count
        passed = $PassedCount
        failed = $Failures.Count
        failures = $Failures
        checks = @($Checks)
    } | ConvertTo-Json -Depth 8
}
finally {
    $UserAJwt = $null
    $PublicKey = $null
    $ServiceKey = $null
    $HttpClient.Dispose()
}
