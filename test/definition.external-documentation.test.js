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
const definition    = require('../bin/definition/index').normalize;
const expect        = require('chai').expect;
const ExternalDoc   = require('../bin/definition/external-documentation');

describe('definitions/external-documentation', () => {

    it('allows a valid external-documentation object', () => {
        const [ err ] = definition(2, ExternalDoc, { url: 'hi' });
        expect(err).to.be.undefined;
    });

    it('requires the "url" property', () => {
        const [ err ] = definition(2, ExternalDoc, {});
        expect(err).to.match(/Missing required property: url/);
    });

    it('can have description property', () => {
        const [, def ] = definition(2, ExternalDoc, { url: 'a', description: 'b' });
        expect(def).to.deep.equal({ url: 'a', description: 'b' })
    });

    it('can have extension property', () => {
        const [, def ] = definition(2, ExternalDoc, { url: 'a', 'x-prop': 'b' });
        expect(def).to.deep.equal({ url: 'a', 'x-prop': 'b' })
    });

    it('cannot have other property', () => {
        const [ err ] = definition(2, ExternalDoc, { url: 'a', other: 'b' });
        expect(err).to.match(/Property not allowed: other/);
    });

    it('cannot have multiple other properties', () => {
        const [ err ] = definition(2, ExternalDoc, { one: 'a', two: 'b' });
        expect(err).to.match(/Properties not allowed: one, two/);
    });

});