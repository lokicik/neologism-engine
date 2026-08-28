param(
  [string]$Endpoint = "http://localhost:8080/v1/chat/completions",
  [string]$Out = "$env:TEMP\gen.json"
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
$sys = "You are a world-class startup naming expert with impeccable taste. You coin original brand names that are inventive, short, pronounceable, and memorable, evoking the product without being generic or purely descriptive - in the spirit of Vercel, Stripe, Notion, Linear, Figma, Render, Deno."
$results = @()
foreach ($b in $briefs) {
  $u = "$sys`n`nProject: $b`n`nCoin 12 original brand names for this project. Mix a few evocative real words with a few invented coinages. Return ONLY the 12 names as a comma-separated list, best first, nothing else."
  $body = @{ model="gemma-4-12B-it"; temperature=0.85; max_tokens=10000; messages=@(@{role="user"; content=$u}) } | ConvertTo-Json -Depth 6
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($body)
  $resp = Invoke-RestMethod -Uri $Endpoint -Method Post -ContentType "application/json; charset=utf-8" -Body $bytes -TimeoutSec 300
  $text = $resp.choices[0].message.content.Trim()
  $names = @()
  foreach ($tok in ($text -split '[,\n]')) {
    $t = ($tok -replace '[^A-Za-z]', '').Trim()
    if ($t.Length -ge 3 -and $t.Length -le 14 -and ($names -notcontains $t)) { $names += $t }
  }
  $results += [pscustomobject]@{ brief = $b; names = $names }
  Write-Host ("[" + $b.Substring(0,[Math]::Min(34,$b.Length)) + " | " + $resp.choices[0].finish_reason + "] " + ($names -join ", "))
}
$results | ConvertTo-Json -Depth 6 | Out-File -Encoding utf8 $Out
Write-Host "`nwrote $Out"
