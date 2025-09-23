const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

class SoftwareController {
  // Add software via autocomplete
  async addSoftware(req, res) {
    try {
      const userId = req.user?.userId || `user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const { name, category, subcategory, version, proficiency, yearsOfExp, experienceId } = req.body;

      if (!name || !category) {
        return res.status(400).json({
          error: 'Name and category are required'
        });
      }

      const software = await prisma.software.create({
        data: {
          userId,
          name,
          category,
          subcategory: subcategory || null,
          version: version || null,
          proficiency: proficiency || null,
          yearsOfExp: yearsOfExp || null,
          experienceId: experienceId || null,
          source: 'autocomplete'
        }
      });

      res.status(201).json({
        message: 'Software added successfully',
        software
      });
    } catch (error) {
      // Handle unique constraint violation
      if (error.code === 'P2002') {
        return res.status(409).json({
          error: 'This software already exists for this user'
        });
      }

      console.error('Add software error:', error);
      res.status(500).json({
        error: 'Internal server error while adding software'
      });
    }
  }

  // Get user's software
  async getUserSoftware(req, res) {
    try {
      const userId = req.user?.userId || req.query.userId;

      if (!userId) {
        return res.status(400).json({
          error: 'User ID is required'
        });
      }

      const software = await prisma.software.findMany({
        where: { userId },
        orderBy: [
          { category: 'asc' },
          { name: 'asc' }
        ]
      });

      res.json({ software });
    } catch (error) {
      console.error('Get software error:', error);
      res.status(500).json({
        error: 'Internal server error while fetching software'
      });
    }
  }

  // Delete software
  async deleteSoftware(req, res) {
    try {
      const userId = req.user?.userId || req.query.userId;
      const { softwareId } = req.params;

      const software = await prisma.software.findFirst({
        where: {
          id: softwareId,
          userId
        }
      });

      if (!software) {
        return res.status(404).json({
          error: 'Software not found'
        });
      }

      await prisma.software.delete({
        where: { id: softwareId }
      });

      res.json({
        message: 'Software deleted successfully'
      });
    } catch (error) {
      console.error('Delete software error:', error);
      res.status(500).json({
        error: 'Internal server error while deleting software'
      });
    }
  }
}

module.exports = new SoftwareController();