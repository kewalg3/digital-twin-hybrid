const express = require('express');
const router = express.Router();
const softwareController = require('../controllers/softwareController');

// POST /api/software - Add new software
router.post('/', softwareController.addSoftware);

// GET /api/software - Get user's software
router.get('/', softwareController.getUserSoftware);

// DELETE /api/software/:softwareId - Delete software
router.delete('/:softwareId', softwareController.deleteSoftware);

module.exports = router;