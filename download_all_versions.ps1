# download_flat_index_v2.ps1

$DownloadDir = Join-Path $PSScriptRoot "packages/@preview"
if (-not (Test-Path $DownloadDir)) { New-Item -ItemType Directory -Path $DownloadDir | Out-Null }

# 目标包列表
$TargetPackages = @(
    # 绘图/图表
    "cetz", "fletcher", "lilaq", "quill",
    # 化学/物理
    "alchemist", "physica",
    # 幻灯片
    "touying", "polylux",
    # 学术工具
    "equate", "glossarium", "hydra", "unify", "showybox",
    # 表格/排版
    "pavemat", "zebraw", "zero",
    # 随机数/工具
    "suiji", "tidy", "wordometer",
    # 甘特图/时间线
    "timeliney",
    # 盒子/装饰
    "umbra", "frame-it",
    # 其他
    "pinit", "meander", "lovelace", "drafting",
    "wrap-it", "stack-pointer", "syntree"
)

Write-Host "=== 正在下载官方索引文件... ===" -ForegroundColor Cyan
$IndexUrl = "https://packages.typst.org/preview/index.json"
$TempIndex = Join-Path $env:TEMP "typst_index_flat.json"

try {
    Invoke-WebRequest -Uri $IndexUrl -OutFile $TempIndex -ErrorAction Stop
    Write-Host "[INFO] 索引下载完成，正在解析..." -ForegroundColor Green
    
    # 解析为扁平数组
    $allPackages = Get-Content $TempIndex -Raw | ConvertFrom-Json
    Remove-Item $TempIndex -ErrorAction SilentlyContinue

} catch {
    Write-Host "[ERROR] 索引下载失败: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

$totalDownloaded = 0
$totalSkipped = 0

foreach ($pkgName in $TargetPackages) {
    Write-Host "`n[INFO] 处理包: $pkgName" -ForegroundColor Yellow
    
    # 1. 在扁平数组中筛选出该包名的所有条目
    $pkgVersions = $allPackages | Where-Object { $_.name -eq $pkgName } | Select-Object -ExpandProperty version -Unique
    
    if (-not $pkgVersions) {
        Write-Host "  [WARN] 索引中未找到该包的任何版本" -ForegroundColor DarkYellow
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
            Write-Host "  [INFO] $fileName" -ForegroundColor Green
        } catch {
            Write-Host "  [WARN] 下载失败: $fileName ($($_.Exception.Message))" -ForegroundColor Red
        }
        
        Start-Sleep -Milliseconds 100
    }
}

Write-Host "`n[SUCCEED] 全部完成！" -ForegroundColor Cyan
Write-Host "[NEW] 新下载: $totalDownloaded"
Write-Host "[SKIPED] 已跳过: $totalSkipped"
Write-Host "[SAVED] 保存位置: $DownloadDir"