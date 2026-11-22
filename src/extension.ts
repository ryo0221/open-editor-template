import {
  CONTRACT_VERSION,
  CREATE_ADDON,
  OPERATIONS_ADDON,
  type ExtensionDefinition,
  type ExtensionManifest,
} from "@editor-platform/extension-contract";
import {
  CARD_ARTIFACT_KIND,
  CARD_SCHEMA_VERSION,
  createDocument,
  isCardDocument,
  type CardDocument,
} from "./model";
import { mountEditor } from "./Editor";
import { operationDeclarations, operations } from "./operations";

/** Change these identities for your Editor. A new view may keep an existing artifactKind. */
export const manifest: Omit<ExtensionManifest, "packageHash"> = {
  contractVersion: CONTRACT_VERSION,
  id: "example.card-editor",
  version: "0.3.0",
  artifactKind: CARD_ARTIFACT_KIND,
  schemaVersion: CARD_SCHEMA_VERSION,
  capabilities: ["local-edit", "surface", "persistence"],
  permissions: ["artifact:read", "artifact:write"],
  licenseNotices: [
    "AGPL-3.0-only. See LICENSE and NOTICE shipped with this package.",
  ],
  addons: {
    operations: {
      version: OPERATIONS_ADDON,
      declarations: operationDeclarations,
    },
    // Lets a Host start an artifact that has no file yet. Remove both lines if your Editor has no empty form.
    create: { version: CREATE_ADDON },
  },
};

/** The trusted build/Host supplies the verified package pin; the Editor does not attest it. */
export function definition(
  packageHash: string,
): ExtensionDefinition<CardDocument> {
  return {
    manifest: { ...manifest, packageHash },
    validate: isCardDocument,
    mount: mountEditor,
    operations,
    /** The first content of a new artifact: holds no user data and passes the validator. */
    create: () => createDocument(),
  };
}
