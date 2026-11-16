import { expect, it } from 'vitest';
import { buildExtension } from '../scripts/build-extension.mjs';
import { verifyPackageTransport } from '../scripts/verify-package.mjs';

it('runs the built Editor in a fresh consumer with the real SDK and no source imports', async () => {
  const built = await buildExtension({ write: false });
  const result = await verifyPackageTransport(built, {
    id: built.manifest.id,
    version: built.manifest.version,
    packageHash: built.packageHash,
  });
  expect(result).toContain('PASS: independent package load');
}, 30_000);
