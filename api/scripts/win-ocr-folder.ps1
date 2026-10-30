param(
  [Parameter(Mandatory = $true)][string]$Folder
)

Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime]
$null = [Windows.Storage.FileAccessMode, Windows.Storage, ContentType = WindowsRuntime]
$null = [Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics.Imaging, ContentType = WindowsRuntime]
$null = [Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType = WindowsRuntime]
$null = [Windows.Globalization.Language, Windows.Globalization, ContentType = WindowsRuntime]

$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
  $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
})[0]

function Await-WinRt($op, [type]$resultType) {
  $method = $asTaskGeneric.MakeGenericMethod($resultType)
  $task = $method.Invoke($null, @($op))
  $task.Wait(-1) | Out-Null
  return $task.Result
}

$engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage((New-Object Windows.Globalization.Language('en')))
if (-not $engine) { $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages() }

$images = Get-ChildItem -LiteralPath $Folder -Recurse -Filter *.png | Sort-Object FullName
foreach ($image in $images) {
  $txt = [System.IO.Path]::ChangeExtension($image.FullName, '.txt')
  if ((Test-Path -LiteralPath $txt) -and ((Get-Item -LiteralPath $txt).Length -gt 20)) { continue }
  $file = Await-WinRt ([Windows.Storage.StorageFile]::GetFileFromPathAsync($image.FullName)) ([Windows.Storage.StorageFile])
  $stream = Await-WinRt ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
  $decoder = Await-WinRt ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
  $bitmap = Await-WinRt ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
  $result = Await-WinRt ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])
  Set-Content -LiteralPath $txt -Value $result.Text -Encoding UTF8
  Write-Output $image.Name
}
