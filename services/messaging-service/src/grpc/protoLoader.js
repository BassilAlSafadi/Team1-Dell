const path = require('path');
const protoLoader = require('@grpc/proto-loader');
const grpc = require('@grpc/grpc-js');

const REPO_ROOT_PROTO_DIR = path.resolve(__dirname, '../../../../proto');

// Loads a .proto file from the shared root /proto directory (one source of truth for all
// 5 services' contracts) and returns the corresponding gRPC package definition.
function loadProto(relPathFromProtoRoot) {
  const packageDefinition = protoLoader.loadSync(path.join(REPO_ROOT_PROTO_DIR, relPathFromProtoRoot), {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true,
    includeDirs: [REPO_ROOT_PROTO_DIR],
  });
  return grpc.loadPackageDefinition(packageDefinition);
}

module.exports = { loadProto, REPO_ROOT_PROTO_DIR };
