$path = "C:\Users\asus\OneDrive\Desktop\h1\README.md"
$content = [System.IO.File]::ReadAllText($path, [System.Text.Encoding]::UTF8)
$content = $content -replace "चौक", ""
$content = $content -replace "—", "�"
$content = $content -replace "→", "?"
$content = $content -replace "−", "-"
$content = $content -replace "6–30", "6�30"
[System.IO.File]::WriteAllText($path, $content, [System.Text.Encoding]::UTF8)
Write-Host "done"
