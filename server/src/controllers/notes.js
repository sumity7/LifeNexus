import { Folder, Note } from '../models/Note.js';
import { AppError } from '../utils/AppError.js';
import { escapeRegex } from '../validators/common.js';
import { htmlToText, sanitizeNoteHtml } from '../utils/html.js';
import { logActivity } from '../services/activity.js';
import { deleteLinksFor } from '../services/links.js';
import { findOwned, toObjectId } from './helpers.js';

async function assertFolder(userId, folderId) {
  if (folderId && !(await Folder.exists({ _id: folderId, user: userId }))) {
    throw new AppError(400, 'Folder not found');
  }
}

function applyContent(note, body) {
  const { content, ...rest } = body;
  note.set(rest);
  if (content !== undefined) {
    note.content = sanitizeNoteHtml(content);
    note.plainText = htmlToText(note.content);
  }
}

export async function listNotes(req, res) {
  const { folder, tag, pinned, archived, q } = req.valid.query;
  const filter = { user: toObjectId(req.user.id), archived: archived === 'true' };
  if (folder) filter.folder = folder === 'none' ? null : toObjectId(folder);
  if (tag) filter.tags = tag;
  if (pinned) filter.pinned = pinned === 'true';
  if (q) {
    const rx = new RegExp(escapeRegex(q), 'i');
    filter.$or = [{ title: rx }, { plainText: rx }, { tags: rx }];
  }

  const notes = await Note.find(filter, {
    title: 1, folder: 1, tags: 1, pinned: 1, archived: 1, createdAt: 1, updatedAt: 1,
    excerpt: { $substrCP: ['$plainText', 0, 220] },
  })
    .sort({ pinned: -1, updatedAt: -1 })
    .limit(1000)
    .lean();

  res.json({ data: notes });
}

export async function getNote(req, res) {
  res.json({ data: await findOwned(Note, req.valid.params.id, req.user.id, 'Note') });
}

export async function createNote(req, res) {
  await assertFolder(req.user.id, req.valid.body.folder);
  const note = new Note({ user: req.user.id });
  applyContent(note, req.valid.body);
  await note.save();
  await logActivity(req.user.id, 'note_created', { entityType: 'note', entityId: note._id, title: note.title || 'Untitled note' });
  res.status(201).json({ data: note });
}

export async function updateNote(req, res) {
  const note = await findOwned(Note, req.valid.params.id, req.user.id, 'Note');
  await assertFolder(req.user.id, req.valid.body.folder);
  applyContent(note, req.valid.body);
  await note.save();
  res.json({ data: note });
}

export async function deleteNote(req, res) {
  const note = await findOwned(Note, req.valid.params.id, req.user.id, 'Note');
  await Promise.all([note.deleteOne(), deleteLinksFor(req.user.id, 'note', note._id)]);
  res.status(204).end();
}

export async function listTags(req, res) {
  const tags = await Note.aggregate([
    { $match: { user: toObjectId(req.user.id) } },
    { $unwind: '$tags' },
    { $group: { _id: '$tags', count: { $sum: 1 } } },
    { $sort: { count: -1, _id: 1 } },
  ]);
  res.json({ data: tags.map((t) => ({ tag: t._id, count: t.count })) });
}

export async function listFolders(req, res) {
  const user = toObjectId(req.user.id);
  const [folders, counts] = await Promise.all([
    Folder.find({ user }).sort({ name: 1 }).lean(),
    Note.aggregate([
      { $match: { user, archived: false } },
      { $group: { _id: '$folder', count: { $sum: 1 }, pinned: { $sum: { $cond: ['$pinned', 1, 0] } } } },
    ]),
  ]);
  const archived = await Note.countDocuments({ user, archived: true });
  const byFolder = new Map(counts.map((c) => [String(c._id), c]));
  res.json({
    data: folders.map((f) => ({ ...f, noteCount: byFolder.get(String(f._id))?.count ?? 0 })),
    meta: {
      total: counts.reduce((sum, c) => sum + c.count, 0),
      pinned: counts.reduce((sum, c) => sum + c.pinned, 0),
      unfiled: byFolder.get('null')?.count ?? 0,
      archived,
    },
  });
}

export async function createFolder(req, res) {
  const folder = await Folder.create({ ...req.valid.body, user: req.user.id });
  res.status(201).json({ data: { ...folder.toJSON(), noteCount: 0 } });
}

export async function updateFolder(req, res) {
  const folder = await findOwned(Folder, req.valid.params.id, req.user.id, 'Folder');
  folder.set(req.valid.body);
  await folder.save();
  res.json({ data: folder });
}

export async function deleteFolder(req, res) {
  const folder = await findOwned(Folder, req.valid.params.id, req.user.id, 'Folder');
  await folder.deleteOne();
  await Note.updateMany({ user: req.user.id, folder: folder._id }, { $set: { folder: null } });
  res.status(204).end();
}
