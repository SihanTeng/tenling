# Apple distribution

TenLing uses bundle ID `com.tenling.app` and Apple Developer team `URMJKK7N6J`. App Store Connect record: [6816904484](https://appstoreconnect.apple.com/apps/6816904484/distribution/info). iOS and macOS versions are configured as free apps. A record in “Prepare for Submission” is not a public App Store listing.

## Direct macOS / Homebrew

Build a universal Developer ID app, then notarize it:

```sh
APPLE_SIGNING_IDENTITY='Developer ID Application: …' \
  bun run tauri build --target universal-apple-darwin --bundles app \
  --config '{"bundle":{"createUpdaterArtifacts":false}}'
NOTARY_PROFILE=your-keychain-profile \
  APPLE_SIGNING_IDENTITY='Developer ID Application: …' \
  bash scripts/package-notarized-macos.sh
```

The packaging script verifies the signature, Apple timestamp, hardened runtime, and both architectures; notarizes and staples the app and DMG; and requires Gatekeeper acceptance. It submits packages to Apple. Keep signing material and app-specific passwords in Keychain, not this repository.

Publish only the resulting `artifacts/macos/tenling-<version>-macos-universal.dmg`. Generate its SHA-256 after stapling, update `Casks/tenling.rb` with `scripts/update-homebrew-cask.sh`, and publish that cask to `SihanTeng/homebrew-tenling`. Verify the public download checksum and run `brew fetch --cask sihanteng/tenling/tenling` before claiming Homebrew availability.

The release workflow now requires Apple signing secrets, keeps artifacts in a draft until validation passes, and refuses to overwrite a published release. See `.github/SECRETS.md`. Those Apple CI secrets and the remote-tap token still need configuration; a successful local release does not configure CI credentials.

## iPhone and iPad

The checked-in Xcode project is `src-tauri/gen/apple/tenling.xcodeproj`. Build with:

```sh
bun run build:ios -- --ci
```

Use `scripts/build-ios.sh` so SwiftPM uses its native build system on Xcode 27 and Xcode uses Apple's matching rsync helper. The project excludes static libraries from bundle resources. iOS app icons must be opaque RGB PNGs; do not replace them with the transparent desktop icons.

App Store builds use the `app-store` Rust feature and do not register the external updater. The iOS target also omits desktop window/process integrations. User-selected files are normalized to local paths; Apple security-scoped bookmarks retain access across sessions where supported by the file provider. Reopen moved or unavailable documents using the file picker.

For export/upload, Xcode can use its existing account and cloud-managed distribution identity. An export-options plist should use `method=app-store-connect`, `signingStyle=automatic`, and `manageAppVersionAndBuildNumber=false`. Use `destination=export` first; inspect the signed IPA before `destination=upload`. Increment `bundle.iOS.bundleVersion` for each uploaded build. Upload does not submit the app for review.

## Mac App Store

`src-tauri/tauri.appstore.conf.json` enables the App Sandbox entitlements and disables external updates. Build a signed package with:

```sh
APPLE_SIGNING_IDENTITY='Apple Distribution: …' \
  APPLE_INSTALLER_IDENTITY='3rd Party Mac Developer Installer: …' \
  APPLE_PROVISIONING_PROFILE=/path/to/TenLing.provisionprofile \
  bun run build:mac:appstore
```

A Developer ID certificate is for direct distribution; it does not replace Mac App Store application/installer signing. The profile must match `URMJKK7N6J.com.tenling.app`. Validate file opening, saving, reopening after restart, and export while running inside the App Sandbox before submission.

## Status and evidence — September 28, 2026

- Frontend: 154 tests across 18 suites pass; TypeScript and Biome checks pass.
- Native: final universal direct Mac and Mac App Store variants build; iOS release build 4 archives successfully with Apple's development signing workflow and uploads through Xcode Organizer.
- App Store Connect: free pricing and release availability in 175 storefronts; both 0.3.3 listings have approved description, categories, keywords, support/marketing links, and the review contact reused from EasyExpense with owner authorization. Sign-in is not required. Data Not Collected is published, the owner-approved No Third-Party Content declaration is saved, and the calculated age rating is 4+.
- Website: support and privacy pages are deployed at `https://tenling.brighteng.org/`.
- Final direct Mac package: Apple accepted app submission `15f3a465-cfff-4ec2-bbf8-367fd6b30406` and DMG submission `5325f510-2bd5-4bf3-b70f-43ed14bad887`. Both are stapled and pass Gatekeeper. The DMG SHA-256 is `b6e65f88d8f91b3b9d5c44fbfb879436f917ddc6062cf5ff7a66e1ff1ab5c3af`. [Release v0.3.3](https://github.com/SihanTeng/tenling/releases/tag/v0.3.3) and the `SihanTeng/homebrew-tenling` tap are public. The public download checksum matches, and `brew fetch --cask sihanteng/tenling/tenling` passes with Homebrew 7. The latest complete cross-platform release remains v0.3.2; v0.3.3 contains the Mac DMG.
- iOS build 4: uploaded successfully through Xcode Organizer. It includes presentation sizing, in-place file-provider access, saving when only the selected file is writable, and touch editor text sizing. Build 4 processed, its owner-approved export compliance declaration was saved, and it was submitted with native iPhone and iPad screenshots. Status: Waiting for Review. Submission: `459dfb58-82e7-467f-9035-06f0163b384c`.
- Mac Store: final sandboxed archive uploaded through Xcode Organizer. Upload completed with a non-blocking missing dSYM warning. The build processed and its owner-approved export compliance declaration was saved. An Xcode Debugging export of the same archive runs with the App Sandbox and a matching development provisioning profile. Saving, reopening after restart, Save As, HTML export, and presentation passed. In-place rename can fail when access is limited to the selected file; use Save As or rename through Finder. The native Mac screenshot processed and the version was submitted. Status: Waiting for Review. Submission: `bc1fa59c-b14b-47fe-8440-42c8542b7558`.
- Layout: checked browser widths from 320 to 1440 pixels, portrait/landscape, sidebar, menus, find, and presentation. Presentation sizing now respects both available width and height so its controls remain visible.
- Native iOS: the app launched on the existing iOS 26.5 simulator. Welcome/editor layouts and the native save picker were inspected. The owner completed the handed-off save/reopen check and reported the expected test text. Native inspection exposed focus zoom, addressed by giving the touch editor a 16px base size. The final native keyboard check passed without focus zoom, and the test document persisted across restart. Native iPhone 17 Pro Max and iPad Air 13-inch editor screenshots were captured and uploaded.
- Source CI at `2f445a9` passed frontend lint/tests/build, Rust formatting/Clippy, and Linux AppImage smoke build. The release workflow refused to overwrite the already-published immutable v0.3.3 assets as designed.
- Remaining Store requirement: Apple review approval for both platforms. Both versions are configured to release automatically after approval. Xcode Organizer recognizes the signed-in account; the CLI currently reports No Accounts.

Local artifacts and screenshots are under `artifacts/` and are intentionally ignored by Git. Store text is in `docs/app-store-metadata.md`. Neither a local package nor a Store draft is proof of publication.
