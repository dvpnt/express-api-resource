const _ = require('underscore');
const t = require('tap');
const express = require('express');
const request = require('supertest');
const pMap = require('p-map');
const ApiResource = require('./');

t.test('ApiResource', async (t) => {
	await t.test('constructor', async (t) => {
		await t.test('without root', (t) => {
			t.throws(() => new ApiResource(), {message: 'root is required'});
			t.end();
		});

		await t.test('success', (t) => {
			const resource = new ApiResource({
				root: '/entities',
				versions: ['1.0', '1.1']
			});

			t.is(resource.root, '/entities');
			t.strictSame(resource.versions, ['1.1', '1.0']);
			t.ok(resource.routers['1.0']);
			t.ok(resource.routers['1.1']);
			t.strictSame(resource.validateRules, {});
			t.is(resource.idAttributeName, '_id');
			t.strictSame(resource.idAttributeSchema, {type: 'integer'});

			t.end();
		});

		await t.test('success root without slash', (t) => {
			const resource = new ApiResource({
				root: 'entities',
				versions: ['1.0', '1.1']
			});

			t.is(resource.root, '/entities');

			t.end();
		});

		await t.test('success without versions', (t) => {
			const resource = new ApiResource({
				root: '/entities'
			});

			t.strictSame(resource.versions, ['1.0']);

			t.end();
		});
	});

	await t.test('makeValidateRules', (t) => {
		const resource = new ApiResource({
			root: 'entities',
			versions: ['1.0'],
			validateRules: {
				name: {type: 'string', required: true},
				count: {type: 'integer'}
			}
		});

		_({
			create: {
				name: {type: 'string', required: true},
				count: {type: 'integer'}
			},
			patch: {
				_id: {type: 'integer', required: true},
				name: {type: 'string'},
				count: {type: 'integer'}
			},
			remove: {
				_id: {type: 'integer', required: true}
			},
			getOne: {
				_id: {type: 'integer', required: true}
			},
			get: {}
		}).each((expectedRules, name) => {
			t.strictSame(resource.makeValidateRules(name), expectedRules);
		});

		t.end();
	});

	await t.test('unknown version', (t) => {
		const resource = new ApiResource({
			root: 'entities',
			versions: ['1.0', '2.0']
		});

		_(['create', 'patch', 'remove', 'getOne', 'get']).each((name) => {
			t.throws(
				() => resource[name]('1.1', _.noop),
				{message: 'unknown version 1.1, expected one of 2.0, 1.0'}
			);
		});

		t.throws(
			() => resource.method('foo', '1.1', _.noop),
			{message: 'unknown version 1.1, expected one of 2.0, 1.0'}
		);

		t.end();
	});

	await t.test('all routes in one version', async (t) => {
		const app = express();
		const resource = new ApiResource({
			root: 'entities',
			versions: ['1.0']
		});

		function middleware(req, res, next) {
			res.set('x-foo', 'bar');
			next();
		}

		resource.create('1.0', middleware, createHandler('create'));
		resource.patch('1.0', middleware, createHandler('patch'));
		resource.remove('1.0', middleware, createHandler('remove'));
		resource.getOne('1.0', middleware, createHandler('getOne'));
		resource.get('1.0', middleware, createHandler('get'));
		resource.method('foo', '1.0', middleware, createHandler('foo'));

		app.use('/api', resource);

		await pMap([
			{name: 'create', method: 'post', path: '/api/1.0/entities'},
			{name: 'patch', method: 'patch', path: '/api/1.0/entities/1'},
			{name: 'remove', method: 'delete', path: '/api/1.0/entities/1'},
			{name: 'getOne', method: 'get', path: '/api/1.0/entities/1'},
			{name: 'get', method: 'get', path: '/api/1.0/entities'},
			{name: 'foo', method: 'put', path: '/api/1.0/entities/foo'}
		], ({method, path, name}) => t.test(name, async (t) => {
			const {statusCode, body, headers} = await request(app)[method](path);

			t.is(statusCode, 200);
			t.strictSame(body, {result: name});
			t.is(headers['x-foo'], 'bar');
		}), {concurrency: 1});
	});

	await t.test('fallbacks', async (t) => {
		const root = 'entities';
		const versions = ['1.0', '1.1', '2.0'];

		async function requestVersion(app, version) {
			const {body} = await request(app).get(`/api/${version}/${root}`);

			return body.result;
		}

		await t.test('method doesn\'t changed in next versions', async (t) => {
			const app = express();
			const resource = new ApiResource({root, versions});

			resource.get('1.0', createHandler('1.0'));

			app.use('/api', resource);

			t.is(await requestVersion(app, '1.0'), '1.0');
			t.is(await requestVersion(app, '1.1'), '1.0');
			t.is(await requestVersion(app, '2.0'), '1.0');
		});

		await t.test('method changed in all versions', async (t) => {
			const app = express();
			const resource = new ApiResource({root, versions});

			resource.get('1.0', createHandler('1.0'));
			resource.get('1.1', createHandler('1.1'));
			resource.get('2.0', createHandler('2.0'));

			app.use('/api', resource);

			t.is(await requestVersion(app, '1.0'), '1.0');
			t.is(await requestVersion(app, '1.1'), '1.1');
			t.is(await requestVersion(app, '2.0'), '2.0');
		});

		await t.test('method changed in all versions except last', async (t) => {
			const app = express();
			const resource = new ApiResource({root, versions});

			resource.get('1.0', createHandler('1.0'));
			resource.get('1.1', createHandler('1.1'));

			app.use('/api', resource);

			t.is(await requestVersion(app, '1.0'), '1.0');
			t.is(await requestVersion(app, '1.1'), '1.1');
			t.is(await requestVersion(app, '2.0'), '1.1');
		});

		await t.test('method changed in all versions except middle', async (t) => {
			const app = express();
			const resource = new ApiResource({root, versions});

			resource.get('1.0', createHandler('1.0'));
			resource.get('2.0', createHandler('2.0'));

			app.use('/api', resource);

			t.is(await requestVersion(app, '1.0'), '1.0');
			t.is(await requestVersion(app, '1.1'), '1.0');
			t.is(await requestVersion(app, '2.0'), '2.0');
		});
	});
});

function createHandler(result) {
	return (req, res) => {
		res.json({result});
	};
}
