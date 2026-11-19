# Code signing policy

## Current status

MagicHat is preparing an application for free open-source code signing.
SignPath Foundation sponsorship has not been granted, no sponsored signing
credentials are configured, and the public build workflow must not be described
as producing SignPath-signed releases.

The current `package.bat` entry point uses a development self-signed certificate
and creates it through the project's development certificate script if missing.
CI uses this same entry point. Development self-signing does not establish a
publicly trusted publisher identity or SignPath approval. A failed signing
request must not be represented as a successful signed release.

Further SignPath integration is paused at the maintainer's request until
Foundation approval is confirmed. Record the application submission status,
reviewer requests, and approval from actual correspondence; preparing the
application form does not establish that it was submitted or accepted.

## Responsibilities

| Role | Maintainer | Responsibility |
| --- | --- | --- |
| Author and committer | [yunate](https://github.com/yunate) | Maintain source code and build configuration |
| Reviewer | [yunate](https://github.com/yunate) | Review external contributions and dependency changes |
| Release and signing approver | [yunate](https://github.com/yunate) | Check the source revision, build evidence, and requested signing scope |

This is currently a single-maintainer project, not a claim of independent
two-person review. Confirm the acceptable role arrangement with SignPath during
onboarding. All signing participants must enable multi-factor authentication on
GitHub and SignPath. Signing credentials belong in protected CI secrets, never
in the repository, build logs, or issue comments.

## License and dependencies

MagicHat-owned source is licensed under the [MIT License](LICENSE).
[Third-Party Notices](THIRD_PARTY_NOTICES.md) records dependency sources and the
outstanding upstream license review. In particular, ddwhouses and its ddbase
dependency need explicit upstream licenses. Public source without a license is
not treated as permission to redistribute or re-sign it.

The linked source revisions do not establish that the committed ddwhouses
executable matches those sources. Its hash identifies the bundled bytes, not
their upstream build process. Verifiable upstream build evidence and approval
of this prebuilt component remain relevant to the SignPath application.

## Build and release evidence

The single [Build and publish workflow](.github/workflows/build-and-publish.yml)
checks out the repository, restores dependency download caches, installs locked
dependencies and calls [package.bat](package.bat), then calls
[publish.bat](publish.bat). It uses the
Windows runner's preinstalled Node.js and npm. It does not add a separate typecheck,
artifact upload, script layer, or cross-job artifact transfer.

The build job runs on a GitHub-hosted Windows runner, installs dependencies
from the lockfile and invokes the existing packaging
command. MagicHat-owned native tools are built by that command. ddwhouses is
packaged directly from the executable in this repository; neither ddwhouses nor
ddbase is fetched or compiled by this workflow.

The existing publishing script uploads installer and update archive outputs to
the release repository. There is no separate Actions artifact upload or
additional provenance or checksum report. Keep
the workflow run URL, source commit, version, and applicable upstream binary
evidence for a future signing review; the current pipeline does not attest that
the prebuilt helper was compiled from the linked source.

Every manual workflow run publishes after a successful package build. There is
no build-only mode, publication input, or additional confirmation step. The
existing latest-only release script replaces current assets and removes older
releases and tags after a successful publication. Do not run this workflow if
that cleanup is unwanted. This is not a SignPath-signed release process.

Configure the `release` GitHub Environment with deployment restricted to `main`
and the required release reviewers. Store `MAGICHAT_RELEASE_TOKEN` there with
write access to `ddmagichat/magichat-release`; the source repository's default
token needs only read access. The release credential is passed only to the
publication step. Branch restrictions and approvals are controlled by that
Environment rather than additional workflow checks. `publish.bat` retains its existing
authentication behavior: failed authentication can enter the interactive web
login path. Configure a valid token before running CI; no new non-interactive
authentication or signing fallback behavior is added by this workflow.

Signed releases are planned to follow this sequence after onboarding:

1. Build from the reviewed source revisions on an approved hosted runner.
2. Upload the unsigned artifacts to the workflow artifact store.
3. Submit the artifact ID to SignPath using the official integration.
4. Require the designated maintainer's explicit signing approval.
5. Verify the returned signatures and publish only the approved signed artifacts.

## Approval and integration handoff

### What to expect after approval

The Foundation normally communicates the application result and account or
onboarding instructions by email. This is not normally delivery of a private-key
certificate file that can replace the current development certificate.

- The signing private key remains in SignPath-managed hardware security modules
  (HSMs); it is not downloaded as a `.pfx` or `.p12` for local use.
- The sponsored certificate is issued in SignPath Foundation's name, not the
  maintainer's personal or company name.
- An approved integration submits verifiable build artifacts to the service,
  obtains the required approval, and downloads the signed artifacts.
- Any downloadable public certificate is not a private signing key and cannot
  be substituted into the existing local PFX signing command.

Follow the actual approval email and onboarding instructions if the service
requires additional steps. Do not assume approval from an automated receipt.

### Information to confirm in the SignPath account

After approval, confirm the following non-secret configuration with SignPath:

| Setting | Purpose |
| --- | --- |
| Organization ID | Identify the SignPath account used for the request |
| Project slug | Identify the approved MagicHat signing project |
| Artifact configuration slug | Define accepted packages, nested files, and metadata restrictions |
| Signing policy slug | Select the approved certificate and approval policy |
| Trusted repository and build integration | Link requests to reviewed source and hosted CI artifacts |
| Approver roles | Confirm the single-maintainer arrangement and release approval process |

Enable multi-factor authentication on SignPath as well as GitHub. Put the
eventual SignPath submitter credential in a protected GitHub Environment secret,
such as `SIGNPATH_API_TOKEN`. Do not record its value in this document or send it
through chat. It is separate from `MAGICHAT_RELEASE_TOKEN`, which authorizes
publishing to the release repository and is not a SignPath signing credential.

### Before resuming implementation

1. Confirm approval and the actual account configuration from the Foundation.
2. Resolve remaining upstream license, binary-origin, and artifact-scope review
	items below, including ddwhouses, Electron, and node-pty.
3. Plan the inner-executable and outer-installer signing stages with the approved
	artifact rules. Do not simply replace the development PFX path or sign only
	the outer installer while claiming that every embedded file is signed.
4. Add only the artifact upload and official SignPath integration steps required
	by the approved build flow. The current workflow has no such integration.
5. Keep publication after signature verification. The existing workflow calls
	`publish.bat` immediately after packaging, so it must be adjusted before it
	can be used to publish Foundation-signed output.
6. Manually approve and verify the first signed main executable, native helpers,
	uninstaller where applicable, installer, and update archive contents before
	publishing them to `ddmagichat/magichat-release`.
7. After approval, add the required attribution to the project and download pages
	and update this document's current-status notice to match the verified state.

Until work resumes, leave the current development signing and release scripts
unchanged. This handoff does not authorize changes to failure recovery, retries,
or fallback signing behavior; obtain the maintainer's confirmation before
implementing any such change.

## Intended signing scope

Discuss the artifact configuration with SignPath before enabling production
signing. The intended MagicHat-owned files include the main application,
native CLI Helper, JavaScript Launcher, stable launcher, uninstaller where
applicable, and NSIS installer. Native executables and installer metadata must
identify MagicHat and use the same release version.

Sign inner executables before packaging them into the final installer or update
archive, then sign the outer installer. Do not repackage or modify a file after
its final signature. Do not assume that signing only the installer signs the
executables inside it.

Electron, node-pty, ddwhouses, and other separately maintained components must
not automatically be included in a MagicHat-only re-signing rule. Confirm the
ownership, upstream signatures, and approved treatment of each component with
SignPath. A source build alone does not resolve a missing license.

## Privacy and installation

See the [Privacy policy](PRIVACY.md) for local storage, default update checks,
OCR resource downloads, and user-script behavior. Do not replace it with a
blanket statement that the application never communicates over the network.
The installer provides an uninstallation path; administrative process controls
must be explained accurately when describing the project to reviewers.

## Application checklist

- [x] Add an explicit MIT license for MagicHat-owned code.
- [x] Identify the public ddwhouses and ddbase source repositories.
- [x] Document current network behavior and signing responsibilities.
- [ ] Publish explicit upstream licenses for ddwhouses and dd, then update the reviewed source references and notices.
- [ ] Complete the redistributed dependency and asset license inventory.
- [ ] Run the combined Windows workflow on GitHub-hosted infrastructure, inspect its artifacts, and document the bundled helper's upstream build provenance.
- [ ] Confirm native product-name and product-version metadata for every proposed signed executable.
- [ ] Confirm the installed application's privacy notice and network controls meet the Foundation's conditions.
- [ ] Enable GitHub multi-factor authentication and suitable branch and release protections.
- [ ] Confirm the public download page includes the functionality, privacy policy, and a link to this code signing policy.
- [ ] Submit the application and confirm the single-maintainer role arrangement.
- [ ] Configure the SignPath project, artifact rules, signing policy, and protected CI credential after approval.
- [ ] Manually approve and verify a first signed release before enabling a regular release process.

The application requires a maintained project with existing releases and
verifiable reputation. Preparing these files does not guarantee acceptance.
Apply through [SignPath Foundation](https://signpath.org/apply) and review the
[current conditions](https://signpath.org/terms) and
[GitHub integration documentation](https://docs.signpath.io/trusted-build-systems/github).

Only after sponsorship is approved, add the required attribution to this page
and the project's home and download pages:

> Free code signing provided by [SignPath.io](https://signpath.io/), certificate by [SignPath Foundation](https://signpath.org/).

Until then, the current-status notice above remains authoritative.