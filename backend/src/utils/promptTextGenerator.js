/**
 * Utility functions for generating and sanitizing prompt text for experiences
 */

/**
 * Sanitizes text for use in AI prompts
 * @param {string} text - Text to sanitize
 * @returns {string} Sanitized text
 */
function sanitizePromptText(text) {
  if (!text) return '';

  return text
    // Replace double quotes with escaped quotes
    .replace(/"/g, '\\"')
    // Replace single quotes with escaped quotes
    .replace(/'/g, "\\'")
    // Replace backslashes
    .replace(/\\/g, '\\\\')
    // Remove HTML tags
    .replace(/<[^>]*>/g, '')
    // Replace multiple spaces with single space
    .replace(/\s+/g, ' ')
    // Replace newlines with proper escape
    .replace(/\n/g, '\\n')
    // Trim whitespace
    .trim();
}

/**
 * Formats a date range for display
 * @param {Date|string} startDate - Start date
 * @param {Date|string|null} endDate - End date (null for current role)
 * @returns {string} Formatted date range
 */
function formatDateRange(startDate, endDate) {
  if (!startDate) return '';

  const start = new Date(startDate);
  const startYear = start.getFullYear();
  const startMonth = start.toLocaleString('en-US', { month: 'short' });

  if (!endDate) {
    return `${startMonth} ${startYear} - Present`;
  }

  const end = new Date(endDate);
  const endYear = end.getFullYear();
  const endMonth = end.toLocaleString('en-US', { month: 'short' });

  return `${startMonth} ${startYear} - ${endMonth} ${endYear}`;
}

/**
 * Generates formatted prompt text from an experience object
 * @param {Object} experience - Experience object with job details
 * @returns {string} Formatted prompt text ready for AI consumption
 */
function generatePromptText(experience) {
  if (!experience) return '';

  const parts = [];

  // Build the main title line
  const titleParts = [];
  if (experience.jobTitle) {
    titleParts.push(sanitizePromptText(experience.jobTitle));
  }
  if (experience.company) {
    titleParts.push(`at ${sanitizePromptText(experience.company)}`);
  }
  if (experience.employmentType) {
    titleParts.push(`(${sanitizePromptText(experience.employmentType)})`);
  }

  // Add date range if available
  const dateRange = formatDateRange(experience.startDate, experience.endDate || experience.isCurrentRole ? null : experience.endDate);
  if (dateRange) {
    titleParts.push(`- ${dateRange}`);
  }

  if (titleParts.length > 0) {
    parts.push(titleParts.join(' '));
  }

  // Add location if available
  if (experience.location) {
    parts.push(`Location: ${sanitizePromptText(experience.location)}`);
  }

  // Add description
  if (experience.description) {
    parts.push(`Responsibilities: ${sanitizePromptText(experience.description)}`);
  }

  // Add achievements if any
  if (experience.achievements && experience.achievements.length > 0) {
    const achievementsList = experience.achievements
      .filter(a => a && a.trim())
      .map(a => sanitizePromptText(a))
      .join('; ');
    if (achievementsList) {
      parts.push(`Key Achievements: ${achievementsList}`);
    }
  }

  // Add skills if any
  if (experience.keySkills && experience.keySkills.length > 0) {
    const skillsList = experience.keySkills
      .filter(s => s && s.trim())
      .map(s => sanitizePromptText(s))
      .join(', ');
    if (skillsList) {
      parts.push(`Skills Used: ${skillsList}`);
    }
  }

  // Join all parts with proper spacing
  return parts.join('. ');
}

/**
 * Generates prompt text for multiple experiences (for all experiences interview)
 * @param {Array} experiences - Array of experience objects
 * @param {string} candidateName - Name of the candidate
 * @returns {string} Combined prompt text for all experiences
 */
function generateCombinedPromptText(experiences, candidateName = 'the candidate') {
  if (!experiences || experiences.length === 0) {
    return `${candidateName} has no professional experiences listed.`;
  }

  const header = `${candidateName} has ${experiences.length} professional experience${experiences.length === 1 ? '' : 's'}:\n\n`;

  const experiencesList = experiences
    .sort((a, b) => {
      // Sort by start date, most recent first
      const dateA = new Date(a.startDate);
      const dateB = new Date(b.startDate);
      return dateB - dateA;
    })
    .map((exp, index) => {
      const promptText = exp.promptText || generatePromptText(exp);
      return `Experience ${index + 1}: ${promptText}`;
    })
    .join('\n\n');

  return header + experiencesList;
}

module.exports = {
  sanitizePromptText,
  formatDateRange,
  generatePromptText,
  generateCombinedPromptText
};