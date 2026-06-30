var Montage = require("../../core/core").Montage,
    compile = require("../../core/frb/compile-evaluator"),
    parse = require("../../core/frb/parse"),
    Promise = require("../../core/promise").Promise,
    syntaxProperties = require("../../core/frb/syntax-properties");


var ONE_WAY_BINDING = "<-";
var TWO_WAY_BINDING = "<->";

var CONVERTERS_ACCEPTING_SCOPE = new Set([
    "data/converter/raw-foreign-value-to-object-converter",
    "data/converter/raw-property-value-to-object-converter",
    "data/converter/raw-embedded-value-to-object-converter",
    "data/converter/raw-embedded-hierarchy-value-to-object-converter"
])

/**
 * Instructions to map raw data to model objects or model objects to model objects
 *
 * @class
 * @extends external:Montage
 */
exports.MappingRule = Montage.specialize(/** @lends MappingRule.prototype */ {


    /**
     * A converter that takes in the the output of #expression and returns the destination value.
     * @type {Converter}
     */
    converter: {
        value: undefined
    },

    /**
     * The expression that defines the input to be passed to .converter. If converter is not provided,
     * the output of the expression is assigned directly to the destination value.
     * @type {string}
     */
    _expression: {
        value: undefined
    },
    expression: {
        get: function () {
            if (!this._expression && this.sourcePathSyntax) {
                this._expression = compile(this.sourcePathSyntax);
            }
            return this._expression;
        }
    },


    /**
     * The descriptor for the property that this rule applies to
     * @type {PropertyDescriptor}
     */
    propertyDescriptor: {
        value: undefined
    },

    /**
     * The names of the properties required to evaluate .expression
     *
     * The raw data that .expression is evaluated against may not
     * have all of the properties referenced in .expression before the
     * the MappingRule is used. This array is used at the time of mapping to
     * populate the raw data with any properties that are missing.
     * 
     * FIXME: This is currently returning a flattened list regardless of the shape / depth 
     * where those property names might have been found
     *
     * @type {string[]}
     */
    requirements: {
        get: function () {
            return this._requirements || (
                this._requirements === undefined && this.sourcePathSyntax
                ?  (this._requirements = this._parseRequirementsFromSyntax(this.sourcePathSyntax))
                : this._requirements = null
            );
            // if (!this._requirements && this.sourcePathSyntax) {
            //     this._requirements = this._parseRequirementsFromSyntax(this.sourcePathSyntax);
            // }
            // return this._requirements;
        }
    },

    hasRawDataRequiredValues: {
        value: function(rawData) {
            var requirements = this.requirements,
                i, countI, iRequirenent;

            for(i=0, countI = requirements.length; (i<countI); i++) {
                iRequirenent = requirements[i];

                if(!rawData.hasOwnProperty(iRequirenent)) {
                    return false;
                }
            }

            return true;
        }

    },

    /**
     * A converter that takes in the the output of #expression and returns the destination value.
     * When a reverter is specified the conversion use the revert method when mapping from
     * right to left.
     *
     * @type {Converter}
     */
    reverter: {
        value: undefined
    },

    _parseRequirementsFromSyntax: {
        value: function (syntax, requirements) {
            var args = syntax.args,
                type = syntax.type,
                _requirements = requirements || null;

            if(type === "value" && !args && this.sourcePath === "this") {
                /*
                    added for pattern used for polymorphic relationship, where we have multiple foreignKeys for each possible destination, and we need to look at the converter and it's foreignDescriptorMappings for their expression syntax.
                */

                var converter = this.converter,
                foreignDescriptorMappings = converter && converter.foreignDescriptorMappings;

                if(foreignDescriptorMappings) {
                    for(var i=0, countI = foreignDescriptorMappings.length, iRawDataTypeMapping;(i<countI);i++) {
                        iRawDataTypeMapping = foreignDescriptorMappings[i];
                        //I think these 2 are functionally equivalent, keeping here for more testing
                        _requirements = syntaxProperties(iRawDataTypeMapping.expressionSyntax, _requirements);
                        //_requirements = this._parseRequirementsFromRecord(iRawDataTypeMapping.expressionSyntax, _requirements);
                    }
                }
            } else {
                _requirements = syntaxProperties(syntax);
            }

            return _requirements;
        }
    },



    // _parseRequirementsFromSyntax: {
    //     value: function (syntax, requirements) {
    //         var args = syntax.args,
    //             type = syntax.type,
    //             _requirements = requirements || null;

    //         if (type === "property" && args[0].type === "value") {
    //             (_requirements || (_requirements = [])).push(args[1].value);
    //         } else if (type === "property" && args[0].type === "property") {
    //             var subProperty = [args[1].value];
    //             this._parseRequirementsFromSyntax(args[0], subProperty);
    //             (_requirements || (_requirements = [])).push(subProperty.reverse().join("."));
    //         } else if (type === "record") {
    //             _requirements = this._parseRequirementsFromRecord(syntax, _requirements);
    //         } else if(type === "value" && !args && this.sourcePath === "this") {
    //             /*
    //                 added for pattern used for polymorphic relationship, where we have multiple foreignKeys for each possible destination, and we need to look at the converter and it's foreignDescriptorMappings for their expression syntax.
    //             */

    //             var converter = this.converter,
    //             foreignDescriptorMappings = converter && converter.foreignDescriptorMappings;

    //             if(foreignDescriptorMappings) {
    //                 for(var i=0, countI = foreignDescriptorMappings.length, iRawDataTypeMapping;(i<countI);i++) {
    //                     iRawDataTypeMapping = foreignDescriptorMappings[i];
    //                     _requirements = this._parseRequirementsFromRecord(iRawDataTypeMapping.expressionSyntax, _requirements);
    //                 }
    //             }
    //         }

    //         return _requirements;
    //     }
    // },

    // _parseRequirementsFromRecord: {
    //     value: function (syntax, requirements) {
    //         var args = syntax.args,
    //             keys = Object.keys(args),
    //             _requirements = requirements || null,
    //             i, countI;

    //         for(i=0, countI = keys.length;(i<countI); i++) {
    //             _requirements = this._parseRequirementsFromSyntax(args[keys[i]], _requirements);
    //         };

    //         return _requirements;
    //     }
    // },

    /**
     * Identifier for the child service of ExpressionDataMapping.service
     * that the destination value should be fetched from.
     * @type {string}
     */
    serviceIdentifier: {
        value: undefined
    },


    /**
     * Path of the property to which the value of the expression should be retrieved
     * @type {string}
     */
    sourcePath: {
        value: undefined
    },

    /**
     * Object created by parsing .sourcePath using frb/grammar.js that will
     * be used to evaluate the data
     * @type {Object}
     * */
    sourcePathSyntax: {
        get: function () {
            if (!this._sourcePathSyntax && this.sourcePath) {
                this._sourcePathSyntax = parse(this.sourcePath);
            }
            return this._sourcePathSyntax;
        }
    },

    /**
     * Path of the property to which the value of the expression should be assigned.
     * @type {string}
     */
    targetPath: {
        value: undefined
    },

    /**
     * Object created by parsing .sourcePath using frb/grammar.js that will
     * be used to evaluate the data
     * @type {Object}
     * */
    targetPathSyntax: {
        get: function () {
            if (!this._targetPathSyntax && this.targetPath) {
                this._targetPathSyntax = parse(this.targetPath);
            }
            return this._targetPathSyntax;
        }
    },

    /**
     * The expression that defines the input to be passed to .converter's revert. If converter is not provided,
     * the output of the expression is assigned directly to the destination value.
     * @type {string}
     */
    _revertExpression: {
        value: undefined
    },
    revertExpression: {
        get: function () {
            if (!this._revertExpression && this.targetPathSyntax) {
                this._revertExpression = compile(this.targetPathSyntax);
            }
            return this._revertExpression;
        }
    },


    /**
     * TODO - put this in a shared place....
     * @type {boolean}
     */

    _isAsync: {
        value: function (object) {
            return object && object.then && typeof object.then === "function";
        }
    },

    _converterAcceptsScope: {
        value: function (converter) {
            var converters = converter && converter.converters,
                i, countI;

            if (!converter) {
                return false;
            }

            if (CONVERTERS_ACCEPTING_SCOPE.has(converter.moduleId)) {
                return true;
            }

            for (i = 0, countI = converters && converters.length || 0; i < countI; i++) {
                if (this._converterAcceptsScope(converters[i])) {
                    return true;
                }
            }

            return false;
        }
    },

    /**
     * Return the value of the property for this rule
     * @type {Scope}
     */
    evaluate: {
        value: function (scope) {
            var value = this.expression(scope),
                ruleScope;
            // return this.converter ? (this.converter.convert(value) :
            //                         this.reverter ?
            //                         this.reverter.revert(value) :
            //                         //Promise.resolve(value);
            //                         value;

            /*
                When converters are shared among multiple rules, they may need to know which rule is invoking their convert/revert method in order to do their conversion job.
            */
            if(this.converter) {
                this.converter.currentRule = this;
                /*
                    Another direction to address the need of nested converters to know about the rule to do their work, and reducing the need to
                    specialize a "composing" converter like a collection-iteration-converter to pass the currentRule they got set dowm, would be
                    to pass the rule as a second argument: regular converters don't need to know and can ignore it, while those who do have it handy,
                    in-scope which is more natural in a stateless / functional approach those convert()/revert() have been using.
                */

                /******
                 * Data Converters were originally written to accept the result of an expression on the scope. This will be changed 
                 * so Data Converters accept the scope itself which will provide access to the full scope chain. This will empower 
                 * the converter to know significantly more about the object being converted without exploding the method signature with arguments. 
                 * 
                 * As an example, raw-embedded-value-to-object-converter expects a scope like...
                 * value: aRawDataService
                 *      --> value: aDataOperation 
                 *         --> value: rawData
                 *             rootObjectBeingMapped: dataObject
                 *    
                 * This goal is to eventually change all data converters to accept scope
                 */
               if (this._converterAcceptsScope(this.converter)) {
                ruleScope = scope.nest(value);
                value = this.converter.convert(ruleScope);
               } else {
                value = this.converter.convert(value);
               }
                
                if(this._isAsync(value)) {
                    var self = this;
                    return value.then(function(value) {
                        self.converter.currentRule = null;
                        return value;
                    });
                } else {
                    this.converter.currentRule = null;
                }
            } else if(this.reverter) {
                this.reverter.currentRule = this;
                /*
                    There may not be a reverter method
                */
                value = this.reverter.revert?.(value);
                if(this._isAsync(value)) {
                    var self = this;
                    return value.then(function(value) {
                        self.reverter.currentRule = null;
                        return value;
                    });
                } else {
                    this.reverter.currentRule = null;
                }
            }

            return value;
        }
    }


}, {

    withRawRuleAndPropertyName: {
        value: function (rawRule, propertyName, addOneWayBindings) {
            var rule = new this();

            rule.sourcePath = addOneWayBindings ? rawRule[ONE_WAY_BINDING] || rawRule[TWO_WAY_BINDING] : propertyName;
            rule.targetPath  = addOneWayBindings && propertyName || rawRule[TWO_WAY_BINDING];

            rule.serviceIdentifier = rawRule.serviceIdentifier;

            return rule;
        }
    }



});
