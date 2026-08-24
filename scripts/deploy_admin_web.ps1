[CmdletBinding()]
param(
  [switch]$Preview,
  [switch]$SkipBuild,
  [switch]$KeepStaging,
  [switch]$AllowDirty
)

$ErrorActionPreference = "Stop"

function Write-Step {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Message
  )

  Write-Host "[deploy:admin] $Message" -ForegroundColor Cyan
}

function Assert-PathExists {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path,
    [Parameter(Mandatory = $true)]
    [string]$Description,
    [switch]$Directory
  )

  $pathType = if ($Directory) { "Container" } else { "Any" }
  if (-not (Test-Path -LiteralPath $Path -PathType $pathType)) {
    throw "$Description path was not found: $Path"
  }
}

function Get-UncommittedChanges {
  param(
    [Parameter(Mandatory = $true)]
    [string]$RepositoryRoot,
    [Parameter(Mandatory = $true)]
    [string[]]$PathSpecs
  )

  $gitCommand = Get-Command "git.exe" -ErrorAction SilentlyContinue
  if (-not $gitCommand) {
    throw "git.exe was not found. The uncommitted change guard requires git."
  }

  $statusOutput = & ($gitCommand.Source) "-C" $RepositoryRoot "status" "--porcelain" "--" @PathSpecs
  if ($LASTEXITCODE -ne 0) {
    throw "git status failed (exit code: $LASTEXITCODE) in: $RepositoryRoot"
  }

  return @($statusOutput | Where-Object { $_ -and $_.Trim().Length -gt 0 })
}

function Invoke-RobocopyChecked {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Source,
    [Parameter(Mandatory = $true)]
    [string]$Destination,
    [Parameter(Mandatory = $true)]
    [string[]]$ExtraArguments
  )

  & robocopy $Source $Destination @ExtraArguments | Out-Null
  if ($LASTEXITCODE -ge 8) {
    throw "Staging copy failed. robocopy exit code: $LASTEXITCODE"
  }
}

function Remove-StagingDirectory {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path
  )

  if (-not (Test-Path -LiteralPath $Path)) {
    return
  }

  for ($attempt = 1; $attempt -le 5; $attempt += 1) {
    try {
      Remove-Item -LiteralPath $Path -Recurse -Force
      return
    } catch {
      if ($attempt -eq 5) {
        Write-Warning "Could not remove staging directory: $Path"
        return
      }

      Start-Sleep -Seconds 1
    }
  }
}

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$frontendRoot = Split-Path -Parent $scriptRoot
$adminWebRoot = Join-Path $frontendRoot "apps/admin-web"
$projectLinkPath = Join-Path $adminWebRoot ".vercel/project.json"
$deployConfigPath = Join-Path $adminWebRoot "vercel.deploy.json"
$rootPackagePath = Join-Path $adminWebRoot "vercel.root-package.json"
$sharedDomainPath = Join-Path $frontendRoot "packages/shared-domain/src"
$sharedSupabasePath = Join-Path $frontendRoot "packages/shared-supabase/src"
$npmCommand = Get-Command "npm.cmd" -ErrorAction SilentlyContinue
$npxCommand = Get-Command "npx.cmd" -ErrorAction SilentlyContinue

# --- 미커밋 변경 가드 -----------------------------------------------------
# 이 스크립트는 git 커밋 상태와 무관하게 로컬 작업 트리를 그대로 배포한다.
# 2026-08-24 public-web에서 미커밋 WIP가 배포에 편승해 상품 상세가 전면
# 크래시(수리 f2fe411)한 사고 재발 방지 — 배포에 실리는 경로에 미커밋 변경이
# 있으면 파일 목록을 출력하고 중단한다. 의도적인 dirty 배포만 -AllowDirty로 우회.
$cleanTreePathSpecs = @("apps/admin-web", "packages")

if ($AllowDirty) {
  Write-Warning "[deploy:admin] -AllowDirty: skipping the uncommitted change guard."
  try {
    $uncommittedChanges = @(Get-UncommittedChanges -RepositoryRoot $frontendRoot -PathSpecs $cleanTreePathSpecs)
    if ($uncommittedChanges.Count -gt 0) {
      Write-Warning "[deploy:admin] Deploying with uncommitted changes:"
      foreach ($change in $uncommittedChanges) {
        Write-Warning "[deploy:admin]   $change"
      }
    }
  } catch {
    Write-Warning "[deploy:admin] Could not inspect git status: $($_.Exception.Message)"
  }
} else {
  Write-Step ("Checking for uncommitted changes in: " + ($cleanTreePathSpecs -join ", "))
  $uncommittedChanges = @(Get-UncommittedChanges -RepositoryRoot $frontendRoot -PathSpecs $cleanTreePathSpecs)
  if ($uncommittedChanges.Count -gt 0) {
    Write-Host "[deploy:admin] Uncommitted changes detected in the deploy scope:" -ForegroundColor Yellow
    foreach ($change in $uncommittedChanges) {
      Write-Host "[deploy:admin]   $change" -ForegroundColor Yellow
    }
    throw "Deploy aborted: the working tree is deployed as-is, so commit or stash these changes first. Use -AllowDirty only for an intentional dirty deploy."
  }
  Write-Step "Working tree is clean in the deploy scope."
}

Assert-PathExists -Path $frontendRoot -Description "frontend root" -Directory
Assert-PathExists -Path $adminWebRoot -Description "admin web app" -Directory
Assert-PathExists -Path $projectLinkPath -Description "admin web Vercel link file"
Assert-PathExists -Path $deployConfigPath -Description "admin web Vercel deploy config"
Assert-PathExists -Path $rootPackagePath -Description "admin web deploy-root package.json"
Assert-PathExists -Path $sharedDomainPath -Description "shared-domain package" -Directory
Assert-PathExists -Path $sharedSupabasePath -Description "shared-supabase package" -Directory

if (-not $npmCommand) {
  throw "npm.cmd was not found. Check your Node.js / npm installation."
}

if (-not $npxCommand) {
  throw "npx.cmd was not found. Check your Node.js / npm installation."
}

$projectLinkContent = ""
try {
  $projectLinkContent = Get-Content -LiteralPath $projectLinkPath -Raw -Encoding UTF8
} catch {
  throw "Failed to read the admin web Vercel link file: $projectLinkPath"
}

$projectLink = $projectLinkContent | ConvertFrom-Json
$projectName = [string]$projectLink.projectName

if ([string]::IsNullOrWhiteSpace($projectName)) {
  throw "The admin web Vercel link file is missing projectName: $projectLinkPath"
}

$targetLabel = if ($Preview) { "preview" } else { "production" }
$stagingRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("subook-admin-web-deploy-" + [guid]::NewGuid().ToString("N"))
$stagingFrontendRoot = Join-Path $stagingRoot "frontend"
$stagingProjectLinkDir = Join-Path $stagingRoot ".vercel"
$stagingProjectLinkPath = Join-Path $stagingProjectLinkDir "project.json"
$stagingDeployConfigPath = Join-Path $stagingRoot "vercel.deploy.json"

Write-Step "target: $targetLabel / project: $projectName"

trap {
  # trap은 정의 위치와 무관하게 스크립트 스코프 전체에 적용된다 — $stagingRoot 할당
  # 전(가드·경로 검증 단계)의 에러에서 Test-Path가 원래 에러를 가리지 않도록 방어.
  if ($stagingRoot) {
    if ($KeepStaging) {
      Write-Step "Keeping staging directory: $stagingRoot"
    } elseif (Test-Path -LiteralPath $stagingRoot) {
      Remove-StagingDirectory -Path $stagingRoot
    }
  }

  # trap 안의 인자 없는 throw는 원래 에러 대신 ScriptHalted를 던져 메시지를 가린다.
  # break가 원래 에러를 그대로 재전파하며 스크립트를 중단시킨다.
  break
}

if (-not $SkipBuild) {
  Write-Step "Running local preflight build."
  Push-Location $frontendRoot
  try {
    & ($npmCommand.Source) "run" "build:admin"
    if ($LASTEXITCODE -ne 0) {
      throw "Local preflight build failed."
    }
  } finally {
    Pop-Location
  }
} else {
  Write-Step "Skipping local preflight build."
}

Write-Step "Creating staging directory: $stagingRoot"
New-Item -ItemType Directory -Path $stagingRoot | Out-Null
New-Item -ItemType Directory -Path $stagingFrontendRoot | Out-Null

$robocopyArguments = @(
  "/E"
  "/XD"
  (Join-Path $frontendRoot "node_modules")
  (Join-Path $frontendRoot ".vercel")
  (Join-Path $adminWebRoot "node_modules")
  (Join-Path $adminWebRoot ".vite")
  (Join-Path $adminWebRoot "dist")
  (Join-Path $adminWebRoot ".vercel")
  "/XF"
  ".env"
  ".env.*"
  "*.log"
  "/NFL"
  "/NDL"
  "/NJH"
  "/NJS"
  "/NP"
)

Write-Step "Copying the frontend workspace into staging."
Invoke-RobocopyChecked -Source $frontendRoot -Destination $stagingFrontendRoot -ExtraArguments $robocopyArguments

New-Item -ItemType Directory -Path $stagingProjectLinkDir | Out-Null
Copy-Item -LiteralPath $projectLinkPath -Destination $stagingProjectLinkPath
Copy-Item -LiteralPath $deployConfigPath -Destination $stagingDeployConfigPath
# ⚠ crons는 `-A vercel.deploy.json`(--local-config) 경로로는 등록되지 않는다
#   (2026-07-24 실측: rewrites/headers는 적용되는데 배포 객체 crons가 항상 빈 배열).
#   표준 이름 vercel.json을 스테이징 루트에 두고 기본 탐지로 배포해야 crons가 등록됨.
Copy-Item -LiteralPath $deployConfigPath -Destination (Join-Path $stagingRoot "vercel.json")
# ⚠ api/ 함수의 npm 의존성(@supabase/supabase-js)은 스테이징 루트 package.json이 있어야
#   Vercel 빌더가 함수 번들에 포함시킨다. 없으면 배포는 성공하지만 모든 함수가 런타임에서
#   "Cannot find module" → FUNCTION_INVOCATION_FAILED (2026-08-04 전면 장애 원인 — 빌더
#   CLI 58.x부터 루트 install 없이는 함수 의존성이 누락됨).
Copy-Item -LiteralPath $rootPackagePath -Destination (Join-Path $stagingRoot "package.json")

$adminWebApiPath = Join-Path $adminWebRoot "api"
if (Test-Path -LiteralPath $adminWebApiPath -PathType Container) {
  Write-Step "Copying API functions into staging root."
  Copy-Item -LiteralPath $adminWebApiPath -Destination (Join-Path $stagingRoot "api") -Recurse
}

Assert-PathExists -Path (Join-Path $stagingFrontendRoot "packages/shared-domain/src") -Description "staging shared-domain" -Directory
Assert-PathExists -Path (Join-Path $stagingFrontendRoot "packages/shared-supabase/src") -Description "staging shared-supabase" -Directory
Assert-PathExists -Path (Join-Path $stagingFrontendRoot "apps/admin-web/src") -Description "staging admin web app" -Directory

# -A 플래그 제거: 스테이징 루트의 vercel.json(위에서 복사)이 기본 설정으로 사용된다.
$deployArguments = @("vercel", "deploy", "-y", "--logs")
if ($Preview) {
  $deployArguments += "--target=preview"
} else {
  $deployArguments += "--prod"
}

Write-Step "Running the Vercel deploy from staging."
Push-Location $stagingRoot
try {
  & ($npxCommand.Source) @deployArguments
  if ($LASTEXITCODE -ne 0) {
    throw "Vercel deploy failed."
  }
} finally {
  Pop-Location
}

if ($KeepStaging) {
  Write-Step "Keeping staging directory: $stagingRoot"
} elseif (Test-Path -LiteralPath $stagingRoot) {
  Remove-StagingDirectory -Path $stagingRoot
}
