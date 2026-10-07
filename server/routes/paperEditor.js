import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { paperEditorAssetsPath } from '../services/paperEditorAssets.js';

export const router = express.Router();
const directory = fileURLToPath(new URL('../../prototypes/tow-paper-editor/', import.meta.url));
router.use((req, res, next) => {
  const allowed = ['/', '/index.html', '/editor.js', '/editor.css', '/assets/pdf-lib.min.js', '/assets/template.js', '/assets/page-1.png', '/assets/page-2.png', '/assets/page-3.png'];
  if (!allowed.includes(req.path)) return res.status(404).end();
  res.set('Cache-Control', 'private, no-store');
  next();
});
router.get('/assets/:name', (req, res) => {
  const name = req.params.name;
  const file = name === 'pdf-lib.min.js'
    ? fileURLToPath(new URL('../../node_modules/pdf-lib/dist/pdf-lib.min.js', import.meta.url))
    : path.join(paperEditorAssetsPath(), name);
  res.sendFile(file, { dotfiles: 'deny' });
});
router.use(express.static(path.resolve(directory), { fallthrough: false, etag: false, maxAge: 0 }));
