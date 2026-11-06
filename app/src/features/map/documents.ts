import type { SupabaseClient } from '@supabase/supabase-js';
import { logAccess } from '../../lib/accessLog';

/** One current PDF per SOP and per practice, stored in the private "documents" bucket (see supabase/migrations/0012_documents.sql). */
export type DocKind = 'sop' | 'practice';
export interface DocInfo {
  name: string;
  size: number;
  at: string;
}
export const MAX_DOC_BYTES = 20 * 1024 * 1024;
const BUCKET = 'documents';

export const docKey = (kind: DocKind, ref: string | number) => `${kind}:${ref}`;
export const docPath = (kind: DocKind, ref: string | number) => (kind === 'sop' ? `sops/${ref}.pdf` : `practices/${ref}.pdf`);

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** First look at a chosen file: a message when it must be refused, otherwise null. */
export function checkFile(f: { name: string; size: number; type: string }): string | null {
  if (!/\.pdf$/i.test(f.name) || (f.type && f.type !== 'application/pdf')) return 'Only PDF files can be uploaded.';
  if (f.size === 0) return 'That file is empty.';
  if (f.size > MAX_DOC_BYTES) return `That file is ${formatSize(f.size)}. The limit is 20 MB.`;
  return null;
}
/** A real PDF starts with "%PDF-". Guards against a renamed file. */
export async function looksLikePdf(f: Blob): Promise<boolean> {
  const head = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsText(f.slice(0, 5), 'latin1');
  });
  return head === '%PDF-';
}

interface Row {
  file_name: string;
  size_bytes: number;
  uploaded_at: string;
  sops: { sop_number: number } | null;
  practices: { code: string } | null;
}
export async function loadDocs(db: SupabaseClient): Promise<Record<string, DocInfo>> {
  const r = await db.schema('codex').from('documents').select('file_name,size_bytes,uploaded_at,sops(sop_number),practices(code)');
  if (r.error) throw new Error('documents failed to load');
  const out: Record<string, DocInfo> = {};
  for (const x of r.data as unknown as Row[]) {
    const key = x.sops ? docKey('sop', x.sops.sop_number) : x.practices ? docKey('practice', x.practices.code) : null;
    if (key) out[key] = { name: x.file_name, size: Number(x.size_bytes), at: x.uploaded_at };
  }
  return out;
}

/** Uploads (or replaces) the document. Returns the saved info, or an error message for the person. */
export async function uploadDoc(db: SupabaseClient, kind: DocKind, ref: string | number, file: File, hadBefore: boolean): Promise<DocInfo | string> {
  const bad = checkFile(file);
  if (bad) return bad;
  if (!(await looksLikePdf(file))) return 'That file is not a real PDF.';
  const path = docPath(kind, ref);
  const up = await db.storage.from(BUCKET).upload(path, file, { upsert: true, contentType: 'application/pdf' });
  if (up.error) return 'Could not upload the file. Check your connection and that you have the editor role.';
  const rec = await db.schema('codex').rpc('set_document', { p_kind: kind, p_ref: String(ref), p_file_name: file.name.slice(0, 200), p_size_bytes: file.size });
  if (rec.error) {
    if (!hadBefore) await db.storage.from(BUCKET).remove([path]); // do not leave a file nobody can see
    return 'The file was sent but could not be saved. Try again.';
  }
  return { name: file.name.slice(0, 200), size: file.size, at: new Date().toISOString() };
}

export async function removeDoc(db: SupabaseClient, kind: DocKind, ref: string | number): Promise<boolean> {
  const r = await db.schema('codex').rpc('remove_document', { p_kind: kind, p_ref: String(ref) });
  if (r.error) return false;
  await db.storage.from(BUCKET).remove([docPath(kind, ref)]);
  return true;
}

/**
 * Shows the PDF in a modal on the same page. The pages are drawn on canvases (no browser PDF viewer),
 * so there is no download or print button. Returns false when it could not be shown.
 */
export async function openDoc(db: SupabaseClient, kind: DocKind, ref: string | number, title = 'Document'): Promise<boolean> {
  const r = await db.storage.from(BUCKET).createSignedUrl(docPath(kind, ref), 60);
  if (r.error || !r.data) return false;
  let data: ArrayBuffer;
  try {
    const res = await fetch(r.data.signedUrl);
    if (!res.ok) return false;
    data = await res.arrayBuffer();
  } catch {
    return false;
  }
  logAccess('document_open', `${kind} ${ref}`);

  const back = document.createElement('div');
  back.className = 'pvback';
  back.innerHTML =
    '<div class="pvdlg" role="dialog" aria-modal="true"><div class="pvdlg-h"><h3></h3><button type="button" class="pvx" aria-label="Close">×</button></div><div class="pvpages" tabindex="0"><p class="pvnote">Loading…</p></div><p class="pvfoot">View only — this document cannot be downloaded.</p></div>';
  (back.querySelector('h3') as HTMLElement).textContent = title;
  const pages = back.querySelector('.pvpages') as HTMLElement;
  document.body.append(back);
  let closed = false;
  const close = () => {
    closed = true;
    document.removeEventListener('keydown', onKey, true);
    back.remove();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      close();
    }
  };
  document.addEventListener('keydown', onKey, true);
  (back.querySelector('.pvx') as HTMLElement).onclick = close;
  back.addEventListener('mousedown', (e) => e.target === back && close());
  back.addEventListener('contextmenu', (e) => e.preventDefault());
  back.addEventListener('dragstart', (e) => e.preventDefault());
  (back.querySelector('.pvx') as HTMLElement).focus();

  try {
    const pdfjs = await import('pdfjs-dist');
    const worker = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
    pdfjs.GlobalWorkerOptions.workerSrc = worker;
    const pdf = await pdfjs.getDocument({ data }).promise;
    pages.textContent = '';
    const width = Math.max(300, pages.clientWidth - 24);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    for (let n = 1; n <= pdf.numPages && !closed; n++) {
      const page = await pdf.getPage(n);
      const base = page.getViewport({ scale: 1 });
      const vp = page.getViewport({ scale: (width / base.width) * dpr });
      const c = document.createElement('canvas');
      c.width = vp.width;
      c.height = vp.height;
      c.style.width = `${width}px`;
      c.style.height = `${(vp.height / dpr).toFixed(0)}px`;
      pages.append(c);
      await page.render({ canvasContext: c.getContext('2d')!, viewport: vp, canvas: c }).promise;
    }
  } catch {
    if (!closed) pages.innerHTML = '<p class="pvnote">This document could not be displayed.</p>';
  }
  return true;
}
