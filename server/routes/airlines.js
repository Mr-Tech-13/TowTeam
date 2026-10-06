import express from 'express';
import { requireAdmin } from '../middleware/auth.js';
import { createAirline, deleteAirline, listAirlines, updateAirline } from '../services/airlines.js';
import { writeAudit } from '../services/audit.js';

export const router = express.Router();

router.get('/', (_req, res) => res.json(listAirlines()));
router.use(requireAdmin);

router.post('/', (req, res) => {
  try {
    const airline = createAirline(req.body);
    writeAudit(req.user, 'airline.create', { entityType: 'airline', entityId: airline.code, details: airline });
    res.status(201).json(airline);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.put('/:code', (req, res) => {
  try {
    const airline = updateAirline(req.params.code, req.body);
    if (!airline) return res.status(404).json({ error: 'Airline not found.' });
    writeAudit(req.user, 'airline.update', { entityType: 'airline', entityId: airline.code, details: airline });
    res.json(airline);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.delete('/:code', (req, res) => {
  if (!deleteAirline(req.params.code)) return res.status(404).json({ error: 'Airline not found.' });
  writeAudit(req.user, 'airline.delete', { entityType: 'airline', entityId: req.params.code });
  res.status(204).end();
});
