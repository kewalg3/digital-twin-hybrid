const express = require('express');
const { PrismaClient } = require('@prisma/client');
const router = express.Router();

const prisma = new PrismaClient();

// Get user skills
router.get('/', async (req, res) => {
  try {
    const userId = req.user.userId;

    const skills = await prisma.skill.findMany({
      where: { userId },
      orderBy: [
        { category: 'asc' },
        { name: 'asc' }
      ]
    });

    res.json({ skills });
  } catch (error) {
    console.error('Get skills error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Add single skill
router.post('/', async (req, res) => {
  try {
    const userId = req.user.userId;
    const {
      name,
      category,
      subcategory,
      proficiency,
      yearsOfExp
    } = req.body;

    const skill = await prisma.skill.create({
      data: {
        userId,
        name,
        category,
        subcategory,
        proficiency,
        yearsOfExp,
        source: 'manual'
      }
    });

    res.status(201).json({
      message: 'Skill added successfully',
      skill
    });
  } catch (error) {
    if (error.code === 'P2002') {
      return res.status(400).json({ error: 'Skill already exists in this category' });
    }
    console.error('Add skill error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Add multiple skills in batch
router.post('/batch', async (req, res) => {
  try {
    const userId = req.user.userId;
    const { skills } = req.body;

    if (!Array.isArray(skills) || skills.length === 0) {
      return res.status(400).json({ error: 'Skills array is required' });
    }

    const skillsData = skills.map(skill => ({
      userId,
      name: skill.name,
      category: skill.category || 'technical',
      subcategory: skill.subcategory,
      proficiency: skill.proficiency,
      yearsOfExp: skill.yearsOfExp,
      source: skill.source || 'manual'
    }));

    const createdSkills = await prisma.skill.createMany({
      data: skillsData,
      skipDuplicates: true
    });

    res.status(201).json({
      message: `${createdSkills.count} skills added successfully`,
      count: createdSkills.count
    });
  } catch (error) {
    console.error('Add skills batch error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update skill
router.put('/:skillId', async (req, res) => {
  try {
    const userId = req.user.userId;
    const { skillId } = req.params;
    const updateData = req.body;

    // Ensure user owns the skill
    const existingSkill = await prisma.skill.findFirst({
      where: {
        id: skillId,
        userId
      }
    });

    if (!existingSkill) {
      return res.status(404).json({ error: 'Skill not found' });
    }

    const skill = await prisma.skill.update({
      where: { id: skillId },
      data: updateData
    });

    res.json({
      message: 'Skill updated successfully',
      skill
    });
  } catch (error) {
    console.error('Update skill error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete skill
router.delete('/:skillId', async (req, res) => {
  try {
    const userId = req.user.userId;
    const { skillId } = req.params;

    // Ensure user owns the skill
    const existingSkill = await prisma.skill.findFirst({
      where: {
        id: skillId,
        userId
      }
    });

    if (!existingSkill) {
      return res.status(404).json({ error: 'Skill not found' });
    }

    await prisma.skill.delete({
      where: { id: skillId }
    });

    res.json({ message: 'Skill deleted successfully' });
  } catch (error) {
    console.error('Delete skill error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;