/**
 * Sanitize error details to ensure JSON serializability
 */
function sanitizeErrorDetails(details) {
  if (!details) return null;
  
  try {
    if (typeof details === 'string') {
      return details;
    } else if (Array.isArray(details)) {
      return details.map(item => {
        if (typeof item === 'object' && item !== null) {
          return {
            field: item.path || item.param || 'unknown',
            message: item.msg || item.message || String(item)
          };
        }
        return String(item);
      });
    } else if (typeof details === 'object' && details !== null) {
      // Extract safe properties from error objects
      const safeDetails = {};
      const safeProps = ['message', 'code', 'type', 'field', 'value', 'statusCode', 'name'];
      
      safeProps.forEach(prop => {
        if (details[prop] !== undefined && details[prop] !== null) {
          safeDetails[prop] = String(details[prop]);
        }
      });

      return Object.keys(safeDetails).length > 0 ? safeDetails : String(details);
    }
    return String(details);
  } catch (serializationError) {
    console.error('Error serializing error details:', serializationError);
    return 'Error details could not be serialized';
  }
}

const errorHandler = (err, req, res, next) => {
  console.error('Error caught by middleware:', err);

  // Default error
  let statusCode = 500;
  let message = 'Internal server error';
  let details = null;

  // Handle specific error types
  if (err.name === 'ValidationError') {
    statusCode = 400;
    message = 'Validation error';
    details = err.errors || err.message;
  } else if (err.name === 'CastError') {
    statusCode = 400;
    message = 'Invalid ID format';
  } else if (err.code === 11000) {
    statusCode = 409;
    message = 'Duplicate field value';
  } else if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = 'Invalid token';
  } else if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'Token expired';
  } else if (err.statusCode) {
    statusCode = err.statusCode;
    message = err.message;
  }

  // Handle Prisma errors
  if (err.code === 'P2002') {
    statusCode = 409;
    message = 'Unique constraint violation';
    details = 'A record with these values already exists';
  } else if (err.code === 'P2025') {
    statusCode = 404;
    message = 'Record not found';
  } else if (err.code === 'P2003') {
    statusCode = 400;
    message = 'Foreign key constraint violation';
  }

  // Create standardized error response
  const errorResponse = {
    success: false,
    error: message
  };

  // Add sanitized details
  const sanitizedDetails = sanitizeErrorDetails(details);
  if (sanitizedDetails) {
    errorResponse.details = sanitizedDetails;
  }

  // Add development info
  if (process.env.NODE_ENV === 'development') {
    errorResponse.debug = {
      name: err.name,
      code: err.code,
      originalMessage: err.message
    };
    
    // Only include stack trace if it's safe to serialize
    if (err.stack && typeof err.stack === 'string') {
      errorResponse.debug.stack = err.stack;
    }
  }

  // Ensure response hasn't been sent already
  if (!res.headersSent) {
    res.status(statusCode).json(errorResponse);
  }
};

module.exports = errorHandler; 