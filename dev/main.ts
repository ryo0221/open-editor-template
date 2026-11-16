import { IndexedDBStorage, createArtifact, type Artifact } from '@editor-platform/artifact-core';
import {
  ExtensionRegistry,
  type ExtensionHandle,
  type PreparedOperation,
} from '@editor-platform/extension-runtime';
import { artifactEditorHost } from '@editor-platform/extension-runtime/editor-host';
import {
  verifyExtensionPackage,
  loadVerifiedExtension,
  installVerifiedExtension,
} from '@editor-platform/extension-runtime/package';
import { editorPackage, trustedPin } from 'virtual:editor-package';
import sample from '../fixtures/example.json';
import { validateDocument, type CardDocument } from '../src/model';
import { createLocalHost, type LocalEditorHost } from './host';
import './styles.css';

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <header class="site-header"><div class="brand"><span class="brand-mark" aria-hidden="true">e.</span><span>Editor Platform <small>DEVELOPER STARTER</small></span></div><span class="local-badge"><span aria-hidden="true">●</span> ローカルで動作</span></header>
  <main class="workspace">
    <section class="page-heading"><div><p class="eyebrow">EDITOR IDEAS</p><h1>Idea Comparison</h1><p class="intro">次に作るEditorの候補を比べる。</p></div><div id="save-state" class="save-state">準備中</div></section>
    <div class="workspace-grid">
      <section class="canvas-panel" aria-label="Editorのプレビュー">
        <div class="host-toolbar"><div class="toolbar-group"><button id="undo" disabled>↶ Undo</button><button id="redo" disabled>↷ Redo</button></div><div class="toolbar-group"><button id="reload" disabled>再読み込み</button><button id="save" class="primary" disabled>保存</button></div></div>
        <p id="readonly-note" class="readonly-note" hidden>読み取り専用です。編集操作はHostで拒否されます。</p>
        <fieldset id="surface-fieldset"><legend class="sr-only">Editorアイデア比較Editor</legend><div id="surface"></div></fieldset>
        <div class="canvas-footer"><span id="artifact-label">サンプルを読み込んでいます</span><div><button id="import" disabled>JSONを取り込む</button><button id="export-document" disabled>PaoBub用JSONを書き出す</button><button id="export" disabled>バックアップを書き出す</button></div></div>
        <input id="file" type="file" accept="application/json,.json" hidden />
      </section>
      <aside class="side-panel">
        <section class="tool-panel" aria-labelledby="proposal-heading"><p class="eyebrow">OPERATIONS</p><h2 id="proposal-heading">AIからの編集を試す</h2><p class="panel-description">固定の操作提案で、確認してから採用する流れを試せます。APIキーは不要です。</p>
          <form id="proposal-form"><label>対象の候補<select id="proposal-card" required></select></label><label>新しい候補名<input id="proposal-title" value="仮説・実験ノートEditor" required autocomplete="off" /></label><button id="prepare" class="wide-button" disabled>変更をプレビュー</button></form>
          <section id="proposal-preview" class="proposal-preview" hidden aria-label="変更のプレビュー"><span class="preview-label">タイトルの変更</span><p id="proposal-before" class="before-value"></p><p id="proposal-after" class="after-value"></p><p id="proposal-stale" class="stale-message" hidden>内容または権限が変わりました。提案を作り直してください。</p><div class="proposal-actions"><button id="reject">破棄</button><button id="apply" class="primary">採用</button></div></section>
        </section>
        <section class="tool-panel" aria-labelledby="checks-heading"><p class="eyebrow">HOST CONTROLS</p><h2 id="checks-heading">動作を確認する</h2><label class="toggle"><span>読み取り専用</span><input id="readonly" type="checkbox" /></label><label class="toggle"><span>保存エラーを再現</span><input id="save-failure" type="checkbox" /></label><dl class="diagnostics"><div><dt>変更番号</dt><dd id="revision">—</dd></div><div><dt>データ形式</dt><dd id="document-format">—</dd></div></dl><details><summary>現在のデータを見る</summary><pre id="native-data"></pre></details></section>
        <section class="start-panel"><p class="eyebrow">MAKE IT YOURS</p><h2>この3か所から始める</h2><p><code>src/Editor.ts</code><span>画面と操作</span></p><p><code>src/model.ts</code><span>保存するデータ</span></p><p><code>src/commands.ts</code><span>データの変更</span></p></section>
      </aside>
    </div>
    <p id="message" class="message" role="status" aria-live="polite"></p>
    <button id="recover" hidden>新しいサンプルを開く</button>
    <footer class="page-footer"><span>Editor Platform · AGPL-3.0-only</span><span>Local preview · Contract 1.0.0-draft.1</span></footer>
  </main>`;

const get = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const button = (id: string) => get<HTMLButtonElement>(id);
const input = (id: string) => get<HTMLInputElement>(id);
const message = (text: string, error = false) => {
  get('message').textContent = text;
  get('message').classList.toggle('error', error);
};
const report = (error: unknown) =>
  message(error instanceof Error ? error.message : '処理を完了できませんでした。', true);
const storage = new IndexedDBStorage<Artifact<CardDocument>>(
  `${editorPackage.manifest.id}:${editorPackage.manifest.artifactKind}`,
);
const activeKey = `${editorPackage.manifest.id}:${editorPackage.manifest.artifactKind}:active`;
let host: LocalEditorHost;
let surfaceHandle: ExtensionHandle<CardDocument> | undefined;
let detach: (() => void) | undefined;
let detachSaved: (() => void) | undefined;
let proposal: PreparedOperation<CardDocument> | undefined;
let proposalRevision = '';
let proposalRevoked = false;
let renderedRevision = '';
let hasSaved = false;
let queued = false;
let ready = false;
let hostBusy = false;

async function main() {
  const verified = await verifyExtensionPackage(
    {
      manifest: editorPackage.manifest,
      entry: editorPackage.entry,
      files: editorPackage.files.map((file) => ({
        path: file.path,
        bytes: Uint8Array.from(atob(file.base64), (c) => c.charCodeAt(0)),
      })),
    },
    (id, version) =>
      id === trustedPin.id && version === trustedPin.version ? trustedPin.packageHash : undefined,
  );
  const loaded = await loadVerifiedExtension<CardDocument>(verified);
  const registration = installVerifiedExtension(new ExtensionRegistry(), loaded);

  function refresh() {
    const snapshot = host.editor.snapshot;
    const revisionKey = JSON.stringify(snapshot.revision);
    const surfaceKey = `${revisionKey}:${snapshot.readOnly}`;
    // draft.1 has no Surface subscription API. Keep an operation handle alive,
    // and replace only the display handle when the canonical Host content changes.
    if (surfaceKey !== renderedRevision) {
      surfaceHandle?.close();
      surfaceHandle = registration.open(
        artifactEditorHost(host.editor, {
          schemaVersion: registration.manifest.schemaVersion,
          allowed: (permission) =>
            permission === 'artifact:read' ||
            (permission === 'artifact:write' && !host.editor.readOnly),
        }),
      );
      surfaceHandle.mount(get('surface'));
      renderedRevision = surfaceKey;
    }
    get<HTMLFieldSetElement>('surface-fieldset').disabled = snapshot.readOnly || hostBusy;
    get('readonly-note').hidden = !snapshot.readOnly;
    get('save-state').textContent = snapshot.saving
      ? '保存中…'
      : snapshot.dirty
        ? '未保存の変更'
        : hasSaved
          ? '保存済み'
          : 'サンプル';
    get('save-state').classList.toggle('dirty', snapshot.dirty);
    button('undo').disabled = snapshot.readOnly || hostBusy || !snapshot.canUndo;
    button('redo').disabled = snapshot.readOnly || hostBusy || !snapshot.canRedo;
    button('save').disabled = snapshot.readOnly || hostBusy || snapshot.saving;
    button('reload').disabled = !hasSaved || hostBusy || snapshot.saving;
    button('export').disabled = hostBusy;
    button('export-document').disabled = hostBusy;
    button('import').disabled = snapshot.readOnly || hostBusy;
    button('prepare').disabled = snapshot.readOnly || hostBusy || !snapshot.content.cards.length;
    get('revision').textContent = String(snapshot.revision.sequence);
    get('document-format').textContent =
      `${snapshot.content.artifactKind}@${snapshot.content.schemaVersion}`;
    get('native-data').textContent = JSON.stringify(snapshot.content, null, 2);
    get('artifact-label').textContent =
      `${snapshot.content.cards.length}件の候補 · このブラウザに保存`;
    const select = get<HTMLSelectElement>('proposal-card');
    const oldValue = select.value;
    select.replaceChildren(
      ...snapshot.content.cards.map((card) => {
        const option = document.createElement('option');
        option.value = card.id;
        option.textContent = card.title;
        return option;
      }),
    );
    if (snapshot.content.cards.some((card) => card.id === oldValue)) select.value = oldValue;
    const stale = !!proposal && (revisionKey !== proposalRevision || proposalRevoked);
    get('proposal-stale').hidden = !stale;
    button('apply').disabled = !proposal || stale || snapshot.readOnly || hostBusy;
  }
  function scheduleRefresh() {
    if (queued) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      if (ready) {
        try {
          refresh();
        } catch (error) {
          report(error);
        }
      }
    });
  }
  function bind(next: LocalEditorHost) {
    detach?.();
    detachSaved?.();
    surfaceHandle?.close();
    surfaceHandle = undefined;
    host = next;
    renderedRevision = '';
    proposal = undefined;
    get('proposal-preview').hidden = true;
    detach = host.editor.attach(scheduleRefresh);
    detachSaved = host.editor.onSaved(() => {
      hasSaved = true;
      // The durable write already succeeded. Failure to remember the active ID
      // must not misreport that write as a failed save.
      try {
        localStorage.setItem(activeKey, host.editor.id);
      } catch {
        /* user can still export */
      }
    });
    ready = true;
    refresh();
  }
  function sampleArtifact() {
    validateDocument(sample);
    return createArtifact(registration.manifest.artifactKind, 'Card Studio', sample);
  }
  async function openInitial(fresh = false) {
    let saved: Artifact<CardDocument> | undefined;
    if (!fresh) {
      const id = localStorage.getItem(activeKey);
      if (id) saved = await storage.get(id);
    }
    hasSaved = !!saved;
    bind(createLocalHost(registration, saved ?? sampleArtifact(), storage));
    get('recover').hidden = true;
    message(
      saved
        ? '前回保存したカードを開きました。'
        : 'サンプルを編集してみましょう。保存すると、このブラウザで再度開けます。',
    );
  }
  const act = (action: () => void | Promise<void>) => async () => {
    if (!ready || hostBusy) return;
    try {
      await action();
    } catch (error) {
      report(error);
    }
  };
  button('save').onclick = act(async () => {
    await host.save();
    refresh();
    message('このブラウザに保存しました。');
  });
  button('undo').onclick = act(() => {
    host.handle.api.undo();
    message('編集を元に戻しました。');
  });
  button('redo').onclick = act(() => {
    host.handle.api.redo();
    message('編集をやり直しました。');
  });
  button('reload').onclick = act(async () => {
    hostBusy = true;
    refresh();
    try {
      const next = await host.reopenSaved();
      bind(next);
      message('保存済みデータを再読み込みしました。');
    } finally {
      hostBusy = false;
      refresh();
    }
  });
  input('readonly').onchange = () => {
    if (!ready) return;
    if (proposal) proposalRevoked = true;
    host.setReadOnly(input('readonly').checked);
  };
  input('save-failure').onchange = () => {
    if (ready) host.setSaveFailure(input('save-failure').checked);
  };
  get<HTMLFormElement>('proposal-form').onsubmit = (event) => {
    event.preventDefault();
    if (!ready) return;
    try {
      const id = get<HTMLSelectElement>('proposal-card').value;
      proposal = host.prepareRename(id, input('proposal-title').value);
      proposalRevision = JSON.stringify(host.editor.revision);
      proposalRevoked = false;
      get('proposal-before').textContent = proposal.base.cards.find(
        (card) => card.id === id,
      )!.title;
      get('proposal-after').textContent = proposal.candidate.cards.find(
        (card) => card.id === id,
      )!.title;
      get('proposal-preview').hidden = false;
      refresh();
      message('変更をプレビューしています。現在のデータはまだ変更されていません。');
    } catch (error) {
      report(error);
    }
  };
  button('apply').onclick = act(() => {
    if (!proposal) return;
    const pending = proposal;
    proposal = undefined;
    get('proposal-preview').hidden = true;
    pending.commit({ origin: 'proposal', transactionId: crypto.randomUUID() });
    message('提案を採用しました。Undoで戻せます。保存はまだ行われていません。');
  });
  button('reject').onclick = () => {
    proposal = undefined;
    get('proposal-preview').hidden = true;
    message('提案を破棄しました。データは変更していません。');
  };
  function downloadJson(json: string, filename: string) {
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  button('export').onclick = act(async () => {
    downloadJson(await host.exportNative(), 'cards.artifact.json');
    message('保存版を含むバックアップを書き出しました。');
  });
  button('export-document').onclick = act(() => {
    downloadJson(host.exportDocument(), 'cards.json');
    message('PaoBubで開くためのカードJSONを書き出しました。登録済みの同じEditorを使用してください。');
  });
  button('import').onclick = () => input('file').click();
  input('file').onchange = act(async () => {
    const file = input('file').files?.[0];
    input('file').value = '';
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) throw new Error('このサンプルは2MB以内のJSONを取り込めます。');
    hostBusy = true;
    refresh();
    try {
      const imported = await host.parseImport(await file.text());
      host.editor.importContent(imported);
      message('JSONの編集内容を取り込みました。Undoで戻せます。');
    } finally {
      hostBusy = false;
      refresh();
    }
  });
  get('recover').onclick = () => {
    void openInitial(true).catch(report);
  };
  await openInitial().catch((error) => {
    report(error);
    get('recover').hidden = false;
  });
  window.addEventListener('beforeunload', (event) => {
    if (ready && host.editor.snapshot.dirty) {
      event.preventDefault();
      event.returnValue = '';
    }
  });
}

void main().catch(report);
