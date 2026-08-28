param(
  [string]$Endpoint = "http://localhost:8080/v1/chat/completions",
  [string]$Checker  = "C:\Users\LOKMAN\Desktop\personalProjects\neologism-engine\target\release\examples\collision_check.exe",
  [int]$Target = 8,
  [int]$MaxRounds = 4,
  [string]$Out = "$env:TEMP\genloop.json"
)
$ErrorActionPreference = "Stop"
$briefs = @(
  "a command line tool for database migrations",
  "a fast static site generator",
  "a terminal based log viewer for developers",
  "a lightweight state management library",
  "a self hosted password manager",
  "an API mocking and testing toolkit",
  "a real time collaborative code editor",
  "a package registry for private modules"
)
# Words Gemma over-reaches for; ban them so it invents instead of recycling.
$banSeed = @("Loom","Flux","Prism","Slate","Pulse","Forge","Arc","Vellum","Echo","Trace","Coda","Lume","Koda","Kyro","Nidus","Axon","Axis","Aura","Drift","Vela","Velo","Velox","Velos","Sintra","Zent","Pith","Glyph","Quill","Strata","Marrow","Trove","Mantle","Parity","Fable","Facet","Mimic","Spoke","Nexa","Modus","Cove","Meld","Vext","Aisle","Sway","Knit","Brio","Flint")

function Ask($prompt) {
  $body = @{ model="gemma-4-12B-it"; temperature=1.0; top_p=0.95; max_tokens=9000;
    messages=@(@{role="user"; content=$prompt}) } | ConvertTo-Json -Depth 6
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($body)
  $r = Invoke-RestMethod -Uri $Endpoint -Method Post -ContentType "application/json; charset=utf-8" -Body $bytes -TimeoutSec 300
  return $r.choices[0].message.content.Trim()
}
function Avail($names) {
  $tmp = [System.IO.Path]::GetTempFileName()
  $names | Out-File -Encoding ascii $tmp
  $res = & $Checker $tmp 2>$null
  Remove-Item $tmp -Force
  $free = @()
  foreach ($line in $res) { $p = $line -split "\t"; if ($p.Count -eq 2 -and $p[1] -eq "free") { $free += $p[0] } }
  return $free
}

$results = @()
foreach ($b in $briefs) {
  $exclude = New-Object System.Collections.Generic.List[string]
  $banSeed | ForEach-Object { $exclude.Add($_) }
  $seen = New-Object System.Collections.Generic.HashSet[string]
  $free = New-Object System.Collections.Generic.List[string]
  for ($round = 1; $round -le $MaxRounds -and $free.Count -lt $Target; $round++) {
    $banList = ($exclude | Select-Object -Last 60) -join ", "
    $prompt = @"
You are a world-class startup naming expert. Coin 16 ORIGINAL, ownable brand names for this project.

Project: $b

Hard rules:
- INVENT new words (coinages). Do NOT use real dictionary words or existing product/company names.
- Distinctive and unexpected, but easy to say and spell. 4-9 letters.
- These are already taken or overused - do NOT use them or close variants: $banList
- Go weirder and more original with each name.

Return ONLY the 16 names as a comma-separated list, nothing else.
"@
    $text = Ask $prompt
    $batch = @()
    foreach ($tok in ($text -split '[,\n]')) {
      $t = ($tok -replace '[^A-Za-z]', '').Trim()
      if ($t.Length -ge 3 -and $t.Length -le 12 -and $seen.Add($t.ToLower())) { $batch += $t }
    }
    if ($batch.Count -eq 0) { continue }
    $freeBatch = Avail $batch
    foreach ($n in $batch) {
      if ($freeBatch -contains $n) { if ($free.Count -lt 12) { $free.Add($n) } }
      else { $exclude.Add($n) }
    }
    Write-Host ("[" + $b.Substring(0,[Math]::Min(30,$b.Length)) + " r$round] +$($freeBatch.Count) free / $($batch.Count) -> total free $($free.Count)")
  }
  $results += [pscustomobject]@{ brief = $b; free = @($free) }
  Write-Host ("  => " + (@($free) -join ", ")); Write-Host ""
}
$results | ConvertTo-Json -Depth 6 | Out-File -Encoding utf8 $Out
Write-Host "wrote $Out"
