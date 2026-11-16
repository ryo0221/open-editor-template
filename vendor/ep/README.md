# Vendored public Editor Platform SDK

Source: [ryo0221/open-editor-platform@0ee0c71](https://github.com/ryo0221/open-editor-platform/tree/0ee0c711027b73e0112a544783793a3563808dd7).
Runtime contract: 1.0.0-draft.1.

These are actual unchanged upstream TypeScript implementations. The five packages
are installed with local file dependencies and require no platform checkout, private
repository access, unpublished registry packages, or workspace configuration.
Consumers use declared @editor-platform package entrypoints. Vite/esbuild/tsx handle
the TypeScript; these are not precompiled packages for direct Node.js imports.

| Package | Included public entrypoints |
| --- | --- |
| @editor-platform/artifact-core | . |
| @editor-platform/editor-core | . |
| @editor-platform/extension-contract | . |
| @editor-platform/editor-host | . |
| @editor-platform/extension-runtime | ., ./package, ./editor-host, ./operations |

Only the source closure of those exports is retained. Draft2, controlled, schema
experiments, and package retention are not exposed. Original package manifests are
under upstream-manifests. Generated manifests record the packaging changes and date.
provenance.json records every copied file with its public path, Git blob SHA, SHA-256
and byte length. Implementation source files are unchanged.

## Reproduce and verify

Run from the template root. These commands use Node built-ins, before or after npm ci.

    node scripts/vendor-sdk.mjs --check
    node scripts/vendor-sdk.mjs --generate
    node scripts/vendor-sdk.mjs --restore
    node scripts/vendor-sdk.mjs --restore --source /path/to/open-editor-platform

--check verifies all copied bytes, generated manifests, legal copies, and the file
inventory. It rejects unexpected files and symlinks. --generate first verifies the
retained source, then recreates package metadata and per-package legal files.
--restore reads only the fixed public commit (from GitHub or a local public checkout),
validates every downloaded byte before writing, and recreates the same result.
It never follows a moving branch or adopts new dependencies. Normal development
and CI use committed files and do not contact GitHub.

## License and notices

The upstream release declares AGPL-3.0-only. LICENSE, LICENSE-SCOPE.md, LICENSE-GUIDE.md,
dual-licensing and draft additional-permission documents, docs/legal/NOTICE.ja.md,
and docs/third-party/RUNTIME-NOTICES.txt are preserved unchanged. The runtime notice
file covers the full upstream inventory, including libraries absent from this subset.
The additional permission is an upstream non-operative draft. Follow the public
source links for related upstream documents outside this minimal copy.
