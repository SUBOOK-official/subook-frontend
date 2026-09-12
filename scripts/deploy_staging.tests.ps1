[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "deploy_staging.ps1")

function Assert-Condition {
  param([bool]$Condition, [string]$Message)
  if (-not $Condition) { throw $Message }
}

# The real deployment scripts run against an isolated fixture and a fake npx.
# No Vercel requests, real project links, or existing temporary folders are used.
$tempRoot = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath()).TrimEnd('\', '/')
$testRoot = Join-Path $tempRoot ("sb-test-" + [guid]::NewGuid().ToString("N"))
$fixtureRoot = Join-Path $testRoot "frontend"
$stubRoot = Join-Path $testRoot "bin"
$previousPath = $env:PATH
$previousExitCode = $env:SUBOOK_STAGING_TEST_EXIT_CODE
$createdStagingPaths = [System.Collections.Generic.List[string]]::new()
$powershellCommand = (Get-Command "powershell.exe" -ErrorAction Stop).Source

function Write-FixtureFile {
  param([string]$RelativePath, [string]$Content = "fixture")
  $filePath = Join-Path $fixtureRoot $RelativePath
  New-Item -ItemType Directory -Path (Split-Path -Parent $filePath) -Force | Out-Null
  Set-Content -LiteralPath $filePath -Value $Content -Encoding ASCII
}

function Invoke-DeploymentFixture {
  param([string]$App, [int]$DeployExitCode = 0, [switch]$KeepStaging)
  $scriptName = if ($App -eq "admin-web") { "deploy_admin_web.ps1" } else { "deploy_public_web.ps1" }
  $scriptPath = Join-Path $fixtureRoot "scripts/$scriptName"
  $arguments = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $scriptPath, "-SkipBuild", "-AllowDirty")
  if ($App -eq "seller-lookup") { $arguments += @("-App", $App) }
  if ($KeepStaging) { $arguments += "-KeepStaging" }
  $env:SUBOOK_STAGING_TEST_EXIT_CODE = [string]$DeployExitCode

  # Windows PowerShell reports native stderr as ErrorRecord. Preserve it for assertions.
  $oldPreference = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  try {
    $output = & $powershellCommand @arguments 2>&1
    $processExitCode = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $oldPreference
  }
  $outputText = ($output | ForEach-Object { $_.ToString() }) -join "`n"
  $pathMatch = [regex]::Match($outputText, 'Creating staging directory: ([^\r\n]+)')
  Assert-Condition $pathMatch.Success "No staging path in fixture output: $outputText"
  $stagingPath = $pathMatch.Groups[1].Value.Trim()
  $createdStagingPaths.Add($stagingPath)
  Assert-Condition ($outputText.Contains("[staging-test] fake deployment")) "Fake npx did not run: $outputText"

  if ($DeployExitCode -eq 0) {
    Assert-Condition ($processExitCode -eq 0) "Fixture deploy failed: $outputText"
  } else {
    Assert-Condition ($processExitCode -ne 0) "Deploy failure was swallowed: $outputText"
    Assert-Condition ($outputText.Contains("Vercel deploy failed.")) "Original deploy error was lost: $outputText"
  }
  Assert-Condition (-not $outputText.Contains("Could not remove staging directory")) "Cleanup failed: $outputText"
  Assert-Condition ((Test-Path -LiteralPath $stagingPath) -eq [bool]$KeepStaging) "Unexpected staging retention: $stagingPath"
  Write-Host "PASS: $App / deploy exit $DeployExitCode / KeepStaging $KeepStaging"
  return $stagingPath
}

try {
  New-Item -ItemType Directory -Path $fixtureRoot, $stubRoot | Out-Null
  $stubPath = Join-Path $stubRoot "npx.cmd"
  Set-Content -LiteralPath $stubPath -Encoding ASCII -Value "@echo off`r`necho [staging-test] fake deployment`r`nexit /b %SUBOOK_STAGING_TEST_EXIT_CODE%"
  $env:PATH = $stubRoot + [System.IO.Path]::PathSeparator + $previousPath
  Assert-Condition ((Get-Command "npx.cmd").Source -eq $stubPath) "The fake npx must be first on PATH."

  foreach ($scriptName in @("deploy_staging.ps1", "deploy_public_web.ps1", "deploy_admin_web.ps1")) {
    Write-FixtureFile "scripts/$scriptName"
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot $scriptName) -Destination (Join-Path $fixtureRoot "scripts/$scriptName") -Force
  }
  Write-FixtureFile "package.json" '{"private":true,"type":"module"}'
  Write-FixtureFile "packages/shared-domain/src/index.js"
  Write-FixtureFile "packages/shared-supabase/src/index.js"
  Write-FixtureFile "apps/public-web/meta-catalog.entry.cjs"
  Write-FixtureFile "apps/public-web/api/meta-catalog.js"
  Write-FixtureFile "apps/admin-web/vercel.root-package.json" '{"private":true}'
  foreach ($app in @("public-web", "admin-web", "seller-lookup")) {
    Write-FixtureFile "apps/$app/src/index.js"
    Write-FixtureFile "apps/$app/.vercel/project.json" '{"projectName":"subook-staging-test","projectId":"test-only","orgId":"test-only"}'
    Write-FixtureFile "apps/$app/vercel.deploy.json" '{}'
    Write-FixtureFile "apps/$app/api/health.js"
    Write-FixtureFile "apps/$app/middleware.js"
  }

  $excludedPaths = @(
    "node_modules/package/index.js", "apps/mobile/node_modules/package/index.js",
    "apps/admin-web/dist/bundle.js", "apps/public-web/.vite/cache.js",
    "apps/mobile/.expo/cache.json", "packages/shared-domain/.turbo/cache.json",
    "coverage/result.json", ".git/config", "apps/mobile/.git",
    ".env", "apps/admin-web/.env.local", "apps/mobile/debug.log"
  )
  foreach ($relativePath in $excludedPaths) { Write-FixtureFile $relativePath }

  # A valid source file would exceed MAX_PATH after the old staging copy.
  $longDirectory = "apps/mobile/node_modules/react-native-screens/android/src/main/java/screens"
  $longNameLength = 248 - (Join-Path $fixtureRoot $longDirectory).Length - 1 - 3
  $longRelativePath = "$longDirectory/" + ("x" * $longNameLength) + ".kt"
  Write-FixtureFile $longRelativePath
  $excludedPaths += $longRelativePath

  $retainedPath = Invoke-DeploymentFixture -App "public-web" -KeepStaging
  Assert-Condition ((Join-Path $retainedPath "frontend/$longRelativePath").Length -gt 260) "Fixture did not reproduce the old long-path condition."
  foreach ($relativePath in $excludedPaths) {
    Assert-Condition (-not (Test-Path -LiteralPath (Join-Path $retainedPath "frontend/$relativePath"))) "Excluded file was copied: $relativePath"
  }
  foreach ($relativePath in @("package.json", "apps/public-web/src/index.js", "apps/admin-web/src/index.js", "packages/shared-domain/src/index.js", "packages/shared-supabase/src/index.js")) {
    Assert-Condition (Test-Path -LiteralPath (Join-Path $retainedPath "frontend/$relativePath")) "Required source was not copied: $relativePath"
  }
  Assert-Condition (Test-Path -LiteralPath (Join-Path $retainedPath ".vercel/project.json")) "Explicit Vercel project link was not copied."
  Assert-Condition (-not (Test-Path -LiteralPath (Join-Path $retainedPath "frontend/apps/public-web/.vercel"))) "Nested Vercel state was copied."
  Remove-StagingDirectory -Path $retainedPath
  Assert-Condition (-not (Test-Path -LiteralPath $retainedPath)) "Retained fixture cleanup failed."
  Write-Host "PASS: nested dependencies/caches excluded; required source and deployment metadata retained"

  foreach ($app in @("public-web", "admin-web", "seller-lookup")) {
    $null = Invoke-DeploymentFixture -App $app
  }
  foreach ($app in @("public-web", "admin-web")) {
    $null = Invoke-DeploymentFixture -App $app -DeployExitCode 23
  }

  $invalidPaths = @(
    $tempRoot, $testRoot, $fixtureRoot, ".", (Split-Path -Parent $PSScriptRoot),
    (Join-Path $testRoot (Split-Path -Leaf $retainedPath)),
    (Join-Path ($tempRoot + "-sibling") (Split-Path -Leaf $retainedPath))
  )
  foreach ($invalidPath in $invalidPaths) {
    $refused = $false
    try { Remove-StagingDirectory -Path $invalidPath } catch { $refused = $_.Exception.Message.StartsWith("Refusing to remove") }
    Assert-Condition $refused "Cleanup must refuse unrelated path: $invalidPath"
  }
  Assert-Condition (Test-Path -LiteralPath (Join-Path $fixtureRoot "apps/public-web/src/index.js")) "Original fixture was removed."
  Write-Host "PASS: cleanup rejects the source, Temp root, relative paths, nested paths, and prefix siblings"
} finally {
  $env:PATH = $previousPath
  $env:SUBOOK_STAGING_TEST_EXIT_CODE = $previousExitCode
  foreach ($stagingPath in $createdStagingPaths) { Remove-StagingDirectory -Path $stagingPath }
  # Only this invocation's GUID fixture is eligible for recursive removal.
  $resolvedTestPath = [System.IO.Path]::GetFullPath($testRoot)
  if (([System.IO.Path]::GetDirectoryName($resolvedTestPath) -eq $tempRoot) -and
      ([System.IO.Path]::GetFileName($resolvedTestPath) -match '^sb-test-[0-9a-f]{32}$') -and
      (Test-Path -LiteralPath $resolvedTestPath)) {
    Remove-Item -LiteralPath $resolvedTestPath -Recurse -Force -ErrorAction Stop
  }
}

Write-Host "All deployment staging tests passed."
