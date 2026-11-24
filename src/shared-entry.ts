import { canonicalJson } from '@editor-platform/artifact-core';
import { COLLABORATION_ADDON, type ExtensionDefinition } from '@editor-platform/extension-contract';
// Shared-capable distribution. The ordinary draft.1 package keeps its existing manifest.
import { definition as localDefinition } from './extension';
import { plan, apply } from './shared-cards';
import type { CardDocument } from './model';
import { sharedCardDeclarations } from './shared-declarations';
export { mountSharedEditor } from './Editor';
export { plan, resource, apply } from './shared-cards';
declare const SHARED_CODEC_HASH: string;
export function definition(packageHash: string): ExtensionDefinition<CardDocument> {
  const local = localDefinition(packageHash);
  const steps = (id: string, input: unknown, base: CardDocument) => plan(id, '1.0.0', input, base);
  return {
    ...local,
    operations: {
      checkInput(id: string, input: unknown, base: CardDocument) {
        try {
          steps(id, input, base).reduce((value, action) => apply(value, action).content, base);
          return [];
        } catch (error) {
          return [error instanceof Error ? error.message : 'invalid-operation'];
        }
      },
      command(id: string, input: unknown, base: CardDocument) {
        const actions = steps(id, input, base);
        const expected = canonicalJson(base);
        return {
          type: id,
          label: sharedCardDeclarations.find((d) => d.id === id)!.title,
          apply(content: CardDocument) {
            if (canonicalJson(content) !== expected) throw Error('stale-precondition');
            return actions.reduce((value, action) => apply(value, action).content, content);
          },
        };
      },
    },
    manifest: {
      ...local.manifest,
      version: '0.4.0-draft.1',
      addons: {
        ...local.manifest.addons,
        operations: { ...local.manifest.addons!.operations!, declarations: sharedCardDeclarations },
        collaboration: {
          version: COLLABORATION_ADDON,
          entry: 'codec.js',
          sha256: SHARED_CODEC_HASH,
          operations: sharedCardDeclarations.map(({ id, version }) => ({ id, version })),
        },
      },
    },
  };
}
