const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

class SkillsetController {
  // Add skillset via autocomplete
  async addSkillset(req, res) {
    try {
      const userId = req.user?.userId || `user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const { name, category, subcategory, proficiency, yearsOfExp, experienceId } = req.body;

      if (!name || !category) {
        return res.status(400).json({
          error: 'Name and category are required'
        });
      }

      const skillset = await prisma.skillset.create({
        data: {
          userId,
          name,
          category,
          subcategory: subcategory || null,
          proficiency: proficiency || null,
          yearsOfExp: yearsOfExp || null,
          experienceId: experienceId || null,
          source: 'autocomplete'
        }
      });

      res.status(201).json({
        message: 'Skillset added successfully',
        skillset
      });
    } catch (error) {
      // Handle unique constraint violation
      if (error.code === 'P2002') {
        return res.status(409).json({
          error: 'This skillset already exists for this user'
        });
      }

      console.error('Add skillset error:', error);
      res.status(500).json({
        error: 'Internal server error while adding skillset'
      });
    }
  }

  // Get user's skillsets
  async getUserSkillsets(req, res) {
    try {
      const userId = req.user?.userId || req.query.userId;

      if (!userId) {
        return res.status(400).json({
          error: 'User ID is required'
        });
      }

      const skillsets = await prisma.skillset.findMany({
        where: { userId },
        orderBy: [
          { category: 'asc' },
          { name: 'asc' }
        ]
      });

      res.json({ skillsets });
    } catch (error) {
      console.error('Get skillsets error:', error);
      res.status(500).json({
        error: 'Internal server error while fetching skillsets'
      });
    }
  }

  // Delete skillset
  async deleteSkillset(req, res) {
    try {
      const userId = req.user?.userId || req.query.userId;
      const { skillsetId } = req.params;

      const skillset = await prisma.skillset.findFirst({
        where: {
          id: skillsetId,
          userId
        }
      });

      if (!skillset) {
        return res.status(404).json({
          error: 'Skillset not found'
        });
      }

      await prisma.skillset.delete({
        where: { id: skillsetId }
      });

      res.json({
        message: 'Skillset deleted successfully'
      });
    } catch (error) {
      console.error('Delete skillset error:', error);
      res.status(500).json({
        error: 'Internal server error while deleting skillset'
      });
    }
  }
}

module.exports = new SkillsetController();