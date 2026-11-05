import express from 'express';
import { deleteCrewMember, listCrewMembers, rememberCrewMember, setCrewFavorite } from '../services/crewMembers.js';

export const router = express.Router();

router.get('/', (req, res) => {
  try { res.json(listCrewMembers(req.user.id, String(req.query.role || 'driver'))); }
  catch (error) { res.status(400).json({ error: error.message }); }
});

router.post('/', (req, res) => {
  try { res.status(201).json(rememberCrewMember(req.user.id, req.body?.role, req.body?.name, req.body?.favorite)); }
  catch (error) { res.status(400).json({ error: error.message }); }
});

router.patch('/:id', (req, res) => {
  try {
    if (!setCrewFavorite(req.user.id, req.params.id, req.body?.favorite)) return res.status(404).json({ error: 'Crew member not found.' });
    res.status(204).end();
  } catch (error) { res.status(400).json({ error: error.message }); }
});

router.delete('/:id', (req, res) => {
  if (!deleteCrewMember(req.user.id, req.params.id)) return res.status(404).json({ error: 'Crew member not found.' });
  res.status(204).end();
});
