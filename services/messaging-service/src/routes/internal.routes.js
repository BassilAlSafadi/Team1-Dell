const { Router } = require('express');
const { healthClientFor } = require('../grpc/clients');

const router = Router();

const PEER_NAMES = ['auth', 'transaction', 'notification', 'ai'];
const CHECK_TIMEOUT_MS = 2000;

function checkPeer(peerName) {
  const start = Date.now();
  const client = healthClientFor(peerName);

  if (!client) {
    return Promise.resolve({ peer: peerName, status: 'UNCONFIGURED', latencyMs: 0 });
  }

  return new Promise((resolve) => {
    const deadline = new Date(Date.now() + CHECK_TIMEOUT_MS);
    client.Check({ service: '' }, { deadline }, (err, response) => {
      const latencyMs = Date.now() - start;
      if (err) {
        return resolve({ peer: peerName, status: 'UNREACHABLE', latencyMs, error: err.details || err.message });
      }
      resolve({ peer: peerName, status: response.status, latencyMs });
    });
  });
}

// GET /internal/mesh/status — fans out a real grpc.health.v1.Health/Check to every other
// peer this service can reach. Unauthenticated, matching the "no service-to-service auth
// yet" limitation this codebase already has on REST.
router.get('/mesh/status', async (req, res) => {
  const results = await Promise.allSettled(PEER_NAMES.map(checkPeer));
  const peers = results.map((r) => (r.status === 'fulfilled' ? r.value : { status: 'ERROR', error: String(r.reason) }));
  res.json({ service: 'messaging-service', peers });
});

module.exports = router;
