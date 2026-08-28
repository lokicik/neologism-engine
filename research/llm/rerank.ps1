param(
  [string]$Pool = "$env:TEMP\pool.json",
  [string]$Endpoint = "http://localhost:8080/v1/chat/completions",
  [string]$Out = "$env:TEMP\reranked.json"
)
$ErrorActionPreference = "Stop"
$pools = Get-Content $Pool -Raw | ConvertFrom-Json
$sys = "You are a world-class brand naming expert helping a developer name their project. You judge coined (invented) names the way a founder would: is it pronounceable, memorable, and does it evoke what the product does without sounding generic, awkward, or like a random mash of syllables? You have impeccable taste."
$results = @()
foreach ($p in $pools) {
  $shortlist = @($p.candidates | Select-Object -First 12)
  $cands = ($shortlist -join ", ")
  $user = "Project: $($p.brief)`n`nCandidate names (all coined by an engine, some good, most mediocre):`n$cands`n`nPick the 6 names that would make the best real-world brand for this project - the ones a developer would be genuinely proud to ship. Reject anything that sounds generic, clumsy, or meaningless. Return ONLY the 6 names as a comma-separated list, best first, nothing else."
  $body = @{
    model = "gemma-4-12B-it"
    temperature = 0.3
    max_tokens = 8000
    messages = @(
      @{ role = "user"; content = ($sys + "`n`n" + $user) }
    )
  } | ConvertTo-Json -Depth 6
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($body)
  $resp = Invoke-RestMethod -Uri $Endpoint -Method Post -ContentType "application/json; charset=utf-8" -Body $bytes -TimeoutSec 180
  $text = $resp.choices[0].message.content.Trim()
  $picked = @()
  foreach ($tok in ($text -split '[,\n]')) {
    $t = ($tok -replace '[^A-Za-z]', '').Trim()
    if ($t.Length -ge 3 -and ($shortlist -contains $t) -and ($picked -notcontains $t)) { $picked += $t }
  }
  $fin = $resp.choices[0].finish_reason
  $results += [pscustomobject]@{ brief = $p.brief; raw = $text; picked = $picked }
  Write-Host ("[" + $p.brief.Substring(0,[Math]::Min(34,$p.brief.Length)) + " | " + $fin + "] " + ($picked -join ", "))
}
$results | ConvertTo-Json -Depth 6 | Out-File -Encoding utf8 $Out
Write-Host "`nwrote $Out"
