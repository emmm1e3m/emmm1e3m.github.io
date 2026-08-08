<#
.SYNOPSIS
启动旅行饼狗的本地 Vite 开发服务器。

.DESCRIPTION
从脚本位置解析仓库根目录，检查 Node.js 24 和 npm 11+，
在 node_modules 或依赖锁标记缺失、package-lock.json 发生变化时
执行干净安装，然后固定使用 localhost:5173 打开
/AllForSUXINHAO/TravellingBingo/。
#>
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$gamePath = '/AllForSUXINHAO/TravellingBingo/'
$devPort = 5173
$gameUrl = "http://localhost:$devPort$gamePath"

function Get-DirectWorkspaceChildPath {
    param(
        [Parameter(Mandatory = $true)]
        [string]$WorkspaceRoot,

        [Parameter(Mandatory = $true)]
        [string]$ChildName
    )

    $normalizedRoot = [IO.Path]::GetFullPath($WorkspaceRoot).TrimEnd(
        [IO.Path]::DirectorySeparatorChar,
        [IO.Path]::AltDirectorySeparatorChar
    )
    $candidatePath = [IO.Path]::GetFullPath((Join-Path $normalizedRoot $ChildName)).TrimEnd(
        [IO.Path]::DirectorySeparatorChar,
        [IO.Path]::AltDirectorySeparatorChar
    )
    $candidateParent = [IO.Directory]::GetParent($candidatePath)
    $pathComparer = [StringComparer]::OrdinalIgnoreCase

    if (
        $null -eq $candidateParent -or
        -not $pathComparer.Equals($candidateParent.FullName, $normalizedRoot) -or
        -not $pathComparer.Equals([IO.Path]::GetFileName($candidatePath), $ChildName) -or
        $pathComparer.Equals($candidatePath, $normalizedRoot)
    ) {
        throw "启动路径越过了工作区边界，已拒绝：$candidatePath"
    }

    return $candidatePath
}

function Get-DependencyInstallReason {
    param(
        [Parameter(Mandatory = $true)]
        [bool]$NodeModulesExists,

        [Parameter(Mandatory = $true)]
        [bool]$MarkerExists,

        [Parameter(Mandatory = $true)]
        [string]$PackageLockHash,

        [AllowNull()]
        [string]$InstalledLockHash
    )

    if (-not $NodeModulesExists) {
        return '本地依赖目录不存在'
    }
    if (-not $MarkerExists) {
        return '依赖锁标记不存在'
    }
    if (-not [StringComparer]::OrdinalIgnoreCase.Equals($InstalledLockHash, $PackageLockHash)) {
        return 'package-lock.json 已发生变化'
    }

    return $null
}

try {
    # 始终以脚本位置推导仓库根，不依赖双击时的当前目录。
    $workspaceRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\..')).Path
    Push-Location -LiteralPath $workspaceRoot

    try {
        $nodeCommand = Get-Command 'node.exe' -ErrorAction SilentlyContinue
        if ($null -eq $nodeCommand) {
            throw '没有找到 Node.js。请安装 Node.js 24 后重试。'
        }

        $npmCommand = Get-Command 'npm.cmd' -ErrorAction SilentlyContinue
        if ($null -eq $npmCommand) {
            throw '没有找到 npm。请安装附带 npm 11 或更高版本的 Node.js 24。'
        }

        $nodeVersionText = (& $nodeCommand.Source --version).Trim()
        $nodeVersion = [version]($nodeVersionText.TrimStart('v'))
        if ($nodeVersion.Major -ne 24) {
            throw "当前 Node.js 版本为 $nodeVersionText，本项目需要 Node.js 24。"
        }

        $npmVersionText = (& $npmCommand.Source --version).Trim()
        $npmVersion = [version]$npmVersionText
        if ($npmVersion.Major -lt 11) {
            throw "当前 npm 版本为 $npmVersionText，本项目需要 npm 11 或更高版本。"
        }

        Write-Host ''
        Write-Host "[旅行饼狗] 工作目录：$workspaceRoot"
        Write-Host "[旅行饼狗] Node.js：$nodeVersionText"
        Write-Host "[旅行饼狗] npm：$npmVersionText"

        $packageLockPath = Get-DirectWorkspaceChildPath -WorkspaceRoot $workspaceRoot -ChildName 'package-lock.json'
        $nodeModulesPath = Get-DirectWorkspaceChildPath -WorkspaceRoot $workspaceRoot -ChildName 'node_modules'
        $dependencyMarkerPath = [IO.Path]::GetFullPath(
            (Join-Path $nodeModulesPath '.travelling-bingo-lock.sha256')
        )
        $pathComparer = [StringComparer]::OrdinalIgnoreCase
        $markerParent = [IO.Directory]::GetParent($dependencyMarkerPath)

        if (
            $null -eq $markerParent -or
            -not $pathComparer.Equals($markerParent.FullName, $nodeModulesPath)
        ) {
            throw "依赖标记路径越过了 node_modules 边界，已拒绝：$dependencyMarkerPath"
        }

        if (-not (Test-Path -LiteralPath $packageLockPath -PathType Leaf)) {
            throw "没有找到 package-lock.json，无法安全安装依赖：$packageLockPath"
        }

        $packageLockItem = Get-Item -LiteralPath $packageLockPath -Force
        if (($packageLockItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
            throw "package-lock.json 是重解析点，已拒绝读取：$packageLockPath"
        }

        $packageLockHash = (Get-FileHash -LiteralPath $packageLockPath -Algorithm SHA256).Hash.ToLowerInvariant()
        $nodeModulesExists = Test-Path -LiteralPath $nodeModulesPath
        $markerExists = $false
        $installedLockHash = $null

        if ($nodeModulesExists) {
            $nodeModulesItem = Get-Item -LiteralPath $nodeModulesPath -Force
            if (-not $nodeModulesItem.PSIsContainer) {
                throw "node_modules 存在但不是目录，已拒绝继续：$nodeModulesPath"
            }
            if (($nodeModulesItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
                throw "node_modules 是重解析点，已拒绝写入依赖标记：$nodeModulesPath"
            }

            $markerExists = Test-Path -LiteralPath $dependencyMarkerPath
            if ($markerExists) {
                $markerItem = Get-Item -LiteralPath $dependencyMarkerPath -Force
                if ($markerItem.PSIsContainer) {
                    throw "依赖锁标记存在但不是文件，已拒绝继续：$dependencyMarkerPath"
                }
                if (($markerItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
                    throw "依赖锁标记是重解析点，已拒绝读取：$dependencyMarkerPath"
                }

                try {
                    $installedLockHash = [IO.File]::ReadAllText($dependencyMarkerPath).Trim().ToLowerInvariant()
                }
                catch {
                    throw "无法读取依赖锁标记：$($_.Exception.Message)"
                }
            }
        }

        $installReason = Get-DependencyInstallReason `
            -NodeModulesExists $nodeModulesExists `
            -MarkerExists $markerExists `
            -PackageLockHash $packageLockHash `
            -InstalledLockHash $installedLockHash

        if ($null -ne $installReason) {
            Write-Host ''
            Write-Host "[旅行饼狗] $installReason，正在按 package-lock.json 同步依赖……"
            & $npmCommand.Source ci --no-audit --no-fund
            $installExitCode = $LASTEXITCODE
            if ($installExitCode -ne 0) {
                throw "依赖安装失败，npm ci 退出码为 $installExitCode。请检查网络和上方 npm 输出。"
            }

            if (-not (Test-Path -LiteralPath $nodeModulesPath -PathType Container)) {
                throw "npm ci 已成功退出，但没有生成 node_modules 目录：$nodeModulesPath"
            }

            $nodeModulesItem = Get-Item -LiteralPath $nodeModulesPath -Force
            if (($nodeModulesItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
                throw "npm ci 后的 node_modules 是重解析点，已拒绝写入依赖标记：$nodeModulesPath"
            }

            try {
                $utf8WithoutBom = New-Object Text.UTF8Encoding($false)
                [IO.File]::WriteAllText($dependencyMarkerPath, "$packageLockHash`n", $utf8WithoutBom)
            }
            catch {
                throw "依赖已安装，但无法写入 UTF-8 依赖锁标记：$($_.Exception.Message)"
            }

            Write-Host "[旅行饼狗] 已记录 package-lock.json SHA-256：$packageLockHash"
        }
        else {
            Write-Host '[旅行饼狗] 本地依赖与 package-lock.json 一致，跳过安装。'
        }

        Write-Host ''
        Write-Host "[旅行饼狗] 正在启动：$gameUrl"
        Write-Host '[旅行饼狗] 停止服务请在本窗口按 Ctrl+C。'
        Write-Host ''

        & $npmCommand.Source run dev -- --host localhost --port $devPort --strictPort --open $gamePath
        if ($LASTEXITCODE -ne 0) {
            throw "开发服务器退出码为 $LASTEXITCODE。如果端口 $devPort 被占用，请关闭占用该端口的程序后再试。"
        }
    }
    finally {
        Pop-Location
    }
}
catch {
    Write-Host ''
    Write-Host "[启动失败] $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
