const textKernelService = require('../services/textKernelService');

class AutocompleteController {
  async searchSkills(req, res) {
    try {
      const { query, type = 'skills' } = req.query;
      
      if (!query || query.length < 2) {
        return res.json({ suggestions: [] });
      }

      const suggestions = await textKernelService.autocomplete(query, type);
      
      res.json({ 
        suggestions,
        query,
        type 
      });

    } catch (error) {
      console.error('Autocomplete search error:', error);
      res.status(500).json({
        error: 'Failed to fetch skill suggestions',
        message: error.message
      });
    }
  }
}

module.exports = new AutocompleteController();