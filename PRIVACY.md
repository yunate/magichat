# Privacy policy

Last reviewed: 2026-11-19.

MagicHat is a local Windows developer toolbox maintained by
[yunate](https://github.com/yunate). This policy describes the application as
implemented; it is not a promise that the application never accesses a network.

## Local data

MagicHat stores Command Workspaces, scripts, Macro parameters, application
settings, task templates, task history, and logs on the local filesystem.
Development runs use the repository data directory. Packaged runs use the
application's per-user data directory, while custom Command Roots can point to
directories selected by the user.

Task output, command lines, and parameters can contain confidential values.
Macro parameters and logs are not a credential vault. Do not assume that they
are encrypted or safe to publish. Review screenshots, logs, and issue attachments
before sharing them.

## Update checks and downloads

Packaged MagicHat installations enable automatic updates by default. After a
startup delay, the updater can contact GitHub to check the latest release and
download an update when one is available. You can turn off automatic updates in
the application's Update settings. Development runs do not run the packaged
automatic update flow.

The current release endpoints belong to
[ddmagichat/magichat-release](https://github.com/ddmagichat/magichat-release).
Connections can also reach GitHub's download infrastructure. These requests
expose ordinary network metadata, such as your IP address and request headers,
to the service providers. The update request does not need your Command scripts,
Macro values, task logs, or selected OCR image.

See the [GitHub privacy statement](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement)
for GitHub's handling of requests.

## OCR resources

Image OCR uses Tesseract.js in a local worker. When you start recognition, the
library may download worker code, the OCR engine, and language data from its
configured resource hosts. Therefore first use, or a language change, can require
network access even though recognition itself runs locally.

MagicHat passes the selected image to the local recognition worker, not to a
MagicHat-hosted image-recognition service. Resource hosts still receive network
metadata for their downloads. Consult the
[Tesseract.js project](https://github.com/naptha/tesseract.js) and
[jsDelivr privacy policy](https://www.jsdelivr.com/terms/privacy-policy-jsdelivr-net)
for the relevant resource-loading behavior and policies. Do not use the OCR
feature if those resource downloads are unsuitable for your environment.

## User-directed operations

Commands, terminals, and Task Center scripts execute code supplied or selected
by the user. That code can read local data, change files or system state, start
processes, and communicate with destinations chosen by the script. Its behavior
is not restricted to the application's update or OCR endpoints. Review scripts
before running them, especially before granting administrator privileges.

Following an external link opens a destination selected by the user. The
destination's own privacy policy applies. File Occupancy inspects local process
and file-handle information; administrative operations require appropriate
permissions and can affect other applications.

## Sharing and support

There is no requirement to upload your Workspace or task logs to receive an
update. If you choose to post an issue or attach diagnostic data, you decide
what to share. For privacy questions, contact the maintainer through
[the project repository](https://github.com/yunate/MagicHat), without posting
secrets in a public issue.