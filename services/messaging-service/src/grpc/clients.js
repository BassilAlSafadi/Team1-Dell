const grpc = require('@grpc/grpc-js');
const env = require('../config/env');
const { loadProto } = require('./protoLoader');

const notificationProto = loadProto('notification/v1/notification.proto').notification.v1;
const healthProto = loadProto('health/v1/health.proto').grpc.health.v1;

const credentials = grpc.credentials.createInsecure();

// Lazily built — a peer being unconfigured/down must never crash this process at require time.
function buildClient(ServiceClient, address) {
  if (!address) return null;
  return new ServiceClient(address, credentials);
}

const notificationClient = buildClient(notificationProto.NotificationService, env.grpcPeers.notification);

// One health client per configured peer, keyed the same way as env.grpcPeers, used by the
// /internal/mesh/status fan-out.
const healthClients = {
  auth: buildClient(healthProto.Health, env.grpcPeers.auth),
  transaction: buildClient(healthProto.Health, env.grpcPeers.transaction),
  notification: buildClient(healthProto.Health, env.grpcPeers.notification),
  ai: buildClient(healthProto.Health, env.grpcPeers.ai),
};

function healthClientFor(peerName) {
  return healthClients[peerName] || null;
}

module.exports = { notificationClient, healthClientFor };
