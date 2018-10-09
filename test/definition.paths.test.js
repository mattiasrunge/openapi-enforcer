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
const definition    = require('../bin/definition-validator').normalize;
const expect        = require('chai').expect;
const Paths         = require('../bin/definition-validators/paths');

describe('definitions/paths', () => {

    function validPathObject (parameters) {
        const result = {
            get: {
                responses: {
                    default: {
                        description: ''
                    }
                }
            }
        };
        if (parameters) result.parameters = parameters;
        return result;
    }

    it('must be an object', () => {
        const [ , err ] = definition(2, Paths, []);
        expect(err).to.match(/Value must be a plain object/);
    });

    it('can be used to define valid path item objects', () => {
        const [ , err ] = definition(2, Paths, {
            '/': validPathObject()
        });
        expect(err).to.be.undefined;
    });

    it('requires that each path start with a slash', () => {
        const [ , err ] = definition(2, Paths, {
            'abc': validPathObject()
        });
        expect(err).to.match(/Path must begin with a single forward slash/);
    });

    it('requires that each path start with a single slash', () => {
        const [ , err ] = definition(2, Paths, {
            '//abc': validPathObject()
        });
        expect(err).to.match(/Path must begin with a single forward slash/);
    });

    it('will identify variable path duplications', () => {
        const [ , err ] = definition(2, Paths, {
            '/a/b/{c}/d/{e}': validPathObject([
                { name: 'c', in: 'path', required: true, type: 'string' },
                { name: 'e', in: 'path', required: true, type: 'string' }
            ]),
            '/a/b/{x}/d/{y}': validPathObject([
                { name: 'x', in: 'path', required: true, type: 'string' },
                { name: 'y', in: 'path', required: true, type: 'string' }
            ]),
            '/a/b/{a}/d/{e}': validPathObject([
                { name: 'a', in: 'path', required: true, type: 'string' },
                { name: 'e', in: 'path', required: true, type: 'string' }
            ]),
            '/a/b/{x}/d/{y}/{z}': validPathObject([
                { name: 'x', in: 'path', required: true, type: 'string' },
                { name: 'y', in: 'path', required: true, type: 'string' },
                { name: 'z', in: 'path', required: true, type: 'string' }
            ]),
            '/a/b/{a}/d/{b}/{c}': validPathObject([
                { name: 'a', in: 'path', required: true, type: 'string' },
                { name: 'b', in: 'path', required: true, type: 'string' },
                { name: 'c', in: 'path', required: true, type: 'string' }
            ]),
        });
        expect(err).to.match(/Equivalent paths are not allowed/)
    })

});