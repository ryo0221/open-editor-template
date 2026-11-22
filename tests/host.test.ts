import { beforeAll, describe, expect, it } from "vitest";
import {
  createArtifact,
  MemoryStorage,
  type Artifact,
} from "@editor-platform/artifact-core";
import {
  ExtensionRegistry,
  type Registration,
} from "@editor-platform/extension-runtime";
import {
  installVerifiedExtension,
  loadVerifiedExtension,
  verifyExtensionPackage,
  type LoadedExtension,
} from "@editor-platform/extension-runtime/package";
import { createLocalHost } from "../dev/host";
import { addCard, updateCard } from "../src/commands";
import {
  CARD_ARTIFACT_KIND,
  CARD_SCHEMA_VERSION,
  createDocument,
  type CardDocument,
} from "../src/model";
import { buildExtension } from "../scripts/build-extension.mjs";

let loaded: LoadedExtension<CardDocument>;
beforeAll(async () => {
  const built = await buildExtension({ write: false });
  const verified = await verifyExtensionPackage(
    {
      manifest: built.manifest,
      entry: built.entry,
      files: built.files.map((f: { path: string; base64: string }) => ({
        path: f.path,
        bytes: new Uint8Array(Buffer.from(f.base64, "base64")),
      })),
    },
    (id, version) =>
      id === built.manifest.id && version === built.manifest.version
        ? built.packageHash
        : undefined,
  );
  loaded = await loadVerifiedExtension<CardDocument>(verified, {
    importModule: (bytes) =>
      import(
        /* @vite-ignore */ `data:text/javascript;base64,${Buffer.from(bytes).toString("base64")}`
      ),
  });
}, 15_000);

function setup() {
  const registry = new ExtensionRegistry();
  const registration: Registration<CardDocument> = installVerifiedExtension(
    registry,
    loaded,
  );
  const content = createDocument([
    { id: "first", title: "元の名前", description: "説明", color: "blue" },
    { id: "second", title: "別のカード", description: "", color: "green" },
  ]);
  const artifact = createArtifact(
    registration.manifest.artifactKind,
    "Test",
    content,
  );
  const storage = new MemoryStorage<Artifact<CardDocument>>();
  const host = createLocalHost(registration, artifact, storage);
  return { host, storage };
}

describe("real local Host lifecycle", () => {
  it("previews without changing content, then accepts as one undoable edit", () => {
    const { host } = setup();
    const proposal = host.prepareRename("first", "採用した名前");
    expect(host.editor.content.cards[0].title).toBe("元の名前");
    expect(proposal.candidate.cards[0].title).toBe("採用した名前");
    proposal.commit();
    expect(host.editor.content.cards[0].title).toBe("採用した名前");
    expect(() => proposal.commit()).toThrow();
    host.handle.api.undo();
    expect(host.editor.content.cards[0].title).toBe("元の名前");
    host.handle.api.redo();
    expect(host.editor.content.cards[0].title).toBe("採用した名前");
    host.close(true);
  });

  it("refuses stale proposals and read-only mutations without adding history", () => {
    const { host } = setup();
    const proposal = host.prepareRename("first", "古い提案");
    host.handle.api.execute(updateCard("second", { title: "後から編集" }));
    const before = host.editor.snapshot;
    expect(() => proposal.commit()).toThrow(/内容または権限/);
    expect(host.editor.snapshot.revision).toEqual(before.revision);
    host.setReadOnly(true);
    expect(() =>
      host.handle.api.execute(updateCard("first", { title: "禁止" })),
    ).toThrow();
    expect(() => host.prepareRename("first", "禁止")).toThrow();
    expect(() => host.handle.api.undo()).toThrow();
    expect(host.editor.content).toEqual(before.content);
    host.close(true);
  });

  it("does not revive a proposal after an edit and Undo restore the same content", () => {
    const { host } = setup();
    const proposal = host.prepareRename("first", "古い提案");
    host.handle.api.execute(updateCard("second", { title: "一時的な編集" }));
    host.handle.api.undo();
    expect(host.editor.content).toEqual(proposal.base);
    const before = host.editor.snapshot;
    expect(() => proposal.commit()).toThrow(/内容または権限/);
    expect(() => proposal.commit()).toThrow(/使用済み/);
    expect(host.editor.snapshot).toEqual(before);
    host.close();
  });

  it("does not revive a proposal after editing permission is revoked and restored", () => {
    const { host } = setup();
    const proposal = host.prepareRename("first", "失効した提案");
    host.setReadOnly(true);
    host.setReadOnly(false);
    const before = host.editor.snapshot;
    expect(() => proposal.commit()).toThrow(/内容または権限/);
    expect(() => proposal.commit()).toThrow(/使用済み/);
    expect(host.editor.snapshot).toEqual(before);
    host.prepareRename("first", "新しい提案").commit();
    expect(host.editor.content.cards[0].title).toBe("新しい提案");
    host.close(true);
  });

  it("keeps a failed save dirty and retries through the same storage boundary", async () => {
    const { host, storage } = setup();
    host.handle.api.execute(updateCard("first", { title: "保存対象" }));
    host.setSaveFailure(true);
    await expect(host.save()).rejects.toThrow(/保存エラー/);
    expect(host.editor.snapshot.dirty).toBe(true);
    expect(await storage.get(host.editor.id)).toBeUndefined();
    host.setSaveFailure(false);
    await host.save();
    expect(host.editor.snapshot.dirty).toBe(false);
    const reopened = await host.reopenSaved();
    expect(reopened.editor.content.cards[0].title).toBe("保存対象");
    expect(reopened.editor.snapshot.dirty).toBe(false);
    reopened.close();
  });

  it("exports and validates native JSON; bad input never changes current content", async () => {
    const { host } = setup();
    const json = await host.exportNative();
    expect((await host.parseNative(json)).draft.content).toEqual(
      host.editor.content,
    );
    const invalid = JSON.parse(json);
    invalid.draft.content.cards[0].title = "";
    const before = host.editor.snapshot;
    await expect(host.parseNative(JSON.stringify(invalid))).rejects.toThrow();
    await expect(
      host.parseNative(
        JSON.stringify({ ...JSON.parse(json), schemaVersion: 999 }),
      ),
    ).rejects.toThrow();
    expect(host.editor.snapshot).toEqual(before);
    host.close();
  });

  it("does not silently discard an unsaved draft when reopening", async () => {
    const { host } = setup();
    await host.save();
    host.handle.api.execute(
      updateCard("first", { description: "未保存の説明" }),
    );
    await expect(host.reopenSaved()).rejects.toThrow(/保存/);
    expect(host.editor.content.cards[0].description).toBe("未保存の説明");
    host.close(true);
  });

  it("exports PaoBub native content and imports it as one edit without replacing artifact identity", async () => {
    const { host } = setup();
    const id = host.editor.id;
    const original = host.editor.content;
    const document = JSON.parse(host.exportDocument());
    expect(document).toEqual(original);
    expect(document).toMatchObject({
      artifactKind: CARD_ARTIFACT_KIND,
      schemaVersion: CARD_SCHEMA_VERSION,
    });
    expect(document).not.toHaveProperty("draft");
    document.cards[0].title = "PaoBubで編集したカード";
    host.editor.importContent(await host.parseImport(JSON.stringify(document)));
    expect(host.editor.id).toBe(id);
    expect(host.editor.content.cards[0].title).toBe("PaoBubで編集したカード");
    host.handle.api.undo();
    expect(host.editor.content).toEqual(original);
    host.handle.api.redo();
    expect(host.editor.content.cards[0].title).toBe("PaoBubで編集したカード");
    expect(await host.parseImport(await host.exportNative())).toEqual(
      host.editor.content,
    );
    host.close(true);
  });

  it("refuses old or different native formats without changing current content or history", async () => {
    const { host } = setup();
    const document = JSON.parse(host.exportDocument());
    const before = host.editor.snapshot;
    for (const invalid of [
      { cards: document.cards },
      { ...document, schemaVersion: 1 },
      { ...document, artifactKind: "another.editor" },
      { ...document, extra: true },
    ]) {
      await expect(host.parseImport(JSON.stringify(invalid))).rejects.toThrow();
      expect(host.editor.snapshot).toEqual(before);
    }
    host.close();
  });

  it("makes the first content of a new artifact through create@0-draft, then edits and saves it", async () => {
    const registration = installVerifiedExtension(
      new ExtensionRegistry(),
      loaded,
    );
    expect(registration.manifest.addons?.create).toEqual({
      version: "create@0-draft",
    });
    const first = registration.create!();
    expect(first).toEqual({
      artifactKind: CARD_ARTIFACT_KIND,
      schemaVersion: CARD_SCHEMA_VERSION,
      cards: [],
    });
    expect(Object.isFrozen(first)).toBe(true);
    const storage = new MemoryStorage<Artifact<CardDocument>>();
    const host = createLocalHost(
      registration,
      createArtifact(
        registration.manifest.artifactKind,
        "New",
        structuredClone(first) as CardDocument,
      ),
      storage,
    );
    host.handle.api.execute(
      addCard({
        id: "new",
        title: "最初のカード",
        description: "",
        color: "blue",
      }),
    );
    await host.save();
    const reopened = await host.reopenSaved();
    expect(reopened.editor.content.cards.map((c) => c.id)).toEqual(["new"]);
    reopened.close();
  });
});
