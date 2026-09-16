import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import clsx from 'clsx';
import { formatDistanceToNowStrict } from 'date-fns';
import { EditorContent, useEditor as useTiptap } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import LinkExtension from '@tiptap/extension-link';
import {
  Archive, ArchiveRestore, ArrowLeft, Bold, Check, Code, FileText, Folder, FolderPlus, Hash, Heading1, Heading2, Italic, Link2, List, ListChecks, ListOrdered,
  NotebookPen, Pencil, Pin, PinOff, Plus, Quote, Redo2, Search, SquareCode, Strikethrough, Trash2, Undo2, X,
} from 'lucide-react';
import { NoteAIMenu } from '../../features/notes/NoteAIMenu';
import { ConnectionsPanel } from '../../components/ConnectionsPanel';
import {
  Button, EmptyState, ErrorState, IconButton, Input, Menu, Select, Skeleton, SkeletonList, TagInput,
} from '../../components/ui';
import {
  useCreateFolder, useCreateNote, useDeleteFolder, useDeleteNote, useFolders, useNote, useNoteTags, useNotes, useUpdateFolder, useUpdateNote,
} from '../../api/hooks';
import { useToast } from '../../context/ToastContext';
import { useConfirm } from '../../context/ConfirmContext';
import { useDebounce } from '../../hooks/useUtils';
import './notes.css';

const isObjectId = (v) => /^[a-f\d]{24}$/i.test(v ?? '');

export default function NotesPage() {
  const [params, setParams] = useSearchParams();
  const selectedId = params.get('note');
  const folderFilter = params.get('folder') ?? 'all';
  const tag = params.get('tag');
  const [search, setSearch] = useState('');
  const q = useDebounce(search.trim(), 250);
  const toast = useToast();

  const listParams = {
    ...(folderFilter === 'pinned' && { pinned: 'true' }),
    ...(folderFilter === 'archived' && { archived: 'true' }),
    ...(folderFilter === 'none' && { folder: 'none' }),
    ...(isObjectId(folderFilter) && { folder: folderFilter }),
    ...(tag && { tag }),
    ...(q && { q }),
  };
  const notes = useNotes(listParams);
  const folders = useFolders();
  const createNote = useCreateNote();

  const updateParams = useCallback(
    (patch) => {
      setParams(
        (current) => {
          const next = new URLSearchParams(current);
          Object.entries(patch).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)));
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  const newNote = () =>
    createNote.mutate(
      { title: '', content: '', folder: isObjectId(folderFilter) ? folderFilter : null, pinned: folderFilter === 'pinned', tags: tag ? [tag] : [] },
      { onSuccess: (note) => updateParams({ note: note._id }), onError: (err) => toast.apiError(err, "Couldn't create note") },
    );

  const folderList = folders.data?.data ?? [];

  return (
    <div className="page page--flush">
      <div className={clsx('notes', selectedId && 'has-selection')}>
        <NotesSidebar folders={folders} folderFilter={folderFilter} tag={tag} onFilter={updateParams} />

        <section className="notes__list" aria-label="Notes">
          <div className="notes__list-header">
            <div className="input-group grow">
              <Search aria-hidden="true" />
              <Input size="sm" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search notes" aria-label="Search notes" />
            </div>
            <IconButton icon={Plus} label="New note" variant="primary" size="sm" onClick={newNote} loading={createNote.isPending} />
          </div>
          <div className="notes__mobile-filters mobile-only">
            <Select
              size="sm"
              aria-label="Filter notes"
              value={tag ? `tag:${tag}` : folderFilter}
              onChange={(e) => {
                const v = e.target.value;
                if (v.startsWith('tag:')) updateParams({ tag: v.slice(4), folder: null });
                else updateParams({ folder: v === 'all' ? null : v, tag: null });
              }}
              options={[
                { value: 'all', label: 'All notes' },
                { value: 'pinned', label: 'Pinned' },
                { value: 'none', label: 'Unfiled' },
                { value: 'archived', label: 'Archived' },
                ...folderList.map((f) => ({ value: f._id, label: f.name })),
              ]}
            />
          </div>
          <div className="notes__items">
            {notes.isPending ? (
              <SkeletonList rows={6} />
            ) : notes.isError && !notes.data ? (
              <ErrorState compact error={notes.error} onRetry={() => notes.refetch()} />
            ) : notes.data.length === 0 ? (
              <EmptyState
                compact
                icon={q ? Search : NotebookPen}
                title={q ? 'No matching notes' : 'No notes here yet'}
                description={q ? 'Try another search term.' : 'Capture ideas, meeting notes and plans.'}
                action={!q && <Button size="sm" icon={Plus} onClick={newNote}>New note</Button>}
              />
            ) : (
              notes.data.map((note) => {
                const folder = folderList.find((f) => f._id === note.folder);
                return (
                  <button
                    key={note._id}
                    type="button"
                    className={clsx('note-item', selectedId === note._id && 'is-selected')}
                    onClick={() => updateParams({ note: note._id })}
                    aria-current={selectedId === note._id ? 'true' : undefined}
                  >
                    <span className="note-item__title">
                      {note.pinned && <Pin aria-label="Pinned" />}
                      <span className="truncate">{note.title || 'Untitled note'}</span>
                    </span>
                    <span className="note-item__excerpt">{note.excerpt || 'No additional text'}</span>
                    <span className="note-item__meta">
                      {formatDistanceToNowStrict(new Date(note.updatedAt), { addSuffix: true })}
                      {folder && <><span className={`dot dot--sm color-${folder.color}`} aria-hidden="true" />{folder.name}</>}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </section>

        <section className="notes__editor" aria-label="Note editor">
          <NotePane noteId={selectedId} folders={folderList} onBack={() => updateParams({ note: null })} onCreate={newNote} />
        </section>
      </div>
    </div>
  );
}

function NotesSidebar({ folders, folderFilter, tag, onFilter }) {
  const tags = useNoteTags();
  const createFolder = useCreateFolder();
  const updateFolder = useUpdateFolder();
  const deleteFolder = useDeleteFolder();
  const toast = useToast();
  const confirm = useConfirm();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [renaming, setRenaming] = useState(null);

  const meta = folders.data?.meta;
  const list = folders.data?.data ?? [];

  const submitFolder = (e) => {
    e.preventDefault();
    if (!name.trim()) return setAdding(false);
    createFolder.mutate(
      { name: name.trim() },
      {
        onSuccess: (folder) => {
          setName('');
          setAdding(false);
          onFilter({ folder: folder._id, tag: null });
        },
        onError: (err) => toast.apiError(err, err.status === 409 ? 'A folder with that name exists' : "Couldn't create folder"),
      },
    );
  };

  const item = (value, label, Icon, count, extra) => (
    <button
      type="button"
      className={clsx('notes-nav__item', !tag && folderFilter === value && 'is-active')}
      onClick={() => onFilter({ folder: value === 'all' ? null : value, tag: null })}
    >
      {Icon}
      <span className="grow truncate">{label}</span>
      {count !== undefined && <span className="notes-nav__count">{count}</span>}
      {extra}
    </button>
  );

  return (
    <nav className="notes__sidebar desktop-only" aria-label="Note folders">
      <div className="notes-nav">
        {item('all', 'All notes', <FileText aria-hidden="true" />, meta?.total)}
        {item('pinned', 'Pinned', <Pin aria-hidden="true" />, meta?.pinned)}
        {item('none', 'Unfiled', <Folder aria-hidden="true" />, meta?.unfiled)}
        {item('archived', 'Archived', <Archive aria-hidden="true" />, meta?.archived)}
      </div>

      <div className="notes-nav__section">
        <span>Folders</span>
        <IconButton icon={FolderPlus} label="New folder" size="xs" onClick={() => setAdding(true)} />
      </div>
      <div className="notes-nav">
        {folders.isPending && <Skeleton height={24} />}
        {list.map((f) =>
          renaming === f._id ? (
            <RenameFolder
              key={f._id}
              folder={f}
              onDone={(newName) => {
                setRenaming(null);
                if (newName && newName !== f.name) {
                  updateFolder.mutate({ id: f._id, name: newName }, { onError: (err) => toast.apiError(err, "Couldn't rename folder") });
                }
              }}
            />
          ) : (
            <div key={f._id} className="notes-nav__row">
              {item(f._id, f.name, <span className={`dot color-${f.color}`} aria-hidden="true" />, f.noteCount)}
              <Menu
                label={`Actions for folder ${f.name}`}
                size="xs"
                items={[
                  { label: 'Rename', icon: Pencil, onSelect: () => setRenaming(f._id) },
                  {
                    label: 'Delete folder',
                    icon: Trash2,
                    danger: true,
                    onSelect: async () => {
                      if (!(await confirm({ title: `Delete "${f.name}"?`, description: 'Notes in this folder are kept and moved to Unfiled.' }))) return;
                      deleteFolder.mutate(f._id, {
                        onSuccess: () => {
                          toast.success('Folder deleted');
                          if (folderFilter === f._id) onFilter({ folder: null });
                        },
                        onError: (err) => toast.apiError(err, "Couldn't delete folder"),
                      });
                    },
                  },
                ]}
              />
            </div>
          ),
        )}
        {adding && (
          <form onSubmit={submitFolder} className="notes-nav__form">
            <Input size="sm" autoFocus value={name} onChange={(e) => setName(e.target.value)} onBlur={submitFolder} placeholder="Folder name" maxLength={60} aria-label="New folder name" />
          </form>
        )}
        {!folders.isPending && !list.length && !adding && <p className="text-xs faint" style={{ padding: '2px 10px' }}>No folders yet</p>}
      </div>

      {tags.data?.length > 0 && (
        <>
          <div className="notes-nav__section"><span>Tags</span></div>
          <div className="notes-tags">
            {tags.data.map((t) => (
              <button key={t.tag} type="button" className={clsx('notes-tag', tag === t.tag && 'is-active')} onClick={() => onFilter({ tag: tag === t.tag ? null : t.tag, folder: null })}>
                <Hash aria-hidden="true" />{t.tag}<span className="notes-nav__count">{t.count}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </nav>
  );
}

function RenameFolder({ folder, onDone }) {
  const [value, setValue] = useState(folder.name);
  return (
    <form className="notes-nav__form" onSubmit={(e) => { e.preventDefault(); onDone(value.trim()); }}>
      <Input size="sm" autoFocus value={value} maxLength={60} onChange={(e) => setValue(e.target.value)} onBlur={() => onDone(value.trim())} onKeyDown={(e) => e.key === 'Escape' && onDone(null)} aria-label="Folder name" />
    </form>
  );
}

function NotePane({ noteId, folders, onBack, onCreate }) {
  const note = useNote(noteId);

  if (!noteId) {
    return (
      <div className="notes__placeholder">
        <EmptyState icon={NotebookPen} title="Select a note" description="Pick a note from the list, or start writing something new." action={<Button icon={Plus} onClick={onCreate}>New note</Button>} />
      </div>
    );
  }
  if (note.isPending) {
    return (
      <div className="note-editor">
        <Skeleton height={34} width="50%" />
        <Skeleton height={14} width="90%" style={{ marginTop: 24 }} />
        <Skeleton height={14} width="75%" style={{ marginTop: 10 }} />
      </div>
    );
  }
  if (note.isError) {
    return (
      <div className="notes__placeholder">
        {note.error.status === 404 ? (
          <EmptyState icon={FileText} title="Note not found" description="It may have been deleted." action={<Button onClick={onBack}>Back to notes</Button>} />
        ) : (
          <ErrorState error={note.error} onRetry={() => note.refetch()} />
        )}
      </div>
    );
  }
  return <NoteEditor key={noteId} note={note.data} folders={folders} onBack={onBack} />;
}

const SAVE_LABEL = { saved: 'Saved', pending: 'Unsaved changes', saving: 'Saving…', error: "Couldn't save" };

function NoteEditor({ note, folders, onBack }) {
  const update = useUpdateNote();
  const remove = useDeleteNote();
  const toast = useToast();
  const confirm = useConfirm();
  const [title, setTitle] = useState(note.title);
  const [tags, setTags] = useState(note.tags);
  const [folder, setFolder] = useState(note.folder ?? '');
  const [pinned, setPinned] = useState(note.pinned);
  const [archived, setArchived] = useState(note.archived ?? false);
  const [status, setStatus] = useState('saved');
  const [linkOpen, setLinkOpen] = useState(false);
  const pending = useRef({});
  const timer = useRef(null);

  const flush = () => {
    clearTimeout(timer.current);
    const patch = pending.current;
    if (!Object.keys(patch).length) return;
    pending.current = {};
    setStatus('saving');
    update.mutate(
      { id: note._id, ...patch },
      {
        onSuccess: () => setStatus(Object.keys(pending.current).length ? 'pending' : 'saved'),
        onError: (err) => {
          pending.current = { ...patch, ...pending.current };
          setStatus('error');
          toast.apiError(err, "Couldn't save note");
        },
      },
    );
  };
  const flushRef = useRef(flush);
  flushRef.current = flush;

  const queue = (patch, delay = 700) => {
    pending.current = { ...pending.current, ...patch };
    setStatus('pending');
    clearTimeout(timer.current);
    timer.current = setTimeout(() => flushRef.current(), delay);
  };

  // Save anything outstanding when switching notes or leaving the page.
  useEffect(() => {
    const onBeforeUnload = (e) => {
      if (Object.keys(pending.current).length) {
        flushRef.current();
        e.preventDefault();
      }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      flushRef.current();
    };
  }, []);

  const editor = useTiptap({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Placeholder.configure({ placeholder: 'Start writing…' }),
      TaskList,
      TaskItem.configure({ nested: true }),
      LinkExtension.configure({ openOnClick: false, autolink: true, protocols: ['mailto'], HTMLAttributes: { rel: 'noopener noreferrer nofollow', target: '_blank' } }),
    ],
    content: note.content,
    editorProps: { attributes: { class: 'prose', 'aria-label': 'Note content' } },
    onUpdate: ({ editor: ed }) => queue({ content: ed.getHTML() }),
  });

  const onDelete = async () => {
    if (!(await confirm({ title: 'Delete this note?', description: `"${title || 'Untitled note'}" will be permanently deleted.` }))) return;
    pending.current = {};
    clearTimeout(timer.current);
    // mutateAsync: the editor unmounts as soon as the cached note is removed, so
    // mutate() callbacks would never fire.
    try {
      await remove.mutateAsync(note._id);
      toast.success('Note deleted');
      onBack();
    } catch (err) {
      toast.apiError(err, "Couldn't delete note");
    }
  };

  return (
    <div className="note-editor">
      <div className="note-editor__topbar">
        <IconButton className="mobile-only" icon={ArrowLeft} label="Back to notes" onClick={onBack} />
        <span className={clsx('save-status', `is-${status}`)} role="status" aria-live="polite">
          {status === 'saved' && <Check aria-hidden="true" />}
          {SAVE_LABEL[status]}
          {status === 'error' && <button type="button" className="text-accent" onClick={() => flush()}>Retry</button>}
        </span>
        <div className="grow" />
        {editor && <NoteAIMenu note={note} onReplaceContent={(html) => { editor.commands.setContent(html); queue({ content: editor.getHTML() }, 0); }} />}
        <IconButton
          icon={pinned ? PinOff : Pin}
          label={pinned ? 'Unpin note' : 'Pin note'}
          aria-pressed={pinned}
          onClick={() => {
            setPinned(!pinned);
            queue({ pinned: !pinned }, 0);
          }}
        />
        <IconButton
          icon={archived ? ArchiveRestore : Archive}
          label={archived ? 'Restore note' : 'Archive note'}
          onClick={() => {
            setArchived(!archived);
            queue({ archived: !archived }, 0);
            toast.success(archived ? 'Note restored' : 'Note archived');
          }}
        />
        <IconButton icon={Trash2} label="Delete note" onClick={onDelete} />
      </div>

      <input
        className="note-editor__title"
        value={title}
        placeholder="Untitled note"
        aria-label="Note title"
        maxLength={200}
        onChange={(e) => {
          setTitle(e.target.value);
          queue({ title: e.target.value });
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            editor?.commands.focus('start');
          }
        }}
        autoFocus={!note.title}
      />

      <div className="note-editor__meta">
        <label className="note-meta-field">
          <Folder aria-hidden="true" />
          <select
            value={folder}
            aria-label="Folder"
            onChange={(e) => {
              setFolder(e.target.value);
              queue({ folder: e.target.value || null }, 0);
            }}
          >
            <option value="">No folder</option>
            {folders.map((f) => <option key={f._id} value={f._id}>{f.name}</option>)}
          </select>
        </label>
        <div className="grow note-meta-tags">
          <TagInput
            value={tags}
            placeholder="Add tags…"
            onChange={(next) => {
              setTags(next);
              queue({ tags: next }, 0);
            }}
          />
        </div>
      </div>

      {editor && <Toolbar editor={editor} linkOpen={linkOpen} setLinkOpen={setLinkOpen} />}
      <EditorContent editor={editor} className="note-editor__content" />
      <div style={{ marginTop: 28 }}>
        <ConnectionsPanel type="note" id={note._id} compact title="Connected to" />
      </div>
    </div>
  );
}

function Toolbar({ editor, linkOpen, setLinkOpen }) {
  const [url, setUrl] = useState('');
  const tools = [
    [
      { icon: Bold, label: 'Bold', active: editor.isActive('bold'), run: () => editor.chain().focus().toggleBold().run() },
      { icon: Italic, label: 'Italic', active: editor.isActive('italic'), run: () => editor.chain().focus().toggleItalic().run() },
      { icon: Strikethrough, label: 'Strikethrough', active: editor.isActive('strike'), run: () => editor.chain().focus().toggleStrike().run() },
      { icon: Code, label: 'Inline code', active: editor.isActive('code'), run: () => editor.chain().focus().toggleCode().run() },
    ],
    [
      { icon: Heading1, label: 'Heading 1', active: editor.isActive('heading', { level: 1 }), run: () => editor.chain().focus().toggleHeading({ level: 1 }).run() },
      { icon: Heading2, label: 'Heading 2', active: editor.isActive('heading', { level: 2 }), run: () => editor.chain().focus().toggleHeading({ level: 2 }).run() },
    ],
    [
      { icon: List, label: 'Bullet list', active: editor.isActive('bulletList'), run: () => editor.chain().focus().toggleBulletList().run() },
      { icon: ListOrdered, label: 'Numbered list', active: editor.isActive('orderedList'), run: () => editor.chain().focus().toggleOrderedList().run() },
      { icon: ListChecks, label: 'Checklist', active: editor.isActive('taskList'), run: () => editor.chain().focus().toggleTaskList().run() },
      { icon: Quote, label: 'Quote', active: editor.isActive('blockquote'), run: () => editor.chain().focus().toggleBlockquote().run() },
      { icon: SquareCode, label: 'Code block', active: editor.isActive('codeBlock'), run: () => editor.chain().focus().toggleCodeBlock().run() },
      {
        icon: Link2,
        label: editor.isActive('link') ? 'Remove link' : 'Add link',
        active: editor.isActive('link'),
        run: () => {
          if (editor.isActive('link')) editor.chain().focus().unsetLink().run();
          else {
            setUrl('');
            setLinkOpen(true);
          }
        },
      },
    ],
    [
      { icon: Undo2, label: 'Undo', disabled: !editor.can().undo(), run: () => editor.chain().focus().undo().run() },
      { icon: Redo2, label: 'Redo', disabled: !editor.can().redo(), run: () => editor.chain().focus().redo().run() },
    ],
  ];

  const applyLink = (e) => {
    e.preventDefault();
    let href = url.trim();
    if (!href) return setLinkOpen(false);
    if (!/^(https?:|mailto:)/i.test(href)) href = `https://${href}`;
    editor.chain().focus().extendMarkRange('link').setLink({ href }).run();
    setLinkOpen(false);
  };

  return (
    <div className="note-toolbar" role="toolbar" aria-label="Formatting">
      {linkOpen ? (
        <form className="note-toolbar__link" onSubmit={applyLink}>
          <Link2 size={15} className="muted" aria-hidden="true" />
          <input autoFocus value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Paste or type a link, then press Enter" aria-label="Link URL" onKeyDown={(e) => e.key === 'Escape' && setLinkOpen(false)} />
          <Button size="xs" type="submit" variant="primary">Apply</Button>
          <IconButton icon={X} size="xs" label="Cancel" onClick={() => setLinkOpen(false)} />
        </form>
      ) : (
        tools.map((group, gi) => (
          <div key={gi} className="note-toolbar__group">
            {group.map((tool) => (
              <IconButton
                key={tool.label}
                icon={tool.icon}
                label={tool.label}
                size="sm"
                aria-pressed={tool.active ?? undefined}
                disabled={tool.disabled}
                onMouseDown={(e) => e.preventDefault()}
                onClick={tool.run}
              />
            ))}
          </div>
        ))
      )}
    </div>
  );
}
