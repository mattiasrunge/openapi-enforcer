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

describe('definition-validator', () => {

    it('handles recursive validators', () => {
        const validator = {
            type: 'object',
            properties: {
                a: { type: 'number' }
            }
        };
        validator.properties.b = validator;

        const def = {
            a: 1,
            b: {
                a: 2,
                b: {
                    a: 'x'
                }
            }
        };

        const [ , err ] = definition(2, validator, def);
        expect(err).to.match(/Value must be a number. Received: "x"/);
    });

    it('handles recursive validation definitions', () => {
        const validator = {
            type: 'object',
            properties: {
                a: { type: 'number' }
            }
        };
        validator.properties.b = validator;

        const def = {
            a: 1
        };
        def.b = def;

        const [ , err ] = definition(2, validator, def);
        expect(err).to.be.undefined;
    });

});