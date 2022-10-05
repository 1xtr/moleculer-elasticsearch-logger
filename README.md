![Moleculer logo](http://moleculer.services/images/banner.png)

[![NPM version](https://img.shields.io/npm/v/@1xtr/moleculer-elasticsearch-logger.svg)](https://www.npmjs.com/package/@1xtr/moleculer-elasticsearch-logger) ![NPM Downloads](https://img.shields.io/npm/dw/@1xtr/moleculer-elasticsearch-logger)

## Send logs to Elasticsearch directly

This is a fork
from [native Datadog logger](https://github.com/moleculerjs/moleculer/blob/e62016ea16c5c4e303738a66e3a7429237ea9042/src/loggers/datadog.js)

### Description

Easy to send logs directly to elasticsearch

Used client `"@elastic/elasticsearch": "^8.4.0"`

### Install

```bash
$ npm install @1xtr/moleculer-elasticsearch-logger --save
```

### Usage

```js
const ElasticLogger = require('@1xtr/moleculer-elasticsearch-logger')

module.exports = {
  logger: new ElasticLogger({
    // put here your options
  })
}
```

### Default options

> Note: field timestamp contain UNIX timestamp in milliseconds, but for create _Data Views_ in Kibana
> need to transform it to **Date** type `yyyy-MM-dd'T'HH:mm:ss.SSSXXX` in pipeline.

If `index` field not set, all logs send to `moleculer-${row.ts.yyyymmdd()}` indexes.
For example, `moleculer-20220929`

If you need to use _Ingest Pipelines_ you can set `pipeline` options. [Ingest pipeline example](#ingest-pipeline-example)


```js
const defaultOptions = {
  clientOptions: {
    node: 'http://localhost:9200',
    tls: {
      // ca: readFileSync('/ca.crt'),
      rejectUnauthorized: false,
    },
  },
  index: null,
  pipeline: null,
  source: process.env.MOL_NODE_NAME || 'moleculer',
  hostname: hostname(),
  objectPrinter: null,
  interval: 5 * 1000,
  excludeModules: []
}
```

### Options example

```json
{
  "clientOptions": {
    "node": "http://es01:9200",
    "auth": {
      "username": "log-user",
      "password": "very-StRoNg-password"
    },
    "tls": {
      "rejectUnauthorized": false
    }
  },
  "pipeline": "moleculer",
  "excludeModules": [
    "broker",
    "registry",
    "discovery",
    "transporter",
    "$node",
    "transit",
    "cacher"
  ]
}
```

### Ingest Pipeline example

1. create `@timestamp` with type Date from `_source.timestamp`
2. save logs to index name `moleculer-yyyyMMdd`
3. remove `timestamp` field
4. try parse JSON from `message` field and save object to `parsedMsg`
5. set `requestID` field from `_source.parsedMsg.requestID`
6. set `subdomain` field from `_source.parsedMsg.subdomain`
7. set `action` field from `_source.parsedMsg.action`
8. set `title` field from `_source.parsedMsg.title`
9. set `caller` field from `_source.parsedMsg.caller`
10. if `ctx.parsedMsg?.title == "Incoming webhook"` add tag `webhook`
11. remove parsed json `_source.parsedMsg`
12. if `message` is empty drop document

```js
[
  {
    "date": {
      "field": "_source.timestamp",
      "formats": [
        "UNIX_MS"
      ],
      "target_field": "@timestamp"
    }
  },
  {
    "date_index_name": {
      "field": "_source.timestamp",
      "date_rounding": "d",
      "index_name_prefix": "moleculer-",
      "index_name_format": "yyyyMMdd",
      "date_formats": [
        "UNIX_MS"
      ]
    }
  },
  {
    "remove": {
      "field": "timestamp",
      "ignore_missing": true,
      "ignore_failure": true
    }
  },
  {
    "json": {
      "field": "_source.message",
      "target_field": "parsedMsg",
      "ignore_failure": true
    }
  },
  {
    "set": {
      "field": "requestID",
      "copy_from": "_source.parsedMsg.requestID",
      "ignore_empty_value": true
    }
  },
  {
    "set": {
      "field": "subdomain",
      "copy_from": "_source.parsedMsg.subdomain",
      "ignore_empty_value": true
    }
  },
  {
    "set": {
      "field": "action",
      "copy_from": "_source.parsedMsg.action",
      "ignore_empty_value": true
    }
  },
  {
    "set": {
      "field": "title",
      "copy_from": "_source.parsedMsg.title",
      "ignore_empty_value": true
    }
  },
  {
    "set": {
      "field": "caller",
      "copy_from": "_source.parsedMsg.caller",
      "ignore_empty_value": true
    }
  },
  {
    "script": {
      "source": "ctx['tags'].add(\"webhook\");",
      "if": "ctx.parsedMsg?.title == \"Incoming webhook\";",
      "ignore_failure": true,
      "description": "Add tag webhook"
    }
  },
  {
    "remove": {
      "field": "_source.parsedMsg",
      "ignore_missing": true
    }
  },
  {
    "drop": {
      "if": "ctx.message === ''"
    }
  }
]
```
