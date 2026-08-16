const express = require('express');
const router = express.Router();
const { connectDB, adminProtect } = require('../config');
const Question = require('../models/Question');

// Simple question history route
router.get('/', adminProtect, async (req, res) => {
  try {
    await connectDB();
    
    // Get basic question count
    const totalQuestions = await Question.countDocuments();
    
    // Get recent questions without population (simpler approach)
    const recentQuestions = await Question.find()
      .sort({ createdAt: -1 })
      .limit(10);
    
    res.render('admin/question-history', {
      questions: recentQuestions,
      totalQuestions,
      user: req.session.user,
      active: 'question-history'
    });
    
  } catch (err) {
    console.error('Question History Error:', err);
    res.status(500).send('Error loading question history');
  }
});

module.exports = router;