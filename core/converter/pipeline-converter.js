var Converter = require("./converter").Converter,
    Promise = require("../promise").Promise,
    Set = require("../collections/set");

/**
 * Converter that chains a series of converters together
 *
 *
 * @class PipelineConverter
 * @extends Converter
 */
exports.PipelineConverter = Converter.specialize({

    constructor: {
        value: function () {
            this.super();
            this.addRangeAtPathChangeListener("converters", this, "_handleConvertersRangeChange");
        }
    },

    _handleConvertersRangeChange: {
        value: function (plus, minus, index) {
            var plusSet = new Set(plus),
                minusSet = new Set(minus),
                converter, i;

            for (i = 0; (converter = minus[i]); ++i) {
                if (!plusSet.has(converter)) {
                    converter.owner = null;
                }
            }

            for (i = 0; (converter = plus[i]); ++i) {
                if (!minusSet.has(converter)) {
                    converter.owner = converter.owner || this;
                }
            }
        }
    },

    /********************************************
     * Serialization
     */

    deserializeSelf: {
        value: function (deserializer) {
            var value;
            value = deserializer.getProperty("converters");
            if (value !== void 0) {
                this.converters = value;

            }
        }
    },

    serializeSelf: {
        value: function (serializer) {
            if (this.converters.length > 0) {
                serializer.setProperty("converters", this.converters);
            }
        }
    },

    /********************************************
     * Convert/Revert
     */

    /**
     * The converters to chain on convert()
     * @type {Converter[]}
     */
    converters: {
        value: undefined
    },


    convert: {
        value: function (value) {
            return this._convertWithConverterAtIndex(value, 0);
        }
    },

    _convertWithConverterAtIndex: {
        value: function (input, index) {
            var self = this,
                converter = this.converters[index],
                isFinalOutput = index === (this.converters.length - 1),
                output,
                isPromise,
                result;

            if (this.currentRule && converter) {
                converter.currentRule = converter.currentRule || this.currentRule;
            }
            if (this.registerMappedPropertiesAsChanged && converter) {
                converter.registerMappedPropertiesAsChanged = converter.registerMappedPropertiesAsChanged || this.registerMappedPropertiesAsChanged;
            }

            output = converter.convert(input);
            isPromise = this._isThenable(output);

            index++;



            if (isFinalOutput) {
                //Potentially breaking change here. The code was introducing a Promise in the output when none existed in any of the converter involved
                //WAS: result = isPromise ? output : Promise.resolve(output);
                //NOW: respecting the natural outcome of the pipeline's converters
                result = output;
            } else if (isPromise) {
                result = output.then(function (value) {
                    return self._convertWithConverterAtIndex(value, index);
                });
            } else {
                result = this._convertWithConverterAtIndex(output, index);
            }

            return result;
        }
    },

    _isThenable: {
        value: function (value) {
            return !!(value && value.then && typeof value.then === "function");
        }
    },


    revert: {
        value: function (value) {
            return this._revertWithConverterAtIndex(value, this.converters.length - 1);
        }
    },

    _revertWithConverterAtIndex: {
        value: function (input, index) {
            var self = this,
                converter = this.converters[index],
                output = converter.revert(input),
                isFinalOutput = index === 0,
                isPromise = this._isThenable(output),
                result;

            index--;

            if (isFinalOutput) {
                result = isPromise ? output : Promise.resolve(output);
            } else if (isPromise) {
                result = output.then(function (value) {
                    return self._revertWithConverterAtIndex(value, index);
                });
            } else {
                result = this._revertWithConverterAtIndex(output, index);
            }

            return result;
        }
    }

});
