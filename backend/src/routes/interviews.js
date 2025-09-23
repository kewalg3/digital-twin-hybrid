const express = require('express');
const interviewController = require('../controllers/interviewController');

const router = express.Router();

// Interview routes
router.post('/start', interviewController.startInterview);
router.get('/current', interviewController.getCurrentSession);
router.post('/response', interviewController.submitResponse);
router.get('/history', interviewController.getInterviewHistory);
router.get('/analytics', interviewController.getInterviewAnalytics);

module.exports = router; 