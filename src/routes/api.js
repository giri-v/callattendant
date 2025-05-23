const express = require('express');
const router = express.Router();
const db = require('../lib/database'); // Adjusted path

// --- Permitted Numbers Endpoints ---

router.get('/permitted-numbers', async (req, res) => {
  try {
    const numbers = await db.getPermittedNumbers();
    res.json(numbers);
  } catch (err) {
    console.error('API Error (GET /permitted-numbers):', err);
    res.status(500).json({ error: 'Failed to retrieve permitted numbers.' });
  }
});


// --- Permitted Patterns Endpoints ---

router.get('/permitted-patterns', async (req, res) => {
  try {
    const patterns = await db.getPermittedPatterns(false); // Get all, including inactive
    res.json(patterns);
  } catch (err) {
    console.error('API Error (GET /permitted-patterns):', err);
    res.status(500).json({ error: 'Failed to retrieve permitted patterns.' });
  }
});

router.post('/permitted-patterns', async (req, res) => {
  const { pattern, scope, comment } = req.body;
  if (!pattern) {
    return res.status(400).json({ error: 'Pattern is required.' });
  }
  if (scope && !['name', 'number', 'any'].includes(scope)) {
    return res.status(400).json({ error: "Invalid scope. Must be 'name', 'number', or 'any'." });
  }
  try {
    const result = await db.addPermittedPattern(pattern, scope, comment);
    // addPermittedPattern in db.js logs success/failure
    res.status(201).json({ message: 'Permitted pattern added/updated successfully.', pattern, scope, comment, changes: result.changes });
  } catch (err) {
    console.error('API Error (POST /permitted-patterns):', err);
    res.status(500).json({ error: 'Failed to add/update permitted pattern.' });
  }
});

router.delete('/permitted-patterns', async (req, res) => {
  const { pattern } = req.body;
  if (!pattern) {
    return res.status(400).json({ error: 'Pattern is required in the request body.' });
  }
  try {
    const result = await db.removePermittedPattern(pattern);
    if (result.changes > 0) {
      res.status(200).json({ message: `Permitted pattern "${pattern}" removed successfully.` });
    } else {
      res.status(404).json({ error: `Permitted pattern "${pattern}" not found.` });
    }
  } catch (err) {
    console.error('API Error (DELETE /permitted-patterns):', err);
    res.status(500).json({ error: 'Failed to remove permitted pattern.' });
  }
});

router.put('/permitted-patterns/status', async (req, res) => {
  const { pattern, isActive } = req.body;
  if (!pattern) {
    return res.status(400).json({ error: 'Pattern is required in the request body.' });
  }
  if (typeof isActive !== 'boolean') {
    return res.status(400).json({ error: 'isActive (boolean) is required in the request body.' });
  }
  try {
    const result = await db.setPermittedPatternStatus(pattern, isActive);
    if (result.changes > 0) {
      res.status(200).json({ message: `Permitted pattern "${pattern}" status updated to ${isActive}.` });
    } else {
      res.status(404).json({ error: `Permitted pattern "${pattern}" not found.` });
    }
  } catch (err) {
    console.error('API Error (PUT /permitted-patterns/status):', err);
    res.status(500).json({ error: 'Failed to update permitted pattern status.' });
  }
});


// --- Blocked Patterns Endpoints ---

router.get('/blocked-patterns', async (req, res) => {
  try {
    const patterns = await db.getBlockedPatterns(false); // Get all, including inactive
    res.json(patterns);
  } catch (err) {
    console.error('API Error (GET /blocked-patterns):', err);
    res.status(500).json({ error: 'Failed to retrieve blocked patterns.' });
  }
});

router.post('/blocked-patterns', async (req, res) => {
  const { pattern, scope, comment } = req.body;
  if (!pattern) {
    return res.status(400).json({ error: 'Pattern is required.' });
  }
  if (scope && !['name', 'number', 'any'].includes(scope)) {
    return res.status(400).json({ error: "Invalid scope. Must be 'name', 'number', or 'any'." });
  }
  try {
    const result = await db.addBlockedPattern(pattern, scope, comment);
    res.status(201).json({ message: 'Blocked pattern added/updated successfully.', pattern, scope, comment, changes: result.changes });
  } catch (err) {
    console.error('API Error (POST /blocked-patterns):', err);
    res.status(500).json({ error: 'Failed to add/update blocked pattern.' });
  }
});

router.delete('/blocked-patterns', async (req, res) => {
  const { pattern } = req.body;
  if (!pattern) {
    return res.status(400).json({ error: 'Pattern is required in the request body.' });
  }
  try {
    const result = await db.removeBlockedPattern(pattern);
    if (result.changes > 0) {
      res.status(200).json({ message: `Blocked pattern "${pattern}" removed successfully.` });
    } else {
      res.status(404).json({ error: `Blocked pattern "${pattern}" not found.` });
    }
  } catch (err) {
    console.error('API Error (DELETE /blocked-patterns):', err);
    res.status(500).json({ error: 'Failed to remove blocked pattern.' });
  }
});

router.put('/blocked-patterns/status', async (req, res) => {
  const { pattern, isActive } = req.body;
  if (!pattern) {
    return res.status(400).json({ error: 'Pattern is required in the request body.' });
  }
  if (typeof isActive !== 'boolean') {
    return res.status(400).json({ error: 'isActive (boolean) is required in the request body.' });
  }
  try {
    const result = await db.setBlockedPatternStatus(pattern, isActive);
    if (result.changes > 0) {
      res.status(200).json({ message: `Blocked pattern "${pattern}" status updated to ${isActive}.` });
    } else {
      res.status(404).json({ error: `Blocked pattern "${pattern}" not found.` });
    }
  } catch (err) {
    console.error('API Error (PUT /blocked-patterns/status):', err);
    res.status(500).json({ error: 'Failed to update blocked pattern status.' });
  }
});

router.post('/permitted-numbers', async (req, res) => {
  const { number, name } = req.body;
  if (!number) {
    return res.status(400).json({ error: 'Number is required.' });
  }
  try {
    const result = await db.addPermittedNumber(number, name);
    if (result.changes > 0) {
      res.status(201).json({ message: 'Permitted number added/updated successfully.', number, name });
    } else {
      // This case might happen if the number exists and name is the same, resulting in no change.
      // Consider it a success for idempotency.
      res.status(200).json({ message: 'Permitted number already exists with the same details.', number, name });
    }
  } catch (err) {
    console.error('API Error (POST /permitted-numbers):', err);
    res.status(500).json({ error: 'Failed to add/update permitted number.' });
  }
});

router.delete('/permitted-numbers/:number', async (req, res) => {
  const { number } = req.params;
  if (!number) {
    return res.status(400).json({ error: 'Number parameter is required.' });
  }
  try {
    const result = await db.removePermittedNumber(number);
    if (result.changes > 0) {
      res.status(200).json({ message: `Permitted number ${number} removed successfully.` });
      // Or res.status(204).send(); if no content is preferred for DELETE success
    } else {
      res.status(404).json({ error: `Permitted number ${number} not found.` });
    }
  } catch (err) {
    console.error('API Error (DELETE /permitted-numbers/:number):', err);
    res.status(500).json({ error: 'Failed to remove permitted number.' });
  }
});

// --- Blocked Numbers Endpoints ---

router.get('/blocked-numbers', async (req, res) => {
  try {
    const numbers = await db.getBlockedNumbers();
    res.json(numbers);
  } catch (err) {
    console.error('API Error (GET /blocked-numbers):', err);
    res.status(500).json({ error: 'Failed to retrieve blocked numbers.' });
  }
});

router.post('/blocked-numbers', async (req, res) => {
  const { number, reason } = req.body;
  if (!number) {
    return res.status(400).json({ error: 'Number is required.' });
  }
  try {
    const result = await db.addBlockedNumber(number, reason);
     if (result.changes > 0) {
      res.status(201).json({ message: 'Blocked number added/updated successfully.', number, reason });
    } else {
      res.status(200).json({ message: 'Blocked number already exists with the same details.', number, reason });
    }
  } catch (err) {
    console.error('API Error (POST /blocked-numbers):', err);
    res.status(500).json({ error: 'Failed to add/update blocked number.' });
  }
});

router.delete('/blocked-numbers/:number', async (req, res) => {
  const { number } = req.params;
  if (!number) {
    return res.status(400).json({ error: 'Number parameter is required.' });
  }
  try {
    const result = await db.removeBlockedNumber(number);
    if (result.changes > 0) {
      res.status(200).json({ message: `Blocked number ${number} removed successfully.` });
      // Or res.status(204).send();
    } else {
      res.status(404).json({ error: `Blocked number ${number} not found.` });
    }
  } catch (err) {
    console.error('API Error (DELETE /blocked-numbers/:number):', err);
    res.status(500).json({ error: 'Failed to remove blocked number.' });
  }
});

module.exports = router;
