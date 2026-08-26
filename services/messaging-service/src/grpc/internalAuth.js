const crypto = require('crypto');
const grpc = require('@grpc/grpc-js');
const env = require('../config/env');

// Requires the mesh's shared internal token on an inbound gRPC call, and returns the end user
// the internal caller (the gateway) is acting for.
//
// This port previously accepted calls from anyone who could reach it, with no authentication of
// any kind, while all end-user authentication lived in the gateway. Trusting x-user-id is only
// sound *after* the token check has established that the caller is the gateway, which validated
// the user's JWT itself.
function requireInternalCaller(call) {
  if (!env.internalServiceToken) {
    throw { code: grpc.status.FAILED_PRECONDITION, details: 'Internal service token is not configured.' };
  }

  const presented = String(call.metadata.get('x-internal-token')[0] || '');
  if (!fixedTimeEquals(presented, env.internalServiceToken)) {
    throw { code: grpc.status.UNAUTHENTICATED, details: 'This endpoint is restricted to internal mesh callers.' };
  }

  const userId = String(call.metadata.get('x-user-id')[0] || '');
  if (!userId) {
    throw {
      code: grpc.status.UNAUTHENTICATED,
      details: "Calls must carry the acting user's id in x-user-id metadata.",
    };
  }

  return userId;
}

function fixedTimeEquals(a, b) {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

module.exports = { requireInternalCaller };
