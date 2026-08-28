param(
  [string]$Endpoint = "http://localhost:8080/v1/chat/completions",
  [string]$Checker  = "C:\Users\LOKMAN\Desktop\personalProjects\neologism-engine\target\release\examples\collision_check.exe",
  [string]$Out = "$env:TEMP\pun.json"
)
$ErrorActionPreference = "Stop"
$briefs = @(
  "a self hosted password manager",
  "a terminal based log viewer for developers",
  "a command line tool for database migrations"
)

function Ask($prompt) {
  $body = @{ model="gemma-4-12B-it"; temperature=0.95; top_p=0.95; max_tokens=20000;
    messages=@(@{role="user"; content=$prompt}) } | ConvertTo-Json -Depth 6
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($body)
  $r = Invoke-RestMethod -Uri $Endpoint -Method Post -ContentType "application/json; charset=utf-8" -Body $bytes -TimeoutSec 500
  return @{ text = $r.choices[0].message.content.Trim(); fin = $r.choices[0].finish_reason }
}

$results = @()
foreach ($b in $briefs) {
  # Angle A: double-reading / pun names (the pattern in every name the owner kept)
  $punPrompt = @"
You invent product names with a DOUBLE READING: the name sounds like a familiar word or phrase, while also containing the product's function. The founder's favorites, so you see the trick:
- "Tabalong" (tab tool) sounds like "tag along"
- "Invault" (password vault) sounds like "involved"
- "Groupane" (log viewer) = group + pane
- "Mokit" (API mocking) = literally "mock kit"
- "Stacraft" (stack tool) winks at StarCraft
- "Nestatic" (static sites) = nest + static

Project: $b

Invent 10 names with that same double-click: familiar sound + hidden function. For each give the decode in 3-6 words.
Format each line exactly as: Name :: decode
Nothing else.
"@
  # Angle B: story/reference names (Kubernetes/Docker/Prometheus school)
  $storyPrompt = @"
You name developer tools the way the greats were named - with a STORY, not a letter mash:
- Kubernetes: Greek for helmsman (steers containers)
- Docker: dock worker moving containers
- Prometheus: brought fire (metrics) to humans
- Celery: task QUEUE, "Q"
- Redis, Kafka, Terraform... each has a reason.

Project: $b

Give 10 name ideas that each carry a real story: mythology, history, seafaring, a foreign word (Turkish, Norse, Japanese, Latin...), literature, wordplay. Prefer obscure-but-ownable words over common English ones. For each give the story in 3-8 words.
Format each line exactly as: Name :: story
Nothing else.
"@
  foreach ($mode in @(@{n="pun"; p=$punPrompt}, @{n="story"; p=$storyPrompt})) {
    $r = Ask $mode.p
    $items = @()
    foreach ($line in ($r.text -split "`n")) {
      if ($line -match '^\s*\**\s*([A-Za-z]{3,16})\**\s*::\s*(.+)$') {
        $items += [pscustomobject]@{ name = $Matches[1]; why = $Matches[2].Trim() }
      }
    }
    # availability
    $free = @{}
    if ($items.Count) {
      $tmp=[System.IO.Path]::GetTempFileName(); $items | ForEach-Object { $_.name } | Out-File -Encoding ascii $tmp
      foreach ($l in (& $Checker $tmp 2>$null)) { $p=$l -split "\t"; if ($p.Count -eq 2) { $free[$p[0]] = ($p[1] -eq "free") } }
      Remove-Item $tmp -Force
    }
    $withAvail = $items | ForEach-Object { [pscustomobject]@{ name=$_.name; why=$_.why; free=[bool]$free[$_.name] } }
    $results += [pscustomobject]@{ brief=$b; mode=$mode.n; fin=$r.fin; items=@($withAvail) }
    Write-Host ("[" + $mode.n + " | " + $b.Substring(0,[Math]::Min(28,$b.Length)) + " | " + $r.fin + "]")
    foreach ($it in $withAvail) { Write-Host ("  " + $it.name + ($(if ($it.free) {" (free)"} else {" (taken)"})) + " :: " + $it.why) }
    Write-Host ""
  }
}
$results | ConvertTo-Json -Depth 6 | Out-File -Encoding utf8 $Out
Write-Host "wrote $Out"
