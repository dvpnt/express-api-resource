const _ = require('underscore');
const {Router} = require('express');
const semver = require('semver');

const proto = {};
const methods = {
	create: {method: 'post', withId: false, withData: true},
	patch: {method: 'patch', withId: true, withData: true},
	remove: {method: 'delete', withId: true, withData: false},
	getOne: {method: 'get', withId: true, withData: false},
	get: {method: 'get', withId: false, withData: false}
};

function ApiResource({
	caseSensitive, strict, root,
	versions = ['1.0'],
	validateRules = {},
	idAttributeName = '_id',
	idAttributeSchema = {type: 'integer'}
} = {}) {
	if (!root) {
		throw new Error('root is required');
	}

	// index router
	const router = Router({
		caseSensitive,
		strict,
		mergeParams: true
	});

	// just look into express sources
	// https://github.com/expressjs/express/blob/451ee5d9/lib/router/index.js#L46
	function resource(req, res, next) {
		router.handle(req, res, next);
	}

	root = root.startsWith('/') ? root : `/${root}`;
	versions = versions.sort((v1, v2) =>
		semver.rcompare(semver.coerce(v1), semver.coerce(v2)));

	const routers = {};

	// versioned routers
	_(versions).each((version) => {
		routers[version] = Router({
			caseSensitive,
			strict,
			mergeParams: true
		});
	});

	// for each version use all routers
	// that are lower or equal in descending order
	// example for 1.0, 1.1, 2.0 versions (route - used routers):
	// /1.0 - 1.0
	// /1.1 - 1.1, 1.0
	// /2.0 - 2.0, 1.1, 1.0
	_(versions).each((version) => {
		router.use(
			`/${version}${root}`,
			_(versions)
				.chain()
				.filter((routerVersion) =>
					semver.lte(semver.coerce(routerVersion), semver.coerce(version)))
				.map((version) => routers[version])
				.value()
		);
	});

	resource.root = root;
	resource.versions = versions;
	resource.router = router;
	resource.routers = routers;
	resource.validateRules = validateRules;
	resource.idAttributeName = idAttributeName;
	resource.idAttributeSchema = idAttributeSchema;

	// dirty hack for express-list-endpoints
	// to force resource looks like router
	Object.defineProperty(resource, 'name', {value: 'router'});
	// expose stack of index router
	// so express-list-endpoints can iterate over it
	resource.stack = router.stack;

	Object.setPrototypeOf(resource, proto);

	return resource;
}

proto.checkVersion = function(version) {
	if (!this.routers[version]) {
		throw new Error(
			`unknown version ${version}, ` +
			`expected one of ${this.versions.join(', ')}`
		);
	}
};

_(methods).each(({method, withId}, name) => {
	proto[name] = function(version, ...handlers) {
		this.checkVersion(version);
		this.routers[version][method](
			'/' + (withId ? `:${this.idAttributeName}` : ''),
			...handlers
		);
	};
});

proto.method = function(name, version, ...handlers) {
	this.checkVersion(version);
	this.routers[version].put(`/${name}`, ...handlers);
};

proto.makeValidateRules = function(method) {
	const {withId, withData} = methods[method];
	const rules = {};

	if (withData) {
		_(this.validateRules).each((rule, name) => {
			rules[name] = {
				..._(rule).omit('required'),
				...method !== 'patch' && rule.required && _(rule).pick('required')
			};
		});
	}

	if (withId) {
		rules[this.idAttributeName] = {
			...this.idAttributeSchema,
			required: true
		};
	}

	return rules;
};

module.exports = ApiResource;
