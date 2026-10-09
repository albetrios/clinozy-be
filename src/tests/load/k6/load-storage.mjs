import { createServer } from 'node:http';
import { createHash } from 'node:crypto';

/** In-memory loopback S3 transport fixture; validates object bytes/copy conditions, not AWS signatures. */
if (process.env.TEST_MODE !== 'true')
  throw new Error('Storage fixture requires explicit TEST_MODE');
const objects = new Map();
const counters = { put: 0, post: 0, head: 0, get: 0, copy: 0, delete: 0, rejected: 0 };
function saveObject({ key, bytes, contentType }) {
  const object = { bytes, contentType, etag: `"${createHash('md5').update(bytes).digest('hex')}"` };
  objects.set(key, object);
  return object;
}
async function readBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 1024 * 1024) throw new Error('Fixture payload exceeds one MiB');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
function readMultipart({ bytes, contentType }) {
  const boundary = /boundary=(?:"([^"]+)"|([^;]+))/.exec(contentType);
  if (!boundary) throw new Error('Missing multipart boundary');
  const parts = bytes.toString('latin1').split(`--${boundary[1] || boundary[2]}`);
  const fields = {};
  let file;
  for (const part of parts) {
    const separator = part.indexOf('\r\n\r\n');
    const name = /name="([^"]+)"/.exec(part.slice(0, separator));
    if (separator < 0 || !name) continue;
    const value = part.slice(separator + 4).replace(/\r\n$/, '');
    if (name[1] === 'file') file = Buffer.from(value, 'latin1');
    else fields[name[1]] = value;
  }
  if (!(fields.key && file)) throw new Error('Missing object key or file');
  return {
    key: fields.key,
    bytes: file,
    contentType: fields['Content-Type'] || 'application/octet-stream',
  };
}
function sendObject({ request, response, object }) {
  response.setHeader('Content-Type', object.contentType);
  response.setHeader('ETag', object.etag);
  response.setHeader('Content-Length', object.bytes.length);
  response.end(request.method === 'HEAD' ? undefined : object.bytes);
}
const server = createServer(async (request, response) => {
  const path = new URL(request.url, 'http://127.0.0.1').pathname;
  if (path === '/__fixture__/state') {
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify({ objects: objects.size, counters }));
    return;
  }
  const key = decodeURIComponent(path.split('/').slice(2).join('/'));
  try {
    if (request.method === 'POST') {
      counters.post++;
      const object = readMultipart({
        bytes: await readBody(request),
        contentType: request.headers['content-type'] || '',
      });
      saveObject(object);
      response.writeHead(204).end();
      return;
    }
    if (request.method === 'PUT') {
      const copySource = request.headers['x-amz-copy-source'];
      if (copySource) {
        counters.copy++;
        const source = objects.get(
          decodeURIComponent(copySource.replace(/^\//, '').split('/').slice(1).join('/')),
        );
        if (!source) {
          response.writeHead(404).end();
          return;
        }
        if (
          request.headers['x-amz-copy-source-if-match'] &&
          request.headers['x-amz-copy-source-if-match'] !== source.etag
        ) {
          counters.rejected++;
          response.writeHead(412).end();
          return;
        }
        const copied = saveObject({
          key,
          bytes: source.bytes,
          contentType: request.headers['content-type'] || source.contentType,
        });
        response.setHeader('Content-Type', 'application/xml');
        response.end(
          `<CopyObjectResult><ETag>${copied.etag.replaceAll('"', '&quot;')}</ETag><LastModified>${new Date().toISOString()}</LastModified></CopyObjectResult>`,
        );
        return;
      }
      counters.put++;
      const object = saveObject({
        key,
        bytes: await readBody(request),
        contentType: request.headers['content-type'] || 'application/octet-stream',
      });
      response.setHeader('ETag', object.etag);
      response.end();
      return;
    }
    if (request.method === 'DELETE') {
      counters.delete++;
      objects.delete(key);
      response.writeHead(204).end();
      return;
    }
    if (request.method === 'GET' || request.method === 'HEAD') {
      counters[request.method === 'GET' ? 'get' : 'head']++;
      const object = objects.get(key);
      if (!object) {
        response.writeHead(404).end();
        return;
      }
      sendObject({ request, response, object });
      return;
    }
    response.writeHead(405).end();
  } catch {
    response.writeHead(400).end();
  }
});
server.listen(Number(process.env.LOAD_STORAGE_PORT || '3004'), '127.0.0.1');
process.once('SIGTERM', () => server.close());
process.once('SIGINT', () => server.close());
