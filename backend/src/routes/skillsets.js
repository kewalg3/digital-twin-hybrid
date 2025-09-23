const express = require('express');
const router = express.Router();
const skillsetController = require('../controllers/skillsetController');

// POST /api/skillsets - Add new skillset
router.post('/', skillsetController.addSkillset);

// GET /api/skillsets - Get user's skillsets
router.get('/', skillsetController.getUserSkillsets);

// DELETE /api/skillsets/:skillsetId - Delete skillset
router.delete('/:skillsetId', skillsetController.deleteSkillset);

module.exports = router;