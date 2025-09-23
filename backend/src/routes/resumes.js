const express = require('express');
const resumeController = require('../controllers/resumeController');

const router = express.Router();

// Resume routes
router.post('/upload', resumeController.uploadResume);
router.get('/', resumeController.getUserResumes);
router.get('/:resumeId', resumeController.getResume);
router.delete('/:resumeId', resumeController.deleteResume);
router.get('/analytics/overview', resumeController.getResumeAnalytics);

module.exports = router; 