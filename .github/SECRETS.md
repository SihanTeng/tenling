# Secrets & variables (canonical registry)

**This is the only place that defines names.**  
Workflows and docs must match this file — no aliases, no legacy names.

Set them on the GitHub repo:

**Settings → Secrets and variables → Actions**

| Kind | Where |
| --- | --- |
| **Secret** | *Secrets* tab (encrypted) |
| **Variable** | *Variables* tab (non-sensitive config) |

---

## Naming convention

| Prefix | Meaning |
| --- | --- |
| `TAURI_*` | App signing / OTA (matches [Tauri updater docs](https://v2.tauri.app/plugin/updater/)) |
| `DIST_*` | Distribution channels |

Rules:

- One name per purpose. Do not invent synonyms.
- Prefer **Variables** when the value is not secret.
- Optional `DIST_*` jobs **skip cleanly** when unset.
- Signing secrets are required to produce updater (`.sig` / `latest.json`) artifacts.

---

## Full list

### Signing

| Name | Kind | Job | Value |
| --- | --- | --- | --- |
| `TAURI_SIGNING_PRIVATE_KEY` | Secret | `build` | Contents of `~/.tauri/tenling.key` (`bun run tauri -- signer generate`) |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Secret | `build` | Key password, or empty if none |

The macOS release job fails before publishing if the following signing secrets are missing. Installers stay in a draft release until all builds and Mac signature, staple, and Gatekeeper checks pass.

| Name | Kind | Purpose |
| --- | --- | --- |
| `APPLE_CERTIFICATE` | Secret | Base64 Developer ID Application certificate and private key (.p12) |
| `APPLE_CERTIFICATE_PASSWORD` | Secret | Password protecting the .p12 |
| `APPLE_SIGNING_IDENTITY` | Secret | Developer ID Application identity |
| `APPLE_ID` | Secret | Apple account used for notarization |
| `APPLE_PASSWORD` | Secret | App-specific password for notarization |
| `APPLE_TEAM_ID` | Secret | Apple Developer team ID |

Local releases may use an existing Keychain notarization profile instead; never commit signing material.

### Distribution

| Name | Kind | Job | Value |
| --- | --- | --- | --- |
| `DIST_HOMEBREW_TOKEN` | Secret | `homebrew` | GitHub PAT with `contents:write` on [`SihanTeng/homebrew-tenling`](https://github.com/SihanTeng/homebrew-tenling). Optional — without it only the in-repo cask updates. |
| `DIST_AUR_SSH_KEY` | Secret | `aur` | Private SSH key registered on [aur.archlinux.org](https://aur.archlinux.org) → My Account → SSH Public Key. See `packaging/aur/README.md`. |
| `DIST_CHOCOLATEY_API_KEY` | Secret | `chocolatey` | API key from [community.chocolatey.org/account](https://community.chocolatey.org/account). |
| `DIST_COPR_CONFIG` | Secret | `copr` | Full `[copr-cli]` config from [copr.fedorainfracloud.org/api](https://copr.fedorainfracloud.org/api/). Expires ~180 days. |
| `DIST_COPR_PROJECT` | **Variable** | `copr` | Project path, e.g. `YourFedoraUsername/tenling`. |

### Automatic (do not create)

| Name | Notes |
| --- | --- |
| `GITHUB_TOKEN` | Release uploads, Pages, in-repo commits. |

---

## Setup checklist

**Secrets**

```text
TAURI_SIGNING_PRIVATE_KEY
TAURI_SIGNING_PRIVATE_KEY_PASSWORD
DIST_HOMEBREW_TOKEN          # optional
DIST_AUR_SSH_KEY             # optional
DIST_CHOCOLATEY_API_KEY      # optional
DIST_COPR_CONFIG             # optional
```

**Variables**

```text
DIST_COPR_PROJECT=YourFedoraUsername/tenling
```

Channel how-tos: [`docs/distribution.md`](../docs/distribution.md).
