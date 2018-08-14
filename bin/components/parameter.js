/**
 *  @license
 *    Copyright 2018 Brigham Young University
 *
 *    Licensed under the Apache License, Version 2.0 (the "License");
 *    you may not use this file except in compliance with the License.
 *    You may obtain a copy of the License at
 *
 *        http://www.apache.org/licenses/LICENSE-2.0
 *
 *    Unless required by applicable law or agreed to in writing, software
 *    distributed under the License is distributed on an "AS IS" BASIS,
 *    WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *    See the License for the specific language governing permissions and
 *    limitations under the License.
 **/
'use strict';
const Exception     = require('../exception');
const normalize     = require('../map-normalizer');
const Result        = require('../result');
const Schema        = require('./schema');
const util          = require('../util');

const rxFalse = /^false/i;
const rxTrue = /^true$/i;
const store = new WeakMap();

module.exports = Parameter;

const schemaProperties = ['default', 'enum', 'exclusiveMaximum', 'exclusiveMinimum', 'format', 'items', 'maximum', 'minimum', 'maxItems', 'minItems', 'maxLength', 'minLength', 'multipleOf', 'pattern', 'type', 'uniqueItems'];

const v2itemsValidationsMap = {
    type: {
        allowed: (ctx, version) => version === 2 && ctx.in !== 'body',
        required: () => true,
        enum: () => ['array', 'boolean', 'file', 'integer', 'number', 'string']
    },
    format: {
        allowed: (ctx, version) => version === 2 && (ctx.type === 'integer' || ctx.type === 'number' || ctx.type === 'string'),
        enum: ctx => {
            if (ctx.type === 'integer') return ['int32', 'int64'];
            if (ctx.type === 'number') return ['float', 'double'];
            return ['binary', 'byte', 'date', 'date-time', 'password'];
        }
    },
    items: {
        allowed: (ctx, version) => version === 2,
        required: ctx => ctx.type === 'array',
    },
    collectionFormat: {
        allowed: (ctx, version) => version === 2 && ctx.type === 'array',
        enum: () => ['csv', 'ssv', 'tsv', 'pipes'],
        default: () => 'csv'
    },
    default: {
        allowed: (ctx, version) => version === 2,
        errors: ctx => ctx.required ? 'Cannot have both "default" and "required"' : ''
    },
    maximum: {
        allowed: (ctx, version) => version === 2 && (ctx.type === 'number' || ctx.type === 'integer' || (ctx.type === 'string' && ctx.format && ctx.format.startsWith('date'))),
        type: ctx => ctx.type === 'string' && ctx.format.startsWith('date') ? 'string' : 'number'
    },
    exclusiveMaximum: {
        allowed: (ctx, version) => version === 2 && (ctx.type === 'number' || ctx.type === 'integer' || (ctx.type === 'string' && ctx.format && ctx.format.startsWith('date'))),
        type: () => 'boolean'
    },
    minimum: {
        allowed: (ctx, version) => version === 2 && (ctx.type === 'number' || ctx.type === 'integer' || (ctx.type === 'string' && ctx.format && ctx.format.startsWith('date'))),
        type: ctx => ctx.type === 'string' && ctx.format.startsWith('date') ? 'string' : 'number'
    },
    exclusiveMinimum: {
        allowed: (ctx, version) => version === 2 && (ctx.type === 'number' || ctx.type === 'integer' || (ctx.type === 'string' && ctx.format && ctx.format.startsWith('date'))),
        type: () => 'boolean'
    },
    maxLength: {
        allowed: (ctx, version) => version === 2 && (ctx.type === 'string' || ctx.type === 'file'),
        type: () => 'number',
        errors: (ctx, version, value) => value < 0 || Math.round(value) !== value ? 'Property "maxLength" must be a non-negative integer' : ''
    },
    minLength: {
        allowed: (ctx, version) => version === 2 && (ctx.type === 'string' || ctx.type === 'file'),
        type: () => 'number',
        errors: (ctx, version, value) => value < 0 || Math.round(value) !== value ? 'Property "maxLength" must be a non-negative integer' : ''
    },
    pattern: {
        allowed: (ctx, version) => version === 2 && ctx.type === 'string',
        type: () => 'string',
        errors: (ctx, version, value) => !value ? 'Property "pattern" must be a non-empty string' : ''
    },
    maxItems: {
        allowed: (ctx, version) => version === 2 && ctx.type === 'array',
        type: () => 'number',
        errors: (ctx, version, value) => value < 0 || Math.round(value) !== value ? 'Property "maxLength" must be a non-negative integer' : ''
    },
    minItems: {
        allowed: (ctx, version) => version === 2 && ctx.type === 'array',
        type: () => 'number',
        errors: (ctx, version, value) => value < 0 || Math.round(value) !== value ? 'Property "maxLength" must be a non-negative integer' : ''
    },
    uniqueItems: {
        allowed: (ctx, version) => version === 2 && ctx.type === 'array',
        type: () => 'boolean'
    },
    enum: {
        allowed: (ctx, version) => version === 2,
        isArray: true
    },
    multipleOf: {
        allowed: (ctx, version) => version === 2 && (ctx.type === 'number' || ctx.type === 'integer'),
        type: () => 'number'
    }
};
const validationsMap = Object.assign({}, v2itemsValidationsMap, {
    name: {
        required: () => true,
        type: () => 'string',
        ignore: (ctx, version, value) => {
            if (typeof value === 'string') value = value.toLowerCase();
            return version === 3 && ctx.in === 'header' && (value === 'accept' || value === 'content-type' || value === 'authorization')
        }
    },
    in: {
        required: () => true,
        type: () =>'string',
        enum: (ctx, version) => version === 2
            ? ['body', 'formData', 'header', 'query', 'path']
            : ['cookie', 'header', 'path', 'query'],
    },
    description: {
        type: () => 'string'
    },
    required: {
        required: ctx => ctx.in === 'path',
        type: () => 'boolean',
        default: () => false,
        errors: (ctx, version, value) => ctx.in === 'path' && value !== true ? 'Value must be true when property "in" is set to "path"' : ''
    },
    deprecated: {
        allowed: (ctx, version) => version === 3,
        type: () => 'boolean'
    },
    allowEmptyValue: {
        allowed: ctx => ctx.in === 'query' || ctx.in === 'formData',
        type: () => 'boolean',
        default: () => false
    },
    collectionFormat: { // overwrite items - can use 'multi'
        allowed: (ctx, version) => version === 2 && ctx.type === 'array',
        enum: () => ['csv', 'ssv', 'tsv', 'pipes', 'multi'],
        default: () => 'csv'
    },
    schema: {
        allowed: (ctx, version) => version === 3 || ctx.in === 'body',
        isPlainObject: true,
        errors: (ctx, version) => version === 3 && ctx.hasOwnProperty('content') ? 'Cannot have both "schema" and "content"' : ''
    },
    style: {
        allowed: (ctx, version) => version === 3,
        type: () => 'string',
        default: ctx => {
            switch (ctx.in) {
                case 'cookie': return 'form';
                case 'header': return 'simple';
                case 'path': return 'simple';
                case 'query': return 'form';
            }
        },
        enum: ctx => {
            switch (ctx.in) {
                case 'cookie': return ['form'];
                case 'header': return ['simple'];
                case 'path': return ['simple', 'label', 'matrix'];
                case 'query': return ['form', 'spaceDelimited', 'pipeDelimited', 'deepObject'];
            }
        }
    },
    explode: {
        allowed: (ctx, version) => version === 3,
        type: () => 'boolean',
        default: ctx => ctx.style === 'form'
    },
    allowReserved: {
        allowed: (ctx, version) => version === 3 && ctx.in === 'query',
        type: () => 'boolean',
        default: ctx => ctx.style === 'form'
    },
    example: {
        allowed: (ctx, version) => version === 3,
        isPlainObject: true
    },
    examples: {
        allowed: (ctx, version) => version === 3,
        isPlainObject: true
    },
    content: {
        allowed: (ctx, version) => version === 3,
        isPlainObject: true,
        errors: ctx => ctx.hasOwnProperty('schema') ? 'Cannot have both "schema" and "content" properties' : ''
    }
});

function Parameter(enforcer, exception, definition, map) {

    if (!util.isPlainObject(definition)) {
        exception('Must be a plain object');
        return;
    }

    // if this definition has already been processed then return result
    const existing = map.get(definition);
    if (existing) return existing;
    map.set(definition, this);

    // store protected variables
    store.set(this, { enforcer });

    // validate and normalize the definition
    const version = enforcer.version;
    normalize(this, version, exception, definition, validationsMap);

    if (!exception.hasException) {
        if (version === 2) {
            // make sure all nested array items definitions are noramlized and validated
            let context = this;
            while (context = (context.type === 'array' && context.items)) {
                normalize(context, version, exception.at('items'), context, v2itemsValidationsMap);
            }

            this.schema = new Schema(enforcer, exception, copySchemaProperties(this), map);

        } else if (version === 3) {
            if (definition.hasOwnProperty('schema')) {
                schemaAndExamples(this, enforcer, exception, definition, map);
            } else if (definition.hasOwnProperty('content')) {
                const child = exception.at('content');
                const mediaTypes = Object.keys(definition.content);
                if (mediaTypes.length !== 1) {
                    child('Must have exactly one media type. Found ' + mediaTypes.join(', '));
                } else {
                    const mt = mediaTypes[0];
                    schemaAndExamples(this, enforcer, exception.at('content/' + mt), definition.content[mt], map);
                }
            } else {
                exception('Missing required property "schema" or "content"');
            }
        }
    }
}

/**
 * Parse input. Does not validate.
 * @param {string} value
 * @returns {EnforcerResult}
 */
Parameter.prototype.parse = function(value) {
    const enforcer = store.get(this).enforcer;

    const exception = Exception('Unable to parse value');
    let result;

    if (enforcer.version === 2) {
        return new Result(exception, v2Parse(this, exception, value))

    } else if (enforcer.version === 3) {
        const explode = this.explode;
        const schema = this.schema;
        const type = schema.type;
        let parsed;

        if (this.style === 'deepObject') {
            const rx = RegExp('(?:^|&)' + this.name + '\\[([^\\]]+)\\](?:=([^&]*))?', 'g');
            const result = {};
            let match;
            let hasValue = false;
            while (match = rx.exec(value)) {
                hasValue = true;
                result[match[1]] = match[2];
            }
            return hasValue ? { match: true, value: result } : { match: false };

        } else if (this.style === 'form') {

        } else if (this.style === 'label') {
            if (/^\./.test(value)) {
                if (type === 'array') {
                    parsed = value.substr(1).split(explode ? '.' : ',');
                } else if (type === 'object') {
                    parsed = explode
                        ? objectExploded('.', '=', value)
                        : objectFlattened(',', value.substr(1));
                } else {
                    parsed = value.substr(1);
                }
            }

        } else if (this.style === 'matrix') {

        } else if (this.style === 'pipeDelimited') {

        } else if (this.style === 'simple') {
            if (type === 'array') {
                parsed = value.split(',');
            } else if (type === 'object') {
                const parsed = explode
                    ? objectExploded(',', '=', ',' + value)
                    : objectFlattened(',', value);
            } else {
                parsed = value;
            }

        } else if (this.style === 'spaceDelimited') {

        }

        // parse array items and object properties
        if (parsed) {
            if (type === 'array') {
                parsed = parsed.map(v => parsePrimitive(schema.items, exception, v));
            } else if (type === 'object') {
                Object.keys(parsed).forEach(key => {
                    if (schema.properties && schema.properties[key]) {
                        parsed[key] = parsePrimitive(schema.properties[key], exception, parsed[key]);
                    } else if (typeof schema.additionalProperties === 'object') {
                        parsed[key] = parsePrimitive(schema.additionalProperties, exception, parsed[key]);
                    }
                });
            } else {
                parsed = parsePrimitive(schema, exception, parsed)
            }
        } else if (parsed === undefined) {
            exception('The value is not formatted properly');
        }

        return new Result(exception, parsed);
    }

    return new Result(exception, result);
};


function arrayExploded(setDelimiter, valueDelimiter, name, value) {
    const ar = value.split(setDelimiter);
    const length = ar.length;
    const result = [];
    for (let i = 0; i < length; i++) {
        const set = ar[i].split(valueDelimiter);
        if (set[0] === name) {
            result.push(set[1]);
        } else {
            return false;
        }
    }
    return result;
}

function copySchemaProperties(source) {
    const result = {};
    schemaProperties.forEach(key => {
        if (source.hasOwnProperty(key)) {
            result[key] = key === 'items'
                ? copySchemaProperties(source[key])
                : source[key];
        }
    });
    return result;
}

function delimited(type, delimiter, value) {
    if (type === 'array') {
        return { match: true, value: value.split(delimiter) };

    } else if (type === 'object') {
        const parsed = objectFlattened(delimiter, value);
        return parsed ? { match: true, value: parsed } : { match: false };
    }
}

function parseArrayOfPrimitives(context, exception, value) {

}

function parsePrimitive(context, exception, value) {
    if (context.type === 'boolean') {
        if (rxTrue.test(value)) return true;
        if (rxFalse.test(value)) return false;
        exception('Expected "true" or "false". Received: ' + value)

    } else if (context.type === 'integer') {
        const num = +value;
        if (isNaN(num)) exception('Expected an integer. Received: ' + value);
        return num;

    } else if (context.type === 'number') {
        const num = +value;
        if (isNaN(num)) exception('Expected a number. Received: ' + value);
        return num;

    } else if (context.type === 'string') {
        return value;
    }
}

function objectExploded(setDelimiter, valueDelimiter, value) {
    const str = 's([^v]+)v([^s]+)?';
    const rx = RegExp(str.replace(/v/g, valueDelimiter).replace(/s/g, setDelimiter), 'g');
    const result = {};
    let match;
    let offset = 0;
    while (match = rx.exec(value)) {
        result[match[1]] = match[2] || '';
        offset = match.index + match[0].length;
    }
    if (offset !== value.length) return false;
    return result;
}

function objectFlattened(delimiter, value) {
    const result = {};
    const ar = value.split(delimiter);
    const length = ar.length;

    if (length % 2 !== 0) return false;
    for (let i = 1; i < length; i += 2) {
        result[ar[i - 1]] = ar[i];
    }
    return result;
}

function schemaAndExamples(context, enforcer, exception, definition, map) {
    if (definition.hasOwnProperty('schema')) {
        context.schema = new Schema(enforcer, exception.at('schema'), definition.schema, map);
    }

    if (definition.hasOwnProperty('example') && definition.hasOwnProperty('examples')) {
        exception('Properties "example" and "examples" are mutually exclusive');
    } else if (definition.hasOwnProperty('example')) {
        context.example = definition.example;
        if (context.schema) {
            const error = context.schema.validate(definition.example);
            if (error) exception.at('example')(error);
        }
    } else if (definition.hasOwnProperty('examples')) {
        context.examples = {};
        Object.keys(definition.examples).forEach(key => {
            context.examples[key] = definition.examples[key];
            if (context.schema) {
                const error = context.schema.validate(definition.examples[key]);
                if (error) exception.at('examples/' + key)(error);
            }
        });
    }
}

function v2Parse(context, exception, value) {
    if (context.type === 'array') {
        let values;
        switch (context.collectionFormat) {
            case 'csv':
                values = value.split(',');
                break;
            case 'pipes':
                values = value.split('|');
                break;
            case 'ssv':
                values = value.split(' ');
                break;
            case 'tsv':
                values = value.split('\t');
                break;
            // multi is not a valid collectionFormat for itemsObject: https://github.com/OAI/OpenAPI-Specification/blob/master/versions/2.0.md#itemsObject
        }
        return values.map((value, index) => v2Parse(context.items, exception.at(index), value));

    } else {
        parsePrimitive(context, exception, value);
    }
}