import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import clsx from 'clsx';
import { format } from 'date-fns';
import {
  AlertTriangle, Archive, ArchiveRestore, Download, ExternalLink, FileText, Image as ImageIcon, Plus, Search, Sparkles, Star, Trash2, Upload, X,
} from 'lucide-react';
import { Badge, Button, Card, EmptyState, ErrorState, Field, FormError, IconButton, Input, Modal, PageHeader, Segmented, Select, Skeleton, SkeletonList, TagInput, Textarea } from '../../components/ui';
import { FormModal } from '../../components/FormModal';
import { ConnectionsPanel } from '../../components/ConnectionsPanel';
import { useDeleteDocument, useDocument, useDocuments, useExtractDocument, useUpdateDocument, useUploadDocument } from '../../api/hooks';
import { fetchBlobUrl, fetchFile } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { useConfirm } from '../../context/ConfirmContext';
import { useDebounce } from '../../hooks/useUtils';
import { useFormState } from '../../hooks/useFormState';
import { DOCUMENT_ACCEPT, DOCUMENT_CATEGORIES, DOCUMENT_MAX_MB, DOCUMENT_META } from '../../lib/constants';
import { countdown, formatKey, relativeDay } from '../../lib/dates';
import { useNavigate } from 'react-router-dom';

const VIEWS = [{ value: 'all', label: 'All' }, { value: 'favorites', label: 'Favorites' }, { value: 'expiring', label: 'Expiring' }, { value: 'archived', label: 'Archived' }];
const bytes = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const fileIcon = (mime) => (mime.startsWith('image/') ? '🖼️' : mime === 'application/pdf' ? '📕' : mime.includes('sheet') || mime.includes('excel') || mime === 'text/csv' ? '📊' : mime.includes('presentation') ? '📽️' : mime.includes('word') ? '📝' : '📄');

export default function DocumentsPage() {
  const [params, setParams] = useSearchParams();
  const view = VIEWS.some((v) => v.value === params.get('view')) ? params.get('view') : 'all';
  const category = params.get('category') ?? '';
  const selectedId = params.get('doc');
  const [search, setSearch] = useState('');
  const q = useDebounce(search.trim(), 250);
  const [uploading, setUploading] = useState(params.get('upload') === '1');
  const docs = useDocuments({ view, category: category || undefined, q: q || undefined });

  const update = (patch) =>
    setParams((current) => {
      const next = new URLSearchParams(current);
      Object.entries(patch).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)));
      next.delete('upload');
      return next;
    }, { replace: true });

  useEffect(() => {
    if (params.get('upload') === '1') setUploading(true);
  }, [params]);

  const list = docs.data?.data ?? [];
  const meta = docs.data?.meta;

  return (
    <div className="page page--wide">
      <PageHeader
        title="Documents"
        subtitle="Your private vault for IDs, policies, contracts and records — with expiry reminders."
        actions={<Button variant="primary" icon={Upload} onClick={() => setUploading(true)}>Upload document</Button>}
      />
      <div className="docs-layout">
        <nav className="desktop-only" aria-label="Document categories">
          <div className="notes-nav">
            <button type="button" className={clsx('notes-nav__item', !category && 'is-active')} onClick={() => update({ category: null })}><FileText aria-hidden="true" /><span className="grow">All categories</span><span className="notes-nav__count">{meta ? Object.values(meta.categories).reduce((a, b) => a + b, 0) : ''}</span></button>
            {DOCUMENT_CATEGORIES.map((c) => (
              <button key={c.value} type="button" className={clsx('notes-nav__item', category === c.value && 'is-active')} onClick={() => update({ category: c.value })}>
                <span aria-hidden="true" style={{ width: 15, textAlign: 'center' }}>{c.emoji}</span><span className="grow">{c.label}</span><span className="notes-nav__count">{meta?.categories?.[c.value] ?? ''}</span>
              </button>
            ))}
          </div>
        </nav>
        <div className="stack" style={{ gap: 12 }}>
          <div className="toolbar" style={{ marginBottom: 0 }}>
            <Segmented label="View" value={view} onChange={(v) => update({ view: v === 'all' ? null : v })} options={VIEWS.map((v) => (v.value === 'expiring' && meta?.expiring ? { ...v, count: meta.expiring } : v))} />
            <Select className="mobile-only" size="sm" value={category} onChange={(e) => update({ category: e.target.value || null })} placeholder="All categories" options={DOCUMENT_CATEGORIES} aria-label="Category" style={{ width: 150 }} />
            <div className="input-group" style={{ flex: '1 1 200px', maxWidth: 320 }}><Search aria-hidden="true" /><Input size="sm" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search documents" aria-label="Search documents" /></div>
          </div>
          {docs.isPending ? (
            <div className="doc-grid">{Array.from({ length: 6 }, (_, i) => <div key={i} className="card doc-card"><Skeleton height={96} /><Skeleton width="70%" /><Skeleton width="40%" /></div>)}</div>
          ) : docs.isError && !docs.data ? (
            <Card><ErrorState error={docs.error} onRetry={() => docs.refetch()} /></Card>
          ) : !list.length ? (
            <Card>
              <EmptyState
                icon={FileText}
                title={q || category || view !== 'all' ? 'No documents match' : 'No documents yet'}
                description={q || category || view !== 'all' ? 'Try another filter or search term.' : 'Upload your first important document — a passport, an insurance policy, a contract.'}
                action={<Button variant="primary" icon={Upload} onClick={() => setUploading(true)}>Upload document</Button>}
              />
            </Card>
          ) : (
            <div className="doc-grid stagger">
              {list.map((d) => <DocCard key={d._id} doc={d} onOpen={() => update({ doc: d._id })} />)}
            </div>
          )}
        </div>
      </div>

      {uploading && <UploadModal defaults={{ category: category || 'other' }} onClose={() => { setUploading(false); update({ upload: null }); }} onUploaded={(d) => update({ doc: d._id })} />}
      {selectedId && <DocumentModal id={selectedId} onClose={() => update({ doc: null })} />}
    </div>
  );
}

function DocCard({ doc, onOpen }) {
  const cat = DOCUMENT_META[doc.category];
  return (
    <button type="button" className="card card--interactive doc-card" onClick={onOpen}>
      <div className="doc-card__thumb" aria-hidden="true">{doc.mimeType.startsWith('image/') ? <Thumb doc={doc} /> : <span>{fileIcon(doc.mimeType)}</span>}</div>
      <span className="doc-card__title truncate">{doc.favorite && <Star size={12} className="text-warning" fill="currentColor" aria-label="Favorite" style={{ display: 'inline', verticalAlign: '-1px', marginRight: 4 }} />}{doc.title}</span>
      <span className="doc-card__meta">
        <span>{cat?.emoji} {cat?.label}</span>
        <span>{bytes(doc.size)}</span>
        {doc.expiryStatus && (
          <Badge tone={doc.expiryStatus === 'expired' ? 'danger' : doc.expiryStatus === 'expiring' ? 'warning' : undefined}>
            {doc.expiryStatus === 'expired' ? 'Expired' : doc.expiryStatus === 'expiring' ? `Expires ${countdown(doc.expiryDate)}` : `Valid until ${formatKey(doc.expiryDate, 'MMM yyyy')}`}
          </Badge>
        )}
      </span>
    </button>
  );
}

/** Loads a protected image through fetch (the signed URL needs the auth header for previews). */
function Thumb({ doc }) {
  const [src, setSrc] = useState(null);
  useEffect(() => {
    let url;
    fetchBlobUrl(doc.fileUrl).then((u) => { url = u; setSrc(u); }).catch(() => setSrc(null));
    return () => url && URL.revokeObjectURL(url);
  }, [doc.fileUrl]);
  return src ? <img src={src} alt="" /> : <ImageIcon />;
}

function UploadModal({ defaults, onClose, onUploaded }) {
  const upload = useUploadDocument();
  const toast = useToast();
  const [file, setFile] = useState(null);
  const [over, setOver] = useState(false);
  const inputRef = useRef(null);
  const form = useFormState({ title: '', category: defaults.category ?? 'other', tags: [], expiryDate: '', remindDaysBefore: '30', notes: '' });

  const pick = (f) => {
    if (!f) return;
    if (f.size > DOCUMENT_MAX_MB * 1024 * 1024) return toast.error(`File is larger than ${DOCUMENT_MAX_MB} MB`);
    setFile(f);
    if (!form.values.title) form.set('title', f.name.replace(/\.[^.]+$/, ''));
  };

  const submit = async () => {
    if (!file) return form.setFormError('Choose a file to upload');
    try {
      const doc = await upload.mutateAsync({ file, title: form.values.title.trim(), category: form.values.category, tags: form.values.tags.join(','), expiryDate: form.values.expiryDate, remindDaysBefore: form.values.expiryDate ? form.values.remindDaysBefore : '', notes: form.values.notes });
      toast.success('Document uploaded', { description: doc.reminder ? 'An expiry reminder was created.' : undefined });
      onClose();
      onUploaded(doc);
    } catch (err) {
      form.handleError(err);
    }
  };

  return (
    <FormModal title="Upload document" description={`PDF, images, text or Office files up to ${DOCUMENT_MAX_MB} MB. Stored privately.`} onClose={onClose} onSubmit={submit} submitLabel="Upload" submitting={upload.isPending}>
      <FormError error={form.formError} />
      <label
        className={clsx('dropzone', over && 'is-over')}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); pick(e.dataTransfer.files?.[0]); }}
      >
        <input ref={inputRef} type="file" accept={DOCUMENT_ACCEPT} onChange={(e) => pick(e.target.files?.[0])} />
        <Upload aria-hidden="true" />
        {file ? <><strong className="text-sm" style={{ color: 'var(--text)' }}>{file.name}</strong><span className="text-xs">{bytes(file.size)} · click to change</span></> : <><strong style={{ color: 'var(--text)' }}>Drop a file here or click to browse</strong><span className="text-xs">{DOCUMENT_ACCEPT.replace(/\./g, '').toUpperCase().replace(/,/g, ' · ')}</span></>}
      </label>
      <Field label="Title" error={form.errors.title}><Input {...form.bind('title')} maxLength={200} placeholder="e.g. Passport" /></Field>
      <div className="form-row">
        <Field label="Category"><Select {...form.bind('category')} options={DOCUMENT_CATEGORIES.map((c) => ({ value: c.value, label: `${c.emoji} ${c.label}` }))} /></Field>
        <Field label="Expiry date" optional error={form.errors.expiryDate}><Input type="date" {...form.bind('expiryDate')} /></Field>
        {form.values.expiryDate && <Field label="Remind me (days before)"><Input type="number" min={0} max={365} {...form.bind('remindDaysBefore')} /></Field>}
      </div>
      <Field label="Tags" optional><TagInput value={form.values.tags} onChange={(t) => form.set('tags', t)} /></Field>
      <Field label="Notes" optional><Textarea {...form.bind('notes')} rows={2} maxLength={2000} placeholder="Policy number, where the original is kept…" /></Field>
    </FormModal>
  );
}

function DocumentModal({ id, onClose }) {
  const doc = useDocument(id);
  return (
    <Modal open onClose={onClose} size="xl" title={doc.data?.title ?? 'Document'} description={doc.data ? `${doc.data.originalName} · ${bytes(doc.data.size)} · uploaded ${relativeDay(doc.data.createdAt.slice(0, 10))}` : undefined}>
      {doc.isPending ? <SkeletonList rows={6} /> : doc.isError ? (
        doc.error.status === 404 ? <EmptyState icon={FileText} title="Document not found" action={<Button onClick={onClose}>Close</Button>} /> : <ErrorState error={doc.error} onRetry={() => doc.refetch()} />
      ) : <DocumentDetail doc={doc.data} onClose={onClose} />}
    </Modal>
  );
}

function DocumentDetail({ doc, onClose }) {
  const update = useUpdateDocument();
  const remove = useDeleteDocument();
  const extract = useExtractDocument();
  const toast = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [previewError, setPreviewError] = useState(false);
  const inline = doc.mimeType === 'application/pdf' || doc.mimeType.startsWith('image/') || doc.mimeType === 'text/plain';
  const [text, setText] = useState(null);

  useEffect(() => {
    if (!inline) return undefined;
    let url;
    if (doc.mimeType === 'text/plain') {
      fetchFile(doc.fileUrl).then((r) => r.text()).then(setText).catch(() => setPreviewError(true));
      return undefined;
    }
    fetchBlobUrl(doc.fileUrl).then((u) => { url = u; setPreviewUrl(u); }).catch(() => setPreviewError(true));
    return () => url && URL.revokeObjectURL(url);
  }, [doc.fileUrl, doc.mimeType, inline]);

  const patch = (body, message) => update.mutate({ id: doc._id, ...body }, { onSuccess: () => message && toast.success(message), onError: (err) => toast.apiError(err, "Couldn't update document") });
  const download = async () => {
    try {
      const url = await fetchBlobUrl(`${doc.fileUrl}&download=true`);
      const a = Object.assign(document.createElement('a'), { href: url, download: doc.originalName });
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      toast.apiError(err, "Couldn't download");
    }
  };
  const onDelete = async () => {
    if (!(await confirm({ title: 'Delete this document?', description: 'The file and its expiry reminder are permanently removed.' }))) return;
    try {
      await remove.mutateAsync(doc._id);
      toast.success('Document deleted');
      onClose();
    } catch (err) {
      toast.apiError(err, "Couldn't delete document");
    }
  };

  const cat = DOCUMENT_META[doc.category];
  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="row row--wrap" style={{ gap: 6 }}>
        <Button size="sm" icon={Download} onClick={download}>Download</Button>
        {inline && previewUrl && <a className="btn btn--secondary btn--sm" href={previewUrl} target="_blank" rel="noopener noreferrer"><span className="btn__content"><ExternalLink aria-hidden="true" />Open</span></a>}
        <Button size="sm" icon={Star} aria-pressed={doc.favorite} onClick={() => patch({ favorite: !doc.favorite }, doc.favorite ? 'Removed from favorites' : 'Added to favorites')}>{doc.favorite ? 'Favorited' : 'Favorite'}</Button>
        <Button size="sm" icon={doc.archived ? ArchiveRestore : Archive} onClick={() => patch({ archived: !doc.archived }, doc.archived ? 'Restored' : 'Archived')}>{doc.archived ? 'Restore' : 'Archive'}</Button>
        <Button size="sm" icon={Sparkles} onClick={() => navigate(`/ai?context=document:${doc._id}`)}>Ask AI</Button>
        <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>Edit details</Button>
        <div className="grow" />
        <IconButton icon={Trash2} size="sm" label="Delete document" onClick={onDelete} />
      </div>

      {doc.expiryStatus && doc.expiryStatus !== 'valid' && (
        <div className={clsx('form-error')} style={doc.expiryStatus === 'expiring' ? { background: 'var(--warning-soft)', color: 'var(--warning-fg)' } : undefined}>
          <AlertTriangle aria-hidden="true" />
          <span>{doc.expiryStatus === 'expired' ? `Expired on ${formatKey(doc.expiryDate)}.` : `Expires ${countdown(doc.expiryDate)} (${formatKey(doc.expiryDate)}).`} {doc.reminder ? 'A reminder is set.' : ''}</span>
        </div>
      )}

      <div className="doc-preview">
        {!inline ? (
          <EmptyState compact icon={FileText} title="Preview not available for this file type" description="Download it to view." />
        ) : previewError ? (
          <EmptyState compact icon={AlertTriangle} title="Couldn't load the preview" />
        ) : doc.mimeType === 'text/plain' ? (
          text === null ? <Skeleton height={200} /> : <pre>{text}</pre>
        ) : !previewUrl ? (
          <Skeleton height={260} />
        ) : doc.mimeType === 'application/pdf' ? (
          <iframe title={doc.title} src={previewUrl} />
        ) : (
          <img src={previewUrl} alt={doc.title} />
        )}
      </div>

      <div className="doc-facts">
        <div><p className="doc-fact__label">Category</p><p className="doc-fact__value">{cat?.emoji} {cat?.label}</p></div>
        <div><p className="doc-fact__label">Type</p><p className="doc-fact__value">{doc.mimeType}</p></div>
        <div><p className="doc-fact__label">Uploaded</p><p className="doc-fact__value">{format(new Date(doc.createdAt), 'MMM d, yyyy')}</p></div>
        <div><p className="doc-fact__label">Updated</p><p className="doc-fact__value">{format(new Date(doc.updatedAt), 'MMM d, yyyy')}</p></div>
        <div><p className="doc-fact__label">Expiry</p><p className="doc-fact__value">{doc.expiryDate ? formatKey(doc.expiryDate) : '—'}</p></div>
        <div><p className="doc-fact__label">Reminder</p><p className="doc-fact__value">{doc.expiryDate && doc.remindDaysBefore !== null ? `${doc.remindDaysBefore} days before` : '—'}</p></div>
        <div><p className="doc-fact__label">Tags</p><p className="doc-fact__value">{doc.tags.length ? doc.tags.map((t) => `#${t}`).join(' ') : '—'}</p></div>
        <div><p className="doc-fact__label">Text extraction</p><p className="doc-fact__value">{doc.extraction?.status === 'done' ? `Available (${doc.extraction.provider})` : doc.extraction?.status === 'unavailable' ? 'No provider configured' : doc.extraction?.status ?? 'none'}{doc.extractionAvailable && doc.extraction?.status !== 'done' && <Button size="xs" variant="ghost" style={{ marginLeft: 6 }} loading={extract.isPending} onClick={() => extract.mutate(doc._id, { onError: (err) => toast.apiError(err, 'Extraction failed') })}>Run</Button>}</p></div>
      </div>
      {doc.notes && <p className="text-sm secondary" style={{ whiteSpace: 'pre-wrap' }}>{doc.notes}</p>}
      {doc.metadata && Object.keys(doc.metadata).length > 0 && (
        <div className="doc-facts">{Object.entries(doc.metadata).map(([k, v]) => <div key={k}><p className="doc-fact__label">{k}</p><p className="doc-fact__value">{v}</p></div>)}</div>
      )}

      <ConnectionsPanel type="document" id={doc._id} compact />

      {editing && <EditDetailsModal doc={doc} onClose={() => setEditing(false)} />}
    </div>
  );
}

function EditDetailsModal({ doc, onClose }) {
  const update = useUpdateDocument();
  const toast = useToast();
  const form = useFormState({ title: doc.title, category: doc.category, tags: doc.tags, expiryDate: doc.expiryDate ?? '', remindDaysBefore: String(doc.remindDaysBefore ?? 30), notes: doc.notes ?? '', metadata: Object.entries(doc.metadata ?? {}).map(([key, value]) => ({ key, value })) });
  const submit = async () => {
    if (!form.validate({ title: (v) => (!v.trim() ? 'Title is required' : null) })) return;
    const metadata = Object.fromEntries(form.values.metadata.filter((m) => m.key.trim()).map((m) => [m.key.trim().slice(0, 60), m.value.slice(0, 300)]));
    try {
      await update.mutateAsync({ id: doc._id, title: form.values.title.trim(), category: form.values.category, tags: form.values.tags, expiryDate: form.values.expiryDate || null, remindDaysBefore: form.values.expiryDate ? Number(form.values.remindDaysBefore) || 0 : null, notes: form.values.notes, metadata });
      toast.success('Document updated');
      onClose();
    } catch (err) {
      form.handleError(err);
    }
  };
  const setMeta = (i, patch) => form.set('metadata', (list) => list.map((m, j) => (j === i ? { ...m, ...patch } : m)));
  return (
    <FormModal title="Edit document details" onClose={onClose} onSubmit={submit} submitting={update.isPending}>
      <FormError error={form.formError} />
      <Field label="Title" error={form.errors.title}><Input {...form.bind('title')} maxLength={200} data-autofocus /></Field>
      <div className="form-row">
        <Field label="Category"><Select {...form.bind('category')} options={DOCUMENT_CATEGORIES.map((c) => ({ value: c.value, label: `${c.emoji} ${c.label}` }))} /></Field>
        <Field label="Expiry date" optional><Input type="date" {...form.bind('expiryDate')} /></Field>
        {form.values.expiryDate && <Field label="Remind (days before)"><Input type="number" min={0} max={365} {...form.bind('remindDaysBefore')} /></Field>}
      </div>
      <Field label="Tags" optional><TagInput value={form.values.tags} onChange={(t) => form.set('tags', t)} /></Field>
      <Field label="Notes" optional><Textarea {...form.bind('notes')} rows={2} maxLength={2000} /></Field>
      <Field label="Metadata" optional hint="Policy number, issuing authority, account reference…">
        <div className="list-editor">
          {form.values.metadata.map((m, i) => (
            <div key={i} className="list-editor__row">
              <input className="input input--sm" placeholder="Field" value={m.key} maxLength={60} aria-label={`Metadata field ${i + 1}`} onChange={(e) => setMeta(i, { key: e.target.value })} style={{ flex: '0 0 40%' }} />
              <input className="input input--sm" placeholder="Value" value={m.value} maxLength={300} aria-label={`Metadata value ${i + 1}`} onChange={(e) => setMeta(i, { value: e.target.value })} />
              <IconButton icon={X} size="xs" label="Remove field" onClick={() => form.set('metadata', (list) => list.filter((_, j) => j !== i))} />
            </div>
          ))}
          {form.values.metadata.length < 30 && <Button size="xs" variant="ghost" icon={Plus} onClick={() => form.set('metadata', (list) => [...list, { key: '', value: '' }])}>Add field</Button>}
        </div>
      </Field>
    </FormModal>
  );
}
