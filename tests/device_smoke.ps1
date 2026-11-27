param([Parameter(Mandatory=$true)][string]$BaseUrl, [switch]$ExerciseLeds)
$ErrorActionPreference = 'Stop'
$client = [guid]::NewGuid().ToString('N')
$other = [guid]::NewGuid().ToString('N')
$leaseRun = $null

function Call-Device($Path, $Data = $null, $Id = $client, $Expected = 200) {
    $arguments = @{ Uri = "$BaseUrl$Path"; Headers = @{'X-Player-Id'=$Id}; UseBasicParsing=$true; TimeoutSec=8 }
    if ($null -ne $Data) { $arguments.Method='POST'; $arguments.Body=$Data }
    try {
        $response = Invoke-WebRequest @arguments
        $status = [int]$response.StatusCode
        $body = $response.Content
    } catch {
        if ($null -eq $_.Exception.Response) { throw }
        $status = [int]$_.Exception.Response.StatusCode
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        try { $body = $reader.ReadToEnd() } finally { $reader.Dispose() }
    }
    if ($status -ne $Expected) { throw "$Path returned $status; expected $Expected. $body" }
    if ($body) { return ($body | ConvertFrom-Json) }
}
function Check($Condition, $Message) { if (!$Condition) { throw $Message } }

# Default leaves LEDs off. -ExerciseLeds explicitly runs the visible color test and all-on.
try {
    $state = Call-Device '/api/state'
    Check (!$state.busy -and !$state.manual.active) 'The board is in use; try again after it is released.'
    Check ($state.best.Count -eq 12) 'Expected separate records for three modes and four speeds.'
    Check ($null -ne $state.pointsHalf) 'Expected half-point scoring.'
    Check (!$state.PSObject.Properties['sequence']) 'The API must not reveal the game sequence.'
    $null = Call-Device '/api/start' @{name='QA';interval='500';mode='3'} $client 400
    $state = Call-Device '/api/manual/start' @{name='QA'}
    $leaseRun = $state.run
    Check ($state.mine -and $state.manual.active -and $state.manual.mask -eq 0) 'Manual start must own the board with all LEDs off.'
    $null = Call-Device '/api/start' @{name='Other';interval='500';mode='0'} $other 409
    $null = Call-Device '/api/manual/start' @{name='Other'} $other 409
    $null = Call-Device '/api/manual/test' @{run=$leaseRun} $other 409
    $null = Call-Device '/api/manual/set' @{run=$leaseRun;mask='0';brightness='25';effect='0';interval='500'} $other 409
    $staleRun = ([uint64]$leaseRun + 1) % 4294967296
    $null = Call-Device '/api/manual/set' @{run=$staleRun;mask='0';brightness='25';effect='0';interval='500'} $client 409
    $null = Call-Device '/api/manual/set' @{run=$leaseRun;mask='16';brightness='25';effect='0';interval='500'} $client 400
    $state = Call-Device '/api/manual/set' @{run=$leaseRun;mask='0';brightness='25';effect='0';interval='500'}
    Check ($state.manual.brightness -eq 25 -and $state.manual.mask -eq 0) 'Manual settings not applied.'
    if ($ExerciseLeds) {
        $state = Call-Device '/api/manual/test' @{run=$leaseRun}
        Check ($state.manual.testing -and $state.manual.testOn -eq 1500 -and $state.manual.testStep -eq 1800) 'Test timing is incorrect.'
        $seen = New-Object System.Collections.Generic.List[int]
        $first = @{}; $last = @{}
        $watch = [System.Diagnostics.Stopwatch]::StartNew()
        do {
            $state = Call-Device '/api/state'
            $lit = @()
            for ($i=0; $i -lt 4; $i++) { if ($state.manual.outputs[$i] -gt 0) { $lit += $i } }
            Check ($lit.Count -le 1) 'The color test must illuminate one LED at a time.'
            if ($lit.Count -eq 1) {
                $color = [int]$lit[0]
                if (!$first.ContainsKey($color)) { $first[$color]=[long]$state.now; $seen.Add($color) }
                $last[$color]=[long]$state.now
            }
            Start-Sleep -Milliseconds 80
        } while ($state.manual.testing -and $watch.Elapsed.TotalSeconds -lt 12)
        Check (!$state.manual.testing) 'Color test failed to finish.'
        Check (($seen -join ',') -eq '0,1,3,2') 'Incorrect physical color test order.'
        foreach ($color in $seen) {
            $span = $last[$color]-$first[$color]
            Check ($span -ge 1100 -and $span -le 1600) "Unexpected observed flash duration for LED ${color}: $span ms."
        }
        $state = Call-Device '/api/manual/set' @{run=$leaseRun;mask='15';brightness='25';effect='0';interval='500'}
        Check (@($state.manual.outputs | Where-Object {$_ -eq 63}).Count -eq 4) 'All-on did not activate all outputs.'
        $null = Call-Device '/api/manual/set' @{run=$leaseRun;mask='0';brightness='25';effect='0';interval='500'}
        Write-Output 'PASS: physical-device output state shows all four 1500ms test flashes in order and all-on; visual color/wiring confirmation still needed.'
    }
    # No owner heartbeat; the real firmware must release the control itself.
    Start-Sleep -Seconds 16
    $state = Call-Device '/api/state' $null $other
    Check (!$state.manual.active -and $state.manual.mask -eq 0) 'Manual control failed to expire.'
    $null = Call-Device '/api/manual/set' @{run=$leaseRun;mask='0';brightness='25';effect='0';interval='500'} $client 400
    Write-Output 'PASS: real ESP32 HTTP API, records, mode validation, exclusive control, stale/foreign requests, manual settings and 15-second expiry. Outputs are off.'
} finally {
    if ($null -ne $leaseRun) {
        try { $null = Call-Device '/api/stop' @{run=$leaseRun} } catch { Write-Warning 'Could not release the test session; it expires automatically.' }
    }
}
