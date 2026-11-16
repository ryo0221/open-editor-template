# Open Editor Platform source notice

Upstream: https://github.com/ryo0221/open-editor-platform/tree/0ee0c711027b73e0112a544783793a3563808dd7/packages/extension-contract

Package: @editor-platform/extension-contract@0.0.0-draft.1

Source in src/ is copied byte for byte from the public commit above. The unmodified
GNU AGPLv3 text is in LICENSE. The upstream release declares AGPL-3.0-only.

Packaging modifications by Open Editor Template on 2026-11-16: package.json exposes
only the reviewed public entrypoints, replaces wildcard dependencies with sibling
file dependencies, removes development dependencies, and adds license/provenance
metadata. No upstream implementation was changed.

Original manifests, per-file Git blob and SHA-256 hashes, upstream license guidance,
and complete upstream runtime notices are retained in vendor/ep in the template.
The runtime notices cover the full upstream repository; the five SDK packages here
do not include those external runtime libraries. No draft additional permission is granted.
