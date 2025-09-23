const express = require('express');
const router = express.Router();
const autocompleteController = require('../controllers/autocompleteController');

// GET /api/autocomplete/skills?query=java&type=skills
router.get('/skills', autocompleteController.searchSkills);

module.exports = router;