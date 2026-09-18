$ErrorActionPreference = "Stop"

$certificateSubject = "CN=MagicHat Development"
$pfxPath = Join-Path $PSScriptRoot "MagicHat-Development.pfx"
$cerPath = Join-Path $PSScriptRoot "MagicHat-Development.cer"

if ((Test-Path -LiteralPath $pfxPath) -or (Test-Path -LiteralPath $cerPath)) {
  Write-Host "Certificate output already exists."
  Write-Host "PFX: $pfxPath"
  Write-Host "CER: $cerPath"
  exit 0
}

$certificates = @(
  Get-ChildItem Cert:\CurrentUser\My |
    Where-Object {
      $_.Subject -eq $certificateSubject `
        -and $_.HasPrivateKey `
        -and $_.EnhancedKeyUsageList.ObjectId.Value -contains "1.3.6.1.5.5.7.3.3"
    }
)
if ($certificates.Count -gt 1) {
  throw "Multiple $certificateSubject code signing certificates exist. Remove duplicates before continuing."
}

$certificate = if ($certificates.Count -eq 1) {
  $certificates[0]
} else {
  New-SelfSignedCertificate `
    -Type CodeSigningCert `
    -Subject $certificateSubject `
    -FriendlyName "MagicHat Development Code Signing" `
    -CertStoreLocation Cert:\CurrentUser\My `
    -KeyAlgorithm RSA `
    -KeyLength 3072 `
    -HashAlgorithm SHA256 `
    -KeyExportPolicy Exportable `
    -NotAfter (Get-Date).AddYears(3)
}

## $password = Read-Host "PFX password" -AsSecureString
$password = ConvertTo-SecureString "q1w2e3r4t5y6" -AsPlainText -Force
Export-PfxCertificate -Cert $certificate -FilePath $pfxPath -Password $password | Out-Null
Export-Certificate -Cert $certificate -FilePath $cerPath | Out-Null

$certificate | Select-Object Subject, Thumbprint, NotAfter, HasPrivateKey
Write-Host "PFX: $pfxPath"
Write-Host "CER: $cerPath"