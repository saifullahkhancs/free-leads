/**
 * Request/Response logging middleware
 * Logs total API response time and database query time for each request
 */

// Global counter to track database query time per request
global.currentRequestDbTime = 0;

function requestLogger(req, res, next) {
  const startTime = Date.now();
  const method = req.method;
  const url = req.originalUrl;
  const clientIp = req.ip || req.connection.remoteAddress;
  
  // Reset DB time for this request
  global.currentRequestDbTime = 0;

  // Store original json method to intercept response
  const originalJson = res.json;
  const originalSend = res.send;

  // Function to log the request completion
  const logRequest = () => {
    const totalTime = Date.now() - startTime;
    const timestamp = new Date().toISOString();
    
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`📡 API Request: ${timestamp}`);
    console.log(`🔗 ${method} ${url}`);
    console.log(`🌐 Client IP: ${clientIp}`);
    console.log(`⏱️  Total Response Time: ${totalTime}ms`);
    console.log(`📊 Database Time: ${global.currentRequestDbTime}ms`);
    console.log(`🚀 API Processing Time: ${totalTime - global.currentRequestDbTime}ms`);
    console.log(`📄 Status: ${res.statusCode}`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  };

  // Intercept json responses
  res.json = function(data) {
    logRequest();
    return originalJson.call(this, data);
  };

  // Intercept send responses (for non-json responses)
  res.send = function(data) {
    logRequest();
    return originalSend.call(this, data);
  };

  next();
}

module.exports = requestLogger;
