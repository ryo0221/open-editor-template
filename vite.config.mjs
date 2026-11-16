import { defineConfig } from 'vite';
import path from 'node:path';
import { buildExtension } from './scripts/build-extension.mjs';

function extensionPackage() {
  const id = 'virtual:editor-package';
  const resolved = '\0' + id;
  let payload;
  const refresh = async () => {
    payload = await buildExtension();
  };
  return {
    name: 'local-editor-package',
    async buildStart() {
      await refresh();
    },
    resolveId(source) {
      return source === id ? resolved : undefined;
    },
    load(source) {
      if (source !== resolved) return;
      const { packageHash, ...editorPackage } = payload;
      // A pin is approved by this local build, separately from the package payload.
      const trustedPin = {
        id: payload.manifest.id,
        version: payload.manifest.version,
        packageHash,
      };
      return `export const editorPackage = ${JSON.stringify(editorPackage)};\nexport const trustedPin = ${JSON.stringify(trustedPin)};`;
    },
    configureServer(server) {
      let queue = Promise.resolve();
      const sourceRoot = path.resolve('src') + path.sep;
      server.watcher.on('change', (file) => {
        if (!path.resolve(file).startsWith(sourceRoot)) return;
        queue = queue
          .then(async () => {
            await refresh();
            const mod = server.moduleGraph.getModuleById(resolved);
            if (mod) server.moduleGraph.invalidateModule(mod);
            server.ws.send({ type: 'full-reload' });
          })
          .catch((error) => server.config.logger.error(String(error)));
      });
    },
  };
}

export default defineConfig({
  plugins: process.env.VITEST ? [] : [extensionPackage()],
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  build: { outDir: 'dist/host', emptyOutDir: true, target: 'es2022' },
  ssr: { noExternal: [/^@editor-platform\//] },
  test: { include: ['tests/**/*.test.ts'], environment: 'node' },
});
