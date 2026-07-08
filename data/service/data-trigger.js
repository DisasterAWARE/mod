var Montage = require("core/core").Montage,
    DataObjectDescriptor = require("../model/data-object-descriptor").DataObjectDescriptor,
    ModelObjectDescriptor = require("../model/object-descriptor").ObjectDescriptor,
    Map = require("core/collections/map"),
    Range = require("core/range").Range,
    //DataService requires DataTrigger before it sets itself on the exports object...
    //DataServiceModule = require("data/service/data-service"),
    ChangeEvent = require("core/event/change-event").ChangeEvent,
    DataTrigger;

/**
 * Intercepts all calls to get and set an object's property and triggers any
 * Montage Data action warranted by these calls.
 *
 * DataTrigger is a JavaScript Objects subclass rather than a Montage subclass
 * so data triggers can be as lightweight as possible: They need to be
 * lightweight because many will be created (one for each relationship or
 * lazily loaded property of each model class) and there's no benefit for them
 * to be derived from the Montage prototype because they don't use any of the
 * Montage class functionality.
 *
 * @private
 * @class
 * @extends Object
 */
DataTrigger = exports.DataTrigger = function () {};

exports.DataTrigger.prototype = Object.create(
    {},
    /** @lends DataTrigger.prototype */ {
        /**
         * The constructor function for all trigger instances.
         *
         * @type {function}
         */
        constructor: {
            configurable: true,
            writable: true,
            value: exports.DataTrigger,
        },

        /**
         * The service used by this trigger to perform Montage Data actions.
         *
         * Typically a number of triggers use the same service so this property
         * is defined in a single DataTrigger instance for each service and all
         * triggers that share that service are then derived from that instance.
         * This avoids the need for each trigger to have a reference to the service
         * it uses and saves memory. See
         * [_getTriggerPrototype()]{@link DataTrigger._getTriggerPrototype} for
         * the implementation of this behavior.
         *
         * @private
         * @type {Service}
         */
        _service: {
            configurable: true,
            writable: true,
            value: undefined,
        },

        /**
         * The prototype of objects whose property is managed by this trigger.
         *
         * @private
         * @type {Object}
         */
        _objectPrototype: {
            configurable: true,
            writable: true,
            value: undefined,
        },

        /**
         * The name of the property managed by this trigger.
         *
         * @private
         * @type {string}
         */
        _propertyName: {
            configurable: true,
            get: function () {
                return this.propertyDescriptor.name;
            },
        },

        /**
         * The property descriptor managed by this trigger.
         *
         * @private
         * @type {string}
         */
        propertyDescriptor: {
            configurable: true,
            writable: true,
            value: undefined,
        },

        /**
         * The name of the private property corresponding to the public property
         * managed by this trigger.
         *
         * The private property name is the
         * [_propertyName]{@link DataTrigger#_propertyName} value prefixed with an
         * underscore. To minimize the time and memory used by a trigger's call
         * intercepts this private property name is generated lazilly the first time
         * it is needed and then cached.
         *
         * @private
         * @type {string}
         */
        _privatePropertyName: {
            configurable: true,
            get: function () {
                if (!this.__privatePropertyName && this._propertyName) {
                    this.__privatePropertyName = "_" + this._propertyName;
                }
                return this.__privatePropertyName;
            },
        },

        /**
         * Whether this trigger is for a global property or not.
         *
         * When a trigger is global and the value of the trigger's property is
         * obtained or set for one object managed by the trigger then that
         * property's value is assumed to have also been obtained or set for all
         * objects managed by the trigger.
         *
         * Setting this value clears the
         * [_valueStatus]{@link DataTrigger#_valueStatus} and should only be done
         * before a trigger is used.
         *
         * @private
         * @type {string}
         */
        _isGlobal: {
            configurable: true,
            get: function () {
                // To save memory a separate _isGlobal boolean is not maintained and
                // the _isGlobal value is derived from the _valueStatus type.
                return !(this._valueStatus instanceof WeakMap);
                //return !(this._valueStatus instanceof Map);
            },
            set: function (global) {
                global = global ? true : false;
                if (global !== this._isGlobal) {
                    this._valueStatus = global ? undefined : new WeakMap();
                    //this._valueStatus = global ? undefined : new Map();
                }
            },
        },

        /**
         * For global triggers, holds the status of this trigger's property value.
         * For other triggers, holds a map from objects whose property is managed
         * by this trigger to the status of that property's value for each of those
         * objects.
         *
         * See [_getValueStatus()]{@link DataTrigger#_getValueStatus} for the
         * possible status values.
         *
         * @private
         * @type {Object|WeakMap}
         */
        __valueStatus: {
            configurable: true,
            writable: true,
            value: undefined,
        },
        _valueStatus: {
            configurable: true,
            get: function () {
                return this.__valueStatus;
            },
            set: function (value) {
                this.__valueStatus = value;
            },
        },

        /**
         * Gets the status of a property value managed by this trigger:
         *
         * - The status will be `undefined` when the value has not yet been
         *   requested or set.
         *
         * - The status will be `null` when the value was requested and has already
         *   been obtained or when it has been set.
         *
         * - When the value has been requested but is still in the process of being
         *   obtained, the status will be an object with a "promise" property set to
         *   a promise that will be resolved when the value is obtained and a
         *   "resolve" property set to a function that will resolve that promise.
         *
         * @private
         * @method
         * @argument {Object} object
         * @returns {Object}
         */
        _getValueStatus: {
            configurable: true,
            value: function (object) {
                return this._isGlobal ? this._valueStatus : this._valueStatus.get(object);
            },
        },

        /**
         * Sets the status of a property value managed by this trigger.
         *
         * See [_getValueStatus()]{@link DataTrigger#_getValueStatus} for the
         * possible status values.
         *
         * @private
         * @method
         * @argument {Object} object
         * @argument {Object} status
         */
        _setValueStatus: {
            configurable: true,
            value: function (object, status) {
                if (this._isGlobal) {
                    this._valueStatus = status;
                } else if (status !== undefined) {
                    this._valueStatus.set(object, status);
                } else {
                    this._valueStatus.delete(object);
                }

                return status;
            },
        },

        __valueGetter: {
            value: undefined,
            writable: true,
            configurable: true,
            enumerable: false,
        },

        _cacheValueGetter: {
            value: function () {
                var prototype,
                    descriptor,
                    getter,
                    propertyName = this._propertyName;

                // Search the prototype chain for a getter for this property,
                // starting just after the prototype that called this method.
                prototype = Object.getPrototypeOf(this._objectPrototype);
                while (prototype) {
                    descriptor = Object.getOwnPropertyDescriptor(prototype, propertyName);
                    getter = descriptor && descriptor.get;
                    prototype = !getter && Object.getPrototypeOf(prototype);
                }

                if (!getter) getter = null;

                this.__valueGetter = getter;
            },
        },

        _valueGetter: {
            get: function () {
                return this.__valueGetter !== undefined
                    ? this.__valueGetter
                    : this._cacheValueGetter() || this.__valueGetter;
            },
        },

        isToMany: {
            get: function () {
                return this.propertyDescriptor.cardinality !== 1;
            },
        },

        /**
         * @method
         * @param {Object} object           The object for which the trigger would get the value for 
         * @param {Boolean} shouldFetch     If false is passed, it will prevents a fetch it would otherwise have done. It's used as such by:
         *                                      - ExpressionDataMapping's _setObjectValueForPropertyDescriptor() 
         *                                      - DataTrigger's _setValue() that passes on shouldFetch and _initialValue it itself get from the caller, 
         *                                        which is ExpressionDataMapping's _assignObjectValueOrDefault() as of now.
         * @param {Object} _initialValue    The value to use as the initial value when the object's value for the property is still undefined, 
         *                                  which typically happens when objects are fetched and raw data is mapped to object's properties' values
         * @returns {Object}                The value for object for the property handled by the receiving DataTrigger
         *
         * #Performance #ToDo: Looks like the same walk-up logic
         * is going to be done many times for individual instances,
         * we should improve that.
         */

        /*
            FIX ME: a new object on which a property getter is invoked right now wouldn't return the default value if one is specified in the data model,
            the way ExpressionDataMapping _assignObjectValueOrDefault() does by using:

                const defaultValue = propertyDescriptor.defaultValue;
                const hasDefaultValue = propertyDescriptor.hasOwnProperty("defaultValue") && typeof defaultValue !== "undefined" && defaultValue !== null;

                BUT if we "burn-in" those values on instances, and they get saved, then it becomes value, even though it was never deliberately entered by a user
                and if default is changed later, that instance would still holds the value that was the previous value.
        */
        _getValue: {
            configurable: true,
            writable: true,
            value: function (object, shouldFetch, _initialValue) {
                var isDerivedProperty = !!this.propertyDescriptor.definition,
                    isRelationshipProperty = !!this.propertyDescriptor._valueDescriptorReference,
                    isCollectionProperty = this.isToMany || this.propertyDescriptor.collectionValueType !== undefined,
                    shouldSkipGetterFetchForScalar = !isDerivedProperty && !isRelationshipProperty && !isCollectionProperty;
                // if(shouldFetch === undefined && this._service.rootService._objectsBeingMapped.has(object) && !object.snapshot) {
                //     shouldFetch = false;
                // }

                /**
                 * Experiment to see if it would make sense to avoid triggering getObjectProperty during mapping?
                 */
                // if(!this._service.rootService._objectsBeingMapped.has(object)
                // ) {
                if (
                    shouldFetch !== false &&
                    !shouldSkipGetterFetchForScalar &&
                    this._getValueStatus(object) !== null &&
                    (!this.propertyDescriptor.definition || !this.propertyDescriptor.isDerived) &&
                    !this._service.isObjectCreated(object)
                ) {
                    /**
                     * if the trigger's property descriptor has a definition, there are 2 cases:
                     * 1. this._service.childServiceForType(this.propertyDescriptor.owner) might know how to process
                     * the whole expression server side, in which case we don't do anything and it will be handled in
                     * the back-end.
                     *
                     * 2. We have to take care of it client side, which means we have to get all expression requirements
                     * individually before it can be evaluated, so we'd have to do the equivalent of getObjectProperties()
                     * rather than just the usual this.getObjectProperty(object)
                     */

                    // Start an asynchronous fetch of the property's value if necessary.
                    this.getObjectProperty(object).catch((error) => {
                        console.error(this._propertyName + " DataTrigger: getObjectProperty error: ", error);
                    });
                }

                //}

                // Ensure to-Many properties are initialized to their collection type.
                if ((this.isToMany || this.propertyDescriptor.collectionValueType !== undefined)) {
                    this._ensureCollectionValue(object, _initialValue);
                } else if (this.propertyDescriptor.isMandatory  && this.propertyDescriptor.ownsValue) {
                    this._ensureMandatoryValue(object, _initialValue);
                }
                // Return the property's current value.
                return this._valueGetter ? this._valueGetter.call(object) : object[this._privatePropertyName];
            },
        },

        _localValueForObject: {
            value: function (object) {
                var value = object[this._privatePropertyName],
                    descriptor;

                if (value === undefined) {
                    descriptor = Object.getOwnPropertyDescriptor(object, this._propertyName);
                    if (descriptor && Object.prototype.hasOwnProperty.call(descriptor, "value")) {
                        value = descriptor.value;
                    }
                }

                return value;
            }
        },

        /**
         * @method
         * @argument {Object} object
         */
        _ensureCollectionValue: {
            value: function _ensureCollectionValue(object, _initialValue) {
                // When the property does not expect a collection value, nothing to do
                // if (!(this.isToMany || this.propertyDescriptor.collectionValueType !== undefined)) {
                //     return;
                // }

                //We need to consider the cardinalityRange of the property when creating the original collection 
                //value. 
                // If no _initialValue is passed in, the array created below should have a length equal to cardinalityRange.begin
                // If _initialValue is passed, let it go. The validation logic lower in the stack should handle that. 

                // Initialize to-Many to their collection type.
                if (
                    // Case 1: collection is not set at all
                    object[this._privatePropertyName] === undefined ||
                    // Case 2: collection is mandatory but null
                    (this.propertyDescriptor.isMandatory === true && object[this._privatePropertyName] === null)
                ) {
                    let valueClass;

                    /**
                     * TODO: We should deprecate collectionValueType for collectionDescriptor
                     * Which would give us directly, via the descriptor, the class to instantiate
                     * @see: https://github.com/PhrontHQ/mod/issues/12
                     *
                     * @Benoit: 2025-12-02
                     * This is a little bit odd that we have both defaultValue and collectionValueType
                     * on the propertyDescriptor to indicate the type of collection to instantiate.
                     * We should probably consolidate that.
                     */
                    switch (this.propertyDescriptor.collectionValueType) {
                        case "map":
                            valueClass = Map;
                            break;
                        case "set":
                            valueClass = Set;
                            break;
                        case "range":
                            valueClass = Range;
                            break;
                        case "list":
                        case "array":
                        // Fall back to Array if no specific collection type is specified
                        default:
                            valueClass = Array;
                            break;
                    }

                    let initValue;

                    if(_initialValue) {
                        if(_initialValue instanceof valueClass) {
                            initValue = _initialValue;
                        } else {
                            try {
                                //Try to morph it into the expected class
                                initValue = new valueClass(_initialValue);
                            } catch(error) {
                                throw "Could not create initial value of class "+valueClass.toString() + "from incompatible initial value: ", _initialValue;
                                // initValue = new valueClass();
                            }
                        }
                    } else {
                        initValue = new valueClass();
                    }

                    /*
                        if we have an _initialValue because the setter is called with a value and the getter was never called, then we use the value passed.
                        However after that in the setter's logic resumes, then the value passed and the value returned by this getter
                        will now be the same, and the logic in the setter will return early.

                        So in order to the system to know about the object getting an a collection value on the property, we need can have it dispatched when we put it on:
                        if false is sent all the time, the app doesn't fully load
                        With this as is, it does, but data is missing (directReports of person logged-in), and on further reload
                        when we read form the FB right away, sonething wonky happens.
                    */
                    this._setValue(object, /*value*/initValue, /*_dispatchChange*/(_initialValue && ((_initialValue.length === undefined ? _initialValue.size :_initialValue.length) > 0)) ? true : false, /*_initialValue*/undefined, /*_currentValue*/undefined);
                }
            },
        },

        _ensureMandatoryValue: {
            value: function (object, _initialValue) {
                if (
                    // Case 1: value is not set at all
                    object[this._privatePropertyName] === undefined ||
                    // Case 2: value is mandatory but null
                    (this.propertyDescriptor.isMandatory === true && object[this._privatePropertyName] === null && this.propertyDescriptor.ownsValue && this.propertyDescriptor._valueDescriptorReference)
                ) {
                    let valueDescriptor = this.propertyDescriptor._valueDescriptorReference,
                    initValue;

                    if (_initialValue) {
                        if (_initialValue.objectDescriptor === valueDescriptor) {
                            initValue = _initialValue;
                        }
                        // throw "Could not create initial value of class "+valueClass.toString() + "from incompatible initial value: ", _initialValue;
                                // initValue = new valueClass();
                    } 

                    if (!initValue) {
                        initValue = this.service.createDataObject(valueDescriptor);
                    }

                    this._setValue(object, initValue, false, undefined, undefined);
                }
            }
        },

        __valueSetter: {
            value: undefined,
            writable: true,
            configurable: true,
            enumerable: false,
        },
        _cacheValueSetter: {
            value: function () {
                var prototype,
                    descriptor,
                    getter,
                    setter,
                    writable,
                    propertyName = this._propertyName;

                // Search the prototype chain for a setter for this trigger's
                // property, starting just after the trigger prototype that caused
                // this method to be called.
                prototype = Object.getPrototypeOf(this._objectPrototype);
                while (prototype) {
                    descriptor = Object.getOwnPropertyDescriptor(prototype, propertyName);
                    getter = descriptor && descriptor.get;
                    setter = getter && descriptor.set;
                    writable = !descriptor || setter || descriptor.writable;
                    prototype = writable && !setter && Object.getPrototypeOf(prototype);
                }
                if (!setter) setter = null;

                this.__valueSetter = setter;
                this.__isPropertyWritable = writable;
            },
        },
        _valueSetter: {
            get: function () {
                return this.__valueSetter !== undefined
                    ? this.__valueSetter
                    : this._cacheValueSetter() || this.__valueSetter;
            },
        },

        __isPropertyWritable: {
            value: undefined,
            writable: true,
            configurable: true,
            enumerable: false,
        },
        _isPropertyWritable: {
            get: function () {
                return this.__isPropertyWritable !== undefined
                    ? this.__isPropertyWritable
                    : this._cacheValueSetter() || this.__isPropertyWritable;
            },
        },

        /**
         * Note that if a trigger's property value is set after that values is
         * requested but before it is obtained from the trigger's service the
         * property's value will only temporarily be set to the specified value:
         * When the service finishes obtaining the value the property's value will
         * be reset to that obtained value.
         *
         * 12/5/2024 — Except for collections where we merge values
         *
         * @method
         * @argument {Object} object
         * @argument {} value
         */
        _setAndObserveValue: {
            configurable: true,
            writable: true,
            value: function (object, initialValue, currentValue) {
                let isInitialValueArray = Array.isArray(initialValue);
                let isMap = !isInitialValueArray && initialValue instanceof Map;

                /**
                 * A range is a collection containing infinite values but it may not properly have a cardinality properly
                 * set as such, so we check this to be sure
                 */
                if (this.isToMany || this.propertyDescriptor.collectionValueType === "range") {
                    if (initialValue) {
                        var listener = this._collectionListener.get(object);
                        if (listener) {
                            if (isInitialValueArray) {
                                initialValue.removeRangeChangeListener(listener);
                            } else if (isMap) {
                                initialValue.removeMapChangeListener(listener);
                            }

                            if (!currentValue) {
                                this._collectionListener.delete(object);
                            }
                        }
                    }
                    if (currentValue) {
                        if (Array.isArray(currentValue)) {
                            var self = this,
                                listener = this._collectionListener.get(object);

                            if (!listener) {
                                listener = function _triggerArrayCollectionListener(plus, minus, index) {
                                    /*
                                        replacing with using the new .isEmpty to eliminate arrays
                                        that may be sparse or specifically contain undefined values.

                                        Some bindings can cause some arrays in those unusual states

                                        isEmpty true if an array has a length of zero or it only contains undefined values
                                    */
                                    //if (plus?.length > 0 || minus?.length > 0) {
                                    if (!plus?.isEmpty || !minus?.isEmpty) {
                                        // If we're not in the middle of a mapping...:
                                        // if(!self._service._objectsBeingMapped.has(object)) {
                                        // Dispatch update event
                                        var changeEvent = new ChangeEvent();
                                        changeEvent.target = object;
                                        changeEvent.key = self._propertyName;

                                        // This
                                        changeEvent.index = index;
                                        changeEvent.addedValues = plus;
                                        changeEvent.removedValues = minus;

                                        // Or this?
                                        // changeEvent.rangeChange = [plus, minus, index];

                                        // Or both with a getter/setter for index, addedValues and removedValues on top of rangeChange?

                                        // To deal with changes happening to an array value of that property,
                                        // we'll need to add/cancel observing on the array itself
                                        // and dispatch added/removed change in the array's change handler.
                                        if (!changeEvent.target.dispatchEvent) {
                                            console.warn(`Change Event target ${changeEvent.target.objectDescriptor.name} does not specialize Target so cannot dispatch event`)
                                            self._service.rootService.handleChange(changeEvent);
                                        } else {
                                            changeEvent.target.dispatchEvent(changeEvent);
                                        }
                                    }
                                };
                            } else {
                                console.debug(
                                    "previously created listener found for " +
                                        object.objectDescriptor.name +
                                        "." +
                                        self._propertyName
                                );
                            }

                            this._collectionListener.set(object, listener);
                            currentValue.addRangeChangeListener(listener);
                        } else if (currentValue instanceof Map) {
                            var self = this,
                                listener = function _triggerMapCollectionListener(value, key) {
                                    // If we're not in the middle of a mapping...:
                                    // if(!self._service._objectsBeingMapped.has(object)) {
                                    // Dispatch update event
                                    var changeEvent = new ChangeEvent();
                                    changeEvent.target = object;
                                    /**
                                     * Here we're saying the hosting object changed.
                                     * so maybe this should be called "property","propertyValue","previousPropertyValue"
                                     * which opens up the use of key for the content, for Map, but also key as index for an array.
                                     * We only support expressing changes on 1 index for array, happy coincidence!
                                     *
                                     * !!! What if we renamed
                                     *    - addedValues to added
                                     *        - for Array, added contains values added to the array (plus)
                                     *        - for Map, added contains one, or more pairs [key,values] as entries, when it's actually added
                                     *
                                     *    - removedValues to removed
                                     *        - for Array, removed contains values removed to the array (minus)
                                     *        - for Map, removed contains one, or more pairs [key,values] as entries, when it's actually deleted from the map
                                     *
                                     *    - key/keyValue represents a set on an object as well as a map, a mutation of something that was there.
                                     *        - For Array it's useful to use it for length on top of added/removed
                                     *
                                     *    - previousKeyValue if there contains the value before keyValue at key
                                     *
                                     */
                                    changeEvent.key = self._propertyName;
                                    // We set the whole Map() since we don't have the tools yet to express better
                                    changeEvent.keyValue = object[self._privatePropertyName];

                                    /**
                                     * Today, we'd have to listen to before change to know about the value that was previously under "key".
                                     * It wouldn't be very practical for the trigger to store somewhere that value, so it can reuse it here.
                                     * We probably can find a way. Another option could be to add the previous value to the arguments
                                     * passed to the listener, which wouldn't break existing code and allow us to be smarter.
                                     */
                                    // changeEvent.previousKeyValue = initialValue;

                                    /**
                                     * Look like we're missing in collections listen the semantic to exparess the fact that
                                     * a key is gone from the Map, vs the key being there and containing undefined?
                                     *
                                     * changeEvent.index makes no sense for a Map or an object, but it is similar to a key, it's a "slot"
                                     *
                                     * How could we express the disparition of a Key? We would need a removedKeys?
                                     */
                                    // We could use "key" for arrays and the value would be an integer
                                    // changeEvent.index = index;
                                    // changeEvent.addedValues = plus;
                                    // changeEvent.removedValues = minus;

                                    // Or this?
                                    // changeEvent.rangeChange = [plus, minus, index];

                                    // Or both with a getter/setter for index, addedValues and removedValues on top of rangeChange?
                                    // To deal with changes happening to an array value of that property,
                                    // we'll need to add/cancel observing on the array itself
                                    // and dispatch added/removed change in the array's change handler.
                                    // Bypass EventManager for now
                                    // self._service.rootService.handleChange(changeEvent);
                                    if (!changeEvent.target.dispatchEvent) {
                                        console.warn(`Change Event target ${changeEvent.target.objectDescriptor.name} does not specialize Target so cannot dispatch event`)
                                        self._service.rootService.handleChange(changeEvent);
                                    } else {
                                        changeEvent.target.dispatchEvent(changeEvent);
                                    }
                                    // }
                                };

                            this._collectionListener.set(object, listener);
                            currentValue.addMapChangeListener(listener);
                        } else if (currentValue instanceof Range) {
                            let self = this,
                                listener = function _triggerRangeListener(value, key, range) {
                                    // If we're not in the middle of a mapping...:
                                    // if(!self._service._objectsBeingMapped.has(object)) {
                                    // Dispatch update event
                                    var changeEvent = new ChangeEvent();
                                    changeEvent.target = object;
                                    changeEvent.key = self._propertyName;
                                    // We'd have to register for addOwnPropertyChangeListener with before argument to true to get it
                                    // changeEvent.previousKeyValue = initialValue;
                                    changeEvent.keyValue = currentValue;

                                    // Bypass EventManager for now
                                    if (!changeEvent.target.dispatchEvent) {
                                        console.warn(`Change Event target ${changeEvent.target.objectDescriptor.name} does not specialize Target so cannot dispatch event`)
                                        self._service.rootService.handleChange(changeEvent);
                                    } else {
                                        changeEvent.target.dispatchEvent(changeEvent);
                                    }
                                };

                            this._collectionListener.set(object, listener);
                            currentValue.addOwnPropertyChangeListener("begin", listener);
                            currentValue.addOwnPropertyChangeListener("end", listener);
                            currentValue.addOwnPropertyChangeListener("bounds", listener);
                        } else if (this.propertyDescriptor.isLocalizable) {
                            console.error(
                                "DataTrigger misses implementation to track changes on to-many localized property values"
                            );
                        } else {
                            console.error(
                                "DataTrigger misses implementation to track changes on property values that are neither Array nor Map"
                            );
                        }
                    }
                }
            },
        },
        
        
        /**
         * Note that if a trigger's property value is set after that values is
         * requested but before it is obtained from the trigger's service the
         * property's value will only temporarily be set to the specified value:
         * When the service finishes obtaining the value the property's value will
         * be reset to that obtained value.
         *
         * 12/5/2024 — Except for collections where we merge values
         *
         * @method
         * @param {Object} object       The object on which value should be set on the property handled by the receiving's trigger
         * @param {} value              the value to be set on "object" for the property handled by the receiving's trigger
         * @param {} _dispatchChange    allows caller to influence wether a change should dispatch a change event, defaults to true 
         * @param {} _initialValue      typically used during initialization, by ExpressionDataMapping's _assignObjectValueOrDefault() 
         *                              to pass the same  value as value and _initialValue, help understanding the context
         * @param {} _currentValue      uniquely used by _ensureCollectionValue() calling _setValue() with the same value for parameter "value" and parameter "_currentValue"
         *                              _currentValue instruct this setter that it is the value currently assigned to the property handled by that trigger on that object
         * 
         * Notes A: Should we allow user-land code to pass undefined as value? Probably not. 
         *        Internal callers, might make sense in case of a reset, if we're told there's been a change of value by someone else,
         *        but the value of that object's property isn't used/displayed anywhere to the user. Then if it were agaib, it would be refethed because then undefined
         */

        _setValue: {
            configurable: true,
            writable: true,
            value: function (object, value, _dispatchChange, _initialValue, _currentValue) {
                //let objectPropertyValue = this._getValue(object, /*shouldFetch*/false, /*_initialValue*/value);
                let objectPropertyValue = (arguments.length >= 5) ? _currentValue : this._getValue(object,  /*shouldFetch*/false, /*_initialValue*/value);
                //if (object[this._privatePropertyName] === value) return;

                //If objectPropertyValue - the value of the property we handle on object as we enter _setValue is the same as the one passed, then nothing to do
                //UNLESS, UNLESS, the _currentValue arument is passed, which is what _getValue() passes when it needs to set the mutable collection 
                //BUT when we come back from  _getValue() -> ensureValue() and this setter was the first time the property was interacted with, 
                // ie the getter was never invoked before, then for efficiency's sake, we store the value passed in
                // and avoid to create a new array. BUT that means that in that use case:
                // (objectPropertyValue === value && !(arguments.length >= 5)) is true and we bail too early
                if (objectPropertyValue === value && !(arguments.length >= 5)) return;

                var status,
                    prototype,
                    descriptor,
                    getter,
                    setter = this._valueSetter,
                    writable,
                    currentValue,
                    isInitialValueArray,
                    isMap,
                    initialValue,
                    dispatchChange = arguments.length >= 3 ? _dispatchChange : true,
                    //shouldFetch = !this._service.rootService._objectsBeingMapped.has(object);
                    //shouldFetch = undefined;
                    //If _initialValue is only going to be provided by mapping logic caller, that should work out 
                    shouldFetch = arguments.length >= 4 && _initialValue === undefined;

                // Get the value's current status and update that status to indicate
                // the value has been obtained. This way if the setter called below
                // requests the property's value it will get the value the property
                // had before it was set, and it will get that value immediately.
                status = this._getValueStatus(object);

                //FIXME - this is way more complicated than it should...
                //If _initialValue is null from mapping, but this.isToMany is true or if's a range, then we want  this._getValue() to call this._ensureCollectionValue() and have the proper collection set there, and observed by _getValue() calling .setValue().
                //If _initialValue is not null from mapping and this.isToMany is true or if's a range, then we want  this._getValue() to call this._ensureCollectionValue() and have the proper collection set there, and observed by _getValue() calling .setValue().
                // if((this.isToMany || this.propertyDescriptor.collectionValueType === "range") && _initialValue !== undefined) {
                //     initialValue = this._getValue(object, shouldFetch, _initialValue);
                // } else {
                //     //initialValue = arguments.length >= 4 ? _initialValue : this._getValue(object, shouldFetch, _initialValue);
                //     //initialValue = arguments.length >= 4 ? _initialValue : objectPropertyValue;
                //     initialValue = objectPropertyValue;
                // }
                    initialValue = objectPropertyValue;

                // initialValue = arguments.length >= 4
                //     ? _initialValue
                //     : (!object.snapshot && this._service.rootService._objectsBeingMapped.has(object))
                //         ? undefined
                //         : this._getValue(object, shouldFetch);
                // If Array / to-Many
                isInitialValueArray = Array.isArray(initialValue);
                isMap = !isInitialValueArray && initialValue instanceof Map;

                // Set this trigger's property to the desired value, but only if
                // that property is writable.
                if (setter) {
                    setter.call(object, value);
                    //currentValue = value;
                } else if (this._isPropertyWritable) {
                    /**
                     * This is going to broacast the change, which the DataService listens to.
                     * The only way we have right now to tell if a change happens from an internal fetch
                     * is:
                     *    this._getValueStatus(object), which returns a promise related to fetching that value
                     * but to accommodate a potential setter right up, we're doing
                     *    this._setValueStatus(object, null);
                     * Which remove the ability for DataService.mainService to tell the difference.
                     *
                     * So we're going to re-set the status to hold the promise.
                     * And we'll clear it again below as we resolve the promise.
                     */
                    //this._setValueStatus(object, status);

                    if (this.isToMany) {
                        if (isInitialValueArray) {
                            /**
                             * this._getValue() sets object[this._privatePropertyName] to [] via calling this
                             */
                            if (value?.length) {

                                //If the setter is called with a different array but identical to our instance variable, there's no point making noise
                                if(!value.equals(object[this._privatePropertyName])) {

                                    // object[this._privatePropertyName].splice.apply(initialValue, [0, initialValue.length].concat(value));
                                    object[this._privatePropertyName].splice.call(
                                        initialValue,
                                        0,
                                        initialValue.length,
                                        ...value
                                    );
                                }

                            }
                        } else if (isMap && value) {
                            // We want to maintain the same map,
                            var map = object[this._privatePropertyName],
                                //iterator are "lives" until used, so we make a copy
                                mapIterator = new Set(map.keys()).values(),
                                valueIterator = value.keys(),
                                iKey;

                            // Add what we don't have, and set if value different for same key
                            while ((iKey = valueIterator.next().value)) {
                                if (!map.has(iKey)) {
                                    map.set(iKey, value.get(iKey));
                                } else if (map.get(iKey) !== value.get(iKey)) {
                                    map.set(iKey, value.get(iKey));
                                }
                            }

                            // Remove what we had that's not in value
                            while ((iKey = mapIterator.next().value)) {
                                if (!value.has(iKey)) {
                                    map.delete(iKey);
                                }
                            }
                        } else {
                            object[this._privatePropertyName] = value;
                        }
                    } else {
                        object[this._privatePropertyName] = value;
                    }
                }

                //undefined should never be set from the inside as part of the mapping as undefined is the state we expect before mapping / fetching of the value of a property
                //_currentValue is only there, (arguments.length >= 5) when we're called by _getValue() -> _ensureCollectionValue(), as the first time a collection is accessed, the _currentValue would be undefined
                //And in this case, we already assigned it to the private variable line 830, so it's value now
                currentValue = (arguments.length >= 5) ? value : this._getValue(object, shouldFetch);
                // currentValue = arguments.length >= 5
                //     ? _currentValue
                //     : (!object.snapshot && this._service.rootService._objectsBeingMapped.has(object))
                //         ? undefined
                //         : this._getValue(object, shouldFetch);

                if (currentValue !== initialValue) {
                    this._setAndObserveValue(object, initialValue, currentValue);
                }

                // addRangeChangeListener

                // If we're not in the middle of a mapping...:
                //If this.isToMany, value could be a different instance passed in
                //but we stick to our mutable collection once we have one, in which case
                //  currentValue should be the same as initialValue
                if (
                    currentValue !== initialValue &&
                    dispatchChange /*&& (!this._service._objectsBeingMapped.has(object) || this._service.isObjectCreated(object))*/
                ) {
                    //Dispatch update event
                    var changeEvent = new ChangeEvent();
                    changeEvent.target = object;
                    changeEvent.key = this._propertyName;
                    changeEvent.previousKeyValue = initialValue;
                    changeEvent.keyValue = currentValue;
                    changeEvent.propertyDescriptor = this.propertyDescriptor;

                    // To deal with changes happening to an array value of that property,
                    // we'll need to add/cancel observing on the array itself
                    // and dispatch added/removed change in the array's change handler.

                    // Bypass EventManager for now
                    
                    if (!changeEvent.target.dispatchEvent) {
                        console.warn(`Change Event target ${changeEvent.target.objectDescriptor.name} does not specialize Target so cannot dispatch event`)
                        this._service.rootService.handleChange(changeEvent);
                    } else {
                        changeEvent.target.dispatchEvent(changeEvent);
                    }
                    
                }

                // Resolve any pending promise for this trigger's property value.
                if (status) {
                    // this._setValueStatus(object, null);
                    status.resolve(currentValue);
                }
                this._setValueStatus(object, null);

            },
        },

        __collectionListener: {
            value: undefined,
            writable: true,
            configurable: true,
            enumerable: false,
        },

        _collectionListener: {
            get: function () {
                return this.__collectionListener || (this.__collectionListener = new WeakMap());
            },
        },

        /**
         * @todo Rename and document API and implementation.
         *
         * @method
         */
        decacheObjectProperty: {
            value: function (object) {
                this._setValueStatus(object, undefined);
            },
        },

        /**
         * Request a fetch of the value of this trigger's property for the
         * specified object but only if that data isn't already in the process
         * of being obtained and only if it wasn't previously obtained or
         * set. To unconditionally request a fetch of this property data use
         * [updateObjectProperty()]{@link DataTrigger#updateObjectProperty}.
         *
         * @method
         * @argument {Object} object
         * @returns {external:Promise}
         */
        getObjectProperty: {
            value: function (object) {
                /**
                 * If the object is not created and not saved, we fetch the value
                 *
                 * In some cases, a new object created in-memory, with enough data set on it,
                 * might be able to read some property that might be derived from the raw values of the property already set on it.
                 * So let's leave the bottom layers to figure that out.
                 */
                // if(!this._service.isObjectCreated(object)) {
                var status = this._getValueStatus(object);

                return status
                    ? status.promise
                    : status === null
                    ? this._service.nullPromise
                    : this.updateObjectProperty(object);

                // Attempt to avoid fetching if there's a local value, but if it's a toMany
                // It's an empty array and that _setValueStatus to null which means we won't fetch it ever
                //     var status = this._getValueStatus(object),
                //     value;
                // return  status
                //             ? status.promise
                //             : status === null
                //                 ? this._service.nullPromise
                //                 : (value = this._getValue(object, false)) !== undefined
                //                     ? this._setValueStatus(object, null) && value
                //                     : this.updateObjectProperty(object);

                // } else {
                //     /*
                //         else the object is just created, not saved, no point fetching
                //         we wouldn't find anything anyway
                //     */

                //   this._setValueStatus(object, null);
                //     return this._service.nullPromise;
                // }
            },
        },

        /**
         * If the value of this trigger's property for the specified object isn't in
         * the process of being obtained, request the most up to date value of that
         * data from this trigger's service.
         *
         * @method
         * @argument {Object} object
         * @returns {external:Promise}
         */
        updateObjectProperty: {
            value: function (object, isUpdate = false) {
                var self = this,
                    status = this._getValueStatus(object) || this._setValueStatus(object, {});
                if (!status.promise) {
                    //this._setValueStatus(object, status);
                    status.promise = new Promise(function (resolve, reject) {
                        status.resolve = resolve;
                        status.reject = reject;
                    });
                    self._fetchObjectProperty(object, isUpdate);
                }
                // Return the existing or just created promise for this data.
                return status.promise;
            },
        },

        /**
         * @private
         * @method
         * @argument {Object} object
         * @returns {external:Promise}
         */
        _fetchObjectProperty: {
            value: function (object, isUpdate) {
                var self = this;
                //console.log("data-trigger: _fetchObjectProperty "+this._propertyName,object );
                this._service
                    .fetchObjectProperty(object, this._propertyName, /*isObjectCreated*/ this._service.isObjectCreated(object), isUpdate)
                    .then((propertyValue) => {
                        this._service._objectsBeingMapped.add(object);

                        /**
                         * If there's a propertyValue, it's the actual result of the fetch
                         * and bipassed the existing path where the mapping would have added the value
                         * on object by the time we get back here. So since it wasn't done, we do it here.
                         */
                        if (propertyValue === null) {
                            let localValue = self._localValueForObject(object);
                            if (isUpdate || localValue === undefined || localValue === null) {
                                object[self._propertyName] = propertyValue;
                            } else {
                                console.warn(
                                    "property " + self._propertyName + "'s value was resolved by fetch to null,",
                                    "but current value is now: ",
                                    localValue
                                );
                            }
                        } else if (propertyValue) {
                            /**
                             * If there's no value at all on the object, we go ahead and set it
                             */
                            let localValue = self._localValueForObject(object);
                            if (!localValue) {
                                if (self.propertyDescriptor.cardinality > 1) {
                                    object[self._propertyName] = propertyValue;
                                } else if (
                                    /**
                                     * When we fetch a property of an object that's not a relationship,
                                     * typically a basic type, the value is returned and mapped to the existing object already.
                                     * If that's the case, propertyValue[0] would be the object itself.
                                     * If that's the case, then there's nothing to do.
                                     *
                                     * Benoit: 5/5/2022 - FIXME. We need to assess wether we'd propertyValue could be return
                                     * as a value in an array for a to-one, or just the objecy as expected.
                                     * Adding a check for that as the code apparently expected an array with only a value in it.
                                     */
                                    (propertyValue = Array.isArray(propertyValue)
                                        ? propertyValue[0]
                                        : propertyValue) !== object
                                ) {
                                    object[self._propertyName] = propertyValue;
                                }
                            } else if (self.propertyDescriptor.cardinality > 1) {

                                    /**
                                     * We now initialize to-Many to empty array/collections.
                                     * So if there's an empty value on the object, we fill, if it has values, we merge
                                     */
                                    if (Array.isArray(localValue) && propertyValue.length > 0) {
                                        if (self.propertyDescriptor.hasUniqueValues && localValue.length > 0) {
                                            for (let iValue of propertyValue) {
                                                if (!localValue.includes(iValue)) {
                                                    localValue.push(iValue);
                                                }
                                            }
                                        } else {
                                            localValue.push(...propertyValue);
                                        }
                                    } else if (localValue instanceof Set && localValue.size > 0) {
                                        localValue.addEach(propertyValue);
                                    } else if (localValue instanceof Map && localValue.size > 0) {
                                        localValue.addEach(propertyValue);
                                    }

                            } else if (
                                /**
                                 * We should not be in a position where a property is fetched for a toOne/type and there's already a value,
                                 * unless it was set by client code while the fetch was happening. We should ideally tell the user as this is
                                 * really an update, and hopefully the stack will treat as such.
                                 *
                                 * TODO: VERIFY that a property set before it is fetched ends up being processed as an update.
                                 */
                                Array.isArray(propertyValue)
                                    ? propertyValue[0] !== undefined && propertyValue[0] !== localValue
                                    : propertyValue !== localValue
                            ) {
                                console.warn(
                                    "property " + self._propertyName + "'s value was resolved by fetch to ",
                                    propertyValue,
                                    ", but current value is now: ",
                                    object[self._propertyName]
                                );
                            }
                        }
                        self._service._objectsBeingMapped.delete(object);
                        return self._fulfillObjectPropertyFetch(object, /*error*/ undefined, propertyValue);
                    })
                    .catch((error) => {
                        console.error(
                            'DataTrigger Error _fetchObjectProperty for property "' + self._propertyName + '"',
                            error
                        );
                        self._service._objectsBeingMapped.delete(object);
                        return self._fulfillObjectPropertyFetch(object, error);
                    });
            },
        },

        _fulfillObjectPropertyFetch: {
            value: function (object, error, propertyValue) {
                var status = this._getValueStatus(object);
                this._setValueStatus(object, null);
                if (status && !error) {
                    status.resolve(propertyValue);
                } else if (status && error) {
                    console.error(error);
                    status.reject(error);
                }
                return null;
            },
        },
    }
);

var DataTriggerClassMethods;
Object.defineProperties(
    exports.DataTrigger,
    /** @lends DataTrigger */ (DataTriggerClassMethods = {
        /**
         * @method
         * @argument {DataService} service
         * @argument {Object} prototype
         * @argument {Set} property names to exclude from triggers.
         * @returns {Object.<string, DataTrigger>}
         */
        addTriggers: {
            value: function (service, type, prototype, requisitePropertyDescriptors) {
                // This function was split into two to provide backwards compatibility
                // to existing Montage data projects.  Future montage data projects
                // should base their object descriptors on Montage's version of object
                // descriptor.
                var isMontageDataType = type instanceof DataObjectDescriptor || type instanceof ModelObjectDescriptor;
                return isMontageDataType
                    ? this._addTriggersForMontageDataType(service, type, prototype, name)
                    : this._addTriggers(service, type, prototype, requisitePropertyDescriptors);
            },
        },

        _addTriggersForMontageDataType: {
            value: function (service, type, prototype) {
                var triggers = {},
                    propertyDescriptors = Object.keys(type.propertyDescriptors),
                    trigger,
                    iPropertyDescriptor,
                    i;

                for (i = 0; (iPropertyDescriptor = propertyDescriptors[i]); ++i) {
                    /**
                     * If a property isn't serializable, then there's no point trying to get it,
                     * from any kind of storage, so no need for a DataTrigger for it.
                     */
                    if (iPropertyDescriptor.isSerializable !== false) {
                        trigger = this.addTrigger(service, type, prototype, iPropertyDescriptor);
                        if (trigger) {
                            triggers[iPropertyDescriptor.name] = trigger;
                        }
                    }
                }
                return triggers;
            },
        },

        _addTriggers: {
            value: function (service, objectDescriptor, prototype, requisitePropertyDescriptors) {
                var triggers = {},
                    propertyDescriptors = objectDescriptor.propertyDescriptors;

                if (propertyDescriptors) {
                    for (
                        let i = 0, propertyDescriptor, trigger;
                        (propertyDescriptor = propertyDescriptors[i]);
                        i += 1
                    ) {
                        /**
                         * If a property isn't serializable, then there's no point trying to get it,
                         * from any kind of storage, so no need for a DataTrigger for it.
                         */
                        if (propertyDescriptor.isSerializable !== false) {
                            trigger = this.addTrigger(service, objectDescriptor, prototype, propertyDescriptor);
                            if (trigger) {
                                triggers[propertyDescriptor.name] = trigger;
                            }
                        }
                    }
                }

                return triggers;
            },
        },

        /**
         * @method
         * @argument {DataService} service
         * @argument {Object} prototype
         * @argument {string} name
         * @returns {?DataTrigger}
         */
        addTrigger: {
            value: function (service, type, prototype, propertyDescriptor) {
                // This function was split into two to provide backwards compatibility
                // to existing Montage data projects.  Future montage data projects
                // should base their object descriptors on Montage's version of object
                // descriptor.
                var isMontageDataType = type instanceof DataObjectDescriptor || type instanceof ModelObjectDescriptor;
                return isMontageDataType
                    ? this._addTriggerForMontageDataType(service, type, prototype, propertyDescriptor.name)
                    : this._addTrigger(service, type, prototype, propertyDescriptor);
            },
        },

        _addTriggerForMontageDataType: {
            value: function (service, type, prototype, name) {
                var descriptor = type.propertyDescriptors[name],
                    trigger;
                if (descriptor && descriptor.isRelationship) {
                    trigger = Object.create(this._getTriggerPrototype(service));
                    trigger._objectPrototype = prototype;
                    trigger.propertyDescriptor = descriptor;
                    trigger._isGlobal = descriptor.isGlobal;
                    Montage.defineProperty(prototype, name, {
                        get: function (shouldFetch) {
                            return trigger._getValue(this, shouldFetch);
                        },
                        set: function (value) {
                            trigger._setValue(this, value);
                        },
                    });
                }
                return trigger;
            },
        },

        /**
         * #Performance #ToDO: Here we're creating a trigger instance right away
         * when we could do it only when the defineProperty get/set are called.
         * This means this method wouldn't return the trigger which is added
         * by caller in service._getTriggersForObject. Instead, when created in the
         * get/set, we would added it to the service's ._getTriggersForObject.
         * First draft is bellow, working with bugs, need baking
         *
         * @private
         * @method
         * @argument {DataService} service
         * @argument {ObjectDescriptor} objectDescriptor
         * @argument {Object} prototype
         * @argument {String} name
         * @returns {DataTrigger}
         */
        _createTrigger: {
            value: function (service, objectDescriptor, prototype, name, propertyDescriptor) {
                var trigger = Object.create(this._getTriggerPrototype(service)),
                    serviceTriggers = service._dataObjectTriggers.get(objectDescriptor);
                trigger._objectPrototype = prototype;
                trigger.propertyDescriptor = propertyDescriptor;
                trigger._isGlobal = propertyDescriptor.isGlobal;
                if (!serviceTriggers) {
                    serviceTriggers = {};
                    service._dataObjectTriggers.set(objectDescriptor, serviceTriggers);
                }
                serviceTriggers[name] = trigger;
                return trigger;
            },
        },

        _addTrigger: {
            value: function (service, objectDescriptor, prototype, descriptor) {
                // var descriptor = objectDescriptor.propertyDescriptorForName(name),
                var trigger;
                if (descriptor) {
                    trigger = Object.create(this._getTriggerPrototype(service));
                    trigger._objectPrototype = prototype;
                    trigger.propertyDescriptor = descriptor;
                    trigger._isGlobal = descriptor.isGlobal;

                    var definition = descriptor.definition;
                    if (definition) {
                        /**
                         * As we create the binding for a definition like "propertyA.propertyB", we will endup doing
                         * fetchObjectProperty for propertyA, and later calling propertyB on the result of fetching propertyA.
                         * This is highly inneficient and we need to find a way to fetch propertyA with a readExpression of propertyB.
                         *
                         * By the time we reach fetchObjectProperty, that info is lost, so we need to find a way to carry it in.
                         *
                         * Every property change observer/listener is an opportunity to collect what "comes next",
                         * but it's only available on defineBinding, as after it's dynamically added once instances are
                         *  in memory which is too late.
                         */
                        var propertyDescriptor;
                        if (typeof definition === "string") {
                            propertyDescriptor = {
                                get: function (shouldFetch) {
                                    if (!this.getBinding(descriptor.name)) {
                                        /**
                                         * This allows us to eventually fetch directly the equivalent of the expression and set it directly.
                                         */
                                        this.defineBinding(descriptor.name, {
                                            "<-": "_" + descriptor.name + " || (" + definition + ")",
                                        });
                                    }
                                    return trigger._getValue(this, shouldFetch);
                                    // return (trigger||(trigger = DataTrigger._createTrigger(service, objectDescriptor, prototype, name,descriptor)))._getValue(this);
                                },
                            };
                        } else if (typeof definition === "object") {
                            propertyDescriptor = {
                                get: function (shouldFetch) {
                                    if (!this.getBinding(trigger._privatePropertyName)) {
                                        /**
                                         * This allows us to eventually fetch directly the equivalent of the expression and set it directly.
                                         */
                                        // this.defineBinding(descriptor.name, {"<-": "_"+descriptor.name});
                                        this.defineBinding(trigger._privatePropertyName, {
                                            source: this,
                                            args: definition.args,
                                            compute: definition.compute,
                                        });

                                        /**
                                         * Once the binding is in place, redefine the getter to just return the private property,
                                         * avoiding to have to test this.getBinding(trigger._privatePropertyName) every time...
                                         */
                                        Montage.defineProperty(this, descriptor.name, {
                                            get: function (shouldFetch) {
                                                return trigger._getValue(this, shouldFetch);
                                            },
                                        });
                                    }
                                    return trigger._getValue(this, shouldFetch);
                                    // return (trigger||(trigger = DataTrigger._createTrigger(service, objectDescriptor, prototype, name,descriptor)))._getValue(this);
                                },
                            };
                        }

                        if (!descriptor.readonly) {
                            propertyDescriptor.set = function (value, _dispatchChange, _initialValue, _currentValue) {
                                arguments.length === 1
                                    //Called via regular setter
                                    ? trigger._setValue(this, value)
                                    //Called from inside the framework with extra arguments
                                    : trigger._setValue(this, value, _dispatchChange, _initialValue, _currentValue);
                                // (trigger||(trigger = DataTrigger._createTrigger(service, objectDescriptor, prototype, name,descriptor)))._setValue(this, value);
                            };
                        }
                        Montage.defineProperty(prototype, descriptor.name, propertyDescriptor);
                    } else {
                        Montage.defineProperty(prototype, descriptor.name, {
                            get: function (shouldFetch) {
                                // if(trigger._privatePropertyName === "origin") {
                                //     debugger;
                                //     console.log("here");
                                // }
                                return trigger._getValue(this, shouldFetch);
                                // return (trigger||(trigger = DataTrigger._createTrigger(service, objectDescriptor, prototype, name,descriptor)))._getValue(this);
                            },
                            set: function (value, _dispatchChange, _initialValue, _currentValue) {
                                arguments.length === 1
                                    //Called via regular setter
                                    ? trigger._setValue(this, value)
                                    //Called from inside the framework with extra arguments
                                    : trigger._setValue(this, value, _dispatchChange, _initialValue, _currentValue);
                                // (trigger||(trigger = DataTrigger._createTrigger(service, objectDescriptor, prototype, name,descriptor)))._setValue(this, value);
                            },
                        });
                    }
                }
                return trigger;
            },
        },

        /**
         * To avoid having each trigger hold a reference to the service it uses, all
         * triggers that use a service are derived from a prototype that contains
         * this references. See [_service]{@link DataTrigger#_service} for details.
         *
         * @private
         * @method
         * @argument {DataService} service
         * @returns {DataTrigger}
         */
        _getTriggerPrototype: {
            value: function (service) {
                var trigger = this._triggerPrototypes && this._triggerPrototypes.get(service);
                if (!trigger) {
                    trigger = new this();
                    trigger._service = service;
                    this._triggerPrototypes = this._triggerPrototypes || new WeakMap();
                    this._triggerPrototypes.set(service, trigger);
                }
                return trigger;
            },
        },

        /**
         * @method
         * @argument {Object.<string, DataTrigger>} triggers
         * @argument {Object} prototype
         */
        removeTriggers: {
            value: function (triggers, prototype) {
                var triggerNames = Object.keys(triggers),
                    name,
                    i;
                for (i = 0; (name = triggerNames[i]); ++i) {
                    this.removeTrigger(triggers[name], prototype, name);
                }
            },
        },

        /**
         * @method
         * @argument {DataTrigger} trigger
         * @argument {Object} prototype
         */
        removeTrigger: {
            value: function (trigger, prototype) {
                if (trigger) {
                    delete prototype[trigger.name];
                }
            },
        },
    })
);

//Temporary share on exports for subclasses to use.
exports._DataTriggerClassMethods = DataTriggerClassMethods;
