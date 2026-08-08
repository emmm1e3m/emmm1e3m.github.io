<#
.SYNOPSIS
清理旅行饼狗工作区内可重建的构建和测试目录。

.DESCRIPTION
仅处理脚本内的八个目录白名单。每个目标会先解析绝对路径，
校验直接父目录和叶子名，并拒绝文件或重解析点。

.EXAMPLE
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/maintenance/clean-workspace.ps1 -WhatIf

只预览可清理目录，不删除任何内容。

.EXAMPLE
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/maintenance/clean-workspace.ps1

校验通过后删除白名单中实际存在的目录。
#>
[CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
param()

$ErrorActionPreference = 'Stop'

# 只允许清理仓库根目录下的可重建产物。
$allowedDirectoryNames = @(
    'dist',
    '_site',
    'coverage',
    'playwright-report',
    'test-results',
    '.playwright-cli',
    'output',
    '.venv'
)

$workspaceRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\..')).Path
$workspaceRoot = [IO.Path]::GetFullPath($workspaceRoot).TrimEnd(
    [IO.Path]::DirectorySeparatorChar,
    [IO.Path]::AltDirectorySeparatorChar
)
$pathComparer = [StringComparer]::OrdinalIgnoreCase
$removedCount = 0

foreach ($directoryName in $allowedDirectoryNames) {
    $candidatePath = [IO.Path]::GetFullPath((Join-Path $workspaceRoot $directoryName)).TrimEnd(
        [IO.Path]::DirectorySeparatorChar,
        [IO.Path]::AltDirectorySeparatorChar
    )
    $candidateParent = [IO.Directory]::GetParent($candidatePath)

    # 同时验证父目录和叶子名，防止绕过白名单或退出工作区。
    if (
        $null -eq $candidateParent -or
        -not $pathComparer.Equals($candidateParent.FullName, $workspaceRoot) -or
        -not $pathComparer.Equals([IO.Path]::GetFileName($candidatePath), $directoryName) -or
        $pathComparer.Equals($candidatePath, $workspaceRoot)
    ) {
        throw "安全检查失败，拒绝处理路径：$candidatePath"
    }

    if (-not (Test-Path -LiteralPath $candidatePath)) {
        Write-Host "[跳过] 不存在：$candidatePath"
        continue
    }

    $item = Get-Item -LiteralPath $candidatePath -Force
    if (-not $item.PSIsContainer) {
        throw "白名单目标不是目录，拒绝删除：$candidatePath"
    }

    # 不跟随结点或符号链接，避免递归删除工作区外的内容。
    if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
        throw "目标是重解析点，拒绝递归删除：$candidatePath"
    }

    if ($PSCmdlet.ShouldProcess($candidatePath, '递归删除可重建工作区产物')) {
        Remove-Item -LiteralPath $candidatePath -Recurse -Force
        Write-Host "[已清理] $candidatePath"
        $removedCount += 1
    }
}

if ($WhatIfPreference) {
    Write-Host ''
    Write-Host '[预览完成] 没有删除任何文件。'
}
else {
    Write-Host ''
    Write-Host "[清理完成] 共删除 $removedCount 个可重建目录。"
}

Write-Host '[保留] node_modules、resources、research 和字体均不在清理白名单中。'
