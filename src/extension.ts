import {
  CONTRACT_VERSION,
  OPERATIONS_ADDON,
  type ExtensionDefinition,
  type ExtensionManifest,
} from '@editor-platform/extension-contract';
import { isCardDocument, type CardDocument } from './model';
import { mountEditor } from './Editor';
import { operationDeclarations, operations } from './operations';

/** Change these identities for your Editor. A new view may keep an existing artifactKind. */
export const manifest: Omit<ExtensionManifest, 'packageHash'> = {
  contractVersion: CONTRACT_VERSION,
  id: 'example.card-editor',
  version: '0.1.0',
  artifactKind: 'example.cards',
  schemaVersion: 1,
  capabilities: ['local-edit', 'selection', 'surface', 'persistence'],
  permissions: ['artifact:read', 'artifact:write', 'selection:write'],
  licenseNotices: ['AGPL-3.0-only. See LICENSE and NOTICE shipped with this package.'],
  addons: { operations: { version: OPERATIONS_ADDON, declarations: operationDeclarations } },
};

/** The trusted build/Host supplies the verified package pin; the Editor does not attest it. */
export function definition(packageHash: string): ExtensionDefinition<CardDocument> {
  return {
    manifest: { ...manifest, packageHash },
    validate: isCardDocument,
    mount: mountEditor,
    operations,
  };
}
