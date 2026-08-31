$ErrorActionPreference = "Stop"

$certificateSubject = "CN=MagicHat Development"
$certificates = @(
  Get-ChildItem Cert:\CurrentUser\My -CodeSigningCert |
    Where-Object { $_.Subject -eq $certificateSubject -and $_.HasPrivateKey }
)
if ($certificates.Count -gt 1) {
  throw "Multiple $certificateSubject code signing certificates exist. Remove duplicates before continuing."
}
if ($certificates.Count -eq 1) {
  $certificates[0] | Select-Object Subject, Thumbprint, NotAfter, HasPrivateKey
  exit 0
}

$certificate = New-SelfSignedCertificate `
  -Type CodeSigningCert `
  -Subject $certificateSubject `
  -FriendlyName "MagicHat Development Code Signing" `
  -CertStoreLocation Cert:\CurrentUser\My `
  -KeyAlgorithm RSA `
  -KeyLength 3072 `
  -HashAlgorithm SHA256 `
  -NotAfter (Get-Date).AddYears(3)
$certificate | Select-Object Subject, Thumbprint, NotAfter, HasPrivateKey