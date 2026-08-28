param(
  [string]$Endpoint = "http://localhost:8080/v1/chat/completions",
  [string]$Checker  = "C:\Users\LOKMAN\Desktop\personalProjects\neologism-engine\target\release\examples\collision_check.exe",
  [string]$Out = "$env:TEMP\sweet.json"
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
$ban = "Loom, Flux, Prism, Slate, Pulse, Forge, Arc, Vellum, Echo, Trace, Vault, Vela, Coda, Nidus"

function Ask($prompt, $maxTok) {
  $body = @{ model="gemma-4-12B-it"; temperature=0.9; top_p=0.95; max_tokens=$maxTok;
    messages=@(@{role="user"; content=$prompt}) } | ConvertTo-Json -Depth 6
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($body)
  $r = Invoke-RestMethod -Uri $Endpoint -Method Post -ContentType "application/json; charset=utf-8" -Body $bytes -TimeoutSec 400
  return @{ text = $r.choices[0].message.content.Trim(); fin = $r.choices[0].finish_reason }
}
function Avail($names) {
  $tmp = [System.IO.Path]::GetTempFileName(); $names | Out-File -Encoding ascii $tmp
  $res = & $Checker $tmp 2>$null; Remove-Item $tmp -Force
  $free = @(); foreach ($l in $res) { $p = $l -split "\t"; if ($p.Count -eq 2 -and $p[1] -eq "free") { $free += $p[0] } }
  return $free
}

$results = @()
foreach ($b in $briefs) {
  $prompt = @"
You are a naming expert. Coin 16 brand names for this project that sound like they COULD be real words but are invented - smooth, natural, easy to say, in the exact style of Vercel, Stripe, Twilio, Sentry, Netlify, Render, Vento, Segment, Kudo.

Project: $b

Rules:
- Invented coinages, not real dictionary words. 5-8 letters, 2 syllables.
- Must sound natural and pronounceable. NO awkward q/x/z/y clusters, no random strings.
- Vary the endings; do not make them all rhyme.
- Avoid these overused ones: $ban
- Evoke the product subtly.

Return ONLY the 16 names, comma-separated, nothing else.
"@
  $r = Ask $prompt 16000
  if ($r.fin -ne "stop" -or $r.text.Length -lt 3) { $r = Ask ($prompt + "`nBe decisive and brief."), 16000 }
  $batch = @(); $seen = @{}
  foreach ($tok in ($r.text -split '[,\n]')) {
    $t = ($tok -replace '[^A-Za-z]', '').Trim()
    if ($t.Length -ge 4 -and $t.Length -le 10 -and -not $seen.ContainsKey($t.ToLower())) { $seen[$t.ToLower()] = 1; $batch += $t }
  }
  $free = if ($batch.Count) { Avail $batch } else { @() }
  $results += [pscustomobject]@{ brief = $b; all = @($batch); free = @($free) }
  Write-Host ("[" + $b.Substring(0,[Math]::Min(30,$b.Length)) + " | " + $r.fin + "] free $($free.Count)/$($batch.Count): " + (@($free) -join ", "))
}
$results | ConvertTo-Json -Depth 6 | Out-File -Encoding utf8 $Out
Write-Host "`nwrote $Out"
