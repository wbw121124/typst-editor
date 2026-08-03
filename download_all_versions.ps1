# download_flat_index_v2.ps1

$DownloadDir = Join-Path $PSScriptRoot "packages/@preview"
if (-not (Test-Path $DownloadDir)) { New-Item -ItemType Directory -Path $DownloadDir | Out-Null }

# 目标包列表
$TargetPackages = @(
    # "alchemist", "bulb", "cetz", "cheq", "codly", "commute", "conchord",
    # "curryst", "deckz", "drafting", "eggs", "equate", "finite", "fletcher",
    # "frame-it", "game-theoryst", "gentle-clues", "glossarium", "hydra",
    # "lilaq", "lovelace", "meander", "pavemat", "physica", "pinit", "polylux",
    # "quick-maths", "quill", "showybox", "stack-pointer", "suiji", "syntree",
    # "tiaoma", "tidy", "timeliney", "tiptoe", "touying", "umbra", "unify",
    # "wordometer", "wrap-it", "coalgorithmic", "zebra", "zebraw", "zero"
    # "cuti"
    # "oxifmt"
)

Write-Host "=== 正在下载官方索引文件... ===" -ForegroundColor Cyan
$IndexUrl = "https://packages.typst.org/preview/index.json"
$TempIndex = Join-Path $env:TEMP "typst_index_flat.json"

try {
    Invoke-WebRequest -Uri $IndexUrl -OutFile $TempIndex -ErrorAction Stop
    Write-Host "✅ 索引下载完成，正在解析..." -ForegroundColor Green
    
    # 解析为扁平数组
    $allPackages = Get-Content $TempIndex -Raw | ConvertFrom-Json
    Remove-Item $TempIndex -ErrorAction SilentlyContinue

} catch {
    Write-Host "❌ 索引下载失败: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

$totalDownloaded = 0
$totalSkipped = 0

foreach ($pkgName in $TargetPackages) {
    Write-Host "`n📦 处理包: $pkgName" -ForegroundColor Yellow
    
    # 1. 在扁平数组中筛选出该包名的所有条目
    $pkgVersions = $allPackages | Where-Object { $_.name -eq $pkgName } | Select-Object -ExpandProperty version -Unique
    
    if (-not $pkgVersions) {
        Write-Host "  ⚠️ 索引中未找到该包的任何版本" -ForegroundColor DarkYellow
        continue
    }

    Write-Host "  找到 $($pkgVersions.Count) 个版本" -ForegroundColor Gray

    # 2. 遍历下载
    foreach ($ver in $pkgVersions) {
        $fileName = "$pkgName-$ver.tar.gz"
        $filePath = Join-Path $DownloadDir $fileName
        
        if (Test-Path $filePath) {
            $totalSkipped++
            continue
        }

        # 构造 CDN 链接
        $cdnUrl = "https://packages.typst.org/preview/$fileName"
        
        try {
            Invoke-WebRequest -Uri $cdnUrl -OutFile $filePath -ErrorAction Stop
            $totalDownloaded++
            Write-Host "  ✅ $fileName" -ForegroundColor Green
        } catch {
            Write-Host "  ❌ 下载失败: $fileName ($($_.Exception.Message))" -ForegroundColor Red
        }
        
        Start-Sleep -Milliseconds 100
    }
}

Write-Host "`n🎉 全部完成！" -ForegroundColor Cyan
Write-Host "✅ 新下载: $totalDownloaded"
Write-Host "⏭️ 已跳过: $totalSkipped"
Write-Host "📁 保存位置: $DownloadDir"