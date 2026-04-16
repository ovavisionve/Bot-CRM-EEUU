# ============================================================
# Test automático de Fase 6: Campaigns + Lead Scoring + SMS
# ============================================================
# Corré desde la raíz del proyecto:
#   .\scripts\test_fase6.ps1
#
# Te va a pedir el password del super admin una vez.
# Muestra un reporte con PASS/FAIL de cada componente.

$ErrorActionPreference = "Stop"
$SUPABASE_URL = "https://vrfydffwczomvuoigwsm.supabase.co"
$ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZyZnlkZmZ3Y3pvbXZ1b2lnd3NtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYyODI1ODIsImV4cCI6MjA5MTg1ODU4Mn0.An0aAhj_tKnRZ6tR-ESq5yJGbmzZ2CchdAH9bBUc38I"
$ADMIN_EMAIL = "ovavision.ve@gmail.com"

$total = 0
$passed = 0
$failed = 0

function Test-Assert {
  param([string]$Name, [scriptblock]$Check)
  $script:total++
  try {
    $result = & $Check
    if ($result -eq $true -or $result) {
      Write-Host "  PASS  $Name" -ForegroundColor Green
      $script:passed++
      return $true
    } else {
      Write-Host "  FAIL  $Name  (devolvió false)" -ForegroundColor Red
      $script:failed++
      return $false
    }
  } catch {
    Write-Host "  FAIL  $Name  ($($_.Exception.Message))" -ForegroundColor Red
    $script:failed++
    return $false
  }
}

function Invoke-Api {
  param([string]$Path, [string]$Method = "GET", [object]$Body = $null, [string]$Token)
  $url = "$SUPABASE_URL/functions/v1/dashboard$Path"
  $headers = @{ "Authorization" = "Bearer $Token" }
  if ($Body) {
    $headers["Content-Type"] = "application/json"
    return Invoke-RestMethod -Uri $url -Method $Method -Headers $headers -Body ($Body | ConvertTo-Json -Depth 6) -UseBasicParsing
  } else {
    return Invoke-RestMethod -Uri $url -Method $Method -Headers $headers -UseBasicParsing
  }
}

Write-Host ""
Write-Host "== OVA REAL - Test automatico Fase 6 ==" -ForegroundColor Cyan
Write-Host ""

# 1. Login como super admin
Write-Host "1. Autenticando como super admin..." -ForegroundColor Yellow
$securePwd = Read-Host "   Password de $ADMIN_EMAIL" -AsSecureString
$BSTR = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePwd)
$plainPwd = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($BSTR)

$loginBody = @{ email = $ADMIN_EMAIL; password = $plainPwd } | ConvertTo-Json
$loginRes = Invoke-RestMethod -Uri "$SUPABASE_URL/auth/v1/token?grant_type=password" `
  -Method POST -Headers @{ "apikey" = $ANON_KEY; "Content-Type" = "application/json" } `
  -Body $loginBody -UseBasicParsing

if (-not $loginRes.access_token) {
  Write-Host "  FAIL login: $($loginRes | ConvertTo-Json)" -ForegroundColor Red
  exit 1
}
$TOKEN = $loginRes.access_token
Write-Host "  PASS login ($($loginRes.user.email))" -ForegroundColor Green
Write-Host ""

# 2. Verificar perfil super_admin
Write-Host "2. Perfil de usuario" -ForegroundColor Yellow
$me = Invoke-Api -Path "?action=me" -Token $TOKEN
Test-Assert "role=super_admin" { $me.user.role -eq "super_admin" }
Write-Host ""

# 3. Lista de tenants
Write-Host "3. Tenants" -ForegroundColor Yellow
$tenants = Invoke-Api -Path "?action=tenants" -Token $TOKEN
Test-Assert "al menos 1 tenant" { $tenants.tenants.Count -ge 1 }
$luis = $tenants.tenants | Where-Object { $_.slug -eq "luis-almario" } | Select-Object -First 1
Test-Assert "Luis Almario existe" { $null -ne $luis }
Test-Assert "Luis tiene email luisrentals16@gmail.com" { $luis.agent_email -eq "luisrentals16@gmail.com" }
Test-Assert "Luis tiene drip_campaigns ON" { $luis.features.drip_campaigns -eq $true }
Test-Assert "Luis tiene lead_scoring ON" { $luis.features.lead_scoring -eq $true }
Test-Assert "Luis tiene tour_calendar ON" { $luis.features.tour_calendar -eq $true }
Write-Host ""

# 4. Campañas pre-cargadas para Luis
Write-Host "4. Campanas de Luis" -ForegroundColor Yellow
$camps = Invoke-Api -Path "?action=campaigns&tenant=luis-almario" -Token $TOKEN
Test-Assert "al menos 3 campanas" { $camps.campaigns.Count -ge 3 }
$triggers = $camps.campaigns.trigger
Test-Assert "campana tour_reminder existe" { $triggers -contains "tour_reminder" }
Test-Assert "campana post_tour existe" { $triggers -contains "post_tour" }
Test-Assert "campana budget_objection existe" { $triggers -contains "budget_objection" }
Write-Host ""

# 5. CRUD campaigns
Write-Host "5. CRUD de campanas" -ForegroundColor Yellow
$newCamp = @{
  tenant_slug = "luis-almario"
  name = "Test Campana $(Get-Random)"
  trigger = "new_lead"
  steps = @(
    @{ step = 1; delay_hours = 0; channel = "instagram"; message = "Hola {name}, bienvenido!" }
  )
  active = $false
}
$createRes = Invoke-Api -Path "?action=create-campaign" -Method POST -Body $newCamp -Token $TOKEN
Test-Assert "crear campana" { $createRes.ok -eq $true -and $createRes.campaign.id }
$newId = $createRes.campaign.id

$updateRes = Invoke-Api -Path "?action=update-campaign" -Method POST `
  -Body @{ id = $newId; updates = @{ active = $true } } -Token $TOKEN
Test-Assert "activar campana" { $updateRes.ok -eq $true }

$deleteRes = Invoke-Api -Path "?action=delete-campaign" -Method POST `
  -Body @{ id = $newId } -Token $TOKEN
Test-Assert "eliminar campana" { $deleteRes.ok -eq $true }
Write-Host ""

# 6. Lead scoring en leads existentes
Write-Host "6. Lead scoring" -ForegroundColor Yellow
$leadsData = Invoke-Api -Path "?tenant=luis-almario" -Token $TOKEN
$hasScoredLead = ($leadsData.leads | Where-Object { $_.score -gt 0 } | Measure-Object).Count -gt 0
Test-Assert "al menos 1 lead tiene score>0" { $hasScoredLead }

if ($hasScoredLead) {
  $topLead = $leadsData.leads | Sort-Object -Property score -Descending | Select-Object -First 1
  Write-Host "    Lead top: $($topLead.name) - score $($topLead.score)/100" -ForegroundColor Gray
  Write-Host "    Factores: $($topLead.score_factors | ConvertTo-Json -Compress)" -ForegroundColor Gray
}
Write-Host ""

# 7. Campaign runner (disparo manual)
Write-Host "7. Campaign runner" -ForegroundColor Yellow
try {
  $runner = Invoke-RestMethod -Uri "$SUPABASE_URL/functions/v1/campaign-runner" `
    -Method POST -UseBasicParsing
  Test-Assert "campaign-runner responde ok" { $runner.ok -eq $true }
  Write-Host "    tenants procesados: $($runner.tenants)" -ForegroundColor Gray
  Write-Host "    enrolled: $($runner.enrolled) | executed: $($runner.executed)" -ForegroundColor Gray
} catch {
  Write-Host "  FAIL  campaign-runner no responde ($($_.Exception.Message))" -ForegroundColor Red
  $script:failed++; $script:total++
}
Write-Host ""

# 8. Analytics con feature gate
Write-Host "8. Analytics" -ForegroundColor Yellow
$analytics = Invoke-Api -Path "?action=analytics&tenant=luis-almario" -Token $TOKEN
Test-Assert "analytics devuelve totals" { $analytics.totals -ne $null }
Test-Assert "analytics devuelve funnel" { $analytics.funnel -ne $null }
Test-Assert "analytics devuelve rates" { $analytics.rates -ne $null }
Write-Host "    Leads total: $($analytics.totals.leads) | hoy: $($analytics.totals.leads_today)" -ForegroundColor Gray
Write-Host ""

# 9. Tours
Write-Host "9. Tours" -ForegroundColor Yellow
$tours = Invoke-Api -Path "?action=tours&tenant=luis-almario" -Token $TOKEN
Test-Assert "endpoint tours responde" { $tours.tours -ne $null }
Write-Host "    Tours en DB: $($tours.tours.Count)" -ForegroundColor Gray
Write-Host ""

# 10. Export CSV (solo HTTP status)
Write-Host "10. Export CSV" -ForegroundColor Yellow
try {
  $exp = Invoke-WebRequest -Uri "$SUPABASE_URL/functions/v1/dashboard?action=export&type=leads&format=csv&tenant=luis-almario" `
    -Headers @{ "Authorization" = "Bearer $TOKEN" } -UseBasicParsing
  Test-Assert "export leads CSV (200)" { $exp.StatusCode -eq 200 }
  Test-Assert "export tiene Content-Type csv" { $exp.Headers["Content-Type"] -match "text/csv" }
} catch {
  Write-Host "  FAIL  export CSV" -ForegroundColor Red; $script:failed++; $script:total++
}
Write-Host ""

# Reporte final
Write-Host ""
Write-Host "===========================================" -ForegroundColor Cyan
Write-Host "  Resultado: $passed/$total OK ($failed fallaron)" -ForegroundColor $(if ($failed -eq 0) { "Green" } else { "Yellow" })
Write-Host "===========================================" -ForegroundColor Cyan

if ($failed -eq 0) {
  Write-Host "Todo Fase 6 funciona :)" -ForegroundColor Green
  exit 0
} else {
  Write-Host "Hay $failed fallas, revisa arriba." -ForegroundColor Yellow
  exit 1
}
