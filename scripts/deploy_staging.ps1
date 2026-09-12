# public/admin/seller 배포 스테이징 공통 처리. Windows PowerShell 5.1 호환.

function Get-DeployCopyArguments {
  # 절대 경로로 일부 앱만 제외하면 다른 앱의 node_modules가 복사된다.
  # 특히 React Native의 긴 경로는 Windows PowerShell 5.1의 정리를 실패시킨다.
  # /XD 이름 제외는 모든 깊이에 적용, /XJ는 원본을 가리키는 junction 제외.
  # https://learn.microsoft.com/windows-server/administration/windows-commands/robocopy
  return @(
    "/E"
    "/XJ"
    "/R:2"
    "/W:1"
    "/XD"
    "node_modules"
    ".git"
    ".vercel"
    ".vite"
    ".expo"
    ".turbo"
    "dist"
    "coverage"
    "/XF"
    ".git"
    ".env"
    ".env.*"
    "*.log"
    "/NFL"
    "/NDL"
    "/NJH"
    "/NJS"
    "/NP"
  )
}

function Remove-StagingDirectory {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path
  )

  # 삭제 대상은 현재 사용자의 Temp 바로 아래에 만든 배포 복사본으로 제한한다.
  # 원본 저장소, Temp 전체, 이름만 비슷한 폴더, junction은 삭제하지 않는다.
  if (-not [System.IO.Path]::IsPathRooted($Path)) {
    throw "Refusing to remove a relative staging path: $Path"
  }
  $resolvedStagingPath = [System.IO.Path]::GetFullPath($Path).TrimEnd('\', '/')
  $tempRoot = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath()).TrimEnd('\', '/')
  $parentPath = [System.IO.Path]::GetDirectoryName($resolvedStagingPath)
  $directoryName = [System.IO.Path]::GetFileName($resolvedStagingPath)
  if (-not [string]::Equals($parentPath, $tempRoot, [System.StringComparison]::OrdinalIgnoreCase) -or
      $directoryName -notmatch '^subook-(public-web|admin-web|seller-lookup)-deploy-[0-9a-f]{32}$') {
    throw "Refusing to remove an unexpected staging path: $resolvedStagingPath"
  }
  if (-not (Test-Path -LiteralPath $resolvedStagingPath)) {
    return
  }
  $stagingItem = Get-Item -LiteralPath $resolvedStagingPath -Force -ErrorAction Stop
  if (-not $stagingItem.PSIsContainer -or
      ($stagingItem.Attributes -band [System.IO.FileAttributes]::ReparsePoint)) {
    throw "Refusing to remove a staging path that is not a regular directory: $resolvedStagingPath"
  }

  for ($attempt = 1; $attempt -le 5; $attempt += 1) {
    try {
      $linkedItems = @(Get-ChildItem -LiteralPath $resolvedStagingPath -Recurse -Force -Attributes ReparsePoint -ErrorAction Stop)
      if ($linkedItems.Count -gt 0) {
        throw "Staging contains a symbolic link or junction: $($linkedItems[0].FullName)"
      }
      Remove-Item -LiteralPath $resolvedStagingPath -Recurse -Force -ErrorAction Stop
      if (Test-Path -LiteralPath $resolvedStagingPath) {
        throw "Staging directory still exists after cleanup."
      }
      Write-Host "[deploy:cleanup] Removed staging directory: $resolvedStagingPath" -ForegroundColor Cyan
      return
    } catch {
      if ($attempt -eq 5) {
        Write-Warning "Could not remove staging directory: $resolvedStagingPath. Reason: $($_.Exception.Message)"
        return
      }
      Start-Sleep -Seconds 1
    }
  }
}
