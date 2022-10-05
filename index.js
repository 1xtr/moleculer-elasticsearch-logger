/*
 * moleculer
 * Copyright (c) 2019 MoleculerJS (https://github.com/moleculerjs/moleculer)
 * MIT Licensed
 */

/**
 * @typedef {Object} ElasticLoggerOptions
 * @property {import('@elastic/elasticsearch').ClientOptions} clientOptions Elasticsearch client options
 * @property {string | null} [index=null] Elasticsearch index
 * @property {string | null} [pipeline=null] Elasticsearch pipeline from Ingest Pipelines
 * @property {string} [source='moleculer'] Default is process.env.MOL_NODE_NAME if set or 'moleculer'
 * @property {string} [hostname='hostname'] Hostname, default is machine hostname 'os.hostname()'
 * @property {Function} [objectPrinter=null] Callback function for object printer, default is 'JSON.stringify'
 * @property {number} [interval=5000] Date uploading interval in milliseconds, default is 10000
 * @property {string[]} [excludeModules=[]] Exclude modules from logs, 'broker', 'registry' etc.
 */

const _ = require('lodash')
const {Client} = require('@elastic/elasticsearch')
const BaseLogger = require('moleculer').Loggers.Base
const {hostname} = require('os')

fetch.Promise = Promise
const isObject = (o) => o !== null && typeof o === 'object' && !(o instanceof String)

Date.prototype.yyyymmdd = function () {
  // getMonth() is zero-based
  const mm = this.getMonth() + 1
  const dd = this.getDate()
  return [this.getFullYear(), (mm > 9 ? '' : '0') + mm, (dd > 9 ? '' : '0') + dd].join('')
}

/**
 * ElasticLogger logger for Moleculer
 * send logs directly to elastic
 * @class ElasticLogger
 * @constructor
 * @extends {BaseLogger}
 */
class ElasticLogger extends BaseLogger {
  /**
   * Creates an instance of ElasticLogger.
   * @param {ElasticLoggerOptions} opts
   * @memberof ElasticLogger
   */
  constructor(opts = {}) {
    super(opts)
    
    /**
     * @type {ElasticLoggerOptions}
     */
    const defaultOptions = {
      clientOptions: {
        node: 'http://localhost:9200',
        tls: {
          //ca: readFileSync('/ca.crt'),
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
    
    this.opts = _.defaultsDeep(this.opts, defaultOptions)
    this.queue = []
    this.timer = null
    this.client = {}
  }
  
  /**
   * Initialize logger.
   * @param {LoggerFactory} loggerFactory
   */
  init(loggerFactory) {
    super.init(loggerFactory)
    
    this.objectPrinter = this.opts.objectPrinter
      ? this.opts.objectPrinter
      : (o) => JSON.stringify(o)
    
    if (this.opts.interval > 0) {
      this.timer = setInterval(() => this.flush(), this.opts.interval)
      this.timer.unref()
    }
    this.client = new Client(this.opts.clientOptions)
  }
  
  /**
   * Stopping logger
   */
  stop() {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
    return this.flush()
  }
  
  /**
   * Generate a new log handler.
   * @param {object} bindings
   */
  getLogHandler(bindings) {
    if (this.opts.excludeModules.includes(bindings.mod)) return null
    
    const level = bindings ? this.getLogLevel(bindings.mod) : null
    if (!level) return null
    
    const printArgs = (args) => {
      return args.map((p) => {
        if (isObject(p) || Array.isArray(p)) return this.objectPrinter(p)
        if (typeof p === 'string') return p.trim()
        return p
      })
    }
    const levelIdx = BaseLogger.LEVELS.indexOf(level)
    
    return (type, args) => {
      const typeIdx = BaseLogger.LEVELS.indexOf(type)
      if (typeIdx > levelIdx) return
      
      this.queue.push({
        ts: new Date(),
        level: type,
        msg: printArgs(args).join(' '),
        bindings,
      })
      if (!this.opts.interval) this.flush()
    }
  }
  
  /**
   * Flush queued log entries to ElasticLogger.
   */
  flush() {
    if (this.queue.length > 0) {
      const rows = Array.from(this.queue)
      this.queue.length = 0
      
      const data = rows.map((row) => [
        {index: {_index: this.opts.index || `moleculer-${row.ts.yyyymmdd()}`, pipeline: this.opts.pipeline}},
        {
          timestamp: row.ts.getTime(),
          level: row.level,
          message: row.msg,
          nodeID: row.bindings.nodeID,
          namespace: row.bindings.ns,
          service: row.bindings.svc,
          version: row.bindings.ver,
          
          source: this.opts.source,
          tags: [process.env.NODE_ENV],
          hostname: this.opts.hostname,
        },
      ])
      const operations = _.flatten(data)
      return this.client
        .bulk({refresh: true, operations})
        .then((res) => {
          if (res.errors) {
            console.info(`Logs are uploaded to ELK server, but has errors: ${res.errors}`)
          }
        })
        .catch((err) => {
          console.warn(`Unable to upload logs to ELK server. Error:${err.message}`, err)
        })
    }
    
    return this.broker.Promise.resolve()
  }
}

module.exports = ElasticLogger
