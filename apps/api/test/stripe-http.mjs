import http from 'node:http';
import https from 'node:https';

// Exercise the real Stripe SDK against a loopback HTTP server in fixture processes.
const origin = new URL(process.env.TEST_STRIPE_ORIGIN);
if (origin.protocol !== 'http:' || origin.hostname !== '127.0.0.1') throw new Error('Stripe fixtures require loopback HTTP.');
const request = https.request;
https.request = (options, ...args) => options.host === 'api.stripe.com'
  ? http.request({ ...options, host: origin.hostname, port: origin.port, agent: undefined }, ...args)
  : request(options, ...args);
