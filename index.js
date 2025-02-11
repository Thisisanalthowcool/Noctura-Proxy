import Fastify from 'fastify';
import { createServer } from 'http';
import { fileURLToPath } from 'url';
import { join } from 'path';
import { createBareServer } from '@tomphttp/bare-server-node';
import { uvPath } from '@titaniumnetwork-dev/ultraviolet';
import fastifyStatic from "@fastify/static";
import createRammerhead from 'rammerhead/src/server/index.js';
import { chromium } from 'playwright';
// airplane
// if anyone can figure out how to unfuck fastify not working on some things that would be great, ideally we want to use it over express whenever we can.
const bare = createBareServer("/bare/");

const rh = createRammerhead();

// used when forwarding the script
// rammerhead hell
const rammerheadScopes = [
	'/rammerhead.js',
	'/hammerhead.js',
	'/transport-worker.js',
	'/task.js',
	'/iframe-task.js',
	'/worker-hammerhead.js',
	'/messaging',
	'/sessionexists',
	'/deletesession',
	'/newsession',
	'/editsession',
	'/needpassword',
	'/syncLocalStorage',
	'/api/shuffleDict',
  '/mainport'
];

const rammerheadSession = /^\/[a-z0-9]{32}/;

function shouldRouteRh(req) {
	const url = new URL(req.url, 'http://0.0.0.0');
	return (
		rammerheadScopes.includes(url.pathname) ||
		rammerheadSession.test(url.pathname)
	);
}

function routeRhRequest(req, res) {
	rh.emit('request', req, res);
}

function routeRhUpgrade(req, socket, head) {
	rh.emit('upgrade', req, socket, head);
}

const serverFactory = (handler, opts) => {
  return createServer()
    .on("request", (req, res) => {
      if (bare.shouldRoute(req)) {
        bare.routeRequest(req, res);
      } else if (shouldRouteRh(req)) {
        routeRhRequest(req, res);
      } else {
        handler(req, res)
      }
    })
    .on("upgrade", (req, socket, head) => {
      if (bare.shouldRoute(req)) {
        bare.routeUpgrade(req, socket, head);
      } else if (shouldRouteRh(req)) {
        routeRhUpgrade(req, socket, head);
      }
    });
}

const fastify = Fastify({ logger: true, serverFactory });

fastify.register(import("@fastify/compress"));

fastify.register(fastifyStatic, {
  root: join(fileURLToPath(import.meta.url), "../dist"),
  decorateReply: false,
});

fastify.register(fastifyStatic, {
  root: uvPath,
  prefix: "/uv/",
  decorateReply: false
});

fastify.get("/search=:query", async (req, res) => {
  const { query } = req.params;

  try {
    const response = await fetch(`http://api.duckduckgo.com/ac?q=${query}&format=json`)
      .then((res) => res.json());
    res.send(response);
  } catch {
    reply.code(500).send({ error: 'Internal Server Error' });
  }
});

let promise = chromium.launch().then(browser => {
  return browser.newPage();
}).then(page => (page.setViewportSize({ width: 1440, height: 796 }), page));

fastify.get("/gen-scrot", async (req, res) => {
  const { url } = req.query;

  let page = await promise;

  try {
    await page.goto(decodeURIComponent(url));
    let buffer = await page.screenshot();

    return res.status(200).headers({ 'content-type': 'image/png' }).send(buffer);
  } catch(e) {
    console.log(e);
    res.status(500).send({ error: 'Internal Server Error' });
  }
});

fastify.listen({
  port: 8080,
});