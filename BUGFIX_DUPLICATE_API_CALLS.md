# Fix for Duplicate API Calls on Search Page

## Problem
The search page was making **2 API calls** to each endpoint on page load:
- 2 calls to `/api/leads`
- 2 calls to `/api/leads/facets`

This was happening in both development and production environments.

## Root Cause
The issue was caused by React 18's **StrictMode** in development and state changes from the `AuthContext` in production. When the `authLoading` state changes from `true` to `false`, the `useEffect` hooks run. However, if the component re-renders or the effect runs multiple times (due to StrictMode or other state changes), duplicate API calls are made.

## Solution
Implemented **AbortController** to cancel in-flight requests when:
1. The effect re-runs (filter changes, component re-renders)
2. The component unmounts
3. A new request is initiated before the previous one completes

## Changes Made

### 1. Added AbortController Refs
**File**: `frontend/src/pages/app/DirectoryPage.jsx`

```javascript
const leadsAbortControllerRef = useRef(null);
const facetsAbortControllerRef = useRef(null);
```

### 2. Updated API Client Functions
**File**: `frontend/src/api/client.js`

Added optional `signal` parameter to:
- `rawRequest()` - passes signal to `fetch()`
- `getLeads()` - accepts and passes signal
- `getLeadFacets()` - accepts and passes signal

```javascript
export async function getLeads(params = {}, signal) {
  // ... build query params
  return request(`/api/leads?${query.toString()}`, { signal });
}

export async function getLeadFacets(params = {}, signal) {
  // ... build query params
  return request(`/api/leads/facets?${query.toString()}`, { signal });
}
```

### 3. Updated useEffect Hooks
**File**: `frontend/src/pages/app/DirectoryPage.jsx`

Both `fetchLeads` and `fetchFacets` effects now:
1. Cancel any in-flight request before starting a new one
2. Create a new AbortController for each request
3. Pass the signal to the fetch functions
4. Return a cleanup function that aborts the request

```javascript
useEffect(() => {
  if (authLoading) return;
  
  // Cancel any in-flight request
  if (leadsAbortControllerRef.current) {
    leadsAbortControllerRef.current.abort();
  }
  const controller = new AbortController();
  leadsAbortControllerRef.current = controller;
  
  setCurrentPage(1);
  fetchLeads({ page: 1 }, controller.signal);
  
  // Cleanup: abort on unmount or re-run
  return () => {
    controller.abort();
  };
}, [/* dependencies */]);
```

### 4. Added AbortError Handling
Added error handling to ignore aborted requests:

```javascript
} catch (err) {
  // Ignore aborted requests
  if (err?.name === "AbortError" || signal?.aborted) return;
  // ... rest of error handling
}
```

### 5. Updated Page Change Handler
The `handlePageChange` function also uses AbortController to cancel in-flight requests when navigating between pages.

## Benefits

1. **Eliminates Duplicate Calls**: Only one request is active at a time
2. **Prevents Race Conditions**: Sequence tracking (`requestSeq`, `facetSeq`) ensures only the latest response updates the UI
3. **Better Performance**: Reduces unnecessary network requests and server load
4. **Cleaner Logs**: No more confusing duplicate requests in the network tab
5. **Works Everywhere**: Fixes the issue in both development (StrictMode) and production

## Testing

After these changes:
- On page load: **1 call** to `/api/leads` and **1 call** to `/api/leads/facets`
- When filters change: Previous request is cancelled, new request is made
- When component unmounts: In-flight requests are cancelled
- No error messages appear for cancelled requests

## Browser Compatibility

AbortController is supported in all modern browsers:
- Chrome 66+
- Firefox 57+
- Safari 12.1+
- Edge 16+

No polyfill is needed for modern web applications.
