const { ExpressionValidationRule } = require("./expression-validation-rule");

var Montage = require("../core").Montage,
    Target = require("../target").Target,
    DerivedDescriptor = require("./derived-descriptor").DerivedDescriptor,
    EventDescriptor = require("./event-descriptor").EventDescriptor,
    Map = require("../collections/map"),
    ModelModule = require("./model"),
    Promise = require("../promise").Promise,
    PropertyDescriptor = require("./property-descriptor").PropertyDescriptor,
    Set = require("../collections/set"),
    parse = require("../frb/parse"),
    SyntaxInOrderIterator = require("core/frb/syntax-iterator").SyntaxInOrderIterator,
    deprecate = require("../deprecate");

var Defaults = {
    name: "default",
    customPrototype: false,
};

/**
 * @class ObjectDescriptor
 * @extends Target
 */

var ObjectDescriptor = (exports.ObjectDescriptor = class ObjectDescriptor extends Target {
    /** @lends ObjectDescriptor */
    constructor() {
        super();
        // this._eventDescriptors = [];
        this._ownPropertyDescriptors = [];
        this._ownValidationRules = [];

        this._propertyDescriptorGroups = {};
        this._eventPropertyDescriptorsTable = new Map();
        this.defineBinding("eventDescriptors", { "<-": "_eventDescriptors.concat(parent.eventDescriptors)" });
        this.defineBinding("localizablePropertyNames", { "<-": "localizablePropertyDescriptors.name" });

        /**
         * Returns all property descriptors that have isUnique set to true
         * @property {Array<PropertyDescriptor>} value
         */
        this.defineBinding("uniquePropertyDescriptors", {
            "<-": "_ownPropertyDescriptors.filter{isUnique == true}.concat(parent.uniquePropertyDescriptors)",
        });
    }
});

ObjectDescriptor.addClassProperties(
    {
        FileExtension: {
            value: ".mjson",
        },

        /**
         * @function
         * @param {string} name The name of the object descriptor
         * @returns itself
         */
        initWithName: {
            value: function (name) {
                this._name = name !== null ? name : "default";
                this.customPrototype = false;

                return this;
            },
        },

        serializeSelf: {
            value: function (serializer) {
                serializer.setProperty("name", this.name);
                serializer.setProperty("description", this.description);
                if (this._model && !this.model.isDefault) {
                    serializer.setProperty("model", this._model, "reference");
                }

                if (this.objectDescriptorInstanceModule) {
                    serializer.setProperty("objectDescriptorModule", this.objectDescriptorInstanceModule);
                }
                if (this._parent) {
                    serializer.setProperty("parent", this._parent);
                }

                this._setPropertyWithDefaults(serializer, "customPrototype", this.customPrototype);
                //
                if (this._ownPropertyDescriptors.length > 0) {
                    if (!this._propertyDescriptorsAreCached) {
                        this._preparePropertyDescriptorsCache();
                    }

                    serializer.setProperty("propertyDescriptors", this._ownPropertyDescriptors);
                }
                if (Object.getOwnPropertyNames(this._propertyDescriptorGroups).length > 0) {
                    serializer.setProperty("propertyDescriptorGroups", this._propertyDescriptorGroups);
                }
                if (this._eventDescriptors.length > 0) {
                    serializer.setProperty("eventDescriptors", this._eventDescriptors);
                }
                if (this._ownValidationRules && this._ownValidationRules.length > 0) {
                    serializer.setProperty("validationRules", this._ownValidationRules);
                }
                if (typeof this.maxAge === "number") {
                    serializer.setProperty("maxAge", this.maxAge);
                }

                if (this.userInterfaceDescriptorModules) {
                    serializer.setProperty("userInterfaceDescriptorModules", this.userInterfaceDescriptorModules);
                }
            },
        },

        deserializeSelf: {
            value: function (deserializer) {
                var value, model, parentReference;
                value = deserializer.getProperty("name");

                if (value !== void 0) {
                    this._name = value;
                }
                value = deserializer.getProperty("description");
                if (value !== void 0) {
                    this.description = value;
                }
                value = deserializer.getProperty("model") || deserializer.getProperty("binder");
                if (value) {
                    this._model = value;
                }
                value =
                    deserializer.getProperty("objectDescriptorModule") || deserializer.getProperty("blueprintModule");
                if (value !== void 0) {
                    this.objectDescriptorInstanceModule = value;
                }
                parentReference = deserializer.getProperty("parent");
                if (parentReference) {
                    if (parentReference.promise && parentReference.valueFromReference) {
                        deprecate.deprecationWarningOnce(
                            "parent reference via ObjectDescriptorReference",
                            "direct reference with object syntax"
                        );
                        this._parentReference = parentReference;
                    } else {
                        this.parent = parentReference;
                    }
                }

                this.customPrototype = this._getPropertyWithDefaults(deserializer, "customPrototype");

                value =
                    deserializer.getProperty("propertyDescriptors") || deserializer.getProperty("propertyBlueprints");
                if (value) {
                    //In case an object is deserialized several times, we merge the propertyDescriptors
                    this._ownPropertyDescriptors
                        ? this._ownPropertyDescriptors.push.apply(this._ownPropertyDescriptors, value)
                        : (this._ownPropertyDescriptors = value);
                }

                value =
                    deserializer.getProperty("propertyDescriptorGroups") ||
                    deserializer.getProperty("propertyBlueprintGroups");
                if (value) {
                    let _propertyDescriptorGroups = this._propertyDescriptorGroups;
                    if (_propertyDescriptorGroups && Object.keys(_propertyDescriptorGroups) > 0) {
                        for (
                            let i = 0, keys = Object.keys(value), countI = keys.length, iKey, iValue, oValue;
                            i < countI;
                            i++
                        ) {
                            iValue = value[(iKey = keys[i])];
                            oValue = _propertyDescriptorGroups[iKey];
                            if (iValue && oValue) {
                                //Merge
                                if (iValue instanceof Array) {
                                    _propertyDescriptorGroups.push.apply(_propertyDescriptorGroups, iValue);
                                } else {
                                    //Overwrite
                                    _propertyDescriptorGroups[iKey] = iValue;
                                }
                            } else {
                                _propertyDescriptorGroups[iKey] = iValue;
                            }
                        }
                    } else {
                        this._propertyDescriptorGroups = value;
                    }
                }
                value = deserializer.getProperty("eventDescriptors") || deserializer.getProperty("eventBlueprints");
                if (value) {
                    this._eventDescriptors
                        ? this._eventDescriptors.push.apply(this._eventDescriptors, value)
                        : (this._eventDescriptors = value);
                }

                // Validation Rules
                value = deserializer.getProperty("validationRules");

                if (value) {
                    // In case an object is deserialized several times, we merge the validationRules
                    this._ownValidationRules
                        ? this._ownValidationRules.push.apply(this._ownValidationRules, value)
                        : (this._ownValidationRules = value);
                }

                // maxAge
                value = deserializer.getProperty("maxAge");
                if (value) {
                    this.maxAge = value;
                }
                value = deserializer.getProperty("userInterfaceDescriptorModules");
                if (value) {
                    this.userInterfaceDescriptorModules
                        ? this.userInterfaceDescriptorModules.push.apply(this.userInterfaceDescriptorModules, value)
                        : (this.userInterfaceDescriptorModules = value);
                }
            },
        },

        _setPropertyWithDefaults: {
            value: function (serializer, propertyName, value) {
                if (value !== Defaults[propertyName]) {
                    serializer.setProperty(propertyName, value);
                }
            },
        },

        _getPropertyWithDefaults: {
            value: function (deserializer, propertyName) {
                return deserializer.getProperty(propertyName) || this[propertyName] || Defaults[propertyName];
            },
        },

        /**
         * Description of the concept/intention behind what an ObjectDescriptor is and does.
         *
         * Intended to document for people.
         *
         * @returns {string} this.description
         */

        description: {
            value: undefined,
        },

        _name: {
            value: null,
        },

        _toString: {
            value: null,
        },

        toString: {
            value: function () {
                return (
                    this._toString ||
                    (this._toString = `${this.objectDescriptorInstanceModule.require.packageDescription.name}/${this.objectDescriptorInstanceModule.id}`)
                );
            },
        },

        /**
         * Name of the object. The name is used to define the property on the object.
         *
         * This is an accessor. It is not writable or observable.
         *
         * @returns {string} this._name
         */
        name: {
            get: function () {
                return this._name;
            },
            set: function (value) {
                if (this._name !== value) {
                    this._name = value;
                }
            },
        },

        /**
         * This is the canonical way of creating managed objects prototypes.
         *
         * Newly created prototype will be blessed with all the required properties
         * to be well behaved.
         *
         * @function
         * @param {Object} prototype
         * @param {Object} propertyDescriptor
         * @returns newPrototype
         */
        create: {
            value: function (aPrototype, propertyDescriptor, constructorDescriptor) {
                var newConstructor;

                if (typeof aPrototype === "undefined" || ObjectDescriptor.prototype.isPrototypeOf(aPrototype)) {
                    var parentCreate = Object.getPrototypeOf(ObjectDescriptor).create;
                    return parentCreate.call(
                        this,
                        typeof aPrototype === "undefined" ? this : aPrototype,
                        propertyDescriptor,
                        constructorDescriptor
                    );
                }

                if (typeof aPrototype.specialize !== "function" && !propertyDescriptor) {
                    newConstructor = new aPrototype();
                } else {
                    newConstructor = aPrototype.specialize(propertyDescriptor, constructorDescriptor);
                }
                this.ObjectProperty.applyWithObjectDescriptor(newConstructor.prototype, this);
                // We have just created a custom prototype lets use it.
                this.customPrototype = true;

                return newConstructor;
            },
        },

        /**
         * Create a new instance of the target prototype for the object descriptor.
         * @function
         * @returns new instance
         */
        newInstance: {
            value: function () {
                var prototype = this.newInstancePrototype();
                return prototype ? new prototype() : null;
            },
        },

        /**
         * Returns the target prototype for this object descriptor.
         *
         * **Note:** This method uses the `customPrototype` property to determine
         * if it needs to require a custom prototype or create a default prototype.
         *
         * @function
         * @returns new prototype
         */
        newInstancePrototype: {
            value: function () {
                // FIXME this function is no missing all the data it needs
                var self = this;
                if (this.customPrototype) {
                    throw new Error("Already has customPrototype");
                    /*
                var resultsPromise = new Promise(function(resolve, reject) {
                    require.async(self.moduleId,
                        function(exports) {
                            resolve(exports);
                        });
                });
                return resultsPromise.then(function(exports) {
                        var prototype = exports[self.prototypeName];
                        return (prototype ? prototype : null);
                    }
                );
                */
                } else {
                    var parentInstancePrototype = this.parent ? this.parent.newInstancePrototype() : Target;
                    var newConstructor = parentInstancePrototype.specialize({
                        // Token class
                        init: {
                            value: function () {
                                return this;
                            },
                        },
                    });
                    this.ObjectProperty.applyWithObjectDescriptor(newConstructor.prototype, this);

                    return newConstructor ? newConstructor : null;
                }
            },
        },

        /**
         * Return the object descriptor object property for this object descriptor.
         *
         * This will return the default if none is declared.
         *
         * @returns {ObjectProperty}
         */
        ObjectProperty: {
            serializable: false,
            enumerable: true,
            get: function () {
                if (this.model) {
                    return this.model.ObjectProperty;
                }
                return ModelModule.Model.group.defaultObjectDescriptorObjectProperty;
            },
        },

        /**
         * This is used for references only so that we can reload referenced
         * object descriptors.
         */
        objectDescriptorInstanceModule: {
            serializable: false,
            value: null,
        },

        /**
         * The identifier is the same as the name and is used to make the
         * serialization of a object descriptor humane.
         * @returns {string}
         * @default `this.name`
         */
        identifier: {
            get: function () {
                // TODO convert UpperCase to lower-case instead of lowercase
                return this.name;
                // return [
                //     "objectDescriptor",
                //     (this.name || "unnamed").toLowerCase()
                // ].join("_");
            },
        },

        _model: {
            value: null,
        },

        /**
         * @returns {Property}
         * @default null
         */
        model: {
            serializable: false,
            get: function () {
                if (!this._model) {
                    this._model = ModelModule.Model.group.defaultModel;
                    this._model.addObjectDescriptor(this);
                }
                return this._model;
            },
            set: function (value) {
                this._model = value;
            },
        },

        _parentReference: {
            value: null,
        },

        _parent: {
            value: null,
        },

        /**
         * Blueprint parent
         * @type {?ObjectDescriptor}
         */
        parent: {
            serializable: false,
            get: function () {
                return this._parent;
            },
            set: function (value) {
                if (this._parent !== value) {
                    //Remove from current parent
                    if (this._parent) {
                        this._parent.removeChildObjectDescriptor(this);
                    }

                    this._parent = value;

                    //Add to new parent
                    if (value) {
                        value.addChildObjectDescriptor(this);
                    }
                }
            },
        },

        _childObjectDescriptors: {
            value: undefined,
        },
        childObjectDescriptors: {
            get: function () {
                return this._childObjectDescriptors || (this._childObjectDescriptors = []);
            },
            set: function (value) {
                if (value !== this._childObjectDescriptors) {
                    this._childObjectDescriptors = value;
                }
            },
        },
        addChildObjectDescriptor: {
            value: function (value) {
                if (value) {
                    if (this.childObjectDescriptors.indexOf(value) === -1) {
                        this.childObjectDescriptors.push(value);
                        this._clearDescendants();
                    }
                }
            },
        },
        removeChildObjectDescriptor: {
            value: function (value) {
                var index = this.childObjectDescriptors.indexOf(value);

                if (index !== -1) {
                    this.childObjectDescriptors.splice(index, 1);
                    this._clearDescendants();
                }
            },
        },

        _parentDescriptors: {
            value: undefined,
        },
        parentDescriptors: {
            get: function () {
                if (this._parentDescriptors === undefined) {
                    let current = this,
                        parent,
                        parents = [];
                    while ((parent = current.parent)) {
                        parents.push(parent);
                    }

                    this._parentDescriptors = parents;
                }
                return this._parentDescriptors;
            },
        },
        _descendantDescriptors: {
            value: undefined,
        },
        _clearDescendants: {
            value: function () {
                this._descendantDescriptors = undefined;
                if (this._parent) {
                    this._parent._clearDescendants();
                }
            },
        },
        descendantDescriptors: {
            get: function () {
                if (this._descendantDescriptors === undefined) {
                    var descendants = null,
                        push = Array.prototype.push,
                        currentChildren = this._childObjectDescriptors,
                        i,
                        countI,
                        iChild,
                        iDescendants;

                    if (currentChildren) {
                        for (i = 0, countI = currentChildren.length; (iChild = currentChildren[i]); i++) {
                            (descendants || (descendants = [])).push(iChild);
                            iDescendants = iChild.descendantDescriptors;
                            if (iDescendants) {
                                push.apply(descendants, iDescendants);
                            }
                        }
                    }
                    this._descendantDescriptors = descendants;
                }
                return this._descendantDescriptors;
            },
            set: function (value) {
                if (value !== this._descendantDescriptors) {
                    this._descendantDescriptors = value;
                }
            },
        },

        _descendantPropertyDescriptors: {
            value: undefined,
        },
        _descendantPropertyDescriptorsByName: {
            value: undefined,
        },
        descendantPropertyDescriptors: {
            get: function () {
                if (this._descendantPropertyDescriptors === undefined) {
                    let propertyDescriptors = [],
                        descendantPropertyDescriptorsByName = new Map(),
                        descendantDescriptors = this.descendantDescriptors;

                    for (let i = 0, countI = descendantDescriptors?.length; i < countI; i++) {
                        /*
                        It's possible, but unfortunate, for 2 subclasses to independently have a property descriptor with the same name, but different type.
                        The only way to solve that would be to alias the columns, like `${objectDescriptorName}_${aPropertyDescriptor.name}`
                        But we would have to dynamically change the mappings... If we were creating it, then it would be fine, but as long as we, humans, do,
                        it's on us.
                    */
                        for (let iiPropertyDescriptor of descendantDescriptors[i].ownPropertyDescriptors) {
                            propertyDescriptors.push(iiPropertyDescriptor);
                            descendantPropertyDescriptorsByName.set(iiPropertyDescriptor.name, iiPropertyDescriptor);
                        }
                    }

                    this._descendantPropertyDescriptors = propertyDescriptors;
                    this._descendantPropertyDescriptorsByName = descendantPropertyDescriptorsByName;
                }
                return this._descendantPropertyDescriptors;
            },
        },

        descendantPropertyDescriptorsByName: {
            get: function () {
                if (!this._descendantPropertyDescriptorsByName) {
                    this.descendantPropertyDescriptors();
                }
                return this._descendantPropertyDescriptorsByName;
            },
        },
        _descendantPropertyDescriptorNames: {
            value: undefined,
        },
        descendantPropertyDescriptorNames: {
            get: function () {
                return (
                    this._descendantPropertyDescriptorNames ||
                    (this._descendantPropertyDescriptorNames = Array.from(
                        this.descendantPropertyDescriptorsByName.keys()
                    ))
                );
            },
        },

        descendantPropertyDescriptorNamed: {
            value: function (aPropertyDescriptorName) {
                if (this._descendantPropertyDescriptorsByName === undefined) {
                    //Trigger the fill of this._descendantPropertyDescriptorsByName by descendantPropertyDescriptors's getter
                    this.descendantPropertyDescriptors;
                }
                return this._descendantPropertyDescriptorsByName.get(aPropertyDescriptorName);
            },
        },

        /**
         * An ObjectDescriptor's next target is it's parent or in the end the mainService.
         * @property {boolean} serializable
         * @property {Component} value
         */
        _nextTarget: {
            value: undefined,
        },

        nextTarget: {
            serializable: false,
            get: function () {
                return (
                    this._nextTarget ||
                    (this._nextTarget =
                        this.parent ||
                        this.eventManager.application.mainService.childServiceForType(this) ||
                        this.eventManager.application.mainService)
                );
            },
        },

        /**
         * An ObjectDescriptor's composedPath cached
         * @property {Array} _composedPath
         */
        _composedPath: {
            value: undefined,
        },
        composedPath: {
            get: function () {
                if (!this._composedPath) {
                    let composedPath = (this._composedPath = [this]),
                        nextTargetCandidate = this.parent,
                        dataServices = this.eventManager.application.mainService.descendantServicesForType(this);

                    //Add all ObjectDescriptor parents
                    do {
                        if (nextTargetCandidate) {
                            composedPath.push(nextTargetCandidate);
                            nextTargetCandidate = nextTargetCandidate.parent;
                        }
                    } while (nextTargetCandidate);

                    //Add all Services handling this object:
                    composedPath.push.apply(composedPath, dataServices);
                    composedPath.push(this.eventManager.application.mainService);
                    composedPath.push(this.eventManager.application);
                }

                return this._composedPath;
            },
        },

        _descriptorTraversingExpression: {
            value: function(anExpression, _returnTraversedDescriptors = false) {
                let syntax = parse(anExpression),
                syntaxIterator = new SyntaxInOrderIterator(syntax),
                currentIteration,
                currentSyntax,
                traversedDescriptors = _returnTraversedDescriptors ? [] : null,
                descriptor = this;

                while (
                    (currentIteration = syntaxIterator.next(undefined, currentSyntax)) &&
                    currentIteration.done !== true
                ) {

                    //A filter{} is just a reduction in content, it doesn't change the type to continue
                    //A map{} however will change the type to consider going forward.
                    //We're going to need a spec to get this right

                    currentSyntax = currentIteration.value;
                    if(currentSyntax.type === "property") {
                        /*
                            currentSyntax: {"type":"property","args":[{"type":"value"},{"type":"literal","value":"userIdentities"}]}
                        */
                        let propertyName = currentSyntax.args[1].value,
                            propertyDescriptor = descriptor.propertyDescriptorNamed(propertyName);

                        //WARNING: propertyDescriptor.valueDescriptor is a promise, which means descriptorTraversingExpression should return a promise
                        //And every method calling this would have to deal with it, hint: composedPath
                        if(propertyDescriptor._valueDescriptorReference) {
                            descriptor = propertyDescriptor._valueDescriptorReference;

                            //We only have an array in traversedDescriptors if _returnTraversedDescriptors === true
                            traversedDescriptors?.push(descriptor)
                        }

                    } else if(currentSyntax.type === "map") {

                    } else {
                        //I think we want to skip to the next property
                    }

                }

                return traversedDescriptors ? traversedDescriptors : descriptor;
            }
        },

        descriptorTerminatingExpression: {
            value: function(anExpression) {
                return this._descriptorTraversingExpression(anExpression, false);
            }
        },

        descriptorsTraversingExpression: {
            value: function(anExpression) {
                return this._descriptorTraversingExpression(anExpression, true);
            }
        },

        /**
         * Defines whether the object descriptor should use custom prototype for new
         * instances.
         *
         * Is `true` if the object descriptor needs to require a custom prototype for
         * creating new instances, `false` if new instance are generic prototypes.
         *
         * @property {boolean} value
         * @default false
         */
        customPrototype: {
            value: false,
        },

        /**
         * Range change listener on this._ownPropertyDescriptors and
         * this.parent.propertyDescriptors
         */
        _handlePropertyDescriptorsRangeChange: {
            value: function (plus, minus, index) {
                var all = new Set(this._propertyDescriptors),
                    plusSet = new Set(plus),
                    minusSet = new Set(minus),
                    descriptor,
                    i;

                for (i = 0; (descriptor = minus[i]); ++i) {
                    if (!plusSet.has(descriptor) && all.has(descriptor)) {
                        index = this._propertyDescriptors.indexOf(descriptor);
                        this._propertyDescriptors.splice(index, 1);
                        this.propertyDescriptorsByName.delete(descriptor.name);
                        descriptor._owner = null;

                        if (descriptor.isLocalizable) {
                            descriptor.removeOwnPropertyChangeListener("isLocalizable", this);

                            // index = this.localizablePropertyDescriptors.indexOf(descriptor);
                            // this.localizablePropertyDescriptors.splice(index, 1);
                            this.localizablePropertyDescriptors.delete(descriptor);
                        }
                    }
                }

                for (i = 0; (descriptor = plus[i]); ++i) {
                    if (!minusSet.has(descriptor) && !all.has(descriptor)) {
                        if (descriptor.owner === this) {
                            this._propertyDescriptors.push(descriptor);
                            this.propertyDescriptorsByName.set(descriptor.name, descriptor);
                        } else if (!this.propertyDescriptorsByName.has(descriptor.name)) {
                            this._propertyDescriptors.push(descriptor);
                            this.propertyDescriptorsByName.set(descriptor.name, descriptor);
                        }
                        descriptor._owner = descriptor._owner || this;

                        if (descriptor.isLocalizable) {
                            //this.localizablePropertyDescriptors.push(descriptor);
                            this.localizablePropertyDescriptors.add(descriptor);
                        }
                    }
                }
            },
        },

        /**
         * Property Range change listener on this._ownPropertyDescriptors and
         * this.parent.propertyDescriptors
         */

        handleIsLocalizablePropertyChange: {
            value: function (changeValue, key, object) {
                if (object.isLocalizable) {
                    //this.localizablePropertyDescriptors.push(object);
                    this.localizablePropertyDescriptors.add(object);
                } else {
                    //this.localizablePropertyDescriptors.splice(this.localizablePropertyDescriptors.indexOf(object), 1);
                    this.localizablePropertyDescriptors.delete(object);
                }
            },
        },

        _preparePropertyDescriptorsCache: {
            value: function () {
                if (!this._propertyDescriptorsAreCached) {
                    var ownDescriptors = this._ownPropertyDescriptors,
                        isReady = true,
                        descriptor,
                        i,
                        n;

                    for (i = 0, n = ownDescriptors.length; i < n && isReady; ++i) {
                        descriptor = ownDescriptors[i];
                        isReady = !!(descriptor && descriptor.name);
                    }

                    if (isReady) {
                        this._propertyDescriptorsAreCached = true;
                        this._propertyDescriptors = [];
                        this.propertyDescriptorsByName.clear();
                        for (i = 0, n = ownDescriptors.length; i < n; ++i) {
                            descriptor = ownDescriptors[i];
                            descriptor._owner = this;
                            this._propertyDescriptors.push(descriptor);
                            this.propertyDescriptorsByName.set(descriptor.name, descriptor);

                            if (descriptor.isLocalizable) {
                                //this.localizablePropertyDescriptors.push(descriptor);
                                this.localizablePropertyDescriptors.add(descriptor);
                                descriptor.addOwnPropertyChangeListener("isLocalizable", this);
                            }
                        }
                        this.addRangeAtPathChangeListener(
                            "_ownPropertyDescriptors",
                            this,
                            "_handlePropertyDescriptorsRangeChange"
                        );
                        this.addRangeAtPathChangeListener(
                            "parent.propertyDescriptors",
                            this,
                            "_handlePropertyDescriptorsRangeChange"
                        );
                    }
                }
            },
        },

        /**
         * PropertyDescriptors for this object descriptor, not including those
         * provided by this.parent
         *
         * @property {Array<PropertyDescriptor>} value
         */
        _ownPropertyDescriptors: {
            value: null,
        },
        ownPropertyDescriptors: {
            get: function () {
                this._preparePropertyDescriptorsCache();
                return this._ownPropertyDescriptors;
            },
        },

        _propertyDescriptors: {
            value: null,
        },

        _propertyDescriptorsAreCached: {
            value: false,
        },

        _localizablePropertyDescriptors: {
            value: undefined,
        },

        /**
         * A Set  of an ObjectDescriptor's Property Descriptors that are localizable
         *
         * @private
         * @property {Set<PropertyDescriptor>}
         */
        localizablePropertyDescriptors: {
            get: function () {
                //return this._localizablePropertyDescriptors || (this._localizablePropertyDescriptors = []);
                return this._localizablePropertyDescriptors || (this._localizablePropertyDescriptors = new Set());
            },
        },

        localizablePropertyNames: {
            value: undefined,
        },

        /**
         * PropertyDescriptors associated to this object descriptor, including those
         * provided by this.parent.
         *
         * @property {Array<PropertyDescriptor>} value
         */
        propertyDescriptors: {
            get: function () {
                if (!this._propertyDescriptors) {
                    this._propertyDescriptors = [];
                }
                this._preparePropertyDescriptorsCache();
                return this._propertyDescriptors;
            },
        },

        _validParentPropertyDescriptors: {
            value: function () {
                var parentPropertyDescriptors = this.parent.propertyDescriptors,
                    descriptors = [],
                    descriptor,
                    i;

                for (i = 0; (descriptor = parentPropertyDescriptors[i]); ++i) {
                    if (!this.propertyDescriptorsByName.has(descriptor.name)) {
                        descriptors.push(descriptor);
                    }
                }
                return descriptors;
            },
        },

        /**
         * Returns all property descriptors that have their serializable property not false
         *
         * @method
         * @returns {Array.<PropertyDescriptor>} Arrat of relevant propertyDescriptors
         */

        serializablePropertyDescriptors: {
            get: function () {
                // TODO Add some caching and invalidation when this._propertyDescriptors or this.parent.propertyDescriptors
                // changes, using bindings might be best.
                return this.propertyDescriptors.filter(function (aPropertyDescriptor) {
                    return aPropertyDescriptor.serializable !== false;
                });
            },
        },

        propertyDescriptorsByName: {
            get: function () {
                if (!this._propertyDescriptorsByName) {
                    this._propertyDescriptorsByName = new Map();
                }
                this._preparePropertyDescriptorsCache();
                return this._propertyDescriptorsByName;
            },
        },

        /*
        s = new Set(m.keys())
        Set(2) {"a", "b"}

        a = Array.from(m.keys())
        (2) ["a", "b"]
    */
        propertyDescriptorNamesIterator: {
            get: function () {
                return this.propertyDescriptorsByName.keys();
            },
        },

        propertyDescriptorNames: {
            get: function () {
                return (
                    this._propertyDescriptorNames ||
                    (this._propertyDescriptorNames = Array.from(this.propertyDescriptorNamesIterator))
                );
            },
        },

        /**
         * Adds a new property descriptor to this object descriptor.
         *
         * If that property descriptor was associated with another object descriptor it will
         * be removed first.
         *
         * @function
         * @param {PropertyDescriptor} property descriptor to be added.
         * @returns the property descriptor
         */
        addPropertyDescriptor: {
            value: function (propertyDescriptor) {
                if (propertyDescriptor !== null && propertyDescriptor.name !== null) {
                    var index = this._ownPropertyDescriptors.indexOf(propertyDescriptor);
                    if (index < 0) {
                        if (propertyDescriptor.owner !== null && propertyDescriptor.owner !== this) {
                            propertyDescriptor.owner.removePropertyDescriptor(propertyDescriptor);
                        }
                        this._ownPropertyDescriptors.push(propertyDescriptor);
                        propertyDescriptor._owner = this;
                    }
                }
                return propertyDescriptor;
            },
        },

        /**
         * Removes a property descriptor from the property descriptor list of this
         * object descriptor.
         *
         * @function
         * @param {PropertyDescriptor} The property descriptor to be removed.
         * @returns the same property descriptor
         */
        removePropertyDescriptor: {
            value: function (propertyDescriptor) {
                if (propertyDescriptor !== null && propertyDescriptor.name !== null) {
                    var index = this._ownPropertyDescriptors.indexOf(propertyDescriptor);
                    if (index >= 0) {
                        this._ownPropertyDescriptors.splice(index, 1);
                        propertyDescriptor._owner = null;
                    }
                }
                return propertyDescriptor;
            },
        },

        /**
         * Return a new property descriptor.
         *
         * **Note:** This is the canonical way of creating new property descriptor
         * in order to enable subclassing.
         * @param {string} name name of the property descriptor to create
         * @param {number} cardinality name of the property descriptor to create
         * @returns {PropertyDescriptor}
         */
        newPropertyDescriptor: {
            value: function (name, cardinality) {
                return new PropertyDescriptor().initWithNameObjectDescriptorAndCardinality(name, this, cardinality);
            },
        },

        /**
         * Convenience to add one property descriptor.
         * @function
         * @param {string} name Add to one property descriptor
         * @returns {PropertyDescriptor}
         */
        addToOnePropertyDescriptorNamed: {
            value: function (name) {
                return this.addPropertyDescriptor(this.newPropertyDescriptor(name, 1));
            },
        },

        /**
         * Convenience to add many property descriptor.
         * @function
         * @param {string} name Add to many property descriptor
         * @returns {PropertyDescriptor}
         */
        addToManyPropertyDescriptorNamed: {
            value: function (name) {
                return this.addPropertyDescriptor(this.newPropertyDescriptor(name, Infinity));
            },
        },

        /**
         * Convenience to add an property descriptor to one relationship.
         * @deprecated
         * @function
         * @param {string} name
         * @param {string} inverse
         * @returns {PropertyDescriptor}
         */
        addToOneAssociationBlueprintNamed: {
            value: function (name, inverse) {
                var relationship = this.addPropertyDescriptor(this.addToOnePropertyDescriptorNamed(name));
                if (inverse) {
                    relationship.valueDescriptor = inverse.owner;
                    inverse.valueDescriptor = this;
                }
                return relationship;
            },
        },

        /**
         * Convenience to add an property descriptor to many relationships.
         * @deprecated
         * @function
         * @param {string} name TODO
         * @param {string} inverse TODO
         * @returns {PropertyDescriptor}
         */
        addToManyAssociationBlueprintNamed: {
            value: function (name, inverse) {
                var relationship = this.addPropertyDescriptor(this.addToManyPropertyDescriptorNamed(name));
                if (inverse) {
                    relationship.valueDescriptor = inverse.owner;
                    inverse.valueDescriptor = this;
                }
                return relationship;
            },
        },

        _cachedBogusPropertyDescriptors: {
            get: function () {
                return this.__cachedBogusPropertyDescriptors || (this.__cachedBogusPropertyDescriptors = new Set());
            },
        },
        /**
         * FIXME: Should probably be named propertyDescriptorNamed or propertyDescriptorWithName
         * @function
         * @param {string} name
         * @returns {PropertyDescriptor}
         */
        propertyDescriptorForName: {
            value: function (name) {
                if (!this._propertyDescriptorsAreCached) {
                    this.propertyDescriptors;
                }
                var propertyDescriptor = this.propertyDescriptorsByName.get(name);
                // if (propertyDescriptor === undefined) {
                //     this.propertyDescriptorsByName.set(name, exports.UnknownPropertyDescriptor);
                // } else if (propertyDescriptor === exports.UnknownPropertyDescriptor) {
                //     propertyDescriptor = null;
                // }

                if (!propertyDescriptor && this.parent) {
                    if (!this._cachedBogusPropertyDescriptors.has(name)) {
                        propertyDescriptor = this.parent.propertyDescriptorForName(name);
                        if (!propertyDescriptor) {
                            this._cachedBogusPropertyDescriptors.add(name);
                        }
                    }
                }

                return propertyDescriptor || null;
            },
        },
        propertyDescriptorNamed: {
            value: function (name) {
                return this.propertyDescriptorForName(name);
            },
        },
        propertyDescriptorWithName: {
            value: function (name) {
                return this.propertyDescriptorForName(name);
            },
        },

        _propertyDescriptorGroups: {
            value: null,
        },

        /**
         * List of properties descriptor groups names
         * @returns {Array.<PropertyBlueprint>}
         */
        propertyDescriptorGroups: {
            get: function () {
                var groups = [],
                    name;
                for (name in this._propertyDescriptorGroups) {
                    if (this._propertyDescriptorGroups.hasOwnProperty(name)) {
                        groups.push(name);
                    }
                }
                if (this.parent) {
                    groups = groups.concat(this.parent.propertyDescriptorGroups);
                }
                return groups;
            },
        },

        /**
         * Returns the group associated with that name
         * @param {string} name of the group
         * @returns {Array.<PropertyDescriptor>} property descriptor group
         */
        propertyDescriptorGroupForName: {
            value: function (groupName) {
                var group = this._propertyDescriptorGroups[groupName];
                if (!group && this.parent) {
                    group = this.parent.propertyDescriptorGroupForName(groupName);
                }
                return group;
            },
        },

        /**
         * Add a new property descriptor group.
         * @function
         * @param {string} name of the group
         * @returns {Array.<PropertyDescriptor>} new property descriptor group
         */
        addPropertyDescriptorGroupNamed: {
            value: function (groupName) {
                var group = this._propertyDescriptorGroups[groupName];
                if (!group) {
                    group = [];
                    this._propertyDescriptorGroups[groupName] = group;
                }
                return group;
            },
        },

        /**
         * Remove the property descriptor group.
         * @function
         * @param {string} name of the group to remove
         * @returns {Array.<PropertyDescriptor>} removed property descriptor group
         */
        removePropertyDescriptorGroupNamed: {
            value: function (groupName) {
                var group = this._propertyDescriptorGroups[groupName];
                if (!group) {
                    delete this._propertyDescriptorGroups[groupName];
                }
                return group;
            },
        },

        /**
         * Adds a property descriptor to the group name.
         * if the group does not exist creates it.
         * @function
         * @param {string} property to add
         * @param {string} name of the group
         * @returns {Array.<PropertyBlueprint>} property descriptor group
         */
        addPropertyDescriptorToGroupNamed: {
            value: function (propertyDescriptor, groupName) {
                var group = this._propertyDescriptorGroups[groupName],
                    index;
                if (!group) {
                    group = this.addPropertyDescriptorGroupNamed(groupName);
                }
                index = group.indexOf(propertyDescriptor);
                if (index < 0) {
                    group.push(propertyDescriptor);
                }
                return group;
            },
        },

        /**
         * Removes a property descriptor from the group name.
         * @function
         * @param {string} name of the property
         * @param {string} name of the group
         * @returns {Array.<PropertyDescriptor>} property descriptor group
         */
        removePropertyDescriptorFromGroupNamed: {
            value: function (propertyDescriptor, groupName) {
                var group = this._propertyDescriptorGroups[groupName];
                if (group && propertyDescriptor) {
                    var index = group.indexOf(propertyDescriptor);
                    if (index >= 0) {
                        group.splice(index, 1);
                    }
                }
                return group || [];
            },
        },

        __eventDescriptors: {
            value: null,
        },
        _eventDescriptors: {
            get: function () {
                return this.__eventDescriptors || (this.__eventDescriptors = []);
            },
        },

        /**
         * @property {Array.<EventDescriptor>} value
         */
        eventDescriptors: {
            value: null,
        },

        _eventPropertyDescriptorsTable: {
            value: null,
        },

        /**
         * Adds a new event property descriptor to this object descriptor.
         *
         * If that event property descriptor was associated with another object descriptor it will
         * be removed first.
         *
         * @function
         * @param {string} event property descriptor to be added.
         * @returns {EventPropertyDescriptor}
         */
        addEventDescriptor: {
            value: function (eventDescriptor) {
                if (eventDescriptor && eventDescriptor.name) {
                    var index = this._eventDescriptors.indexOf(eventDescriptor);
                    if (index < 0) {
                        if (eventDescriptor.owner && eventDescriptor.owner !== this) {
                            eventDescriptor.owner.removeEventDescriptor(eventDescriptor);
                        }
                        this._eventDescriptors.push(eventDescriptor);
                        this._eventPropertyDescriptorsTable.set(eventDescriptor.name, eventDescriptor);
                        eventDescriptor._owner = this;
                    }
                }
                return eventDescriptor;
            },
        },

        /**
         * Removes an property descriptor from the property descriptor list of this
         * object descriptor.
         * @function
         * @param {Object} property descriptor The property descriptor to be removed.
         * @returns {PropertyDescriptor}
         */
        removeEventDescriptor: {
            value: function (eventDescriptor) {
                if (eventDescriptor && eventDescriptor.name) {
                    var index = this._eventDescriptors.indexOf(eventDescriptor);
                    if (index >= 0) {
                        this._eventDescriptors.splice(index, 1);
                        this._eventPropertyDescriptorsTable.delete(eventDescriptor.name);
                        eventDescriptor._owner = null;
                    }
                }
                return eventDescriptor;
            },
        },

        /**
         * Return a new event property descriptor.
         * **Note:** This is the canonical way of creating new event property descriptors in
         * order to enable subclassing.
         * @param {string} name name of the event property descriptor to create
         */
        newEventDescriptor: {
            value: function (name) {
                return new EventDescriptor().initWithNameAndObjectDescriptor(name, this);
            },
        },

        /**
         * Convenience to add an event descriptor.
         * @function
         * @param {string} name
         * @returns {EventDescriptor}
         */
        addEventDescriptorNamed: {
            value: function (name) {
                return this.addEventDescriptor(this.newEventDescriptor(name));
            },
        },

        /**
         * @function
         * @param {string} name
         * @returns {EventDescriptor}
         */
        eventDescriptorForName: {
            value: function (name) {
                var eventDescriptor = this._eventPropertyDescriptorsTable.get(name);
                if (typeof eventDescriptor === "undefined") {
                    eventDescriptor = exports.UnknownEventDescriptor;
                    var anEventPropertyDescriptor, index;
                    for (
                        index = 0;
                        typeof (anEventPropertyDescriptor = this._eventDescriptors[index]) !== "undefined";
                        index++
                    ) {
                        if (anEventPropertyDescriptor.name === name) {
                            eventDescriptor = anEventPropertyDescriptor;
                            break;
                        }
                    }
                    this._eventPropertyDescriptorsTable.set(name, eventDescriptor);
                }

                // TODO: Come back after creating event property descriptor
                if (eventDescriptor === exports.UnknownEventDescriptor) {
                    eventDescriptor = null;
                }

                if (!eventDescriptor && this.parent) {
                    eventDescriptor = this.parent.eventDescriptorForName(name);
                }
                return eventDescriptor;
            },
        },

        _validationRules: {
            value: null,
        },

        /**
         * Gets the list of properties validation rules.
         * @returns {Array.<ValidationRule>} copy of the list of properties
         * validation rules.
         */
        validationRules: {
            get: function () {
                if (!this._validationRules) {
                    const validationRules = [];

                    for (let propertyName in this._ownValidationRules) {
                        validationRules.push(this._ownValidationRules[propertyName]);
                    }

                    if (this.parent) {
                        validationRules.push(...this.parent.validationRules);
                    }

                    this._validationRules = validationRules;
                }

                return this._validationRules;
            },
        },

        /**
         * Evaluates the validity of objectInstance and collects validation errors. This is done using:
         * - rules set on ObjectDescriptor
         * - propertyDescriptor properties:
         * - mandatory: is a value there?
         * - readOnly: is the value changed?
         * - valueType, collectionValueType, valueDescriptor: Does the current value match?
         * - cardinality, is the current value match?
         *
         * All validation rules are executed in parallel.
         *
         * @param {Object} objectInstance The object instance to evaluate the rules for.
         * @returns {Promise<Array<ValidationError>>} A promise that resolves to an array of
         * ValidationError objects for each rule that failed. The array is empty if all rules pass.
         */
        evaluateObjectValidity: {
            value: async function (objectInstance) {
                // Create an array of promises by calling evaluateRule for each validation rule.
                const validationPromises = [];
                const rules = Object.values(this.validationRules);

                for (let i = 0, length = rules.length; i < length; i++) {
                    validationPromises.push(rules[i].evaluateRule(objectInstance));
                }

                // Wait for all validation rules to complete and filter results
                return Promise.all(validationPromises).then((validationErrors) => {
                    const actualErrors = [];

                    for (let j = 0, errLength = validationErrors.length; j < errLength; j++) {
                        // Filter out the `null` errors (which indicate a passed rule)
                        if (validationErrors[j] !== null) {
                            actualErrors.push(validationErrors[j]);
                        }
                    }
                    return actualErrors;
                });
            },
        },

        /**
         * Evaluates the rules based on the object and the properties.
         * @param {Object} object instance to evaluate the rule for
         * @returns {Array.<string>} list of message key for rule that fired. Empty
         * array otherwise.
         */
        evaluateRules: {
            value: deprecate.deprecateMethod(
                void 0,
                (objectInstance) => this.evaluateObjectValidity(objectInstance),
                "evaluateRules",
                "evaluateObjectValidity"
            ),
        },

        objectDescriptorModuleId: require("../core")._objectDescriptorModuleIdDescriptor,
        objectDescriptor: require("../core")._objectDescriptorDescriptor,

        userInterfaceDescriptor: {
            get: function () {
                if (!this._userInterfaceDescriptor) {
                    if (this.userInterfaceDescriptorModules && this.userInterfaceDescriptorModules["*"]) {
                        Montage.defineProperty(this, "_userInterfaceDescriptor", {
                            enumerable: false,
                            value: this.userInterfaceDescriptorModules["*"].require
                                .async(this.userInterfaceDescriptorModules["*"].id)
                                .then(function (userInterfaceDescriptorModule) {
                                    return userInterfaceDescriptorModule.montageObject;
                                }),
                        });
                    }
                }

                return this._userInterfaceDescriptor || (this._userInterfaceDescriptor = Promise.resolve());
            },
        },

        userInterfaceDescriptors: {
            get: function () {
                if (!this._userInterfaceDescriptors) {
                    if (this.userInterfaceDescriptorModules) {
                        var keys = Object.keys(this.userInterfaceDescriptorModules),
                            length;

                        if ((length = keys.length)) {
                            var promisesHandler = function ([
                                    defaultUserInterfaceDescriptor,
                                    userInterfaceDescriptorModule,
                                ]) {
                                    return Object.assign(
                                        {},
                                        defaultUserInterfaceDescriptor,
                                        userInterfaceDescriptorModule.montageObject
                                    );
                                },
                                map = {},
                                key;

                            for (var i = 0; i < length; i++) {
                                key = keys[i];

                                if (key === "*") {
                                    map[key] = this.userInterfaceDescriptor;
                                } else {
                                    Montage.defineProperty(map, key, {
                                        enumerable: false,
                                        value: Promise.all([
                                            this.userInterfaceDescriptor,
                                            this.userInterfaceDescriptorModules[key].require.async(
                                                this.userInterfaceDescriptorModules[key].id
                                            ),
                                        ]).then(promisesHandler),
                                    });
                                }
                            }
                            this._userInterfaceDescriptors = map;
                        }
                    }
                }

                return this._userInterfaceDescriptors;
            },
        },

        /**********************************************************************************
         * Deprecated methods.
         */

        /**
         * Add a new event descriptor to this object descriptor.
         *
         * If that event descriptor was associated with another object descriptor it will
         * be removed first.
         *
         * @function
         * @param {string} property descriptor The property descriptor to be added.
         * @returns {EventDescriptor}
         */
        addEventBlueprint: {
            value: deprecate.deprecateMethod(
                void 0,
                function (eventBlueprint) {
                    return this.addEventDescriptor(eventBlueprint);
                },
                "addEventBlueprint",
                "addEventDescriptor"
            ),
        },

        /**
         * Convenience to add an event descriptor.
         * @function
         * @param {string} name
         * @returns {EventDescriptor}
         */
        addEventBlueprintNamed: {
            value: deprecate.deprecateMethod(
                void 0,
                function (name) {
                    return this.addEventDescriptorNamed(name);
                },
                "addEventBlueprintNamed",
                "addEventDescriptorNamed",
                true
            ),
        },

        /**
         * Add a new property descriptor to this object descriptor.
         *
         * If that property descriptor was associated with another object descriptor it will
         * be removed first.
         * @deprecated
         * @function
         * @param {PropertyDescriptor} property descriptor The property descriptor to
         * be added.
         * @returns the property descriptor
         */
        addPropertyBlueprint: {
            value: deprecate.deprecateMethod(
                void 0,
                function (propertyBlueprint) {
                    this.addPropertyDescriptor(propertyBlueprint);
                },
                "addPropertyBlueprint",
                "addPropertyDescriptor",
                true
            ),
        },

        /**
         * Add a new property descriptor group.
         * @function
         * @param {string} name of the group
         * @returns {Array.<PropertyBlueprint>} new property descriptor group
         */
        addPropertyBlueprintGroupNamed: {
            value: deprecate.deprecateMethod(
                void 0,
                function (groupName) {
                    this.addPropertyDescriptorGroupNamed(groupName);
                },
                "addPropertyBlueprintGroupNamed",
                "addPropertyDescriptorGroupNamed",
                true
            ),
        },

        /**
         * Adds a property descriptor to the group name.
         * if the group does not exist creates it.
         * @function
         * @param {string} property to add
         * @param {string} name of the group
         * @returns {Array.<PropertyBlueprint>} property descriptor group
         */
        addPropertyBlueprintToGroupNamed: {
            value: deprecate.deprecateMethod(
                void 0,
                function (propertyBlueprint, groupName) {
                    this.addPropertyDescriptorToGroupNamed(propertyBlueprint, groupName);
                },
                "addPropertyBlueprintToGroupNamed",
                "addPropertyDescriptorToGroupNamed",
                true
            ),
        },

        /**
         * @deprecated
         */
        addToOnePropertyBlueprintNamed: {
            value: deprecate.deprecateMethod(
                void 0,
                function (name) {
                    return this.addToOnePropertyDescriptorNamed(name);
                },
                "addToOnePropertyBlueprintNamed",
                "addToOnePropertyDescriptorNamed",
                true
            ),
        },

        /**
         * @deprecated
         */
        addToManyPropertyBlueprintNamed: {
            value: deprecate.deprecateMethod(
                void 0,
                function (name) {
                    return this.addToManyPropertyDescriptorNamed(name);
                },
                "addToManyPropertyBlueprintNamed",
                "addToManyPropertyDescriptorNamed",
                true
            ),
        },

        /**
         * @deprecated
         * This is used for references only so that we can reload referenced
         * object descriptors.
         */
        blueprintInstanceModule: {
            serializable: false,
            get: deprecate.deprecateMethod(
                void 0,
                function () {
                    return this.objectDescriptorInstanceModule;
                },
                "blueprintInstanceModule.get",
                "objectDescriptorInstanceModule.get",
                true
            ),
            set: deprecate.deprecateMethod(
                void 0,
                function (value) {
                    this.objectDescriptorInstanceModule = value;
                },
                "blueprintInstanceModule.set",
                "objectDescriptorInstanceModule.set",
                true
            ),
        },

        /**
         * @deprecated
         * @returns {Model}
         * @default null
         */
        binder: {
            serializable: false,
            get: deprecate.deprecateMethod(
                void 0,
                function () {
                    return this.model;
                },
                "binder.get",
                "model.get",
                true
            ),
            set: deprecate.deprecateMethod(
                void 0,
                function (value) {
                    this.model = value;
                },
                "binder.set",
                "model.set",
                true
            ),
        },

        /**
         * @deprecated
         * @function
         * @param {string} name
         * @returns {EventDescriptor}
         */
        eventBlueprintForName: {
            value: deprecate.deprecateMethod(
                void 0,
                function (name) {
                    return this.eventDescriptorForName(name);
                },
                "eventBlueprintForName",
                "eventDescriptorForName",
                true
            ),
        },

        /**
         * @property {Array.<EventDescriptor>} value
         */
        eventBlueprints: {
            // value: null
            get: deprecate.deprecateMethod(
                void 0,
                function () {
                    return this.eventDescriptors;
                },
                "eventBlueprints.get",
                "eventDescriptors.get",
                true
            ),
            set: deprecate.deprecateMethod(
                void 0,
                function (value) {
                    this.eventDescriptors = value;
                },
                "eventBlueprints.set",
                "eventDescriptors.set",
                true
            ),
        },

        /**
         * Return a new property descriptor.
         * **Note:** This method is deprecated use addToOnePropertyDescriptor
         * and addToManyPropertyDescriptor to model relationships.
         * @deprecated
         * @param {string} name of the property descriptor to create
         * @param {number} cardinality name of the property descriptor to create
         * @returns {PropertyDescriptor}
         */
        // TODO: Deprecate -- discuss with Benoit.
        newAssociationBlueprint: {
            value: function (name, cardinality) {
                // TODO: Implement.
                return cardinality === 1
                    ? this.addToOnePropertyDescriptorNamed(name)
                    : this.addToManyPropertyDescriptorNamed(name);
            },
        },

        /**
         * Return a new derived descriptor.
         * **Note:** This is the canonical way of creating new derived descriptors.
         * in order to enable subclassing.
         * @deprecated
         * @param {string} name of the derived descriptor to create
         * @param {number} the cardinality to use for the descriptor.
         * @returns {DerivedDescriptor}
         */
        newDerivedPropertyBlueprint: {
            value: deprecate.deprecateMethod(
                void 0,
                function (name, cardinality) {
                    return this.newDerivedDescriptor(name, cardinality);
                },
                "newDerivedPropertyBlueprint",
                "newDerivedDescriptor",
                true
            ),
        },

        /**
         * Return a new derived descriptor.
         * **Note:** This is the canonical way of creating new derived descriptors.
         * in order to enable subclassing.
         * @deprecated
         * @param {string} name of the derived descriptor to create
         * @param {number} the cardinality to use for the descriptor.
         * @returns {DerivedDescriptor}
         */
        newDerivedDescriptor: {
            value: function (name, cardinality) {
                return new DerivedDescriptor().initWithNameObjectDescriptorAndCardinality(name, this, cardinality);
            },
        },

        /**
         * Return a new event descriptor.
         * **Note:** This is the canonical way of creating new event descriptor in
         * order to enable subclassing.
         * @deprecated
         * @param {string} name name of the event descriptor to create
         */
        newEventBlueprint: {
            value: deprecate.deprecateMethod(
                void 0,
                function (name) {
                    return this.newEventDescriptor(name);
                },
                "newEventBlueprint",
                "newEventDescriptor",
                true
            ),
        },

        /**
         * Return a new property descriptor.
         *
         * **Note:** This is the canonical way of creating new property descriptors
         * in order to enable subclassing.
         * @deprecated
         * @param {string} name name of the property descriptor to create
         * @param {number} cardinality name of the property descriptor to create
         * @returns {PropertyDescriptor}
         */
        newPropertyBlueprint: {
            value: deprecate.deprecateMethod(
                void 0,
                function (name, cardinality) {
                    return this.newPropertyDescriptor(name, cardinality);
                },
                "newPropertyBlueprint",
                "newPropertyDescriptor",
                true
            ),
        },

        /**
         * @deprecated
         * @function
         * @param {string} name
         * @returns {PropertyDescriptor}
         */
        propertyBlueprintForName: {
            value: deprecate.deprecateMethod(
                void 0,
                function (name) {
                    return this.propertyDescriptorForName(name);
                },
                "propertyBlueprintForName",
                "propertyDescriptorForName",
                true
            ),
        },

        /**
         * List of properties descriptor groups names
         * @deprecated
         * @returns {Array.<PropertyDescriptor>}
         */
        propertyBlueprintGroups: {
            get: deprecate.deprecateMethod(
                void 0,
                function () {
                    return this.propertyDescriptorGroups;
                },
                "propertyBlueprintGroups",
                "propertyDescriptorGroups",
                true
            ),
        },

        /**
         * Returns the group associated with that name
         * @deprecated
         * @param {string} name of the group
         * @returns {Array.<PropertyDescriptor>} property descriptor group
         */
        propertyBlueprintGroupForName: {
            value: deprecate.deprecateMethod(
                void 0,
                function (groupName) {
                    return this.propertyDescriptorGroupForName(groupName);
                },
                "propertyBlueprintGroupForName",
                "propertyDescriptorForName",
                true
            ),
        },

        /**
         * Returns the group associated with that name
         * @deprecated
         */
        propertyBlueprints: {
            get: deprecate.deprecateMethod(
                void 0,
                function () {
                    return this.propertyDescriptors;
                },
                "propertyBlueprints",
                "propertyDescriptors",
                true
            ),
        },

        /**
         * Removes a property descriptor from the property descriptor list of this
         * object descriptor.
         * @deprecated
         * @function
         * @param {Object} event descriptor The event descriptor to be removed.
         * @returns {PropertyDescriptor}
         */
        removeEventBlueprint: {
            value: deprecate.deprecateMethod(
                void 0,
                function (eventBlueprint) {
                    this.removeEventDescriptor(eventBlueprint);
                },
                "removeEventBlueprint",
                "removeEventDescriptor",
                true
            ),
        },

        /**
         * Removes a property descriptor from the property descriptor list of this
         * object descriptor.
         *
         * @deprecated
         * @function
         * @param {PropertyDescriptor} property descriptor The property descriptor to
         * be removed.
         * @returns the same property descriptor
         */
        removePropertyBlueprint: {
            value: deprecate.deprecateMethod(
                void 0,
                function (propertyBlueprint) {
                    this.removePropertyDescriptor(propertyBlueprint);
                },
                "removePropertyBlueprint",
                "removePropertyDescriptor",
                true
            ),
        },

        /**
         * Removes a property descriptor from the group name.
         * @deprecated
         * @function
         * @param {string} name of the property
         * @param {string} name of the group
         * @returns {Array.<PropertyDescriptor>} property descriptor group
         */
        removePropertyBlueprintFromGroupNamed: {
            value: deprecate.deprecateMethod(
                void 0,
                function (propertyBlueprint, groupName) {
                    this.removePropertyDescriptorFromGroupNamed(propertyBlueprint, groupName);
                },
                "removePropertyBlueprintFromGroupNamed",
                "removePropertyDescriptorGroupNamed",
                true
            ),
        },

        /**
         * Remove the property descriptor group.
         * @deprecated
         * @function
         * @param {string} name of the group to remove
         * @returns {Array.<PropertyDescriptor>} removed property descriptor group
         */
        removePropertyBlueprintGroupNamed: {
            value: deprecate.deprecateMethod(
                void 0,
                function (groupName) {
                    this.removePropertyDescriptorGroupNamed(groupName);
                },
                "removePropertyBlueprintGroupNamed",
                "removePropertyDescriptorGroupNamed",
                true
            ),
        },

        /**
         *  Specifies the maximum amount of time that the values of on object
         * described by an ObjectDescriptor will be considered fresh.
         *
         * Value is in seconds, default to 4 minutes
         *
         * @returns {number} this.maxAge
         */
        maxAge: {
            value: 240,
        },

        blueprintModuleId: require("../core")._objectDescriptorModuleIdDescriptor,
        blueprint: require("../core")._objectDescriptorDescriptor,
    },
    {
        /**
         * @deprecated
         * Creates a default object descriptor with all enumerable properties.
         *
         * **Note:** Value type are set to the string default.
         */
        createDefaultBlueprintForObject: {
            value: deprecate.deprecateMethod(
                void 0,
                function (object) {
                    return ObjectDescriptor.createDefaultObjectDescriptorForObject(object);
                },
                "Blueprint.createDefaultBlueprintForObject",
                "ObjectDescriptor.createDefaultObjectDescriptorForObject",
                true
            ),
        },

        /**
         * Creates a default object descriptor with all enumerable properties.
         *
         * **Note:** Value type are set to the string default.
         */
        createDefaultObjectDescriptorForObject: {
            value: function (object) {
                if (object) {
                    var target = Montage.getInfoForObject(object).isInstance
                        ? Object.getPrototypeOf(object)
                        : object.prototype;
                    var info = Montage.getInfoForObject(target);

                    // Create `new this()` so that subclassing works
                    var newObjectDescriptor = new this();

                    for (var name in target) {
                        if (name[0] !== "_" && target.hasOwnProperty(name)) {
                            // We don't want to list private properties
                            var value = target[name];
                            var propertyDescriptor;
                            if (Array.isArray(value)) {
                                propertyDescriptor = newObjectDescriptor.addToManyPropertyDescriptorNamed(name);
                            } else {
                                propertyDescriptor = newObjectDescriptor.addToOnePropertyDescriptorNamed(name);
                            }
                            newObjectDescriptor.addPropertyDescriptorGroupNamed(propertyDescriptor, info.objectName);
                        }
                    }
                    var parentObject = Object.getPrototypeOf(target);
                    if (parentObject && "objectDescriptor" in parentObject) {
                        return parentObject.objectDescriptor.then(function (objectDescriptor) {
                            newObjectDescriptor.parent = objectDescriptor;
                            return newObjectDescriptor;
                        });
                    } else {
                        return Promise.resolve(newObjectDescriptor);
                    }
                } else {
                    return Promise.resolve(exports.UnknownObjectDescriptor);
                }
            },
        },
    }
);

exports.UnknownObjectDescriptor = Object.freeze(new ObjectDescriptor().initWithName("Unknown"));
exports.UnknownPropertyDescriptor = Object.freeze(
    new PropertyDescriptor().initWithNameObjectDescriptorAndCardinality("Unknown", null, 1)
);
exports.UnknownEventDescriptor = Object.freeze(new EventDescriptor().initWithNameAndObjectDescriptor("Unknown", null));
