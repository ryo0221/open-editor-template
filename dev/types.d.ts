declare module 'virtual:editor-package' {
  export const trustedPin: { id: string; version: string; packageHash: string };
  export const editorPackage: {
    format: 'open-editor-template-package-1';
    manifest: Omit<import('@editor-platform/extension-contract').ExtensionManifest, 'packageHash'>;
    entry: string;
    files: { path: string; base64: string }[];
  };
}
