const crypto = require("crypto");
const { redisCache } = require("../config/redis");

// TTL constants (in seconds)
const DEFAULT_LEADS_TTL = 24 * 60 * 60; // 24 hours
const PAGINATED_LEADS_TTL = 10 * 60; // 10 minutes
const SESSION_TTL = 24 * 60 * 60; // 24 hours

// Key patterns
const KEYS = {
  DEFAULT_LEADS: (userId) => `leads:default:${userId}`,
  PAGINATED_LEADS: (userId, page, filtersHash) => `leads:page:${userId}:${page}:${filtersHash}`,
  USER_SESSION: (userId) => `leads:session:${userId}`,
};

/**
 * Generate a hash of the filters object for cache key differentiation
 */
function generateFiltersHash(filters) {
  if (!filters) return "none";
  
  // Sort keys to ensure consistent hashing
  const sortedFilters = {};
  Object.keys(filters)
    .sort()
    .forEach((key) => {
      sortedFilters[key] = filters[key];
    });
  
  const filterString = JSON.stringify(sortedFilters);
  return crypto.createHash("md5").update(filterString).digest("hex").substring(0, 8);
}

/**
 * Cache the default first 20 leads for a user (24h TTL)
 */
async function cacheDefaultLeads(userId, leadsData) {
  try {
    const key = KEYS.DEFAULT_LEADS(userId);
    const value = JSON.stringify({
      ...leadsData,
      cached_at: new Date().toISOString(),
    });
    
    await redisCache.setex(key, DEFAULT_LEADS_TTL, value);
    
    // Track this key in the user's session
    await addToUserSession(userId, key);
    
    return true;
  } catch (error) {
    console.error("Error caching default leads:", error);
    return false;
  }
}

/**
 * Get cached default leads for a user
 */
async function getCachedDefaultLeads(userId) {
  try {
    const key = KEYS.DEFAULT_LEADS(userId);
    const startTime = Date.now();
    const cached = await redisCache.get(key);
    const cacheTime = Date.now() - startTime;
    
    if (cached) {
      console.log(`[CACHE HIT] Default leads for user ${userId} - Redis time: ${cacheTime}ms`);
      return JSON.parse(cached);
    }
    
    console.log(`[CACHE MISS] Default leads for user ${userId} - Redis time: ${cacheTime}ms`);
    return null;
  } catch (error) {
    console.error("Error getting cached default leads:", error);
    return null;
  }
}

/**
 * Cache paginated leads with pre-fetch logic (10min TTL)
 * Pre-fetches: current page, next 2 pages (page 1), or previous 1 + next 2 (page > 1)
 * NOTE: Pre-fetch is asynchronous (fire-and-forget) to avoid blocking the response
 */
async function cachePaginatedLeads(userId, currentPage, leadsData, filters, fetchLeadsFn) {
  try {
    const filtersHash = generateFiltersHash(filters);
    
    // Cache the current page immediately (synchronously)
    const currentKey = KEYS.PAGINATED_LEADS(userId, currentPage, filtersHash);
    const currentValue = JSON.stringify({
      ...leadsData,
      cached_at: new Date().toISOString(),
      page: currentPage,
      filters,
    });
    
    await redisCache.setex(currentKey, PAGINATED_LEADS_TTL, currentValue);
    await addToUserSession(userId, currentKey);
    
    // Pre-fetch additional pages asynchronously (fire-and-forget)
    if (fetchLeadsFn) {
      const pagesToPrefetch = [];
      
      if (currentPage === 1) {
        // Page 1: pre-fetch pages 2, 3
        pagesToPrefetch.push(2, 3);
      } else {
        // Page N (N > 1): pre-fetch pages N-1, N+1, N+2
        pagesToPrefetch.push(currentPage - 1, currentPage + 1, currentPage + 2);
      }
      
      // Filter out invalid pages
      const validPages = pagesToPrefetch.filter(page => page >= 1);
      
      // Fire and forget - don't await
      (async () => {
        for (const page of validPages) {
          try {
            const pageData = await fetchLeadsFn(page, filters);
            if (pageData) {
              const key = KEYS.PAGINATED_LEADS(userId, page, filtersHash);
              const value = JSON.stringify({
                ...pageData,
                cached_at: new Date().toISOString(),
                page,
                filters,
              });
              
              await redisCache.setex(key, PAGINATED_LEADS_TTL, value);
              await addToUserSession(userId, key);
            }
          } catch (fetchError) {
            console.error(`Error pre-fetching page ${page}:`, fetchError);
          }
        }
      })();
    }
    
    return true;
  } catch (error) {
    console.error("Error caching paginated leads:", error);
    return false;
  }
}

/**
 * Get cached paginated leads for a specific page and filters
 */
async function getCachedPaginatedLeads(userId, page, filters) {
  try {
    const filtersHash = generateFiltersHash(filters);
    const key = KEYS.PAGINATED_LEADS(userId, page, filtersHash);
    const startTime = Date.now();
    const cached = await redisCache.get(key);
    const cacheTime = Date.now() - startTime;
    
    if (cached) {
      console.log(`[CACHE HIT] Paginated leads for user ${userId}, page ${page} - Redis time: ${cacheTime}ms`);
      return JSON.parse(cached);
    }
    
    console.log(`[CACHE MISS] Paginated leads for user ${userId}, page ${page} - Redis time: ${cacheTime}ms`);
    return null;
  } catch (error) {
    console.error("Error getting cached paginated leads:", error);
    return null;
  }
}

/**
 * Add a cache key to the user's session tracker
 */
async function addToUserSession(userId, cacheKey) {
  try {
    const sessionKey = KEYS.USER_SESSION(userId);
    await redisCache.sadd(sessionKey, cacheKey);
    await redisCache.expire(sessionKey, SESSION_TTL);
  } catch (error) {
    console.error("Error adding to user session:", error);
  }
}

/**
 * Clear all cached data for a user (called on sign out)
 */
async function clearUserCache(userId) {
  try {
    const sessionKey = KEYS.USER_SESSION(userId);
    const cachedKeys = await redisCache.smembers(sessionKey);
    
    if (cachedKeys.length > 0) {
      // Delete all cached keys
      await redisCache.del(...cachedKeys);
    }
    
    // Remove the session tracker
    await redisCache.del(sessionKey);
    
    return true;
  } catch (error) {
    console.error("Error clearing user cache:", error);
    return false;
  }
}

/**
 * Invalidate specific cached pages for a user (e.g., after data update)
 */
async function invalidateUserPageCache(userId, page, filters) {
  try {
    const filtersHash = generateFiltersHash(filters);
    const key = KEYS.PAGINATED_LEADS(userId, page, filtersHash);
    await redisCache.del(key);
    
    // Also remove from session tracker
    const sessionKey = KEYS.USER_SESSION(userId);
    await redisCache.srem(sessionKey, key);
    
    return true;
  } catch (error) {
    console.error("Error invalidating page cache:", error);
    return false;
  }
}

module.exports = {
  cacheDefaultLeads,
  getCachedDefaultLeads,
  cachePaginatedLeads,
  getCachedPaginatedLeads,
  clearUserCache,
  invalidateUserPageCache,
  generateFiltersHash,
  KEYS,
};
