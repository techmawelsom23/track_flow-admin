// Express 4 does not catch rejected promises thrown inside async route
// handlers — without this wrapper, a thrown error (bad input causing a
// Postgres type error, a network blip, etc.) leaves the request hanging
// with no response at all instead of returning a clean error. Wrapping
// every handler in this ensures every failure always reaches the error
// middleware and the client always gets a response.
export function ah(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}
