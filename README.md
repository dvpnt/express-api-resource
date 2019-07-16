# express-api-resource
[![Build Status](https://travis-ci.org/dvpnt/express-api-resource.svg?branch=master)](https://travis-ci.org/dvpnt/express-api-resource)
[![Coverage Status](https://coveralls.io/repos/github/dvpnt/express-api-resource/badge.svg?branch=master)](https://coveralls.io/github/dvpnt/express-api-resource?branch=master)
[![NPM Version](https://img.shields.io/npm/v/@dvpnt/express-api-resource.svg)](https://www.npmjs.com/package/@dvpnt/express-api-resource)

Convenient wrapper for express router for easy REST API building and composing.

## Installation

    $ npm install @dvpnt/express-api-resource


## Usage
```js
const express = require('express');
const ApiResource = require('@dvpnt/express-api-resource');

const resource = new ApiResource({
	root: 'entities',
	versions: ['1.0'],
	idAttributeName: id
});

resource.getOne('1.0', (req, res) => {
	res.json({id: 1, name: 'foo'});
});

resource.get('1.0', (req, res) => {
	res.json([
		{id: 1, name: 'foo'},
		{id: 2, name: 'foo'}
	]);
});

const app = express();

app.use('/api', resource);

```

## License

[The MIT License (MIT)](/LICENSE)