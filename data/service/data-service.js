const Object = global.Object, //Cache for scope traversal performance
    Montage = require("core/core").Montage,
    Target = require("core/target").Target,
    defaultEventManager = require("core/event/event-manager").defaultEventManager,
    ObjectDescriptor = require("core/meta/object-descriptor").ObjectDescriptor,
    AuthorizationManager = require("./authorization-manager").defaultAuthorizationManager,
    AuthorizationPolicy = require("./authorization-policy").AuthorizationPolicy,
    AuthenticationPolicy = require("./authentication-policy").AuthenticationPolicy,
    IdentityManager = require("./identity-manager").IdentityManager,
    DataObjectDescriptor = require("../model/data-object-descriptor").DataObjectDescriptor,
    Criteria = require("core/criteria").Criteria,
    DataQuery = require("../model/data-query").DataQuery,
    DataStream = require("./data-stream").DataStream,
    DataTrigger = require("./data-trigger").DataTrigger,
    Map = require("core/collections/map"),
    Promise = require("core/promise").Promise,
    Set = require("core/collections/set"),
    CountedSet = require("core/counted-set").CountedSet,
    ObjectPool = require("core/object-pool").ObjectPool,
    DataEvent = require("../model/data-event").DataEvent,
    PropertyDescriptor = require("core/meta/property-descriptor").PropertyDescriptor,
    DeleteRule = require("core/meta/property-descriptor").DeleteRule,
    deprecate = require("core/deprecate"),
    currentEnvironment = require("core/environment").currentEnvironment,
    PropertyChanges = require("core/collections/listen/property-changes"),
    DataOperation = require("./data-operation").DataOperation,
    Locale = require("core/locale").Locale,
    ReadEvent = require("../model/read-event").ReadEvent,
    DataOperationErrorNames = require("./data-operation").DataOperationErrorNames,
    Transaction = require("../model/transaction").Transaction,
    TransactionDescriptor = require("../model/transaction.mjson").montageObject,
    TransactionEvent = require("../model/transaction-event").TransactionEvent,
    ObjectStoreDescriptor = require("../model/object-store.mjson").montageObject,
    ObjectPropertyStoreDescriptor = require("../model/object-property-store.mjson").montageObject
    isArray = Array.isArray;

require("core/extras/string");
require("core/extras/date");
require("core/extras/function");

var AuthorizationPolicyType = new Montage();
AuthorizationPolicyType.NoAuthorizationPolicy = AuthorizationPolicy.NONE;
AuthorizationPolicyType.UpfrontAuthorizationPolicy = AuthorizationPolicy.UP_FRONT;
AuthorizationPolicyType.OnDemandAuthorizationPolicy = AuthorizationPolicy.ON_DEMAND;
AuthorizationPolicyType.OnFirstFetchAuthorizationPolicy = AuthorizationPolicy.ON_FIRST_FETCH;

var AuthenticationPolicyType = new Montage();
AuthenticationPolicyType.NoAuthenticationPolicy = AuthenticationPolicy.NONE;
AuthenticationPolicyType.UpfrontAuthenticationPolicy = AuthenticationPolicy.UP_FRONT;
AuthenticationPolicyType.OnDemandAuthenticationPolicy = AuthenticationPolicy.ON_DEMAND;
AuthenticationPolicyType.OnFirstFetchAuthenticationPolicy = AuthenticationPolicy.ON_FIRST_FETCH;

AuthenticationPolicy.NoAuthenticationPolicy = AuthenticationPolicy.NONE;
AuthenticationPolicy.UpfrontAuthenticationPolicy = AuthenticationPolicy.UP_FRONT;
AuthenticationPolicy.OnDemandAuthenticationPolicy = AuthenticationPolicy.ON_DEMAND;
AuthenticationPolicy.OnFirstFetchAuthenticationPolicy = AuthenticationPolicy.ON_FIRST_FETCH;

/**
 * Future: Look at https://www.npmjs.com/package/broadcast-channel to implement cross-tab event distribution?
 */

/**
 * Provides data objects and manages changes to them.
 *
 * Data service subclasses that implement their own constructor should call this
 * class' constructor at the beginning of their constructor implementation
 * with code like the following:
 *
 *     DataService.call(this);
 *
 * Currently only one service tree with one
 * [root services]{@link DataService#rootService} is supported, and every
 * instance of DataService or a DataService subclasses must either be that root
 * service or be set as a descendent of that root service.
 *
 *
 * @class
 * @extends external:Montage
 */
const DataService = (exports.DataService = class DataService extends Target {
    /** @lends DataService */
    constructor() {
        super();

        this.defineBinding("mainService", { "<-": "mainService", source: defaultEventManager.application });
        this.defineBinding("types", { "<-": "childServices.map{types}", source: this });

        // exports.DataService.mainService = exports.DataService.mainService || this;
        // if(this === DataService.mainService) {
        //     // IdentityManager.mainService = DataService.mainService;
        //     //this.addOwnPropertyChangeListener("userLocales", this);
        //     this.addRangeAtPathChangeListener("userLocales", this, "handleUserLocalesRangeChange");
        // }

        //Deprecated now
        //this._initializeAuthorization();

        if (this.providesAuthorization) {
            exports.DataService.authorizationManager.registerAuthorizationService(this);
        }

        if (this.providesIdentity === true) {
            IdentityManager.registerIdentityService(this);
        }

        this._initializeOffline();

        this._thenableByOperationId = new Map();
        //this._pendingOperationById = new Map();

        // this._serializer = new MontageSerializer().initWithRequire(require);
        // this._deserializer = new Deserializer();

        //this.addOwnPropertyChangeListener("mainService", this);
    }

    static {
        Montage.defineProperties(this.prototype, {
            // apiVersion: {
            //     value: "FROM AWS, NECESSARY FOR GCP?"
            // }
            date: {
                get: function () {
                    return Date.date;
                },
            },
        });
    }
});

// DataService = exports.DataService = Target.specialize(/** @lends DataService.prototype */ {

//     /***************************************************************************
//      * Initializing
//      */

//     constructor: {
//         value: function DataService() {

//             this.defineBinding("mainService", {"<-": "mainService", source: defaultEventManager.application});

//             // exports.DataService.mainService = exports.DataService.mainService || this;
//             // if(this === DataService.mainService) {
//             //     // IdentityManager.mainService = DataService.mainService;
//             //     //this.addOwnPropertyChangeListener("userLocales", this);
//             //     this.addRangeAtPathChangeListener("userLocales", this, "handleUserLocalesRangeChange");
//             // }

//             //Deprecated now
//             //this._initializeAuthorization();

//             if (this.providesAuthorization) {
//                 exports.DataService.authorizationManager.registerAuthorizationService(this);
//             }

//             if(this.providesIdentity === true) {
//                 IdentityManager.registerIdentityService(this);
//             }

//             this._initializeOffline();

//             this._thenableByOperationId = new Map();
//             //this._pendingOperationById = new Map();

//             // this._serializer = new MontageSerializer().initWithRequire(require);
//             // this._deserializer = new Deserializer();

//             //this.addOwnPropertyChangeListener("mainService", this);
//         }
//     },

DataService.addClassProperties(
    {
        /**
         * A reference to the application's main service.
         *
         * Applications typically have one and only one
         * [root service]{@link DataService#rootService} to which all data requests
         * are sent, and this is called the application's main service. That service
         * can in turn delegate handling of different types of data to child
         * services specialized by type.
         *
         * This property will be set automatically by bindings
         *
         * @type {DataService}
         */
        mainService: {
            get: function () {
                return this._mainService;
            },
            set: function (service) {
                if (service !== this._mainService) {
                    this._mainService = service;

                    if (this._mainService) {
                        this.addMainServiceEventListeners();
                    }
                }
            },
        },

        addMainServiceEventListeners: {
            value: function () {},
        },

        //Works with this.addOwnPropertyChangeListener("mainService", this)
        handleMainServiceChange: {
            value: function (mainService) {
                //That only happens once
                if (mainService) {
                    // mainService.addEventListener(DataOperation.Type.ReadOperation,this,false);
                    // mainService.addEventListener(DataOperation.Type.UpdateOperation,this,false);
                    // mainService.addEventListener(DataOperation.Type.CreateOperation,this,false);
                    // mainService.addEventListener(DataOperation.Type.DeleteOperation,this,false);
                    // mainService.addEventListener(DataOperation.Type.CreateTransactionOperation,this,false);
                    // mainService.addEventListener(DataOperation.Type.BatchOperation,this,false);
                    // mainService.addEventListener(DataOperation.Type.CommitTransactionOperation,this,false);
                    // mainService.addEventListener(DataOperation.Type.RollbackTransactionOperation,this,false);

                    /*
                    Prepare to listen for ReadOperation that will be dispatched by RawDataServices that
                    handle that Read Event, so we can know the data services that handled it
                */
                    // self.addEventListener(DataOperation.Type.ReadOperation, self, true);

                    mainService.addEventListener("change", this, false);

                    mainService.addEventListener(DataOperation.Type.NoOp, this, false);
                    mainService.addEventListener(DataOperation.Type.ReadFailedOperation, this, false);
                    mainService.addEventListener(DataOperation.Type.ReadCompletedOperation, this, false);
                    mainService.addEventListener(DataOperation.Type.UpdateFailedOperation, this, false);
                    mainService.addEventListener(DataOperation.Type.UpdateCompletedOperation, this, false);
                    mainService.addEventListener(DataOperation.Type.CreateFailedOperation, this, false);
                    mainService.addEventListener(DataOperation.Type.CreateCompletedOperation, this, false);
                    mainService.addEventListener(DataOperation.Type.DeleteFailedOperation, this, false);
                    mainService.addEventListener(DataOperation.Type.DeleteCompletedOperation, this, false);
                    mainService.addEventListener(DataOperation.Type.CreateTransactionFailedOperation, this, false);
                    mainService.addEventListener(DataOperation.Type.CreateTransactionCompletedOperation, this, false);

                    // mainService.addEventListener(DataOperation.Type.BatchCompletedOperation,this,false);
                    // mainService.addEventListener(DataOperation.Type.BatchFailedOperation,this,false);
                    // mainService.addEventListener(DataOperation.Type.TransactionUpdatedOperation,this,false);
                    // mainService.addEventListener(DataOperation.Type.CommitTransactionFailedOperation,this,false);
                    // mainService.addEventListener(DataOperation.Type.CommitTransactionCompletedOperation,this,false);
                    // mainService.addEventListener(DataOperation.Type.RollbackTransactionFailedOperation,this,false);
                    // mainService.addEventListener(DataOperation.Type.RollbackTransactionCompletedOperation,this,false);
                }
            },
        },

        application: {
            get: function () {
                return defaultEventManager.application;
            },
        },

        /***************************************************************************
         * Serialization
         */

        deserializeSelf: {
            value: function (deserializer) {
                var self = this,
                    result = this,
                    value;

                value = deserializer.getProperty("identifier");
                if (value) {
                    this._identifier = value;
                }

                value = deserializer.getProperty("name");
                if (value) {
                    this.name = value;
                }

                value = deserializer.getProperty("model") || deserializer.getProperty("binder");
                if (value) {
                    this.model = value;
                }

                value = !this.model && deserializer.getProperty("types");
                if (value) {
                    var childServiceTypes = this._childServiceTypes;
                    childServiceTypes.push.apply(childServiceTypes, value);
                }

                value = deserializer.getProperty("mappings");
                if (value) {
                    Array.prototype.push.apply(this._childServiceMappings, value);
                }

                value = deserializer.getProperty("delegate");
                if (value) {
                    this.delegate = value;
                }

                value = deserializer.getProperty("isUniquing");
                if (value !== undefined) {
                    this.isUniquing = value;
                }

                value = deserializer.getProperty("childServices");
                if (value) {
                    this._deserializedChildServices = value;
                }

                value = deserializer.getProperty("authorizationPolicy");
                if (value) {
                    this.authorizationPolicy = value;
                }

                value = deserializer.getProperty("authenticationPolicy");
                if (value) {
                    this.authenticationPolicy = value;
                }

                value = deserializer.getProperty("performsAccessControl");
                if (value) {
                    this.performsAccessControl = value;
                }

                value = deserializer.getProperty("authorizedIdentiesNamedCriteria");
                if (value) {
                    this.authorizedIdenitiesNamedCriteria = value;
                }

                value = deserializer.getProperty("accessPolicies");
                if (value) {
                    /*
                    accessPolicies are cumulative, but unfortunately we're missing an operator to add (nor remove) to a property that is an array with frb. We only have a replace

                    TODO if we need AccessPolicy to have access to it's data service, we need to introduce a new addAccessPolicy() where we'll be able to add a policy.service = this.
                */

                    this.accessPolicies.push.apply(this.accessPolicies, value);
                }

                value = deserializer.getProperty("shouldAuthenticateReadOperation");
                if (value !== undefined) {
                    this.shouldAuthenticateReadOperation = value;
                }

                value = deserializer.getProperty("originIdKey");
                if (value) {
                    this.originIdKey = value;
                }

                value = deserializer.getProperty("autosaves");
                if (typeof value === "boolean") {
                    this.autosaves = value;
                }

                return this;
            },
        },

        _deserializedChildServices: {
            value: undefined,
        },

        deserializedFromSerialization: {
            value: function (label) {
                if (isArray(this._deserializedChildServices) && this._deserializedChildServices.length > 0) {
                    //var childServices = this._childServices;
                    // if(!this._childServices) {
                    //     this._childServices = [];
                    // }
                    this.addChildServices(this._deserializedChildServices);

                    //Sets ourselve as application's main service
                    if (!this.parentService && !defaultEventManager.application.mainService) {
                        defaultEventManager.application.service =
                            defaultEventManager.application.dataService =
                            defaultEventManager.application.mainService =
                                this;
                    }
                }

                if (this.authorizationPolicy === AuthorizationPolicyType.UpfrontAuthorizationPolicy) {
                    var self = this;
                    this.authorizationPromise = exports.DataService.authorizationManager
                        .authorizeService(this)
                        .then(function (authorization) {
                            self.authorization = authorization;
                            return authorization;
                        });
                }
            },
        },

        currentEnvironment: {
            value: currentEnvironment,
        },

        delegate: {
            value: null,
        },

        /***************************************************************************
         * Basic Properties
         *
         * Private properties are defined where they are used, not here.
         */

        /**
         * The types of data handled by this service. If this `undefined`, `null`,
         * or an empty array this service is assumed to handled all types of data.
         *
         * The default implementation of this property returns the union of all
         * types handled by child services of this service. Subclasses without child
         * services should override this to directly return an array of the specific
         * types they handle.
         *
         * Applications typically have one [raw data service]{@link RawDataService}
         * service for each set of related data types and one
         * [main service]{@link DataService.mainService} which is the parent of all
         * those other services and delegates work to them based on the type of data
         * to which the work applies. It is possible for child data services to have
         * children of their own and delegate some or all of their work to them.
         *
         * A service's types must not be changed after it is added as a child of
         * another service.
         *
         * @type {Array.<DataObjectDescriptor>}
         */
        types: {
            get: function () {
                return this._childServiceTypes;
            },
            set: function (value) {
                if (value !== this._childServiceTypes) {
                    this._childServiceTypes = value;
                }
            },
        },

        /**
         * The data mappings used by this service to convert objects to raw
         * data and vice-versa.
         *
         * @type {Array.<DataMapping>}
         */
        mappings: {
            get: function () {
                return this._childServiceMappings;
            },
        },

        /**
         * A property that identifies the root DataService, from the outside.
         * set by application, on both client and server side.
         *
         * It should be the same as rootService, which can only be known really when all DataServices
         * and rawDataServices have been loaded, and is used from the perspectibe of child dataServices
         * within their trees.
         *
         * @type {boolean}
         */

        _isMainService: {
            value: false,
        },
        isMainService: {
            get: function () {
                return this._isMainService;
            },
            set: function (value) {
                if (value !== this._isMainService) {
                    this._isMainService = value;
                    if (value) {
                        this.addRangeAtPathChangeListener("userLocales", this, "handleUserLocalesRangeChange");

                        /*
                        Prepare to listen for ReadOperation that will be dispatched by RawDataServices that
                        handle that Read Event, so we can know the data services that handled it
                    */
                        this.application.addEventListener(DataOperation.Type.ReadOperation, this, true);
                        this.addEventListener("change", this, false);

                        this.addEventListener(DataOperation.Type.NoOp, this, false);
                        this.addEventListener(DataOperation.Type.ReadFailedOperation, this, false);
                        this.addEventListener(DataOperation.Type.ReadCompletedOperation, this, false);
                        this.addEventListener(DataOperation.Type.UpdateFailedOperation, this, false);
                        this.addEventListener(DataOperation.Type.UpdateCompletedOperation, this, false);
                        this.addEventListener(DataOperation.Type.CreateFailedOperation, this, false);
                        this.addEventListener(DataOperation.Type.CreateCompletedOperation, this, false);
                        this.addEventListener(DataOperation.Type.DeleteFailedOperation, this, false);
                        this.addEventListener(DataOperation.Type.DeleteCompletedOperation, this, false);
                        this.addEventListener(DataOperation.Type.CreateTransactionFailedOperation, this, false);
                        this.addEventListener(DataOperation.Type.CreateTransactionCompletedOperation, this, false);
                        // this.addEventListener(DataOperation.Type.BatchCompletedOperation,this,false);
                        // this.addEventListener(DataOperation.Type.BatchFailedOperation,this,false);
                        // this.addEventListener(DataOperation.Type.TransactionUpdatedOperation,this,false);
                        // this.addEventListener(DataOperation.Type.CommitTransactionFailedOperation,this,false);
                        // this.addEventListener(DataOperation.Type.CommitTransactionCompletedOperation,this,false);
                        // this.addEventListener(DataOperation.Type.RollbackTransactionFailedOperation,this,false);
                        // this.addEventListener(DataOperation.Type.RollbackTransactionCompletedOperation,this,false);
                    } else {
                        this.removeRangeAtPathChangeListener("userLocales", this, "handleUserLocalesRangeChange");
                    }
                }
            },
        },

        /***************************************************************************
         * Service Hierarchy
         */

        /**
         * A read-only reference to the parent of this service.
         *
         * This value is modified by calls to
         * [addChildService()]{@link DataService#addChildService} and
         * [removeChildService()]{@link DataService#removeChildService} and cannot
         * be modified directly.
         *
         * Data services that have no parents are called
         * [root services]{@link DataService#rootService}.
         *
         * @type {?DataService}
         */
        parentService: {
            get: function () {
                return this._parentService;
            },
        },

        /**
         * Private settable parent service reference.
         *
         * This property's value should not be modified outside of
         * [addChildService()]{@link DataService#addChildService} and
         * [removeChildService()]{@link DataService#removeChildService}.
         *
         * @private
         * @type {?DataService}
         */
        _parentService: {
            value: undefined,
        },

        /**
         * A DataService's next target is it's parent
         * @property {boolean} serializable
         * @property {Component} value
         */
        nextTarget: {
            serializable: false,
            get: function () {
                return this._parentService;
            },
        },

        /**
         * Convenience read-only reference to the root of the service tree
         * containing this service. Most applications have only one root service,
         * the application's [main service]{@link DataService.mainService}.
         *
         * @type {DataService}
         */
        rootService: {
            get: function () {
                return this.parentService ? this.parentService.rootService : this;
            },
        },

        /**
         * Convenience method to assess if a dataService is the rootService
         *
         * @type {Boolean}
         */
        isRootService: {
            get: function () {
                return this === this.rootService;
            },
        },

        /**
         * The child services of this service.
         *
         * This value is modified by calls to
         * [addChildService()]{@link DataService#addChildService} and
         * [removeChildService()]{@link DataService#removeChildService} and must not
         * be modified directly.
         *
         * @type {Set.<DataService>}
         */
        childServices: {
            get: function () {
                if (!this._childServices) {
                    this._childServices = new Set();
                }
                return this._childServices;
            },
        },

        /**
         * Private settable child service set.
         *
         * This property should not be modified outside of the
         * [childServices getter]{@link DataService#childServices}, and its contents
         * should not be modified outside of
         * [addChildService()]{@link DataService#addChildService} and
         * [removeChildService()]{@link DataService#removeChildService}
         *
         * @private
         * @type {?Set.<DataService>}
         */
        _childServices: {
            value: undefined,
        },

        /**
         * Adds child Services to the receiving service.
         *
         * @param {Array.<DataServices>} childServices. childServices to add.
         */

        addChildServices: {
            value: function (childServices) {
                var i, countI, iChild, j, countJ, mappings, jMapping, types;

                for (i = 0, countI = childServices.length; i < countI; i++) {
                    iChild = childServices[i];

                    if (this.childServices.has(iChild)) {
                        continue;
                    }

                    if ((types = iChild.types)) {
                        this.registerTypes(types);

                        // for(j=0, countJ = types.length;(j<countJ);j++ ) {
                        //     jType = types[j];
                        //     jResult = this._makePrototypeForType(iChild, jType);
                        //     if(Promise.is(jResult)) {
                        //         (typesPromises || (typesPromises = [])).push(jResult);
                        //     }
                        // }
                    }

                    if ((mappings = iChild.mappings)) {
                        for (j = 0, countJ = mappings.length; j < countJ; j++) {
                            jMapping = mappings[j];
                            iChild.addMappingForType(jMapping, jMapping.objectDescriptor);
                        }
                    }

                    this.addChildService(iChild);

                    //Process Mappings
                    //this._childServiceMappings / addMappingForType(mapping, type)
                }

                // if(typesPromises) {
                //     this._childServiceRegistrationPromise = Promise.all(typesPromises);
                // }
            },
        },

        /**
         * Adds a raw data service as a child of this data service and set it to
         * handle data of the types defined by its [types]{@link DataService#types}
         * property.
         *
         * Child services must have their [types]{@link DataService#types} property
         * value or their [model]{@link DataService#model} set before they are passed in to
         * this method, and that value cannot change after that.  The model property takes
         * priority of the types property.  If the model is defined the service will handle
         * all the object descriptors associated to the model.
         *
         * @method
         * @argument {RawDataService} service
         * @argument {Array} [types] Types to use instead of the child's types.
         */
        addChildService: {
            value: function (child, types) {
                if (child instanceof exports.DataService && child.constructor !== exports.DataService) {
                    this._addChildService(child, types);
                } else {
                    console.warn("Cannot add child -", child);
                    console.warn("Children must be instances of DataService subclasses.");
                }
            },
        },

        _addChildService: {
            value: function (child, types) {
                var children,
                    type,
                    i,
                    n,
                    nIfEmpty = 1,
                    isNotParentService,
                    service;

                types = types || (child.model && child.model.objectDescriptors) || child.types;

                if (child === this) {
                    throw new Error("DataService cannot be added as a child of itself.");
                }

                service = this;
                while (service) {
                    if (service === child) {
                        throw new Error("DataService child registration would create a parent-service cycle.");
                    }
                    service = service._parentService;
                }

                isNotParentService = child._parentService !== this;
                // If the new child service already has a parent, remove it from
                // that parent.
                // Adding more test to allow a service to register types in multiple
                // calls, which can happen if the service is deserilized multiple times
                if (child._parentService && isNotParentService) {
                    child._parentService.removeChildService(child);
                }

                // Add the new child to this service's children set.
                if (isNotParentService) {
                    this.childServices.add(child);
                    this._childServicesByIdentifier.set(child.identifier, child);
                    this.supportsDataOperation = this.supportsDataOperation && child.supportsDataOperation;
                }
                // Add the new child service to the services array of each of its
                // types or to the "all types" service array identified by the
                // `null` type, and add each of the new child's types to the array
                // of child types if they're not already there.

                for (i = 0, n = (types && types.length) || nIfEmpty; i < n; i += 1) {
                    type = (types && types.length && types[i]) || null;
                    children = this._childServicesByType.get(type) || [];

                    //Checking in case this is called multiple times
                    if (children.indexOf(child) === -1) {
                        children.push(child);
                        if (children.length === 1) {
                            this._childServicesByType.set(type, children);
                            if (type) {
                                this._childServiceTypes.push(type);
                            }
                        }
                    }
                }
                // Set the new child service's parent.
                child._parentService = child.nextTarget = this;
            },
        },

        __childServiceRegistrationPromise: {
            value: null,
        },

        _childServiceRegistrationPromise: {
            get: function () {
                return (
                    this.__childServiceRegistrationPromise ||
                    (this.__childServiceRegistrationPromise = Promise.resolve())
                );
            },
            set: function (value) {
                this.__childServiceRegistrationPromise = value;
            },
        },

        registerChildServices: {
            value: function (childServices) {
                var self;
                if (!this.__childServiceRegistrationPromise) {
                    self = this;
                    this.__childServiceRegistrationPromise = Promise.all(
                        childServices.map(function (child) {
                            return self.registerChildService(child);
                        })
                    );
                }
            },
        },

        /**
         * Alternative to [addChildService()]{@link DataService#addChildService}.
         * While addChildService is synchronous, registerChildService is asynchronous
         * and may take a child whose [types]{@link DataService#types} property is
         * a promise instead of an array.
         *
         * This is useful for example if the child service does not know its types
         * immediately, e.g. if it must fetch them from a .mjson descriptors file.
         *
         * If the child's types is an array, it is guaranteed to behave exactly
         * like addChildService.
         *
         * @method
         * @param {DataService} child service to add to this service.
         * @param {?Promise|ObjectDescriptor|Array<ObjectDescriptor>}
         * @return {Promise}
         */
        registerChildService: {
            value: function (child, types) {
                var self = this,
                    mappings = child.mappings || [];
                // possible types
                // -- types is passed in as an array or a single type.
                // -- a model is set on the child.
                // -- types is set on the child.
                // any type can be asychronous or synchronous.
                types =
                    (types && isArray(types) && types) ||
                    (types && [types]) ||
                    (child.model && child.model.objectDescriptors) ||
                    (child.types && isArray(child.types) && child.types) ||
                    (child.types && [child.types]) ||
                    [];

                return child._childServiceRegistrationPromise.then(function () {
                    return self._registerChildServiceTypesAndMappings(child, types, mappings);
                });
            },
        },

        // #1 resolve asynchronous types
        // -- types are arrays
        // -- contents of the array can be:
        // ---- an objectDescriptor or
        // ---- a promise for an objectDescriptor or
        // ---- a promise for an array of objectDescriptors
        // -- flatten the result
        // #2 map module id to object descriptor
        // #3 register mapping to objectDescriptor
        // -- resolve the mappings references
        // -- map objectDescriptor to mapping
        // #4 make prototype for object descriptor
        // -- map constructor to prototype
        // -- map objectDescriptor to prototype
        // -- map objectDescriptor to dataTriggers

        // -- TODO: dataTriggers should be derived from all properties - mapping requisitePropertyNames

        _registerChildServiceTypesAndMappings: {
            value: function (child, types, mappings) {
                var self = this,
                    objectDescriptors;
                return this.loadThenRegisterTypes(types)
                    .then(function (descriptors) {
                        objectDescriptors = descriptors;
                        return self._registerChildServiceMappings(child, mappings);
                    })
                    .then(function () {
                        return self._makePrototypeForTypes(child, objectDescriptors);
                    })
                    .then(function () {
                        self.addChildService(child, types);
                        return null;
                    });
            },
        },

        loadThenRegisterTypes: {
            value: function (types) {
                return this._resolveAsynchronousTypes(types).then((objectDescriptors) => {
                    this.registerTypes(objectDescriptors);
                    return objectDescriptors;
                });
            },
        },

        _resolveAsynchronousTypes: {
            value: function (types) {
                var self = this;
                return Promise.all(
                    this._flattenArray(types).map(function (type) {
                        return type;
                    })
                ).then(function (descriptors) {
                    return self._flattenArray(descriptors);
                });
            },
        },

        _flattenArray: {
            value: function (array) {
                return Array.prototype.concat.apply([], array);
            },
        },

        _registerObjectDescriptor: {
            value: function (jObjectDescriptor, moduleIdToObjectDescriptorMap = this._moduleIdToObjectDescriptorMap) {
                var result = null;

                if (jObjectDescriptor.object) {
                    this._constructorToObjectDescriptorMap.set(jObjectDescriptor.object, jObjectDescriptor);
                } else if (jObjectDescriptor.module && typeof jObjectDescriptor.loadObjectFromModule === "function") {
                    var self = this;
                    result = jObjectDescriptor.loadObjectFromModule().then(function () {
                        self._constructorToObjectDescriptorMap.set(jObjectDescriptor.object, jObjectDescriptor);
                    });
                }
                var jModule = jObjectDescriptor.module;
                if (!jModule) {
                    jModuleId = Montage.getInfoForObject(this).moduleId;
                } else {
                    jModuleId = jModule.id;
                    jModuleId += "/";
                    jModuleId += jObjectDescriptor.exportName;
                }
                moduleIdToObjectDescriptorMap[jModuleId] = jObjectDescriptor;

                //Setup the event propagation chain
                /*
                this is now done in objectDescriptor as it follows the hierachy of objectDescriptor before getting to DataServices.
            */
                // jObjectDescriptor.nextTarget = service;
                return result;
            },
        },

        registerTypes: {
            value: function (types) {
                var map = this._moduleIdToObjectDescriptorMap,
                    typesPromises,
                    j,
                    countJ,
                    jObjectDescriptor,
                    jResult,
                    self = this;

                for (j = 0, countJ = types.length; j < countJ; j++) {
                    jObjectDescriptor = types[j];

                    jResult = this._registerObjectDescriptor(jObjectDescriptor, map);

                    // jResult = this._makePrototypeForType(service, jObjectDescriptor);
                    if (jResult && Promise.is(jResult)) {
                        (typesPromises || (typesPromises = [])).push(jResult);
                    }
                }

                // types.forEach(function (objectDescriptor) {
                //     var module = objectDescriptor.module,
                //         moduleId = [module.id, objectDescriptor.exportName].join("/");
                //     map[moduleId] = objectDescriptor;
                // });

                if (typesPromises) {
                    this._childServiceRegistrationPromise = Promise.all(typesPromises);
                }
            },
        },

        _registerChildServiceMappings: {
            value: function (child, mappings) {
                var self = this;
                return Promise.all(
                    mappings.map(function (mapping) {
                        return self._addMappingToChild(mapping, child);
                    })
                );
            },
        },

        _makePrototypeForTypes: {
            value: function (childService, types) {
                var self = this;
                return Promise.all(
                    types.map(function (objectDescriptor) {
                        return self._makePrototypeForType(childService, objectDescriptor);
                    })
                );
            },
        },

        _makePrototypeForType: {
            value: function (childService, objectDescriptor) {
                if (objectDescriptor.object) {
                    return this.__makePrototypeForType(childService, objectDescriptor, objectDescriptor.object);
                } else {
                    var self = this,
                        module = objectDescriptor.module;
                    if (module && typeof objectDescriptor.loadObjectFromModule === "function") {
                        return objectDescriptor.loadObjectFromModule().then(function (moduleObject) {
                            return self.__makePrototypeForType(childService, objectDescriptor, moduleObject);
                        });

                        // return module.require.async(module.id).then(function (exports) {
                        //     return self.__makePrototypeForType(childService, objectDescriptor, exports[objectDescriptor.exportName]);
                        // });
                    } else {
                        return Promise.resolveNull;
                    }
                }
            },
        },

        __makePrototypeForType: {
            value: function (childService, objectDescriptor, constructor) {
                /* to handle things like native types passing by */
                if (!childService) {
                    return constructor
                        ? constructor.prototype
                        : objectDescriptor?.object
                        ? objectDescriptor.object.prototype
                        : typeof objectDescriptor === "function"
                        ? objectDescriptor
                        : null;
                }

                var prototype = Object.create(
                        constructor?.prototype
                            ? constructor.prototype
                            : typeof objectDescriptor === "function"
                            ? objectDescriptor
                            : Object
                    ),
                    mapping = childService.mappingForType(objectDescriptor),
                    /*
                FIXME
                we're "lucky" here as when this is called, the current DataService hasn't registered yet the mappings, so we end up creating triggers for all property descriptors.
            */
                    requisitePropertyNames = (mapping && mapping.requisitePropertyNames) || new Set(),
                    dataTriggers = this.DataTrigger.addTriggers(
                        this,
                        objectDescriptor,
                        prototype,
                        requisitePropertyNames
                    ),
                    mainService = this.rootService;

                Object.defineProperty(prototype, "dataIdentifier", {
                    enumerable: true,
                    get: function () {
                        return mainService.dataIdentifierForObject(this);
                    },
                });
                Object.defineProperty(prototype, "snapshot", {
                    enumerable: true,
                    get: function () {
                        /*
                        this is making a big assumption that there's only one raw data service handling this,
                        but the whole point of introducing data operations was to open up the fact that there could be multiple,
                        like a cloud + a local.

                        So we might want to keep an eye on this, even though all should be in-sync if they handle the same properties.
                    */
                        return this.dataIdentifier.dataService.snapshotForObject(this);
                        // return mainService._getChildServiceForObject(this)?.snapshotForObject(this);
                    },
                });
                Object.defineProperty(prototype, "nextTarget", {
                    enumerable: true,
                    get: function () {
                        return this.objectDescriptor;
                    },
                });

                /*
                OPTIMIZE ME: We need to be smarter and only do that for the highest levels as it will be inherited
            */
                Object.defineProperty(prototype, "propertyChanges_prototype_addOwnPropertyChangeListener", {
                    value: this.propertyChanges_prototype_addOwnPropertyChangeListener,
                });
                Object.defineProperty(prototype, "addOwnPropertyChangeListener", {
                    value: this._dataObject_addOwnPropertyChangeListener,
                });

                Object.defineProperty(prototype, "propertyChanges_prototype_removeOwnPropertyChangeListener", {
                    value: this.propertyChanges_prototype_removeOwnPropertyChangeListener,
                });
                Object.defineProperty(prototype, "removeOwnPropertyChangeListener", {
                    value: this._dataObject_removeOwnPropertyChangeListener,
                });

                this._dataObjectPrototypes.set(constructor, prototype);
                this._dataObjectPrototypes.set(objectDescriptor, prototype);
                this._dataObjectTriggers.set(objectDescriptor, dataTriggers);
                // this._constructorToObjectDescriptorMap.set(constructor, objectDescriptor);
                return prototype;
            },
        },

        _addMappingToChild: {
            value: function (mapping, child) {
                var service = this;
                return Promise.all([mapping.objectDescriptor, mapping.rawDataDescriptor]).then(function ([
                    objectDescriptor,
                    rawDataDescriptor,
                ]) {
                    // TODO -- remove looking up by string to unique.
                    var type = [objectDescriptor.module.id, objectDescriptor.name].join("/");
                    objectDescriptor = service._moduleIdToObjectDescriptorMap[type];
                    mapping.objectDescriptor = objectDescriptor;
                    mapping.rawDataDescriptor = rawDataDescriptor;
                    mapping.service = child;
                    child.addMappingForType(mapping, objectDescriptor);
                    return null;
                });
            },
        },

        objectDescriptorForType: {
            value: function (type) {
                var descriptor =
                    this._constructorToObjectDescriptorMap.get(type) ||
                    (typeof type === "string" && this._moduleIdToObjectDescriptorMap[type]);

                return descriptor || type;
            },
        },

        _objectDescriptorForType: {
            value: function (type) {
                return this.objectDescriptorForType(type);
            },
        },

        _constructorToObjectDescriptorMap: {
            value: new Map(),
        },

        _moduleIdToObjectDescriptorMap: {
            value: {},
        },

        /**
         * Remove a raw data service as a child of this service and clear its parent
         * if that service is a child of this service.
         *
         * The performance of this method is O(m) + O(n), where m is the number of
         * children of this service handling the same type as the child service to
         * remove and n is the number of types handled by all children of this
         * service.
         *
         * @method
         * @argument {RawDataService} service
         * @argument {Array} [types] Types to use instead of the child's types.
         */
        removeChildService: {
            value: function (child, types) {
                var type, chidren, index, i, n;
                types = types || child.types;
                // Remove the child service from the services array of each of its
                // types or from the "all types" service array identified by the
                // `null` type, or remove a type altogether if its service array
                // only contains the child service to remove, or remove the "all
                // types" service array if it only contains the child service to
                // remove.
                for (i = 0, n = (types && types.length) || 1; i < n; i += 1) {
                    type = (types && types.length && types[i]) || null;
                    chidren = this._childServicesByType.get(type);
                    index = chidren ? chidren.indexOf(child) : -1;
                    if (index >= 0 && chidren.length > 1) {
                        chidren.splice(index, 1);
                    } else if (index === 0) {
                        this._childServicesByType.delete(type);
                        index = type ? this._childServiceTypes.indexOf(type) : -1;
                        if (index >= 0) {
                            this._childServiceTypes.splice(index, 1);
                        }
                    }
                }
                // Remove the child from this service's children set.
                this.childServices.delete(child);
                // Clear the service parent if appropriate.
                if (child._parentService === this) {
                    child._parentService = undefined;
                }
            },
        },

        /**
         * Alternative to [removeChildService()]{@link DataService#removeChildService}.
         * While removeChildService is synchronous, unregisterChildService is asynchronous
         * and may take a child whose [types]{@link DataService#types} property is
         * a promise instead of an array.
         *
         * This is useful for example if the child service does not know its types
         * immediately, e.g. if it must fetch them from a .mjson descriptors file.
         *
         * If the child's types is an array, it is guaranteed to behave exactly
         * like removeChildService.
         *
         * @method
         * @return {Promise}
         */
        unregisterChildService: {
            value: function (child) {
                var self = this;
                return new Promise(function (resolve, reject) {
                    self.removeChildService(child, child.types);
                    resolve();
                });
            },
        },

        /**
         * A map from each of the data types handled by this service to an array
         * of the child services that can handle that type, with each such array
         * ordered according to the order in which the services in it were
         * [added]{@link DataService#addChildService} as children of this service.
         *
         * If one or more child services of this service are defined as handling all
         * types (their [types]{@link DataService#types} property is `undefined`,
         * `null`, or an empty array), the child service map also include a `null`
         * key whose corresponding value is an array of all those services defined
         * to handle all types.
         *
         * The contents of this map should not be modified outside of
         * [addChildService()]{@link DataService#addChildService} and
         * [removeChildService()]{@link DataService#removeChildService}.
         *
         * @private
         * @type {Map<DataObjectDescriptor, Array.<DataService>>}
         */
        _childServicesByType: {
            get: function () {
                if (!this.__childServicesByType) {
                    this.__childServicesByType = new Map();
                }
                return this.__childServicesByType;
            },
        },

        __childServicesByType: {
            value: undefined,
        },

        /**
         * Returns true if type is one of the types a data service has been configured to support.
         * Which means at the minimum how to map a type from raw data.x
         *
         * Note that to have a mmore fine-grained assessment of what a DataService can do with that type,
         * Use handlesDataOperationForType() / handlesDataOperationTypeForType()
         *
         * @method
         * @argument {ObjectDescriptor} type
         * @return {boolean}
         */
        handlesType: {
            value: function (type) {
                return (
                    this.types.indexOf(type) !== -1
                    /* || (this.childServicesForType(type)?.length > 0)*/
                );
                //return (this.rootService._childServicesByType.get(type).indexOf(this) !== -1);
            },
        },

        /**
         * Returns true if the data service knows how to handle the passed dataOperation
         *
         * Note that to have a mmore fine-grained assessment of what a DataService can do with that type,
         * Use handlesDataOperationForType() / handlesDataOperationTypeForType()
         *
         * @method
         * @argument {DataOperation} dataOperation
         * @argument {ObjectDescriptor} type
         * @return {boolean}
         */
        handlesDataOperation: {
            value: function (dataOperation) {
                return this.handlesDataOperationTypeForType(dataOperation.type, dataOperation.target);
            },
        },

        /**
         * Returns true if the data service knows how to handle the passed dataOperation's type
         * for the passed type / objectDescriptor
         *
         * By default it assumes a DataService handles all types of operation per data type
         *
         * Would it be better named:
         *  - handlesDataOperationTypeForDataType ?
         *  - handlesDataOperationTypeForObjectDescriptor ?
         *
         * @method
         * @argument {DataOperation} dataOperation
         * @argument {ObjectDescriptor} type
         * @return {boolean}
         */
        handlesDataOperationTypeForType: {
            value: function (dataOperationType, type) {
                return this.handlesType(type);
            },
        },

        _childServicesByIdentifier: {
            get: function () {
                if (!this.__childServicesByIdentifier) {
                    this.__childServicesByIdentifier = new Map();
                }
                return this.__childServicesByIdentifier;
            },
        },

        __childServicesByIdentifier: {
            value: undefined,
        },

        /**
         * An array of the data types handled by all child services of this service.
         *
         * The contents of this map should not be modified outside of
         * [addChildService()]{@link DataService#addChildService} and
         * [removeChildService()]{@link DataService#removeChildService}.
         *
         * @private
         * @type {Array.<DataObjectDescriptor>}
         */
        _childServiceTypes: {
            get: function () {
                if (!this.__childServiceTypes) {
                    this.__childServiceTypes = [];
                }
                return this.__childServiceTypes;
            },
        },

        __childServiceTypes: {
            value: undefined,
        },

        /**
         * Get the first child service that can handle the specified object,
         * or `null` if no such child service exists.
         *
         * @private
         * @method
         * @argument {Object} object
         * @returns DataService
         */
        _getChildServiceForObject: {
            value: function (object) {
                return this.childServiceForType(this.rootService._getObjectType(object));
            },
        },

        /**
         * Get all child services that handle data of the specified type argument,
         * or `null` if no such child service exists.
         *
         * @method
         * @argument {ObjectDescriptor} type
         * @returns {Array<DataService>}
         */
        childServicesForType: {
            value: function (type) {
                var services;
                type = type instanceof ObjectDescriptor ? type : this.objectDescriptorForType(type);
                //services = this._childServicesByType.get(type) || this._childServicesByType.get(null);
                services = this._childServicesByType.get(type);
                /*
                    Fixing bug were a catch-all data service, one that states it handles all by having no type
                    could end up multiple times in  services as the following block was executed at every call with the same type argument.

                    So freezing the array storing the results in this._childServicesByType allows us to know we
                    don't need to do it again
                */
                if (services) {
                    let catchAllServices = this._childServicesByType.get(null);
                    if (catchAllServices && !Object.isFrozen(services)) {
                        services.push(...catchAllServices);
                        Object.freeze(services);
                    }
                } else {
                    services = this._childServicesByType.get(null);
                }
                return services || null;
            },
        },

        /**
         * Get all child services that handle a dataOperation, which can mean:
         *  - handling the type of operation — dataOperation.type
         *  - handling the object descriptor involved - dataOperation.target
         *  - but also handling the readExpressions involved — dataOperation.data.readExpresssions
         *    
         * Just because a RawDataService can read objects of a certain type, doesn't necessarily means 
         * it can resolves a property/relationship on the source object descriptor (dataOperation.target) to that type
         *
         * TODO: ADD CACHING
         *
         * @method
         * @argument {DataOperationType} dataOperationtype
         * @argument {ObjectDescriptor} type
         * @returns {Array<DataService>}
         */
        childServicesHandlingDataOperation: {
            value: function (dataOperation) {
                return this.childServicesHandlingDataOperationTypeForType(dataOperation.type, dataOperation.target);
            },
        },

        /**
         * Get all child services that handle dataOperationtype of the specified type argument,
         * or `null` if no such child service exists.
         *
         * TODO: ADD CACHING
         *
         * @method
         * @argument {DataOperationType} dataOperationtype
         * @argument {ObjectDescriptor} type
         * @returns {Array<DataService>}
         */
        childServicesHandlingDataOperationTypeForType: {
            value: function (dataOperationtype, type) {
                return this.childServicesForType(type)?.filter(
                    (service) => service.handlesDataOperationTypeForType(dataOperationtype, type) === true
                );
            },
        },

        /*
        TODO: cache / optimize
    */
        childServicesThatCanSaveDataType: {
            value: function (type) {
                return this.childServicesForType(type)?.filter((service) => service.canSaveData === true);
            },
        },

        /**
         * Get all descendant child services that can handle data of the specified type,
         * or `null` if no such child service exists. They are ordered to be depth first, followed by their parent
         *
         * @private
         * @method
         * @argument {DataObjectDescriptor} type
         * @returns {Set.<DataService,number>}
         */

        __descendantServicesByType: {
            value: undefined,
        },
        _descendantServicesByType: {
            get: function () {
                if (!this.__descendantServicesByType) {
                    this.__descendantServicesByType = new Map();
                }
                return this.__descendantServicesByType;
            },
        },

        descendantServicesForType: {
            value: function (type) {
                var descendantServicesForType = this._descendantServicesByType.get(type);

                if (!descendantServicesForType) {
                    var childServices = this.childServicesForType(type),
                        countI = childServices?.length || 0;

                    if (countI > 0) {
                        var i = 0,
                            iChildService,
                            iDescendantServicesForType;

                        descendantServicesForType = [];

                        do {
                            iChildService = childServices[i];

                            if (iChildService) {
                                iDescendantServicesForType = iChildService.descendantServicesForType(type);
                                if (iDescendantServicesForType) {
                                    descendantServicesForType.push.apply(
                                        descendantServicesForType,
                                        iDescendantServicesForType
                                    );
                                }
                                descendantServicesForType.push(iChildService);
                            }
                            i++;
                        } while (i < countI);
                    } else if (this.handlesType(type)) {
                        descendantServicesForType = this;
                    } else {
                        descendantServicesForType = null;
                    }

                    this._descendantServicesByType.set(type, descendantServicesForType);
                }

                return descendantServicesForType;
            },
        },

        /**
         * Get the first child service that can handle data of the specified type,
         * or `null` if no such child service exists.
         *
         * @private
         * @method
         * @argument {DataObjectDescriptor} type
         * @returns {Set.<DataService,number>}
         */
        childServiceForType: {
            value: function (type) {
                var services = this.childServicesForType(type);
                return (services && services[0]) || null;
            },
        },

        /***************************************************************************
         * Mappings
         */

        /**
         * Adds a mapping to the service for the specified
         * type.
         * @param {DataMapping} mapping.  The mapping to use.
         * @param {ObjectDescriptor} type.  The object type.
         */
        addMappingForType: {
            value: function (mapping, type) {
                mapping.service = mapping.service || this;
                this._mappingByType.set(type, mapping);
            },
        },

        /**
         * Return the mapping to use for the specified type.
         * @param {ObjectDescriptor} type.
         * @returns {DataMapping|null} returns the specified mapping or null
         * if a mapping is not defined for the specified type.
         *
         * If an immediate mapping isn't found, we look up the parent chain
         */
        mappingForType: {
            value: function (type) {
                if (this.isRootService) {
                    var childService = this.childServiceForType(type);
                    if (childService) {
                        return childService.mappingForType(type);
                    } else {
                        return null;
                    }
                } else {
                    var mapping,
                        localType = this.objectDescriptorForType(type);

                    while (
                        localType &&
                        !(mapping = this._mappingByType.has(localType) && this._mappingByType.get(localType))
                    ) {
                        localType = localType.parent;
                    }
                    return mapping || null;
                }
            },
        },

        mappingWithType: {
            value: deprecate.deprecateMethod(
                void 0,
                function (type) {
                    return this.mappingForType(type);
                },
                "mappingWithType",
                "mappingForType"
            ),
        },

        _mappingByType: {
            get: function () {
                if (!this.__mappingByType) {
                    this.__mappingByType = new Map();
                }
                return this.__mappingByType;
            },
        },

        __mappingByType: {
            value: undefined,
        },

        _childServiceMappings: {
            get: function () {
                if (!this.__childServiceMappings) {
                    this.__childServiceMappings = [];
                }
                return this.__childServiceMappings;
            },
        },

        __childServiceMappings: {
            value: undefined,
        },

        /***************************************************************************
         * Models
         */

        /**
         * The [model]{@link ObjectModel} that this service supports.  If the model is
         * defined the service supports all the object descriptors contained within the model.
         */
        _model: {
            value: undefined,
        },

        model: {
            get: function () {
                return this._model;
            },
            set: function (value) {
                if (value !== this._model) {
                    var childServiceTypes = this._childServiceTypes;
                    //TODO Remove correctly the types of the model going away: handling of events, etc...
                    this._model = value;
                    childServiceTypes.push.apply(childServiceTypes, this._model.objectDescriptors);
                }
            },
        },

        /**
         * The maximum amount of time a DataService's data will be considered fresh.
         * ObjectDescriptor's maxAge should take precedence over this and a DataStream's dataMaxAge should
         * take precedence over a DataService's dataMaxAge global default value.
         *
         * @type {Number}
         */
        dataMaxAge: {
            value: undefined,
        },

        /***************************************************************************
         *
         * Authorization
         *
         ***************************************************************************/

        _initializeAuthorization: {
            value: function () {
                if (this.providesAuthorization) {
                    exports.DataService.authorizationManager.registerAuthorizationService(this);
                }

                if (this.authorizationPolicy === AuthorizationPolicyType.UpfrontAuthorizationPolicy) {
                    var self = this;
                    this.authorizationPromise = exports.DataService.authorizationManager
                        .authorizeService(this)
                        .then(function (authorization) {
                            self.authorization = authorization;
                            return authorization;
                        });
                } else {
                    //Service doesn't need anything upfront, so we just go through
                    this.authorizationPromise = Promise.resolve();
                }
            },
        },

        /**
         * Returns the AuthorizationPolicyType used by this DataService.
         *
         * @type {AuthorizationPolicyType}
         */
        authorizationPolicy: {
            value: AuthorizationPolicyType.NoAuthorizationPolicy,
        },

        /**
         * holds authorization object after a successful authorization
         *
         * @type {Object}
         */

        authorization: {
            value: undefined,
        },

        authorizationPromise: {
            value: Promise.resolve(),
        },

        /**
         * Returns the list of moduleIds of DataServices a service accepts to provide
         * authorization on its behalf. If an array has multiple
         * authorizationServices, the final choice will be up to the App user
         * regarding which one to use. This array is expected to return moduleIds,
         * not objects, allowing the AuthorizationManager to manage unicity
         *
         * @type {string[]}
         */
        authorizationServices: {
            value: null,
        },

        /**
         * @type {string}
         * @description Module ID of the panel component used to gather necessary authorization information
         */
        authorizationPanel: {
            value: undefined,
        },

        /**
         * Indicates whether a service can provide user-level authorization to its
         * data. Defaults to false. Concrete services need to override this as
         * needed.
         *
         * @type {boolean}
         */
        providesAuthorization: {
            value: false,
        },

        /**
         * Performs whatever tasks are necessary to authorize
         * this service and returns a Promise that resolves with
         * an Authorization object.
         *
         * @method
         * @returns Promise
         */
        authorize: {
            value: undefined,
        },

        /********* New set of methods for user identity and authentication **********/

        /**
         * Indicates whether a service can provide application user-identity .
         * Defaults to false. Concrete services need to override this as
         * needed.
         *
         * @type {boolean}
         */

        providesIdentity: {
            value: false,
        },

        /**
         * Returns the AuthenticationPolicyType used by a DataService. For enabling both
         * system to co-exists for upgradability, there is no default here.
         * DataServices suclass have to provide it.
         *
         * @type {AuthorizationPolicyType}
         */
        authenticationPolicy: {
            value: AuthorizationPolicyType.NoAuthorizationPolicy,
        },

        /**
         * The identity for the data service. It could be an unauthenticated/
         * anonymous identity, a user identity or an agent/application identity
         *
         * @type {Object}
         */

        identity: {
            value: undefined,
        },

        /**
         * a promise to the user identity for the data service. This is necessary to buffer
         * fetch/data operations that can't be executed until a valid user identity is known.
         *
         * @type {Object}
         */

        identityPromise: {
            value: Promise.resolve(),
        },

        /**
         * The list of DataServices a service accepts to provide
         * authorization on its behalf. If an array has multiple
         * authorizationServices, the final choice will be up to the App user
         * regarding which one to use. This array is expected to return moduleIds,
         * not objects, allowing the AuthorizationManager to manage unicity
         *
         * @type {string[]}
         */
        identityServices: {
            value: null,
        },

        /**
         *
         * @method
         * @returns Promise
         */
        logOut: {
            value: undefined,
        },

        /***************************************************************************
         * Data Object Types
         */

        /**
         * Returns an object descriptor for the provided object.  If this service
         * does not have an object descriptor for this object it will ask its
         * parent for one.
         *
         * TODO: looks like we're looping all the time and not caching a lookup"
         * Why isn't objectDescriptorWithModuleId used??
         *
         * @param {object}
         * @returns {ObjectDescriptor|null} if an object descriptor is not found this
         * method will return null.
         */
        objectDescriptorForObject: {
            value: function (object) {
                var objectDescriptor = this._objectDescriptorForObjectCache.get(object);

                if (!objectDescriptor) {
                    objectDescriptor = this.objectDescriptorForType(object?.constructor);
                }

                if (!objectDescriptor) {
                    var types = this.types,
                        objectInfo = Montage.getInfoForObject(object),
                        moduleId = objectInfo.moduleId,
                        objectName = objectInfo.objectName,
                        module,
                        exportName,
                        i,
                        n;

                    objectDescriptor = this.objectDescriptorWithModuleId(moduleId);
                    for (i = 0, n = types.length; i < n && !objectDescriptor; i += 1) {
                        module = types[i].module;
                        exportName = module && types[i].exportName;
                        if (module && moduleId === module.id && objectName === exportName) {
                            if (objectDescriptor !== types[i]) {
                                console.error(
                                    "objectDescriptorWithModuleId cached an objectDescriptor and objectDescriptorForObject finds another"
                                );
                            }
                            objectDescriptor = types[i];
                        }
                    }
                    return (
                        objectDescriptor || (this.parentService && this.parentService.objectDescriptorForObject(object))
                    );
                } else {
                    return objectDescriptor;
                }
            },
        },

        _objectDescriptorByModuleId: {
            value: undefined,
        },
        _mjsonExtension: {
            value: ".mjson",
        },
        objectDescriptorWithModuleId: {
            value: function (objectDescriptorModuleId) {
                if (!this._objectDescriptorByModuleId) {
                    var map = (this._objectDescriptorByModuleId = new Map());

                    var types = this.types,
                        i,
                        n,
                        iType,
                        iInfo,
                        iModuleId,
                        mjsonExtension = this._mjsonExtension;
                    for (i = 0, n = types.length; i < n; i++) {
                        iType = types[i];
                        if (!iType.module) {
                            iInfo = Montage.getInfoForObject(iType);
                            iModuleId = iInfo.moduleId;
                            if (iModuleId.endsWith(mjsonExtension)) {
                                iModuleId = iModuleId.removeSuffix(mjsonExtension);
                            }
                            map.set(iModuleId, iType);
                        } else {
                            map.set(iType.module.id, iType);
                        }
                    }
                }
                return this._objectDescriptorByModuleId.get(objectDescriptorModuleId);
            },
        },

        /**
         * Get the type of the specified data object.
         *
         * @private
         * @method
         * @argument {Object} object       - The object whose type is sought.
         * @returns {DataObjectDescriptor} - The type of the object, or undefined if
         * no type can be determined.
         */
        _getObjectType: {
            value: function (object) {
                var type = this._typeRegistry.get(object),
                    moduleId = typeof object === "string" ? object : this._getModuleIdForObject(object);
                while (!type && object) {
                    if (object.constructor.TYPE instanceof DataObjectDescriptor) {
                        type = object.constructor.TYPE;
                    } else if (this._moduleIdToObjectDescriptorMap[moduleId]) {
                        type = this._moduleIdToObjectDescriptorMap[moduleId];
                    } else {
                        object = Object.getPrototypeOf(object);
                    }
                }
                return type;
            },
        },

        _getModuleIdForObject: {
            value: function (object) {
                var info = Montage.getInfoForObject(object);
                return [info.moduleId, info.objectName].join("/");
            },
        },

        /**
         * Register the type of the specified data object if necessary.
         *
         * @private
         * @method
         * @argument {Object} object
         * @argument {DataObjectDescriptor} type
         */
        _setObjectType: {
            value: function (object, type) {
                if (this._getObjectType(object) !== type) {
                    this._typeRegistry.set(object, type);
                }
            },
        },

        _typeRegistry: {
            get: function () {
                if (!this.__typeRegistry) {
                    this.__typeRegistry = new WeakMap();
                }
                return this.__typeRegistry;
            },
        },

        shouldListenForRemoteObjectPropertyChange: {
            value: function (dataObjecy, key, beforeChange) {
                return false;
            },
        },

        propertyChanges_prototype_addOwnPropertyChangeListener: {
            value: PropertyChanges.prototype.addOwnPropertyChangeListener,
        },
        propertyChanges_prototype_removeOwnPropertyChangeListener: {
            value: PropertyChanges.prototype.removeOwnPropertyChangeListener,
        },

        /*
        This is executed on DataObject instances, so this is an instance of a DataObject.
    */
        __dataObject_addOwnPropertyChangeListener: {
            value: undefined,
        },

        _dataObject_addOwnPropertyChangeListener: {
            get: function () {
                if (!this.__dataObject_addOwnPropertyChangeListener) {
                    var dataService = this;

                    this.__dataObject_addOwnPropertyChangeListener = function (
                        key,
                        listener,
                        beforeChange,
                        trackRemoteChanges
                    ) {
                        if (
                            trackRemoteChanges ||
                            dataService.shouldListenForRemoteObjectPropertyChange(this, key, beforeChange)
                        ) {
                            // if(dataService.shouldAddEventListenerForObjectRemotePropertyChange(this,key,beforeChange)) {
                            dataService.trackRemoteObjectPropertyChanges(this, key);
                        }
                        return this.propertyChanges_prototype_addOwnPropertyChangeListener(key, listener, beforeChange);
                    };
                }
                return this.__dataObject_addOwnPropertyChangeListener;
            },
        },

        __dataObject_removeOwnPropertyChangeListener: {
            value: undefined,
        },
        _dataObject_removeOwnPropertyChangeListener: {
            get: function () {
                if (!this.__dataObject_removeOwnPropertyChangeListener) {
                    var dataService = this;

                    this.__dataObject_removeOwnPropertyChangeListener = function (
                        key,
                        listener,
                        beforeChange,
                        trackRemoteChanges
                    ) {
                        if (
                            trackRemoteChanges ||
                            dataService.shouldListenForRemoteObjectPropertyChange(this, key, beforeChange)
                        ) {
                            // if(dataService.shouldAddEventListenerForObjectRemotePropertyChange(this,key,beforeChange)) {
                            dataService.removeEventListener("");
                        }

                        return this.propertyChanges_prototype_removeOwnPropertyChangeListener(
                            key,
                            listener,
                            beforeChange
                        );
                    };
                }
                return this.__dataObject_removeOwnPropertyChangeListener;
            },
        },

        /***************************************************************************
         * Data Object Triggers
         */

        /**
         * Returns a prototype for objects of the specified type. The returned
         * prototype will have a [data trigger]{@link DataTrigger} defined for each
         * lazy relationships and properties of that type. A single prototype will
         * be created for all objects of a given type.
         *
         * @private
         * @method
         * @argument {DataObjectDescriptor|ObjectDescriptor} type
         * @returns {Object}
         */
        _getPrototypeForType: {
            value: function (type, _rawDataService) {
                var info, triggers, prototypeToExtend, prototype;
                type = this.objectDescriptorForType(type);
                prototype = this._dataObjectPrototypes.get(type);
                if (type && !prototype) {
                    return this.__makePrototypeForType(
                        _rawDataService || this.childServiceForType(type),
                        type,
                        type.object
                    );

                    // //type.objectPrototype is legacy and should be depreated over time
                    // prototypeToExtend = type.objectPrototype || Object.getPrototypeOf(type.module) || Montage.prototype;
                    // prototype = Object.create(prototypeToExtend);
                    // prototype.constuctor = type.objectPrototype     ? type.objectPrototype.constructor
                    //                                                 : type.module;

                    // if(prototype.constuctor.name === "constructor" ) {
                    //     Object.defineProperty(prototype.constuctor, "name", { value: type.typeName });
                    // }

                    // this._dataObjectPrototypes.set(type, prototype);
                    // if (type instanceof ObjectDescriptor || type instanceof DataObjectDescriptor) {
                    //     triggers = this.DataTrigger.addTriggers(this, type, prototype);
                    // } else {
                    //     info = Montage.getInfoForObject(type.prototype);
                    //     console.warn("Data Triggers cannot be created for this type. (" + (info && info.objectName) + ") is not an ObjectDescriptor");
                    //     triggers = [];
                    // }
                    // this._dataObjectTriggers.set(type, triggers);
                    // //We add a property that returns an object's snapshot
                    // //We add a property that returns an object's primaryKey
                    // //Let's postponed this for now and revisit when we need
                    // //add more properties/logic to automatically track changes
                    // //on objects

                    // // Object.defineProperties(prototype, {
                    // //      "montageDataSnapshot": {
                    // //          get: this.__object__snapshotMethodImplementation
                    // //      },
                    // //      "montageDataPrimaryKey": {
                    // //          get: this.__object_primaryKeyMethodImplementation
                    // //      }
                    // //  });

                    // //Adds support for event structure, setting the classes as instances next target
                    // //if there's type.module
                    // if(type.module) {
                    //     Object.defineProperty(prototype, "nextTarget", { value: type.module });

                    //     //setting objectDescriptor as classes next target:
                    //     Object.defineProperty(type.module, "nextTarget", { value: type });
                    // } else {
                    //     //If no known custom JS constructor, we go straight to the object descriptor:
                    //     Object.defineProperty(prototype, "nextTarget", { value: type });
                    // }

                    // // //set data service as objectDescriptor next target:
                    // // Object.defineProperty(type, "nextTarget", { value: this.mainService });
                }
                return prototype;
            },
        },

        // __object__snapshotMethodImplementation: {
        //     value: function() {
        //         return exports.DataService.mainService._getChildServiceForObject(this).snapshotForObject(this);
        //     }
        // },
        // __object_primaryKeyMethodImplementation: {
        //     value: function() {
        //         return exports.DataService.mainService.dataIdentifierForObject(this).primaryKey;
        //     }
        // },

        /**
         * Returns the [data triggers]{@link DataTrigger} set up for objects of the
         * specified type.
         *
         * @private
         * @method
         * @argument {Object} object
         * @returns {Object<string, DataTrigger>}
         */
        _getTriggersForObject: {
            value: function (object) {
                var type = this._getObjectType(object),
                    triggers = type && this._dataObjectTriggers.get(type);
                if (!triggers && this.handlesType(type)) {
                }
                return triggers;
            },
        },

        _triggerForObjectProperty: {
            value: function (object, propertyName) {
                return this._getTriggersForObject(object)?.[propertyName];
            },
        },

        _dataObjectPrototypes: {
            // get: function () {
            //     if (!this.__dataObjectPrototypes){
            //         this.__dataObjectPrototypes = new Map();
            //     }
            //     return this.__dataObjectPrototypes;
            // },
            value: new Map(),
        },

        __dataObjectPrototypes: {
            value: undefined,
        },

        _dataObjectTriggers: {
            get: function () {
                if (!this.__dataObjectTriggers) {
                    this.__dataObjectTriggers = new Map();
                }
                return this.__dataObjectTriggers;
            },
        },

        __dataObjectTriggers: {
            value: undefined,
        },

        /***************************************************************************
         * Data Object Properties
         */

        /**
         * Since root services are responsible for triggering data objects fetches,
         * subclasses whose instances will not be root services should override this
         * method to call their root service's implementation of it.
         *
         * @todo Rename and document API and implementation.
         *
         * @method
         */
        decacheObjectProperties: {
            value: function (object, propertyNames) {
                if (this.isRootService) {
                    var names = isArray(propertyNames) ? propertyNames : arguments,
                        start = names === propertyNames ? 0 : 1,
                        triggers = this._getTriggersForObject(object),
                        trigger,
                        i,
                        n;
                    for (i = start, n = names.length; i < n; i += 1) {
                        trigger = triggers && triggers[names[i]];
                        if (trigger) {
                            trigger.decacheObjectProperty(object);
                        }
                    }
                } else {
                    this.rootService.decacheObjectProperties(object, propertyNames);
                }
            },
        },

        /**
         * Request possibly asynchronous values of a data object's properties. These
         * values will only be fetched if necessary and only the first time they are
         * requested.
         *
         * To force an update of a value that was previously obtained or set, use
         * [updateObjectProperties()]{@link DataService#updateObjectProperties}
         * instead of this method.
         *
         * Since root services are responsible for determining when to fetch or
         * update data objects values, subclasses whose instances will not be root
         * services should override this method to call their root service's
         * implementation of it.
         *
         * Subclasses should define how property values are obtained by overriding
         * [fetchObjectProperty()]{@link DataService#fetchObjectProperty} instead
         * of this method. That method will be called by this method when needed.
         *
         * Although this method returns a promise, the requested data will not be
         * passed in to the promise's callback. Instead that callback will received
         * a `null` value and the requested values will be set on the specified
         * properties of the object passed in. Those values can be accessed there
         * when the returned promise is fulfilled, as in the following code:
         *
         *     myService.getObjectProperties(myObject, "x", "y").then(function () {
         *         someFunction(myObject.x, myObject.y);
         *     }
         *
         * @method
         * @argument {object} object          - The object whose property values are
         *                                      being requested.
         * @argument {string[]} propertyNames - The names of each of the properties
         *                                      whose values are being requested.
         *                                      These can be provided as an array of
         *                                      strings or as a list of string
         *                                      arguments following the object
         *                                      argument.
         * @returns {external:Promise} - A promise fulfilled when all of the
         * requested data has been received and set on the specified properties of
         * the passed in object.
         */
        getObjectProperties: {
            value: function (object, propertyNames) {
                if (!object) {
                    return Promise.resolve(null);
                }
                /*
                Benoit:

                - If we create an object, properties that are not relations can't
                be fetched. We need to make sure we don't actually try.


                COUNTER: If an object created already has the info to make it's primary key, we should go forward.

                The real test could be that if it's mapped as a relationship, then we might be able to get something.

                - If a property is a relationship and it wasn't set on the object,
                as an object, we can't get it either.
            */
                // if(this.isObjectCreated(object)) {
                //     //Not much we can do there anyway, punt
                //     return Promise.resolve(true);
                // } else
                if (this.isRootService) {
                    // Get the data, accepting property names as an array or as a list
                    // of string arguments while avoiding the creation of any new array.
                    //var names = Array.isArray(propertyNames) ? propertyNames : Array.prototype.slice.call(arguments, 1),
                    var names = isArray(propertyNames) ? propertyNames : arguments,
                        start = names === propertyNames ? 0 : 1;
                    return this._getOrUpdateObjectProperties(object, names, start, false);
                } else {
                    return this.rootService.getObjectProperties(...arguments);
                }
            },
        },

        /**
         * perform getObjectProperties for each object with propertyNames
         * @method
         * @argument {object[]} objects       - The objects whose property values are
         *                                      being requested.
         * @argument {string[]} propertyNames - The names of each of the properties
         *                                      whose values are being requested.
         *                                      These can be provided as an array of
         *                                      strings or as a list of string
         *                                      arguments following the object
         *                                      argument.
         * @returns {external:Promise} - A promise fulfilled when all of the
         * requested data has been received and set on the specified properties of
         * the passed in object.
         */

        getObjectsProperties: {
            value: function (objects, propertyNames) {
                if (!objects || objects.length === 0) {
                    return Promise.resolve(null);
                } else {
                    let promises = [],
                        i,
                        countI,
                        names = isArray(propertyNames) ? propertyNames : arguments,
                        start = names === propertyNames ? 0 : 1;

                    for (i = 0, countI = objects.length; i < countI; i++) {
                        promises.push(this._getOrUpdateObjectProperties(objects[i], names, start, false));
                    }

                    return Promise.all(promises);
                }
            },
        },

        getObjectPropertyExpressions: {
            value: function (object, propertyValueExpressions) {
                if (this.isRootService) {
                    // Get the data, accepting property names as an array or as a list
                    // of string arguments while avoiding the creation of any new array.
                    var expressions = isArray(propertyValueExpressions) ? propertyValueExpressions : arguments,
                        start = expressions === propertyValueExpressions ? 0 : 1,
                        promises = [],
                        self = this;

                    for(let i=0, countI = expressions.length; (i<countI); i++ ) {
                        /*
                        This only works for expressions that are pure, chained
                        property traversals, aka property path. A more general walk
                        would be needed using the expression syntax to be totally
                        generic and support any kind of expression.
                    */
                        let split = expressions[i].split(".");
                        // if (split.length == 1) {
                        //     promises.push(self.getObjectProperties(object, split[0]));
                        // } else {
                        promises.push(self._getPropertiesOnPath(object, split));
                        // }
                    };

                    return Promise.all(promises);
                } else {
                    return this.rootService.getObjectPropertyExpressions(object, propertyValueExpressions);
                }
            },
        },

        _getPropertiesOnPath: {
            value: function (object, propertiesToRequest) {
                var self = this,
                    propertyName = propertiesToRequest.shift(),
                    promise = this.getObjectProperties(object, propertyName);

                if (promise) {
                    return promise.then(function () {
                        var result = null;
                        if (propertiesToRequest.length && object[propertyName]) {
                            result = self._getPropertiesOnPath(object[propertyName], propertiesToRequest);
                        }
                        return result;
                    });
                } else {
                    return this.nullPromise;
                }
            },
        },

        /**
         * Request possibly asynchronous values of a data object's properties,
         * forcing asynchronous values to be re-fetched and updated even if they
         * had previously been fetched or set.
         *
         * Except for the forced update, this method behaves exactly like
         * [getObjectProperties()]{@link DataService#getObjectProperties}.
         *
         * Since root services are responsible for determining when to fetch or
         * update data objects values, subclasses whose instances will not be root
         * services should override this method to call their root service's
         * implementation of it.
         *
         * Subclasses should define how property values are obtained by overriding
         * [fetchObjectProperty()]{@link DataService#fetchObjectProperty} instead
         * of this method. That method will be called by this method when needed.
         *
         * @method
         * @argument {object} object          - The object whose property values are
         *                                      being requested.
         * @argument {string[]} propertyNames - The names of each of the properties
         *                                      whose values are being requested.
         *                                      These can be provided as an array of
         *                                      strings or as a list of string
         *                                      arguments following the object
         *                                      argument.
         * @returns {external:Promise} - A promise fulfilled when all of the
         * requested data has been received and set on the specified properties of
         * the passed in object.
         */
        updateObjectProperties: {
            value: function (object, propertyNames) {
                if (this.isRootService) {
                    // Get the data, accepting property names as an array or as a list
                    // of string arguments while avoiding the creation of any new array.
                    var names = isArray(propertyNames) ? propertyNames : arguments,
                        start = names === propertyNames ? 0 : 1;
                    return this._getOrUpdateObjectProperties(object, names, start, true);
                } else {
                    return this.rootService.updateObjectProperties(...arguments);
                }
            },
        },

        /**
         * Fetch the value of a data object's property, possibly asynchronously.
         *
         * The default implementation of this method delegates the fetching to a
         * child services, or does nothing but return a fulfilled promise for `null`
         * if no child service can be found to handle the specified object.
         *
         * [Raw data service]{@link RawDataService} subclasses should override
         * this method to perform any fetch or other operation required to get the
         * requested data. The subclass implementations of this method should use
         * only [fetchData()]{@link DataService#fetchData} calls to fetch data.
         *
         * This method should never be called directly:
         * [getObjectProperties()]{@link DataService#getObjectProperties} or
         * [updateObjectProperties()]{@link DataService#updateObjectProperties}
         * should be called instead as those methods handles some required caching,
         * fetch aggregation, and [data trigger]{@link DataTrigger}. Those methods
         * will call this method if and when that is necessary.
         *
         * Like the promise returned by
         * [getObjectProperties()]{@link DataService#getObjectProperties}, the
         * promise returned by this method should not pass the requested value to
         * its callback: That value must instead be set on the object passed in to
         * this method.
         *
         * @method
         * @argument {object} object            - The object whose property value is being
         *                                      requested.
         *
         * @argument {string} name              - The name of the single property whose value
         *                                      is being requested.
         *
         * @argument {array} readExpressions    - A list of object[propertyName] properties to get
         *                                      at the same time we're getting object[propertyName].
         * @returns {external:Promise} - A promise fulfilled when the requested
         * value has been received and set on the specified property of the passed
         * in object.
         */
        fetchObjectProperty: {
            value: function (object, propertyName, isObjectCreated, isUpdate) {
                var childServices = this.childServicesForType(object.objectDescriptor),
                    handlesType =
                        /*(this.parentService && this.parentService._getChildServiceForObject(object) === this)*/ this.handlesType(
                            object.objectDescriptor
                        ),
                    hasPropertyDescriptorLookup = typeof this._propertyDescriptorForObjectAndName === "function",
                    hasMappingLookup = typeof this.mappingForType === "function",
                    mapping = handlesType && hasMappingLookup && this.mappingForType(object.objectDescriptor),
                    mappingRule = mapping && mapping.objectMappingRuleForPropertyName(propertyName),
                    propertyDescriptor =
                        hasPropertyDescriptorLookup &&
                            this._propertyDescriptorForObjectAndName(object, propertyName) ||
                        object.objectDescriptor && object.objectDescriptor.propertyDescriptorForName(propertyName) ||
                        mappingRule && mappingRule.propertyDescriptor,
                    isRelationshipProperty = !!(propertyDescriptor && propertyDescriptor._valueDescriptorReference),
                    hasFetchRawObjectProperty = typeof this.fetchRawObjectProperty === "function",
                    localDelegateFunction = this._delegateFunctionForPropertyName(propertyName),
                    canMapObjectPropertyLocally = !!mappingRule &&
                        typeof this.snapshotForObject === "function" &&
                        typeof this.mapObjectToRawData === "function",
                    shouldHandleLocally = handlesType &&
                        (hasFetchRawObjectProperty || localDelegateFunction || canMapObjectPropertyLocally) &&
                        (!childServices || childServices.length === 0 || (mappingRule && !mappingRule.serviceIdentifier)),
                    isHandler = shouldHandleLocally,
                    useDelegate = isHandler && hasFetchRawObjectProperty && !isRelationshipProperty,
                    delegateFunction = !useDelegate && isHandler && localDelegateFunction,
                    childService = !isHandler && this._getChildServiceForObject(object),
                    isObjectCreated = this.isObjectCreated(object),
                    debug = exports.DataService.debugProperties.has(propertyName);

                // Check if property is included in debugProperties. Intended for debugging
                if (debug) {
                    console.debug("DataService.fetchObjectProperty", object, propertyName);
                    console.debug(
                        "To debug ExpressionDataMapping.mapRawDataToObjectProperty for " +
                            propertyName +
                            ", set a breakpoint here."
                    );
                }
                if (propertyName === "preferences" && typeof document !== "undefined" && document.documentElement) {
                    var objectDescriptor = object.objectDescriptor,
                        directPropertyDescriptor = objectDescriptor &&
                            objectDescriptor.propertyDescriptorForName &&
                            objectDescriptor.propertyDescriptorForName(propertyName),
                        propertyNames = objectDescriptor && objectDescriptor.propertyDescriptors &&
                            objectDescriptor.propertyDescriptors.map(function (descriptor) {
                                return descriptor && descriptor.name;
                            });
                    document.documentElement.setAttribute("data-preferences-fetch-object-property", JSON.stringify({
                        service: this.name || this.identifier,
                        objectDescriptorName: objectDescriptor && objectDescriptor.name,
                        objectDescriptorModule: objectDescriptor && objectDescriptor.module && objectDescriptor.module.id,
                        directPropertyDescriptorName: directPropertyDescriptor && directPropertyDescriptor.name,
                        propertyNames: propertyNames,
                        handlesType: !!handlesType,
                        hasMappingLookup: !!hasMappingLookup,
                        canMapObjectPropertyLocally: !!canMapObjectPropertyLocally,
                        isRelationshipProperty: !!isRelationshipProperty,
                        useDelegate: !!useDelegate,
                        childServiceCount: childServices && childServices.length || 0,
                        childServices: childServices && childServices.map(function (service) {
                            return service.name || service.identifier;
                        }),
                        hasMappingRule: !!mappingRule,
                        serviceIdentifier: mappingRule && mappingRule.serviceIdentifier,
                        shouldHandleLocally: !!shouldHandleLocally,
                        hasDelegateFunction: !!delegateFunction,
                        hasPropertyDescriptor: !!propertyDescriptor
                    }));
                }

                if (
                    handlesType &&
                    propertyDescriptor &&
                    !isRelationshipProperty &&
                    !mappingRule &&
                    !delegateFunction &&
                    !hasFetchRawObjectProperty
                ) {
                    return this.nullPromise;
                }

                return useDelegate
                    ? this.fetchRawObjectProperty(object, propertyName)
                    : delegateFunction
                    ? delegateFunction.call(this, object)
                    : isHandler && propertyDescriptor
                    ? this._fetchObjectPropertyWithPropertyDescriptor(
                          object,
                          propertyName,
                          propertyDescriptor,
                          isObjectCreated
                      )
                    : childServices?.length > 0
                    ? childServices.length === 1
                        ? childServices[0].fetchObjectProperty(object, propertyName, isObjectCreated, isUpdate)
                        : this.childServicesFetchObjectProperty(object, propertyName, isObjectCreated, isUpdate)
                    : this.nullPromise;
            },
        },

        childServicesFetchObjectProperty: {
            value: function (object, propertyName, isObjectCreated, isUpdate) {
                var dataIdentifierService = object.dataIdentifier && object.dataIdentifier.dataService,
                    childServices = this.childServicesForType(object.objectDescriptor),
                    serviceIdentifiers = childServices && childServices.map(function (service) {
                        return service.identifier;
                    });
                //Workaround for now:
                if (dataIdentifierService && dataIdentifierService !== this) {
                    return dataIdentifierService.fetchObjectProperty(object, propertyName, isObjectCreated, isUpdate);
                }

                throw new Error("Data Services with multiple child services per ObjectDescriptor have to implement this method. objectDescriptor=" +
                    (object.objectDescriptor && object.objectDescriptor.name) +
                    ", propertyName=" + propertyName +
                    ", service=" + this.identifier +
                    ", dataIdentifierService=" + (dataIdentifierService && dataIdentifierService.identifier) +
                    ", childServices=" + serviceIdentifiers);
                //     /*
                //         If there's more than one, we're entering the realm of decisions about how to deal with them.
                //         That's why MuxDataService's and it's subclasses were created, to implement the various possible strategies.
                //     */

                // let childServices = this.childServicesForType(object.objectDescriptor),
                //     promises,
                //     childService;

                // if(childServices === 1) {
                //     return childServices[0].fetchObjectProperty(object, propertyName, isObjectCreated)
                // } else {
                //     for(childService of childServices) {
                //         (promises || (promises = [])).push(childService.fetchObjectProperty(object, propertyName, isObjectCreated));
                //     }
                //     //If the
                // }
            },
        },

        _delegateFunctionForPropertyName: {
            value: function (propertyName) {
                var capitalized = propertyName.charAt(0).toUpperCase() + propertyName.slice(1),
                    functionName = "fetch" + capitalized + "Property";
                return typeof this[functionName] === "function" && this[functionName];
            },
        },

        _isAsync: {
            value: function (object) {
                return object && object.then && typeof object.then === "function";
            },
        },

        /* TODO: Remove when mapping is moved in the webworker. This is used right now to know
    when an object is bieng mapped so we can avoid tracking changes happening during that time. This issue will disappear when mapping is done in a web worker and not on the object directly.
    */
        _objectsBeingMapped: {
            value: new CountedSet(),
        },

        _rawDataToObjectMappingPromiseByObject: {
            value: new Map(),
        },

        _setMapRawDataToObjectPromise: {
            value: function (rawData, object, promise) {
                var objectMap = this._rawDataToObjectMappingPromiseByObject.get(object),
                    rawDataPromise;
                if (!objectMap) {
                    objectMap = new Map();
                    this._rawDataToObjectMappingPromiseByObject.set(object, objectMap);
                }

                if (!objectMap.has(rawData)) {
                    objectMap.set(rawData, promise);
                } else {
                    if (objectMap.get(rawData) !== promise) {
                        console.error(
                            "Overriding existing mapping promise for object:",
                            object,
                            " rawData:",
                            rawData,
                            " existing Promise:",
                            objectMap.get(rawData),
                            " new Promise:",
                            promise
                        );
                    } else {
                        console.error(
                            "Overriding existing mapping promise with same promise for object:",
                            object,
                            " rawData:",
                            rawData,
                            " existing Promise:",
                            objectMap.get(rawData)
                        );
                    }
                }
            },
        },

        _getMapRawDataToObjectPromise: {
            value: function (rawData, object) {
                var objectMap = this._rawDataToObjectMappingPromiseByObject.get(object);
                return objectMap && objectMap.get(rawData);
            },
        },

        _deleteMapRawDataToObjectPromise: {
            value: function (rawData, object) {
                var objectMap = this._rawDataToObjectMappingPromiseByObject.get(object);
                // console.log(object.dataIdentifier.objectDescriptor.name+" _deleteMapRawDataToObjectPromise: id: "+object.dataIdentifier.primaryKey);
                // if(!objectMap.has(rawData)) {
                //     console.log(object.dataIdentifier.objectDescriptor.name+" _deleteMapRawDataToObjectPromise: id: "+object.dataIdentifier.primaryKey+" !!! COULDN'T FIND rawData entry");
                // }
                return objectMap && objectMap.delete(rawData);
            },
        },

        _fetchObjectPropertyWithPropertyDescriptor: {
            value: function (object, propertyName, propertyDescriptor, isObjectCreated) {
                var self = this,
                    objectDescriptor = this.objectDescriptorForObject(object),
                    mapping = objectDescriptor && this.mappingForType(objectDescriptor),
                    data = {},
                    snapshotPromise,
                    result;

                if (mapping) {
                    /*
                    To open the ability to get derived values from non-saved objects, some failsafes blocking a non-saved created object to get any kind of property resolved/fetched were removed. So we need to be smarter here and do the same.

                    If an object is created (which we don't know here, but we can check), fetching a property relies on the primary key and that the primarty key is one property only (like a uuid) and there's already a value (client-side generated like uuid can be), than it can't be fetched and we shoould resolve to null.

                    Another approch would be to map all dependencies and let the rule's converter assess if it has everytrhing it needs to do the job, but at that level, the converter doesn't know the object, but it has the primaryKey in the criteria's syntax and the value in the associated parameters, so it could find out if there's a corresponding object that is created. It might be needed, let's see if this first heuristic works first.
                */
                    if (isObjectCreated) {
                        var rule = mapping.objectMappingRuleForPropertyName(propertyName),
                            rawDataPrimaryKeys = mapping.rawDataPrimaryKeys,
                            requiredRawProperties = rule && rule.requirements,
                            mappingResult;

                        mappingResult = this.mapObjectToRawData(object, data);
                        if (Promise.is(mappingResult)) {
                            snapshotPromise = mappingResult;
                        } else {
                            snapshotPromise = Promise.resolve(mappingResult);
                        }

                        /*
                        rawDataPrimaryKeys.length === 1 is to assess if it's a traditional id with no intrinsic meaning
                    */
                        // if(rawDataPrimaryKeys.length === 1 && requiredRawProperties.indexOf(rawDataPrimaryKeys[0]) !== -1) {
                        if (
                            rawDataPrimaryKeys.length === 1 &&
                            requiredRawProperties.indexOf(rawDataPrimaryKeys[0]) === -1
                        ) {
                            /*
                            Fetching depends on something that doesn't exists on the other side, we bail:
                        */
                            return this.nullPromise;
                        }
                    } else {
                        /*
                        @marchant: Why aren't we passing this.snapshotForObject(object) instead of copying everying in a new empty object?

                        @tejaede: The criteria source was a first attempt to support derived properties. It's a bucket in which we can put data from the cooked object in order to fetch other cooked properties. The cooked data placed in the criteria source does not belong in the snapshot.

                        For example, take this model:

                        A Foo model includes a bars property and a baz property.
                        Foo.baz is derived from the value of Foo.bars.
                        When the application triggers a fetch for Foo.baz, the value of Foo.bars needs to be available to build the criteria for the fetch. However, the value of Foo.bars is cooked and does not belong in the snapshot. Therefore, we create a copy of the snapshot called the "criteria source" into which we can put Foo.bars.

                        All of this said, I don't know this is the right way to solve the problem. The issue at the moment is that this functionality is being used so we cannot remove it without an alternative.
                    */
                        Object.assign(data, this.snapshotForObject(object));
                        snapshotPromise = Promise.resolve(data);
                    }

                    return snapshotPromise.then((data) => {
                        self._objectsBeingMapped.add(object);

                        result = mapping.mapObjectToCriteriaSourceForProperty(object, data, propertyName, true);
                        if (this._isAsync(result)) {
                            return result.then(
                                function () {
                                    Object.assign(data, self.snapshotForObject(object));
                                    result = mapping.mapRawDataToObjectProperty(data, object, propertyName);

                                    if (!self._isAsync(result)) {
                                        result = this.nullPromise;
                                        self._objectsBeingMapped.delete(object);
                                    } else {
                                        result = result.then(
                                            function (resolved) {
                                                self._objectsBeingMapped.delete(object);
                                                return resolved;
                                            },
                                            function (failed) {
                                                self._objectsBeingMapped.delete(object);
                                            }
                                        );
                                    }
                                    return result;
                                },
                                function (error) {
                                    self._objectsBeingMapped.delete(object);
                                    throw error;
                                }
                            );
                        } else {
                            //This was already done a few lines up. Why are we re-doing this?
                            Object.assign(data, self.snapshotForObject(object));
                            /*
                            This code path ends up triggering the mapping logic to convert a foreign/primary key to an object via a converter.
                            The converter ends up being the one doing a fetch
                        */
                            result = mapping.mapRawDataToObjectProperty(data, object, propertyName);
                            if (!this._isAsync(result)) {
                                /*
                                BUG: when we map from values already in the snapshot we end up here, but the value has alredy been assigned to the object by  mapping.mapRawDataToObjectProperty(data, object, propertyName).

                                So there's really nothing else to do but return result. If we re-set result to null bellow, it does end up as the result of DataTrigger._fetchObjectProperty() promise and erases the value that was there, the one just mapped, causing loss of data and bugs.
                            */
                                // result = this.nullPromise;
                                this._objectsBeingMapped.delete(object);
                            } else {
                                result = result.then(
                                    function (resolved) {
                                        self._objectsBeingMapped.delete(object);
                                        return resolved;
                                    },
                                    function (failed) {
                                        self._objectsBeingMapped.delete(object);
                                    }
                                );
                            }
                            return result;
                        }
                    });
                } else {
                    return this.nullPromise;
                }
            },
        },

        /**
         * @private
         * @method
         */
        _getOrUpdateObjectProperties: {
            value: function (object, names, start, isUpdate) {
                var triggers, trigger, promises, promise, i, n;
                // Request each data value separately, collecting unique resulting
                // promises into an array and a set, but avoid creating any array
                // or set unless that's necessary.
                triggers = this._getTriggersForObject(object);
                for (i = start, n = names.length; i < n; i += 1) {
                    trigger = triggers && triggers[names[i]];
                    promise = !trigger
                        ? this.nullPromise
                        : isUpdate
                            ? trigger.updateObjectProperty(object)
                            : trigger.getObjectProperty(object);
                    if (promise !== this.nullPromise) {
                        if (!promises) {
                            promises = { array: [promise] };
                        } else if (!promises.set && promises.array[0] !== promise) {
                            promises.set = new Set();
                            promises.set.add(promises.array[0]);
                            promises.set.add(promise);
                            promises.array.push(promise);
                        } else if (promises.set && !promises.set.has(promise)) {
                            promises.set.add(promise);
                            promises.array.push(promise);
                        }
                    }
                }

                // Return a promise that will be fulfilled only when all of the
                // requested data has been set on the object. If possible do this
                // without creating any additional promises.
                return !promises
                    ? this.nullPromise
                    : !promises.set
                    ? promises.array[0]
                    : Promise.all(promises.array).then(this.nullFunction);
            },
        },

        /**
         * @private
         * @method
         */
        _setObjectPropertyValue: {
            value: function (object, propertyName, propertyValue, updateInverse) {
                var triggers = this._getTriggersForObject(object),
                    trigger = triggers ? triggers[propertyName] : null;

                if (trigger) {
                    trigger._setValue(object, propertyValue, false);
                }
            },
        },

        /***************************************************************************
         * Data Object Creation
         */

        /**
         * Find an existing data object corresponding to the specified raw data, or
         * if no such object exists, create one.
         *
         * Since root services are responsible for tracking and creating data
         * objects, subclasses whose instances will not be root services should
         * override this method to call their root service's implementation of it.
         *
         * @method
         * @argument {DataObjectDescriptor} type - The type of object to find or
         *                                         create.
         * @argument {Object} rawData               - An object whose property values
         *                                         hold the object's raw data. That
         *                                         data will be used to determine
         *                                         the object's unique identifier.
         * @argument {?} context                 - A value, usually passed in to a
         *                                         [raw data service's]{@link RawDataService}
         *                                         [addRawData()]{@link RawDataService#addRawData}
         *                                         method, that can help in getting
         *                                         or creating the object.
         * @returns {Object} - The existing object with the unique identifier
         * specified in the raw data, or if no such object exists a newly created
         * object of the specified type.
         */
        getDataObject: {
            value: function (type, rawData, dataIdentifier, context) {
                if (this.isRootService) {
                    var dataObject;
                    // TODO [Charles]: Object uniquing.
                    if (this.isUniquing && dataIdentifier) {
                        dataObject = this.objectForDataIdentifier(dataIdentifier, rawData, context);
                    }
                    if (!dataObject) {
                        if (dataIdentifier === undefined) {
                            dataObject = this.createDataObject(type);
                        } else {
                            dataObject = this._createDataObject(type, dataIdentifier);
                        }
                    }

                    return dataObject;
                } else {
                    let dataObject = this.objectForDataIdentifier(dataIdentifier);

                    if (!dataObject) {
                        dataObject = this.rootService.getDataObject(type, rawData, dataIdentifier, context);

                        /*
                        If the root service uses a different dataIdentifier than ours,
                        We keep a reference for ourselves to the unique object returned
                        for our own dataIdentifier for it.
                    */
                        // if(dataObject.dataIdentifier !== dataIdentifier) {
                        //     this.recordObjectForDataIdentifier(dataObject, dataIdentifier);
                        // }
                    }

                    return dataObject;
                }
            },
        },

        isUniquing: {
            value: false,
        },

        _identifier: {
            value: undefined,
        },

        identifier: {
            get: function () {
                return this._identifier || (this._identifier = Montage.getInfoForObject(this).moduleId);
            },
            set: function (value) {
                if (value !== this._identifier) {
                    this._identifier = value;
                }
            },
        },

        __dataIdentifierByObject: {
            value: null,
        },

        _dataIdentifierByObject: {
            // This property is shared with all child services.
            // If created lazily the wrong data identifier will be returned when
            // accessed by a child service.

            /*
            Benoit 2/13/2025. Going for a per service bookkeeping, so rootService is the one creating and uniquing
            objects, but RawDataServices can keep track with their own native dataIdentifiers
        */
            get: function () {
                return this.__dataIdentifierByObject || (this.__dataIdentifierByObject = new WeakMap());
            },
        },

        /**
         * Returns a unique DataIdentifier for an object
         * [fetchObjectProperty()]{@link DataService#fetchObjectProperty} instead
         * of this method. That method will be called by this method when needed.
         *
         * @method
         * @argument {object} object         - The object for which a DataIdentifier is
         *                                      being requested.
         *
         * @returns {DataIdentifier}        - An object's DataIdentifier
         */
        dataIdentifierForObject: {
            value: function (object) {
                //If we don't have a local / native one, we return the one assigned by the main service
                //let dataIdentifier = this._dataIdentifierByObject.get(object) || object.dataIdentifier;
                let dataIdentifier = this._dataIdentifierByObject.get(object),
                    mainService = this.mainService || this.rootService;

                //When we merge in a graph of data object's it's possible that those objects are
                if (!dataIdentifier && this !== mainService) {
                    dataIdentifier = mainService.dataIdentifierForObject(object);
                    if (!dataIdentifier) {
                        // throw "No dataIdentifier found for data object: "+object;
                        dataIdentifier = this.createDataIdentifierForObject(object);
                        if (this.parentService === mainService) {
                            mainService.registerUniqueObjectWithDataIdentifier(object, dataIdentifier);
                            mainService.recordDataIdentifierForObject(dataIdentifier, object);
                        }
                    }
                    this.registerUniqueObjectWithDataIdentifier(object, dataIdentifier);
                }
                return dataIdentifier;
            },
        },

        createDataIdentifierForObject: {
            value: function (object) {
                return this.dataIdentifierForNewObjectWithObjectDescriptor(object.objectDescriptor);
            },
        },

        /**
         * Records an object's DataIdentifier
         *
         * @method
         * @argument {object} object                        - an Object.
         * @argument {DataIdentifier} dataIdentifier        - The object whose property values are
         */
        recordDataIdentifierForObject: {
            value: function (dataIdentifier, object) {
                /*
                When we have a SynchronizationDataService in-between MainService and RawDataOnes, dataIdentifier and
                    this._dataIdentifierByObject.get(object) are actually not the same. need to figure out why, but narrowing the test
                to verify they have the same primaryKey should help for now.
            */
                if (
                    this._dataIdentifierByObject.has(object) &&
                    this._dataIdentifierByObject.get(object)?.primaryKey !== dataIdentifier.primaryKey
                ) {
                    //throw new Error("recordDataIdentifierForObject when one already exists:"+JSON.stringify(object));
                    console.error(
                        "WARNING: recordDataIdentifierForObject when one already exists:" + JSON.stringify(object)
                    );
                }
                /*
                TODO: This is called twice when this._dataIdentifierByObject already contains (object, dataIdentifier)
            */
                this._dataIdentifierByObject.set(object, dataIdentifier);
            },
        },

        /**
         * Remove an object's DataIdentifier
         *
         * @method
         * @argument {object} object         - an object
         */
        removeDataIdentifierForObject: {
            value: function (object) {
                // console.log("removeDataIdentifierForObject(",object);
                this._dataIdentifierByObject.delete(object);
            },
        },

        __objectByDataIdentifier: {
            value: null,
        },

        _objectByDataIdentifier: {
            get: function () {
                return this.__objectByDataIdentifier || (this.__objectByDataIdentifier = new WeakMap());
            },
        },

        clearObjectDataIdentifiers: {
            value: function () {
                this.__objectByDataIdentifier = null;
                this.__dataIdentifierByObject = null;
            },
        },
        /**
         *  Returns a unique object for a DataIdentifier
         * [fetchObjectProperty()]{@link DataService#fetchObjectProperty} instead
         * of this method. That method will be called by this method when needed.
         *
         * @method
         * @argument {DataIdentifier} dataIdentifier        - the dataIdentifier object
         * @argument {Object} rawData                       - the raw data for the object expected to be found
         * @argument {Object} context                       - the context around, typically a DataOperation
         * @returns {Objecr}                                - object found for that dataIdentifier if any
         */
        objectForDataIdentifier: {
            value: function (dataIdentifier, rawData, context) {
                return this._objectByDataIdentifier.get(dataIdentifier);
            },
        },
        /**
         * Records an object's DataIdentifier
         *
         * @method
         * @argument {DataIdentifier} dataIdentifier    - DataIdentifier
         * @argument {object} object                    - object represented by dataIdentifier
         */
        recordObjectForDataIdentifier: {
            value: function (object, dataIdentifier) {
                if (dataIdentifier && typeof dataIdentifier === "object") {
                    this._objectByDataIdentifier.set(dataIdentifier, object);
                }
            },
        },

        /**
         * Remove an object's DataIdentifier
         *
         * @method
         * @argument {object} object         - an object
         */
        removeObjectForDataIdentifier: {
            value: function (dataIdentifier) {
                this._objectByDataIdentifier.delete(dataIdentifier);
            },
        },
        _eventPoolFactoryForEventType: {
            value: function () {
                return new DataEvent();
            },
        },

        __dataEventPoolByEventType: {
            value: null,
        },
        _dataEventPoolForEventType: {
            value: function (eventType) {
                var pool = (this.__dataEventPoolByEventType || (this.__dataEventPoolByEventType = new Map())).get(
                    eventType
                );
                if (!pool) {
                    this.__dataEventPoolByEventType.set(
                        eventType,
                        (pool = new ObjectPool(this._eventPoolFactoryForEventType))
                    );
                }
                return pool;
            },
        },
        __preparedConstructorsForDataEvents: {
            value: null,
        },

        isConstructorPreparedToHandleDataEvents: {
            value: function (objectConstructor) {
                return (
                    this.__preparedConstructorsForDataEvents || (this.__preparedConstructorsForDataEvents = new Set())
                ).has(objectConstructor);
            },
        },

        prepareConstructorToHandleDataEvents: {
            value: function (objectConstructor, event) {
                if (typeof objectConstructor.prepareToHandleDataEvents === "function") {
                    objectConstructor.prepareToHandleDataEvents(event);
                }
                //prepareToHandleDataEvent or prepareToHandleCreateEvent
                this.__preparedConstructorsForDataEvents.add(objectConstructor);
            },
        },

        dispatchDataEventTypeForObject: {
            value: function (eventType, object, detail) {
                /*
                This needs to be made more generic in EventManager, which has "prepareForActivationEvent,
                but it's very specialized for components. Having all prototypes of DO register as eventListeners upfront
                would be damaging performance wise. We should do it as things happen.
            */
                if (object.dispatchEvent) {
                    var eventPool = this._dataEventPoolForEventType(eventType),
                        objectDescriptor = this.objectDescriptorForObject(object),
                        objectConstructor = object.constructor,
                        dataEvent = eventPool.checkout();

                    dataEvent.type = eventType;
                    dataEvent.target = objectDescriptor;
                    dataEvent.dataService = this;
                    dataEvent.dataObject = object;
                    dataEvent.detail = detail;

                    if (!this.isConstructorPreparedToHandleDataEvents(objectConstructor)) {
                        this.prepareConstructorToHandleDataEvents(objectConstructor, dataEvent);
                    }

                    object.dispatchEvent(dataEvent);

                    var propagationPromise = dataEvent.propagationPromise;
                    if (Promise.is(propagationPromise)) {
                        return propagationPromise.then(function () {
                            eventPool.checkin(dataEvent);
                        });
                    } else {
                        eventPool.checkin(dataEvent);
                    }
                }
            },
        },

        /**
         * Create a new data object of the specified type.
         *
         * Since root services are responsible for tracking and creating data
         * objects, subclasses whose instances will not be root services should
         * override this method to call their root service's implementation of it.
         *
         * @method
         * @argument {DataObjectDescriptor} type - The type of object to create.
         * @returns {Object}                     - The created object.
         */
        //TODO add the creation of a temporary identifier to pass to _createDataObject
        createDataObject: {
            value: function (type) {
                if (this.isRootService) {
                    var service = this.childServiceForType(type),
                        //Gives a chance to raw data service to provide a primary key for clien-side creation/
                        //Especially useful for systems that use uuid as primary keys.
                        //object = this._createDataObject(type, service.dataIdentifierForNewObjectWithObjectDescriptor(type))
                        object = this._createDataObject(
                            type,
                            service.dataIdentifierForNewObjectWithObjectDescriptor(this.objectDescriptorForType(type))
                        );

                    this.registerCreatedDataObject(object);

                    return object;
                } else {
                    this.rootService.createDataObject(type);
                }
            },
        },

        /**
         * A DataObject will always be decribed by only one ObjectDescriptor, even when we support more "main" dataServices.
         * So caching on prototype so it serves everyone.
         *
         * @private
         * @method
         * @argument {DataObjectDescriptor} type - The type of object to create.
         * @returns {Object}                     - The created object.
         */

        _objectDescriptorForObjectCache: {
            value: new WeakMap(),
        },

        /**
         * A WeakMap where keys are ObjectDescriptors and values are all instances of data objects of that type
         *
         * @private
         * @method
         * @argument {DataObjectDescriptor} type - The type of object to create.
         * @returns {Object}                     - The created object.
         */

        _objectsByObjectDescriptor: {
            value: new WeakMap(),
        },

        /**
         * ObjectDescriptors' instances are held in an array so we can iterate on them. But this may hold them and prevent garbage collection, as ObjectDesc
         *
         * @private
         * @method
         * @argument {DataObjectDescriptor} type - The type of object to create.
         * @returns {Object}                     - The created object.
         */
        registeredObjectsForObjectDescriptor: {
            value: function (anObjectDescriptor) {
                return (
                    this._objectsByObjectDescriptor.get(anObjectDescriptor) ||
                    (this._objectsByObjectDescriptor.set(anObjectDescriptor, []) &&
                        this._objectsByObjectDescriptor.get(anObjectDescriptor))
                );
            },
        },

        registeredObjectsForObjectDescriptorMatchingCriteria: {
            value: function (anObjectDescriptor, aCriteria, _result) {
                let result = _result || [],
                    anObjectDescriptorResult,
                    aCriteriaPredicateFunction,
                    registeredObjectsForObjectDescriptor =
                        this.registeredObjectsForObjectDescriptor(anObjectDescriptor),
                    childObjectDescriptors = anObjectDescriptor.childObjectDescriptors;

                if (registeredObjectsForObjectDescriptor) {
                    aCriteriaPredicateFunction = aCriteria.predicateFunction;
                    anObjectDescriptorResult = registeredObjectsForObjectDescriptor.filter(aCriteriaPredicateFunction);
                    if (anObjectDescriptorResult && anObjectDescriptorResult.length) {
                        result.push(...anObjectDescriptorResult);
                    }
                }

                if (childObjectDescriptors) {
                    //There could be childObjectDescriptors that we need to take care of as well.
                    for (let i = 0, countI = childObjectDescriptors.length; i < countI; i++) {
                        this.registeredObjectsForObjectDescriptorMatchingCriteria(
                            childObjectDescriptors[i],
                            aCriteria,
                            result
                        );
                    }
                }

                return result;
            },
        },

        registerDataObject: {
            value: function (aDataObject) {
                this.registeredObjectsForObjectDescriptor(this.objectDescriptorForObject(aDataObject)).push(aDataObject);
            },
        },

        unregisterDataObject: {
            value: function (aDataObject) {
                this.registeredObjectsForObjectDescriptor(this.objectDescriptorForObject(aDataObject)).delete(aDataObject);
            },
        },

        unregisterDataObjectsWithObjectDescriptor: {
            value: function (anObjectDescriptor) {
                this._objectsByObjectDescriptor.delete(anObjectDescriptor);
            },
        },

        /**
         * Create a data object without registering it in the new object map.
         *
         * @private
         * @method
         * @argument {DataObjectDescriptor} type - The type of object to create.
         * @returns {Object}                     - The created object.
         */
        _createDataObject: {
            value: function (type, dataIdentifier) {
                var objectDescriptor = this.objectDescriptorForType(type),
                    prototype = this._getPrototypeForType(objectDescriptor),
                    object = Object.create(prototype),
                    constructor = prototype && prototype.constructor,
                    specializeConstructor = constructor && constructor.specializeConstructor,
                    dataIdentifierDataService = dataIdentifier && dataIdentifier.dataService,
                    delegateDataIdentifier,
                    constructedObject;
                // constructor = this._getPrototypeForType(objectDescriptor).constructor,
                // object = new constructor;
                // //object = Reflect.construct(constructor, this._emptyArray);

                if (object) {
                    delegateDataIdentifier = dataIdentifierDataService ?
                        dataIdentifierDataService.callDelegateMethod(
                            "dataIdentifierForRawDataServiceCreatingObjectWithDataIdentifier",
                            dataIdentifier.dataService,
                            dataIdentifier
                        ) ?? dataIdentifier :
                        dataIdentifier;

                    /*
                    Our delegate overrode our dataIdentifier, we're going to keep a reference from
                    dataIdentifier to the object
                */
                    if (delegateDataIdentifier !== dataIdentifier) {
                        this.mainService.recordObjectForDataIdentifier(object, dataIdentifier);
                        dataIdentifier = delegateDataIdentifier;
                    }
                    //This needs to be done before a user-land code can attempt to do
                    //anything inside its constructor, like creating a binding on a relationships
                    //causing a trigger to fire, not knowing about the match between identifier
                    //and object... If that's feels like a real situation, it is.
                    this.registerUniqueObjectWithDataIdentifier(object, dataIdentifier);
                    // if (dataIdentifier && this.isUniquing) {
                    //     this.recordDataIdentifierForObject(dataIdentifier, object);
                    //     this.recordObjectForDataIdentifier(object, dataIdentifier);
                    // }

                    // Legacy Montage constructors initialize template defaults.
                    // Mod stores them separately because class constructors
                    // cannot be invoked for Object.create() instances.
                    if (typeof specializeConstructor === "function") {
                        constructedObject = specializeConstructor.call(object);
                        object = constructedObject || object;
                    }

                    if (object) {
                        this._setObjectType(object, objectDescriptor);
                        this._objectDescriptorForObjectCache.set(object, objectDescriptor);

                        //This is an in-memory cache of all objects with the same objectDescriptor, regarding of the fact that are new objects or fetched
                        this.registerDataObject(object);
                    }

                    if (dataIdentifierDataService) {
                        dataIdentifierDataService.callDelegateMethod(
                            "rawDataServiceDidCreateObject",
                            dataIdentifierDataService,
                            object
                        );
                    }
                }
                return object;
            },
        },

        /**
         * Register an object with its dataIdentifier for uniquing reasons
         *
         * @private
         * @method
         * @argument {Object} object - object to register.
         * @argument {DataIdentifier} dataIdentifier - dataIdentifier of object to register.
         * @returns {void}
         */
        registerUniqueObjectWithDataIdentifier: {
            value: function (object, dataIdentifier) {
                //Benoit: this is currently relying on a manual turn-on of isUniquing on the MainService, which is really not something people should have to worry about...
                /*
                Benoit 2/13/25: Relaxing to have RawDataServices keep track of this in a context
                where mutliple RawDataServices for the same ObjectDescriptors are involved
                with different native RawData shapes
            */
                //if (object && dataIdentifier && this.isRootService && this.isUniquing) {
                if (object && dataIdentifier && typeof dataIdentifier === "object") {
                    this.recordDataIdentifierForObject(dataIdentifier, object);
                    this.recordObjectForDataIdentifier(object, dataIdentifier);
                }
            },
        },

        /***************************************************************************
         *
         * Data Object Changes
         *
         */

        /**
         * A set of the data objects created by this service or any other descendent
         * of this service's [root service]{@link DataService#rootService} since
         * that root service's data was last saved, or since the root service was
         * created if that service's data hasn't been saved yet.
         *
         * Since root services are responsible for tracking data objects, subclasses
         * whose instances will not be root services should override this property
         * to return their root service's value for it.
         *
         * @type {Set.<Object>}
         */
        _objectDescriptorsWithChanges: {
            value: undefined,
        },
        objectDescriptorsWithChanges: {
            get: function () {
                return this._objectDescriptorsWithChanges || (this._objectDescriptorsWithChanges = new CountedSet());
            },
        },
        createdDataObjects: {
            get: function () {
                if (this.isRootService) {
                    if (!this._createdDataObjects) {
                        this._createdDataObjects = new Map();
                    }
                    return this._createdDataObjects;
                } else {
                    return this.rootService.createdDataObjects;
                }
            },
        },

        registerCreatedDataObject: {
            value: function (dataObject) {
                var objectDescriptor = this.objectDescriptorForObject(dataObject),
                    createdDataObjects = this.createdDataObjects,
                    value = createdDataObjects.get(objectDescriptor);
                if (!value) {
                    createdDataObjects.set(objectDescriptor, (value = new Set()));
                }

                /*
                This makes sure that properties' data triggers' valueStatus are set to null
                ensuring there's no reference to it in a storage
            */
                //////////this._setCreatedObjectPropertyTriggerStatusToNull(dataObject);

                value.add(dataObject);
                this.objectDescriptorsWithChanges.add(objectDescriptor);

                this.dispatchDataEventTypeForObject(DataEvent.create, dataObject);
            },
        },

        unregisterCreatedDataObject: {
            value: function (dataObject) {
                var objectDescriptor = this.objectDescriptorForObject(dataObject),
                    value = this.createdDataObjects.get(objectDescriptor);
                if (value) {
                    value.delete(dataObject);
                    this.objectDescriptorsWithChanges.delete(objectDescriptor);
                }
            },
        },

        _setCreatedObjectPropertyTriggerStatusToNull: {
            value: function (dataObject) {
                let dataObjectTriggers = this._getTriggersForObject(dataObject),
                    dataObjectTriggersPropertyNames = Object.keys(dataObjectTriggers);

                for (
                    let i = 0, iPropertyName, iValue, countI = dataObjectTriggersPropertyNames.length;
                    i < countI;
                    i++
                ) {
                    iPropertyName = dataObjectTriggersPropertyNames[i];
                    //If values were set on the object and the property has a trigger, meaning it's handled by Mod data
                    if (!dataObject.hasOwnProperty(iPropertyName)) {
                        dataObjectTriggers[iPropertyName]._setValueStatus(dataObject, null);
                    }
                }
            },
        },

        /**
     * This method makes the mainService aware of a dataObject that wasn't fetched. So
     * beyond that we can't really know if it's new, as it doesn't exists in the a storage
     * the matching data services encapsulate, or if it does and this might be more of a merge
     * / update. It might be necessary to flag it to rawDataServcices somehow. A DB like PostgreSQL
     * can probably deal with it by using INSERT ... ON CONFLICT (key) DO UPDATE (and ON CONFLICT (key) DO NOTHING),
     * i.e. upsert, or the more recent MERGE.
     *
     * TODO: refactor to use isObjectCreated() and registerCreatedDataObject() methods if possible
     *
     * @method {Set.<Object>}
     * @argument {DataObject} dataObject
     * @argument {Object} delegate - an object that gets a chance to substitute an existing object instead of merging the one at end, for example to avoid duplicates
     * @returns {void || Promise} - if a delegate is used, the method will return a promise otherwise it returns the dataObject passed in

     */

        _invokeDelegateWillMergeDataObjectPropertyValueIntoExistingDataObject: {
            value: function (
                delegate,
                dataObject,
                propertyName,
                valueToMerge,
                existingDataObject,
                propertyArray,
                propertyIndex,
                _promises,
                isRoot,
                _mergingDataObjects
            ) {
                if (!delegate?.willMergeDataObjectPropertyValueIntoExistingDataObject) {
                    this.mergeDataObject(valueToMerge, delegate, _promises, isRoot, _mergingDataObjects);
                } else {
                    let delegatePromise = delegate
                        .willMergeDataObjectPropertyValueIntoExistingDataObject(
                            dataObject,
                            propertyName,
                            valueToMerge,
                            existingDataObject,
                            propertyArray,
                            propertyIndex
                        )
                        .then((delegateValueToMerge) => {
                            /*
                            If null is returned by the delegate, nothing to do
                            But if an object is returned that is known, then the
                            next mergeDataObject() will punt as needed
                        */
                            if (delegateValueToMerge) {
                                this.mergeDataObject(
                                    delegateValueToMerge,
                                    delegate,
                                    _promises,
                                    isRoot,
                                    _mergingDataObjects
                                );

                                /*
                                Update the property
                                DOES NOT HANDLE ANYTHING BUT to-one and array-based to-many...
                                Shall we leave this to the delegate to do?
                            */
                                if (propertyArray) {
                                    if (!existingDataObject) {
                                        if (propertyArray[propertyIndex] !== delegateValueToMerge) {
                                            propertyArray.set(propertyIndex, delegateValueToMerge);
                                        }
                                    } else {
                                        return this.getObjectProperties(existingDataObject, [propertyName]).then(() => {
                                            let existingDataObjectArray = existingDataObject[propertyName];
                                            if (!existingDataObjectArray.includes(delegateValueToMerge)) {
                                                existingDataObjectArray.push(delegateValueToMerge);
                                            }
                                        });
                                    }
                                } else {
                                    if (existingDataObject) {
                                        return this.getObjectProperties(existingDataObject, [propertyName]).then(() => {
                                            let existingDataObjectValue = existingDataObject[propertyName];
                                            if (existingDataObjectValue !== delegateValueToMerge) {
                                                existingDataObjectValue[propertyName] = delegateValueToMerge;
                                            }
                                        });
                                    } else if (dataObject[propertyName] !== delegateValueToMerge) {
                                        dataObject[propertyName] = delegateValueToMerge;
                                    }
                                }
                            }

                            return delegateValueToMerge;
                        });

                    _promises.push(delegatePromise);
                    return delegatePromise;
                }
            },
        },

        _invokeDelegateWillMergeDataObject: {
            value: function (delegate, dataObject, _promises, isRoot) {
                if (delegate?.willMergeDataObject) {
                    let delegatePromise = delegate.willMergeDataObject(dataObject);
                    _promises.push(delegatePromise);
                    return delegatePromise;
                } else {
                    return Promise.resolve(dataObject);
                }
            },
        },

        _mergeDataObjectProperties: {
            value: function (dataObject, delegate, delegateObjectToMerge, _promises, _isRoot, _mergingDataObjects) {
                //Sanity check
                if (delegateObjectToMerge === dataObject) {
                    delegateObjectToMerge = null;
                }

                let objectKeys = Object.keys(dataObject);
                for (let iKey of objectKeys) {
                    let iValue = dataObject[iKey];
                    //console.log("merging "+iKey+", iValue ",iValue, "for ",dataObject.identifier);

                    //If it's a new object, we need to make sure things are square like if dataObject had been created by the data service
                    if (!delegateObjectToMerge) {
                        delete dataObject[iKey];
                        dataObject[iKey] = iValue;

                        //The array on dataObject is its owm, so we need to grab it as it's not iValue anymore
                        iValue = dataObject[iKey];
                    }

                    //If we have delegateObjectToMerge, we need to make sure that we move the values of dataObject on to delegateObjectToMerge
                    if (isArray(iValue)) {
                        for (let i = 0, countI = iValue.length; i < countI; i++) {
                            if (delegate) {
                                this._invokeDelegateWillMergeDataObjectPropertyValueIntoExistingDataObject(
                                    delegate,
                                    dataObject,
                                    iKey,
                                    iValue[i],
                                    delegateObjectToMerge,
                                    iValue,
                                    i,
                                    _promises,
                                    _isRoot,
                                    _mergingDataObjects
                                );
                            } else {
                                //We don't change the structure, we just blend in values off dataObject
                                this.mergeDataObject(iValue[i], delegate, _promises, _isRoot, _mergingDataObjects);
                            }
                        }
                    } else if (iValue && typeof iValue === "object") {
                        if (delegate) {
                            this._invokeDelegateWillMergeDataObjectPropertyValueIntoExistingDataObject(
                                delegate,
                                dataObject,
                                iKey,
                                iValue,
                                delegateObjectToMerge,
                                undefined,
                                undefined,
                                _promises,
                                _isRoot,
                                _mergingDataObjects
                            );
                        } else {
                            //We don't change the structure, we just blend in values off dataObject
                            this.mergeDataObject(iValue, delegate, _promises, _isRoot, _mergingDataObjects);
                        }
                    }

                    //console.log("merged "+iKey+" for:"+dataObject.identifier);
                }
            },
        },

        _mergeDataObject: {
            value: function (dataObject, delegate, delegateObjectToMerge, _promises, _isRoot, _mergingDataObjects) {
                if (!delegateObjectToMerge || (delegateObjectToMerge && dataObject === delegateObjectToMerge)) {
                    let objectDescriptor = this.objectDescriptorForObject(dataObject),
                        createdDataObjects = this.createdDataObjects,
                        value = createdDataObjects.get(objectDescriptor);

                    if (!value) {
                        createdDataObjects.set(objectDescriptor, (value = new Set()));
                        this.objectDescriptorsWithChanges.add(objectDescriptor);
                    }

                    if (!value.has(dataObject)) {
                        let service = this.childServicesThatCanSaveDataType(objectDescriptor)?.[0],
                            //     //In case the object's primarykey is a public property
                            //     //
                            //     //primaryKey = service.dataIdentifierForNewObjectWithObjectDescriptor(objectDescriptor, dataObject),
                            //     primaryKey = service.primaryKeyForTypeRawData(objectDescriptor, dataObject),
                            prototype = this._getPrototypeForType(objectDescriptor /*, service*/);
                        //     dataIdentifier = primaryKey
                        //         ? service.dataIdentifierForTypePrimaryKey(objectDescriptor, primaryKey)
                        //         : service.dataIdentifierForNewObjectWithObjectDescriptor(objectDescriptor);
                        /*
                        for Anonymous identity object, it happens that no service is found, which is to be investigated.
                        One unusual thing is that Identity extends Montage and not DataObject, relevant?
                    */
                        if (service) {
                            let dataIdentifier = service.dataIdentifierForObject(dataObject);
                            // this is mainService here
                            // this.registerUniqueObjectWithDataIdentifier(dataObject, dataIdentifier);
                            // this.recordDataIdentifierForObject(dataIdentifier, dataObject);

                            if (!dataIdentifier) {
                                dataIdentifier = service?.dataIdentifierForNewObjectWithObjectDescriptor(
                                    objectDescriptor,
                                    dataObject
                                );
                                service.registerUniqueObjectWithDataIdentifier(dataObject, dataIdentifier);
                                this.registerUniqueObjectWithDataIdentifier(dataObject, dataIdentifier);
                                this.recordDataIdentifierForObject(dataIdentifier, dataObject);
                            }

                            //Need to fix the prototype if needed
                            if (Object.getPrototypeOf(dataObject) !== prototype) {
                                // let valueShallowCopy = {};
                                // Object.assign(valueShallowCopy, dataObject);
                                Object.setPrototypeOf(dataObject, prototype);
                            }

                            value.add(dataObject);

                            //This is done in _createDataObject, is it needed here?
                            this._setObjectType(dataObject, objectDescriptor);
                            this._objectDescriptorForObjectCache.set(dataObject, objectDescriptor);

                            //Make sure we won't fetch properties missing
                            this._setCreatedObjectPropertyTriggerStatusToNull(dataObject);

                            //Let's make sure the values are now handled by DataTriggers
                            this._mergeDataObjectProperties(
                                dataObject,
                                delegate,
                                delegateObjectToMerge,
                                _promises,
                                _isRoot,
                                _mergingDataObjects
                            );

                            //Build the changes we'll want to upsert
                            //this.registerMergedDataObjectChanges(dataObject);

                            this.dispatchDataEventTypeForObject(DataEvent.create, dataObject);

                            //if(delegate && _isRoot && _promises) {
                            if (_isRoot && _promises) {
                                return Promise.all(_promises).then(() => dataObject);
                            }
                            return dataObject;
                        } else {
                            console.warn(
                                "WARNING: Object NOT MERGED: No RawDataService found that can save data type " +
                                    objectDescriptor
                            );
                        }
                    }
                } else {
                    //An existing object was found, but we still want to eventually move properties from dataObject to delegateObjectToMerge
                    this._mergeDataObjectProperties(
                        dataObject,
                        delegate,
                        delegateObjectToMerge,
                        _promises,
                        _isRoot,
                        _mergingDataObjects
                    );
                }

                //if(delegate && _isRoot && _promises) {
                if (_isRoot && _promises) {
                    return Promise.all(_promises).then(() => dataObject);
                }
                return dataObject;
            },
        },

        mergeDataObject: {
            value: function (dataObject, delegate, _promises, _isRoot, _mergingDataObjects) {
                let isRoot = arguments.length === 4 ? _isRoot : _promises === undefined,
                    promises;

                if (_promises) {
                    promises = _promises;
                }

                if (!_mergingDataObjects) {
                    _mergingDataObjects = new Set();
                }

                if (_mergingDataObjects.has(dataObject)) {
                    return isRoot ? Promise.resolve(dataObject) : dataObject;
                } else {
                    _mergingDataObjects.add(dataObject);
                }

                if (dataObject === null || dataObject === undefined) {
                    //return (delegate && isRoot)? Promise.resolve(dataObject) : dataObject;
                    return isRoot ? Promise.resolve(dataObject) : dataObject;
                }

                let objectDescriptor = this.objectDescriptorForObject(dataObject);
                let childServicesForType = this.childServicesForType(objectDescriptor);

                if (
                    !objectDescriptor ||
                    (objectDescriptor &&
                        (!this.handlesType(objectDescriptor) ||
                            !childServicesForType ||
                            (childServicesForType &&
                                childServicesForType?.filter((value) => value.handlesType(objectDescriptor))?.length ==
                                    0)))
                ) {
                    //return  (delegate && isRoot) ? Promise.resolve(dataObject) : dataObject;
                    return isRoot ? Promise.resolve(dataObject) : dataObject;
                }
                //If we already know about the object, nothing to do
                else if (
                    this.isObjectCreated(dataObject) ||
                    this.isObjectFetched(dataObject) ||
                    this.isObjectChanged(dataObject) ||
                    this.isObjectDeleted(dataObject)
                ) {
                    //return (delegate && isRoot) ? Promise.resolve(dataObject) : dataObject;
                    return isRoot ? Promise.resolve(dataObject) : dataObject;
                } else {
                    let rootPromise;

                    if (delegate) {
                        return this._invokeDelegateWillMergeDataObject(
                            delegate,
                            dataObject,
                            promises || (promises = []),
                            isRoot
                        ).then((delegateObjectToMerge) => {
                            this._mergeDataObject(
                                dataObject,
                                delegate,
                                delegateObjectToMerge,
                                promises || (promises = []),
                                isRoot,
                                _mergingDataObjects
                            );

                            if (isRoot && promises) {
                                return Promise.all(promises).then(() => dataObject);
                            } else {
                                return dataObject;
                            }
                        });
                    } else {
                        this._mergeDataObject(
                            dataObject,
                            delegate,
                            undefined,
                            promises || (promises = []),
                            isRoot,
                            _mergingDataObjects
                        );

                        // if(delegate && isRoot && promises) {
                        if (isRoot && promises) {
                            return Promise.all(promises).then(() => dataObject);
                        } else {
                            return dataObject;
                        }
                    }
                }
            },
        },

        registerMergedDataObjectChanges: {
            value: function (dataObject) {
                let dataObjectTriggers = this._getTriggersForObject(dataObject),
                    dataObjectTriggerNames = Object.keys(dataObjectTriggers),
                    dataObjectPropertyNames = Object.keys(dataObject),
                    // propertyNames = Object.keys(dataObjectTriggers),
                    changesForDataObject = this.changesForDataObject(dataObject);

                for (
                    let i = 0, iDataObjectTrigger, iPropertyName, iValue, countI = dataObjectTriggerNames.length;
                    i < countI;
                    i++
                ) {
                    iDataObjectTrigger = dataObjectTriggers[dataObjectTriggerNames[i]];
                    //If values were set on the object and the property has a trigger, meaning it's handled by Mod data
                    if (dataObject.hasOwnProperty((iPropertyName = iDataObjectTrigger._privatePropertyName))) {
                        changesForDataObject.set(
                            iDataObjectTrigger._propertyName,
                            (iValue = dataObject[iPropertyName])
                        );
                    } else if (dataObject.hasOwnProperty((iPropertyName = iDataObjectTrigger._propertyName))) {
                        changesForDataObject.set(
                            iDataObjectTrigger._propertyName,
                            (iValue = dataObject[iPropertyName])
                        );
                    }

                    if (iValue) {
                        this.mergeDataObject(iValue);
                    }
                }

                // for(let i=0, iPropertyName, iValue, countI = dataObjectPropertyNames.length; (i < countI); i++) {
                //     iPropertyName = dataObjectPropertyNames[i];
                //     //If values were set on the object and the property has a trigger, meaning it's handled by Mod data
                //     if(dataObject.hasOwnProperty(iPropertyName) && dataObjectTriggers[iPropertyName]) {
                //         changesForDataObject.set(iPropertyName, (iValue = dataObject[iPropertyName]));
                //         if(iValue) {
                //             this.mergeDataObject(iValue);
                //         }
                //     }
                // }
            },
        },

        isObjectCreated: {
            value: function (object) {
                var objectDescriptor = this.objectDescriptorForObject(object),
                    createdDataObjects = this.createdDataObjects.get(objectDescriptor),
                    isObjectCreated = createdDataObjects && createdDataObjects.has(object);

                if (!isObjectCreated) {
                    var service = this._getChildServiceForObject(object);
                    if (service) {
                        /*
                        !service.hasSnapshotForObject(object) means that it's not been fetched.
                        Not that it's been registered as created:
                    */
                        isObjectCreated = service.isObjectCreated(object) /*|| !service.hasSnapshotForObject(object)*/;
                    } else {
                        isObjectCreated = false;
                    }
                }

                if (!isObjectCreated && this.isMainService) {
                    var pendingTransactions = this._pendingTransactions;

                    if (pendingTransactions && pendingTransactions.length) {
                        for (var i = 0, countI = pendingTransactions.length; i < countI; i++) {
                            if (pendingTransactions[i].createdDataObjects.get(object.objectDescriptor)?.has(object)) {
                                return true;
                            }
                        }
                        return false;
                    } else {
                        return false;
                    }
                }

                return isObjectCreated;
            },
        },

        __readOnlyDataObjectsByObjectDescriptors: {
            value: undefined,
        },

        _readOnlyDataObjectsByObjectDescriptors: {
            get: function () {
                return (
                    this.__readOnlyDataObjectsByObjectDescriptors ||
                    (this.__readOnlyDataObjectsByObjectDescriptors = new Map())
                );
            },
        },

        _readOnlyDataObjectsFoObjectDescriptor: {
            value: function (objectDescriptor) {
                var result;
                return (
                    this._readOnlyDataObjectsByObjectDescriptors.get(objectDescriptor) ||
                    (this._readOnlyDataObjectsByObjectDescriptors.set(objectDescriptor, (result = [])) && result)
                );
            },
        },
        registerReadOnlyDataObject: {
            value: function (dataObject) {
                this._readOnlyDataObjectsFoObjectDescriptor(dataObject.objectDescriptor).push(dataObject);
            },
        },
        unregisterReadOnlyDataObject: {
            value: function (dataObject) {
                if (dataObject) {
                    let readOnlyDataObjectsRegisteredForObjectDescriptor =
                        this.__readOnlyDataObjectsByObjectDescriptors?.(dataObject.objectDescriptor);

                    if (readOnlyDataObjectsRegisteredForObjectDescriptor) {
                        let index = readOnlyDataObjectsRegisteredForObjectDescriptor.indexOf(dataObject);

                        if (index !== -1) {
                            readOnlyDataObjectsRegisteredForObjectDescriptor.splice(index, 1);
                        }
                    }
                }
            },
        },

        readOnlyDataObjectsRegisteredForObjectDescriptor: {
            value: function (objectDescriptor) {
                var result;
                return this.__readOnlyDataObjectsByObjectDescriptors?.get(objectDescriptor);
            },
        },

        /**
         * A set of the data objects modified by the user after they were fetched.
         *     *
         * @type {Set.<Object>}
         */
        changedDataObjects: {
            get: function () {
                if (this.isRootService) {
                    if (!this._changedDataObjects) {
                        this._changedDataObjects = new Map();
                    }
                    return this._changedDataObjects;
                } else {
                    return this.rootService.changedDataObjects;
                }
            },
        },
        registerChangedDataObject: {
            value: function (dataObject) {
                var objectDescriptor = this.objectDescriptorForObject(dataObject),
                    changedDataObjects,
                    value;

                if (this.isObjectCreated(dataObject)) {
                    console.warn(
                        `DataService can't register a new object (${objectDescriptor.name}) in changedDataObjects`
                    );
                    return;
                }

                changedDataObjects = this.changedDataObjects;
                value = changedDataObjects.get(objectDescriptor);

                if (!value) {
                    changedDataObjects.set(objectDescriptor, (value = new Set()));
                }
                value.add(dataObject);
                this.objectDescriptorsWithChanges.add(objectDescriptor);
            },
        },

        isObjectChanged: {
            value: function (dataObject) {
                return this.changedDataObjects.get(dataObject.objectDescriptor)?.has(dataObject);
            },
        },

        unregisterChangedDataObject: {
            value: function (dataObject) {
                var objectDescriptor = this.objectDescriptorForObject(dataObject),
                    value = this.changedDataObjects.get(objectDescriptor);

                if (value) {
                    value.delete(dataObject);
                    this.objectDescriptorsWithChanges.delete(objectDescriptor);
                }
            },
        },

        isObjectFetched: {
            value: function (dataObject) {
                return !!dataObject.snapshot;
            },
        },

        /**
         * A Map of the data objects managed by this service or any other descendent
         * of this service's [root service]{@link DataService#rootService} that have
         * been changed since that root service's data was last saved, or since the
         * root service was created if that service's data hasn't been saved yet
         *
         * Since root services are responsible for tracking data objects, subclasses
         * whose instances will not be root services should override this property
         * to return their root service's value for it.
         *
         * The key are the objects, the value is a Set containing the property changed
         *
         * @type {Map.<Object>}
         */
        dataObjectChanges: {
            get: function () {
                if (this.isRootService) {
                    return this._dataObjectChanges || (this._dataObjectChanges = new Map());
                } else {
                    return this.rootService.dataObjectChanges;
                }
            },
        },

        _dataObjectChanges: {
            value: undefined,
        },

        /**
         * A Map containing the changes for an object. Keys are the property modified,
         * values are either a single value, or a map with added/removed keys for properties
         * that have a cardinality superior to 1. The underlyinng collection doesn't matter
         * at that level.
         *
         * Retuns undefined if no changes have been registered.
         *
         * @type {Map.<Object>}
         */

        _buildChangesForDataObject: {
            value: function (dataObject) {
                let changesForDataObject = new Map();
                this.dataObjectChanges.set(dataObject, changesForDataObject);
                return changesForDataObject;
            },
        },
        changesForDataObject: {
            value: function (dataObject) {
                return this.dataObjectChanges.get(dataObject) || this._buildChangesForDataObject(dataObject);
            },
        },

        /**
     * handles the propagation of a value set to a property's inverse property, fka "addToBothSidesOfRelationship..."
     * This doesn't handle range changes, which is done in another method.
     *
     * WARNING: It doesn't look like this is called anywhere, but _setDataObjectPropertyDescriptorValueForInversePropertyDescriptor() is
     *
     * @private
     * @method
     * @argument {Object} dataObject
     * @returns {Promise}

     */
        _setDataObjectPropertyDescriptorValueForInversePropertyName: {
            value: function (dataObject, propertyDescriptor, value, inversePropertyName) {
                //Now set the inverse if any
                if (inversePropertyName) {
                    var inversePropertyDescriptor = propertyDescriptor._inversePropertyDescriptor; /* Sync */
                    if (!inversePropertyDescriptor) {
                        var self = this;
                        return propertyDescriptor.inversePropertyDescriptor.then(function (
                            inversePropertyDescriptorResolved
                        ) {
                            self._setDataObjectPropertyDescriptorValueForInversePropertyDescriptor(
                                dataObject,
                                propertyDescriptor,
                                value,
                                inversePropertyDescriptorResolved
                            );
                        });
                    } else {
                        this._setDataObjectPropertyDescriptorValueForInversePropertyDescriptor(
                            dataObject,
                            propertyDescriptor,
                            value,
                            inversePropertyDescriptor
                        );
                        return Promise.resolveTrue;
                    }
                }
            },
        },

        _setDataObjectPropertyDescriptorValueForInversePropertyDescriptor: {
            value: function (
                dataObject,
                propertyDescriptor,
                value,
                inversePropertyDescriptor,
                previousValue,
                isDataObjectBeingMapped
            ) {
                if (!inversePropertyDescriptor) {
                    return;
                }

                // if(this._objectsBeingMapped.has(dataObject) && this._objectsBeingMapped.has(value)) {
                //     return;
                // }

                let addedValueAsObjectsBeingMapped = false,
                    setInversePromise;

                if (this._objectsBeingMapped.has(dataObject)) {
                    if (this._objectsBeingMapped.has(value)) {
                        return;
                    } else {
                        addedValueAsObjectsBeingMapped = true;
                        this._objectsBeingMapped.add(value);
                    }
                }

                var inversePropertyName = inversePropertyDescriptor.name,
                    inversePropertyCardinality = inversePropertyDescriptor.cardinality,
                    inverseValue;

                if (propertyDescriptor.cardinality === 1) {
                    //value should not be an array
                    if (isArray(value)) {
                        console.warn(
                            "Something's off...., the value of propertyDescriptor:",
                            propertyDescriptor,
                            " of data object:",
                            dataObject,
                            " should not be an array"
                        );
                    }

                    if (value) {
                        if (inversePropertyCardinality > 1) {
                            /*
                            value needs to be added to the other's side:

                            BUT - TODO - doing value[inversePropertyName] actually fires the trigger if wasn't there alredy.
                            In some cases, we rely on the value being there so it gets saved properly, by putting a foreignKey in for example.
                            It might be possible to handle that when we save only, or we could do the lookup using the property getter's secret shouldFetch argument.

                             inverseValue = Object.getPropertyDescriptor(value,inversePropertyName).get(false); //<-shouldFetch false

                            If we add the value and we don't know what was there (because we didn't fetch), we won't be able to do optimistic locking
                            We also would need to mark that property as "incommplete?", which we would need to do to able to add to a relationship without resolving it.
                            such that if the user actually fetch that property we can re-apply what was added/removed locally to what was actually fetched.

                            Also value[inversePropertyName] does fire the trigger, but it's async, so we're likely missing the value here and we migh need to use a promise with
                            getObjectProperty/ies

                        */
                            inverseValue = value[inversePropertyName];
                            if (inverseValue) {
                                /*
                                We might be looping back, but in any case, we shouldn't add the same object again, so we need to check if it is there. I really don't like doinf indexOf() here, but it's not a set...
                            */
                                if (inverseValue.indexOf(dataObject) === -1) {
                                    inverseValue.push(dataObject);
                                }
                            } else {
                                //No existing array so we create one on the fly
                                value[inversePropertyName] = [dataObject];
                            }
                        } else {
                            /*
                            A 1-1 then. Let's not set if it's the same...

                            CAVEAT: if inversePropertyName has not been fetched so far, we don't really know what the value is.
                            If the "join" is made on value's primary key, checking the snapshot wouldn't tell us anything.
                            If we do value[inversePropertyName], it does trigger a fetch anyway and the value returned may or may not
                            end up overriding value[inversePropertyName] = dataObject done here, which isn't what the user intended.
                        */
                            setInversePromise = this.getObjectProperties(value, [inversePropertyName]).then(() => {
                                if (value[inversePropertyName] !== dataObject) {
                                    value[inversePropertyName] = dataObject;
                                }
                            });
                        }
                    }

                    if (previousValue) {
                        inverseValue = previousValue[inversePropertyName];
                        if (inversePropertyCardinality > 1) {
                            /*
                            previousValue needs to be removed from the other's side:
                        */
                            if (inverseValue) {
                                /*
                                Assuming it only exists once in the array as it should...
                            */
                                inverseValue.delete(dataObject);
                            }
                            // else {
                            //     //No existing array so nothing to do....
                            // }
                        } else if (inverseValue === dataObject) {
                            /*
                        only if previousValue still points back to dataObject, do we sever the relationship
                        This checks allows to break a cycle of 1-1 updatimg each other one side moves on
                    */
                            //A 1-1 then
                            previousValue[inversePropertyName] = null;
                        }
                    }
                } else if (propertyDescriptor.cardinality > 1) {
                    //value should  be an array
                    if (value && !isArray(value)) {
                        console.warn(
                            "Something's off...., the value of propertyDescriptor:",
                            propertyDescriptor,
                            " of data object:",
                            dataObject,
                            " should be an array"
                        );
                    }

                    this._addDataObjectPropertyDescriptorValuesForInversePropertyDescriptor(
                        dataObject,
                        propertyDescriptor,
                        value,
                        inversePropertyDescriptor
                    );

                    if (previousValue) {
                        this._removeDataObjectPropertyDescriptorValuesForInversePropertyDescriptor(
                            dataObject,
                            propertyDescriptor,
                            previousValue,
                            inversePropertyDescriptor
                        );
                    }
                    // for(var i=0, countI = value.length, iValue; (i<countI); i++) {
                    //     iValue = value[i];

                    //     if(inversePropertyCardinality > 1) {
                    //         //many to many:
                    //         //value needs to be added to the other's side:
                    //         inverseValue = value[inversePropertyName];
                    //         if(inverseValue) {
                    //             inverseValue.push(dataObject)
                    //         } else {
                    //             //No existing array so we create one on the fly
                    //             value[inversePropertyName] = [dataObject];
                    //         }

                    //     } else {
                    //         //A many-to-one
                    //         iValue[inversePropertyName] = dataObject;
                    //     }

                    // }
                }

                //Cleanup:
                if (addedValueAsObjectsBeingMapped) {
                    if (setInversePromise) {
                        setInversePromise.then(() => {
                            this._objectsBeingMapped.delete(value);
                        });
                    } else {
                        this._objectsBeingMapped.delete(value);
                    }
                }
            },
        },

        /**
     * handles the propagation of a values added to a property's array value to it's inverse property, fka "addToBothSidesOfRelationship..."
     *
     * @private
     * @method
     * @argument {Object} dataObject
     * @returns {Promise}

     */
        _addDataObjectPropertyDescriptorValuesForInversePropertyName: {
            value: function (dataObject, propertyDescriptor, value, inversePropertyName) {
                //Now set the inverse if any
                if (inversePropertyName) {
                    var inversePropertyDescriptor = propertyDescriptor._inversePropertyDescriptor; /* Sync */
                    if (!inversePropertyDescriptor) {
                        var self = this;
                        return propertyDescriptor.inversePropertyDescriptor.then(function (
                            inversePropertyDescriptorResolved
                        ) {
                            self._addDataObjectPropertyDescriptorValuesForInversePropertyDescriptor(
                                dataObject,
                                propertyDescriptor,
                                value,
                                inversePropertyDescriptorResolved
                            );
                        });
                    } else {
                        this._addDataObjectPropertyDescriptorValuesForInversePropertyDescriptor(
                            dataObject,
                            propertyDescriptor,
                            value,
                            inversePropertyDescriptor
                        );
                        return Promise.resolveTrue;
                    }
                }
            },
        },

        _addDataObjectPropertyDescriptorValuesForInversePropertyDescriptor: {
            value: function (
                dataObject,
                propertyDescriptor,
                values,
                inversePropertyDescriptor,
                isDataObjectBeingMapped
            ) {
                if (inversePropertyDescriptor) {
                    //value should  be an array
                    if ((values && !isArray(values)) || !(propertyDescriptor.cardinality > 0)) {
                        console.warn(
                            "Something's off...., values added to propertyDescriptor:",
                            propertyDescriptor,
                            " of data object:",
                            dataObject,
                            " should be an array"
                        );
                    }

                    var inversePropertyName = inversePropertyDescriptor.name,
                        inversePropertyCardinality = inversePropertyDescriptor.cardinality,
                        i,
                        countI;

                    for (i = 0, countI = values?.length; i < countI; i++) {
                        this._addDataObjectPropertyDescriptorValueForInversePropertyDescriptor(
                            dataObject,
                            propertyDescriptor,
                            values[i],
                            inversePropertyDescriptor,
                            inversePropertyCardinality,
                            inversePropertyName,
                            isDataObjectBeingMapped
                        );
                    }
                }
            },
        },

        _addDataObjectPropertyDescriptorValueForInversePropertyDescriptor: {
            value: function (
                dataObject,
                propertyDescriptor,
                value,
                inversePropertyDescriptor,
                _inversePropertyCardinality,
                _inversePropertyName,
                isDataObjectBeingMapped
            ) {
                if (inversePropertyDescriptor && value) {
                    if (isDataObjectBeingMapped) {
                        this._objectsBeingMapped.add(value);
                    }

                    if ((_inversePropertyCardinality || inversePropertyDescriptor.cardinality) > 1) {
                        //many to many:
                        //value, if there is one, needs to be added to the other's side:
                        inverseValue = value[_inversePropertyName || inversePropertyDescriptor.name];
                        if (inverseValue) {
                            /*
                            We shouldn't add the same object again, so we need to check if it is there. I really don't like doinf indexOf() here, but it's not a set...
                        */
                            if (inverseValue.indexOf(dataObject) === -1) {
                                inverseValue.push(dataObject);
                            }
                        } else {
                            //No existing array so we create one on the fly
                            value[_inversePropertyName || inversePropertyDescriptor.name] = [dataObject];
                        }
                    } else {
                        //A many-to-one
                        let propertyName = _inversePropertyName || inversePropertyDescriptor.name,
                            objectPropertyValue = Object.getPropertyDescriptor(value, propertyName)?.get?.call(
                                value,
                                /*shouldFetch*/ false
                            );

                        if (objectPropertyValue !== dataObject) {
                            value[_inversePropertyName || inversePropertyDescriptor.name] = dataObject;
                        }
                    }

                    if (isDataObjectBeingMapped) {
                        this._objectsBeingMapped.delete(value);
                    }
                }
            },
        },

        /**
     * handles the propagation of a values added to a property's array value to it's inverse property, fka "addToBothSidesOfRelationship..."
     *
     * @private
     * @method
     * @argument {Object} dataObject
     * @returns {Promise}

     */
        _removeDataObjectPropertyDescriptorValuesForInversePropertyName: {
            value: function (dataObject, propertyDescriptor, value, inversePropertyName) {
                //Now set the inverse if any
                if (inversePropertyName) {
                    var inversePropertyDescriptor = propertyDescriptor._inversePropertyDescriptor; /* Sync */
                    if (!inversePropertyDescriptor) {
                        var self = this;
                        return propertyDescriptor.inversePropertyDescriptor.then(function (
                            inversePropertyDescriptorResolved
                        ) {
                            self._removeDataObjectPropertyDescriptorValuesForInversePropertyDescriptor(
                                dataObject,
                                propertyDescriptor,
                                value,
                                inversePropertyDescriptorResolved
                            );
                        });
                    } else {
                        this._removeDataObjectPropertyDescriptorValuesForInversePropertyDescriptor(
                            dataObject,
                            propertyDescriptor,
                            value,
                            inversePropertyDescriptor
                        );
                        return Promise.resolveTrue;
                    }
                }
            },
        },

        _removeDataObjectPropertyDescriptorValuesForInversePropertyDescriptor: {
            value: function (dataObject, propertyDescriptor, values, inversePropertyDescriptor) {
                if (inversePropertyDescriptor) {
                    //value should  be an array
                    if (!isArray(values) || !(propertyDescriptor.cardinality > 0)) {
                        console.warn(
                            "Something's off...., values added to propertyDescriptor:",
                            propertyDescriptor,
                            " of data object:",
                            dataObject,
                            " should be an array"
                        );
                    }

                    var inversePropertyName = inversePropertyDescriptor.name,
                        inversePropertyCardinality = inversePropertyDescriptor.cardinality,
                        i,
                        countI;

                    for (i = 0, countI = values.length; i < countI; i++) {
                        this._removeDataObjectPropertyDescriptorValueForInversePropertyDescriptor(
                            dataObject,
                            propertyDescriptor,
                            values[i],
                            inversePropertyDescriptor,
                            inversePropertyCardinality,
                            inversePropertyName
                        );
                    }
                }
            },
        },

        _removeDataObjectPropertyDescriptorValueForInversePropertyDescriptor: {
            value: function (
                dataObject,
                propertyDescriptor,
                value,
                inversePropertyDescriptor,
                _inversePropertyCardinality,
                _inversePropertyName
            ) {
                if (inversePropertyDescriptor && value) {
                    if ((_inversePropertyCardinality || inversePropertyDescriptor.cardinality) > 1) {
                        /*
                        many to many:
                        value needs to be renoved to the other's side, unless it doesn't exists (which would be the case if it wasn't fetched).
                    */
                        inverseValue = value[_inversePropertyName || inversePropertyDescriptor.name];
                        if (inverseValue) {
                            inverseValue.delete(dataObject);
                        }
                    } else {
                        //A many-to-one, sever the ties
                        value[_inversePropertyName || inversePropertyDescriptor.name] = null;
                    }
                }
            },
        },

        debouncedQueueMicrotaskWithDelay: {
            value: queueMicrotask.debounceWithDelay(500),
        },

        registerDataObjectChangesFromEvent: {
            value: function (changeEvent, shouldTrackChangesWhileBeingMapped) {
                var dataObject = changeEvent.target,
                    key = changeEvent.key,
                    objectDescriptor = this.objectDescriptorForObject(dataObject),
                    propertyDescriptor = objectDescriptor.propertyDescriptorForName(key),
                    isDataObjectBeingMapped = this._objectsBeingMapped.has(dataObject);

                //Property with definitions are read-only shortcuts, we don't want to treat these as changes the raw layers will want to know about
                if (propertyDescriptor.definition) {
                    return;
                }

                if (!isDataObjectBeingMapped && this.autosaves /* && !this.isAutosaveScheduled*/) {
                    //this.isAutosaveScheduled = true;
                    this.debouncedQueueMicrotaskWithDelay(() => {
                        this.isAutosaveScheduled = false;
                        this.saveChanges();
                    });
                }

                // if (!isDataObjectBeingMapped && this.autosaves && !this.isAutosaveScheduled) {
                //     this.isAutosaveScheduled = true;
                //     queueMicrotask(() => {
                //         this.isAutosaveScheduled = false;
                //         this.saveChanges();
                //     });
                // }

                var inversePropertyName = propertyDescriptor.inversePropertyName,
                    inversePropertyDescriptor;

                if (inversePropertyName) {
                    inversePropertyDescriptor = propertyDescriptor._inversePropertyDescriptor /* Sync */;
                    if (!inversePropertyDescriptor) {
                        var self = this;
                        return propertyDescriptor.inversePropertyDescriptor.then(function (_inversePropertyDescriptor) {
                            if (!_inversePropertyDescriptor) {
                                console.error(
                                    "objectDescriptor " +
                                        objectDescriptor.name +
                                        "'s propertyDescriptor " +
                                        propertyDescriptor.name +
                                        " declares an inverse property named " +
                                        inversePropertyName +
                                        " on objectDescriptor " +
                                        propertyDescriptor._valueDescriptorReference.name +
                                        ", no matching propertyDescriptor could be found on " +
                                        propertyDescriptor._valueDescriptorReference.name
                                );
                            } else {
                                self._registerDataObjectChangesFromEvent(
                                    changeEvent,
                                    propertyDescriptor,
                                    _inversePropertyDescriptor,
                                    shouldTrackChangesWhileBeingMapped
                                );
                            }
                        });
                    } else {
                        this._registerDataObjectChangesFromEvent(
                            changeEvent,
                            propertyDescriptor,
                            inversePropertyDescriptor,
                            shouldTrackChangesWhileBeingMapped
                        );
                    }
                } else {
                    this._registerDataObjectChangesFromEvent(
                        changeEvent,
                        propertyDescriptor,
                        inversePropertyDescriptor,
                        shouldTrackChangesWhileBeingMapped
                    );
                }
            },
        },

        _registerDataObjectChangesFromEvent: {
            value: function (
                changeEvent,
                propertyDescriptor,
                inversePropertyDescriptor,
                shouldTrackChangesWhileBeingMapped
            ) {
                var dataObject = changeEvent.target,
                    isCreatedObject = this.isObjectCreated(dataObject),
                    key = changeEvent.key,
                    keyValue = changeEvent.keyValue,
                    addedValues = changeEvent.addedValues,
                    removedValues = changeEvent.removedValues,
                    isDataObjectBeingMapped = this._objectsBeingMapped.has(dataObject),
                    changesForDataObject = this.changesForDataObject(dataObject),
                    //WARNING TEST: THIS WAS REDEFINING THE PASSED ARGUMENT
                    //inversePropertyDescriptor,
                    self = this;

                /*
                Benoit refactoring saveChanges: shouldn't we be able to know that if there are no changesForDataObject, as we create on, it would ve the only time we'd have to call:

                                this.registerChangedDataObject(dataObject);

                ?
                #TODO TEST!!
            */
                // if (dataObject.objectDescriptor.name === "EmploymentPositionStaffing") {
                //     debugger;
                // }

                if (!isCreatedObject && (!isDataObjectBeingMapped || shouldTrackChangesWhileBeingMapped)) {
                    //this.changedDataObjects.add(dataObject);
                    this.registerChangedDataObject(dataObject);
                }

                //Now handled in changesForDataObject
                // if(!changesForDataObject) {
                //     changesForDataObject = new Map();
                //     this.dataObjectChanges.set(dataObject,changesForDataObject);
                // }

                /*

                TODO / WARNING / FIX: If an object's property that has not been fetched, mapped and assigned is accessed, it will be undefined and will trigger a fetch to get it. If the business logic then assumes it's not there and set a value synchronously, when the fetch comes back, we will have a value and the set will look like an update.

                This situation is poorly handled and should be made more robust, here and in DataTrigger.

                Should we look into the snapshot to help? Then map what's there first, and then compare before acting?

                var dataObjectSnapshot = this._getChildServiceForObject(dataObject)._snapshot.get(dataObject.dataIdentifier);

                Just because it's async, doesn't mean we couldn't get it right, since we can act after the sync code action and reconciliate the 2 sides.

            */

                /*
                While a single change Event should be able to model both a range change
                equivalent of minus/plus and a related length property change at
                the same time, a changeEvent from the perspective of tracking data changes
                doesn't really care about length, or the array itself. The key of the changeEvent will be one of the target's and the added/removedValues would be from that property's array if it's one.

                Which means that data objects setters should keep track of an array
                changing on the object itself, as well as mutation done to the array itself while modeling that object's relatioonship.

                Client side we're going to have partial views of a whole relationship
                as we may not want to fetch everything at once if it's big. Which means
                that even if we can track add / removes to a property's array, what we
                may consider as an add / remove client side, may be a no-op while it reaches the server, and we may want to be able to tell the client about that specific fact.


            */
                if (
                    changeEvent.key &&
                    typeof changeEvent.keyValue !== "undefined" &&
                    key !== "length" &&
                    /* new for blocking re-entrant */ changesForDataObject.get(key) !== keyValue
                ) {
                    if (!isDataObjectBeingMapped || shouldTrackChangesWhileBeingMapped) {
                        changesForDataObject.set(key, keyValue);
                    }

                    //Now set the inverse if any
                    if (inversePropertyDescriptor) {
                        self._setDataObjectPropertyDescriptorValueForInversePropertyDescriptor(
                            dataObject,
                            propertyDescriptor,
                            keyValue,
                            inversePropertyDescriptor,
                            changeEvent.previousKeyValue,
                            isDataObjectBeingMapped
                        );
                    }
                }

                //A change event could carry both a key/value change and addedValues/remove, like a splice, where the key would be "length"

                if ((addedValues && addedValues.length > 0) || (removedValues && removedValues.length > 0)) {

                    /*
                        TODO: FIXME
                        if addedValues and removedValues contain the same objects in a different order,
                        there's a bug in a way the graph is updated that is not symetric and the underlaying property of the object that change
                        ends up empty.
                        We set the to-one inverse of the objects in the array to null, 
                        which in turn, understands this as it shouldn't belong in the array of its inverse relationship, from which it is removed.

                        This is wastefull when it's just a different order that has no consequence for the graph itself.
                        But the problem is that when we process the addedValues that should re-set things, there's a problem in logic that guards
                        against upading the graph forever, that's ends the cycle before the state has been fully processed.

                        #WARNING #TODO #FIXME - THAT NEEDS TO BE FIXED!

                    */

                    //If both array contain the same values, there's nothing to do from a relationship/graph management stand point 
                    if (addedValues.isContentEqual(removedValues)) {
                        return;
                    }


                    //For key that can have add/remove the value of they key is an object
                    //that itself has two keys: addedValues and removedValues
                    //which value will be a set;
                    var manyChanges = changesForDataObject.get(key),
                        isManyChangesArray = manyChanges && isArray(manyChanges),
                        i,
                        countI;

                    //TODO The logic for tracking array changes uses the index at which the change occured a la handleRangeChange(plus, minus, index). 
                    // The problem is that it assumes there was a single action taken at a single index within a save cycle. 
                    //Example: foo.bar = [A, B, C, D, E, F, G];
                    //
                    // foo.bar.splice(2, 2); Removes 2 items at index 2 so change event has index 2
                    // foo.bar.push(H); Adds item to end of array so change event has index 5 
                    // foo.bar.unshift(Z); Adds item to beginning of array so change event has index 0
                    // saveChanges();
                    // 
                    // The index captured in dataObjectChanges is the one from the first change event, so 2. 
                    // The indices at which to make the 2nd and 3rd changes are lost. 

                    if (!manyChanges) {
                        manyChanges = new CollectionChanges();
                        changesForDataObject.set(key, manyChanges);
                    } 
                    

                    if (isManyChangesArray && (isCreatedObject || isDataObjectBeingMapped)) {
                        if (removedValues) {
                            self._removeDataObjectPropertyDescriptorValuesForInversePropertyDescriptor(
                                dataObject,
                                propertyDescriptor,
                                removedValues,
                                inversePropertyDescriptor,
                                isDataObjectBeingMapped
                            );
                        }
                        if (addedValues) {
                            self._addDataObjectPropertyDescriptorValuesForInversePropertyDescriptor(
                                dataObject,
                                propertyDescriptor,
                                addedValues,
                                inversePropertyDescriptor,
                                isDataObjectBeingMapped
                            );
                        }
                    } else {

                        if (addedValues && isManyChangesArray && manyChanges.equals(addedValues)) {
                            manyChanges = new CollectionChanges();
                            changesForDataObject.set(key, manyChanges);
                        }
                        manyChanges.trackChangeEvent(changeEvent);

                        if (removedValues) {
                            registeredRemovedValues = manyChanges.removedValues;

                            if (isDataObjectBeingMapped) {
                                let targetName = changeEvent.target instanceof ObjectDescriptor ? changeEvent.target.name : changeEvent.target.dataIdentifier?.typeName;
                                
                                console.warn(`[DataService] RemovedValue during mapping? ${targetName}.${changeEvent.key}`);
                            }
                        

                            for (i = 0, countI = removedValues.length; i < countI; i++) {
                                if (!isDataObjectBeingMapped) {
                                    registeredRemovedValues.add(removedValues[i]);
                                }
                                self._removeDataObjectPropertyDescriptorValueForInversePropertyDescriptor(
                                    dataObject,
                                    propertyDescriptor,
                                    removedValues[i],
                                    inversePropertyDescriptor,
                                    isDataObjectBeingMapped
                                );
                            }
                        }

                        if (addedValues) {
                            registeredAddedValues = manyChanges.addedValues;

                            if (isDataObjectBeingMapped) {
                                let targetName = changeEvent.target instanceof ObjectDescriptor ? changeEvent.target.name : changeEvent.target.dataIdentifier?.typeName;
                                console.warn(`[DataService] Add value during mapping? ${targetName}.${changeEvent.key}`);
                            }
                            let shouldAdd = true;
                            for (i = 0, countI = addedValues.length; i < countI; i++) {
                                if (!isDataObjectBeingMapped) {
                                    if (!registeredAddedValues.has(addedValues[i])) {
                                        registeredAddedValues.add(addedValues[i]);
                                        shouldAdd = true;
                                    } else if (!addedValues[i]) {
                                        shouldAdd = true;
                                    } else {
                                        shouldAdd = false;
                                    }
                                }
                                if (shouldAdd) {
                                    self._addDataObjectPropertyDescriptorValueForInversePropertyDescriptor(
                                        dataObject,
                                        propertyDescriptor,
                                        addedValues[i],
                                        inversePropertyDescriptor,
                                        isDataObjectBeingMapped
                                    );
                                }
                            }
                        }
                    }

                    return;

                }
            },
        },

        clearRegisteredChangesForDataObject: {
            value: function (dataObject) {
                this.dataObjectChanges.set(dataObject, null);
            },
        },

        /**
         * A set of the data objects managed by this service or any other descendent
         * of this service's [root service]{@link DataService#rootService} that have
         * been set for deletion since that root service's data was last saved, or since the
         * root service was created if that service's data hasn't been saved yet
         *
         * Since root services are responsible for tracking data objects, subclasses
         * whose instances will not be root services should override this property
         * to return their root service's value for it.
         *
         * @type {Set.<Object>}
         */
        deletedDataObjects: {
            get: function () {
                if (this.isRootService) {
                    this._deletedDataObjects = this._deletedDataObjects || new Map();
                    return this._deletedDataObjects;
                } else {
                    return this.rootService.deletedDataObjects;
                }
            },
        },

        _deletedDataObjects: {
            value: undefined,
        },

        registerDeletedDataObject: {
            value: function (dataObject) {
                var objectDescriptor = this.objectDescriptorForObject(dataObject),
                    deletedDataObjects = this.deletedDataObjects,
                    value = deletedDataObjects.get(objectDescriptor);
                if (!value) {
                    deletedDataObjects.set(objectDescriptor, (value = new Set()));
                }
                value.add(dataObject);
                this.objectDescriptorsWithChanges.add(objectDescriptor);
            },
        },

        isObjectDeleted: {
            value: function (dataObject) {
                return this.deletedDataObjects.get(dataObject.objectDescriptor)?.has(dataObject);
            },
        },

        unregisterDeletedDataObject: {
            value: function (dataObject) {
                var objectDescriptor = this.objectDescriptorForObject(dataObject),
                    value = this.deletedDataObjects.get(objectDescriptor);
                if (value) {
                    value.delete(dataObject);
                    this.objectDescriptorsWithChanges.delete(objectDescriptor);
                }
            },
        },

        // handleBatchCompletedOperation: {
        //     value: function (operation) {
        //         this.handleOperationCompleted(operation);
        //     }
        // },
        // handleBatchFailedOperation: {
        //     value: function (operation) {
        //         this.handleOperationFailed(operation);
        //     }
        // },
        // handleCommitTransactionCompletedOperation: {
        //     value: function (operation) {
        //         this.handleOperationCompleted(operation);
        //     }
        // },
        // handleCommitTransactionFailedOperation: {
        //     value: function (operation) {
        //         this.handleOperationFailed(operation);
        //     }
        // },
        // handleRollbackTransactionCompletedOperation: {
        //     value: function (operation) {
        //         this.handleOperationCompleted(operation);
        //     }
        // },
        // handleRollbackTransactionFailedOperation: {
        //     value: function (operation) {
        //         this.handleOperationFailed(operation);
        //     }
        // },

        /**
         * Asynchronously validates a collection of data instances and attaches the
         * resulting invalidity state to each instance as a non-enumerable property.
         *
         * @param {Map<ObjectDescriptor, Set<object>>} objects - A map where each value is a Set of objects to evaluate.
         * @returns {Promise<Map<object, Map<string, ValidationError[]>>>} A promise that resolves with a map where each
         * key is an object and its value is its own invalidity state.
         */
        _buildInvalidityStateForObjects: {
            value: function (objects) {
                const validationPromises = [];

                for (const dataObjects of objects.values()) {
                    for (const dataObject of dataObjects) {
                        const promise = this._getInvalidityStateForObject(dataObject).then((invalidityState) => {
                            this._setInvalidityStateOnObject(dataObject, invalidityState);
                            return [dataObject, invalidityState];
                        });

                        validationPromises.push(promise);
                    }
                }

                return Promise.all(validationPromises).then((resolvedPairs) => {
                    return new Map(resolvedPairs);
                });
            },
        },

        /**
         * Asynchronously evaluates the validity of a single object and groups any errors by rule name.
         *
         * @param {object} object - The object to evaluate.
         * @returns {Promise<Map<string, ValidationError[]>>} A promise that resolves with the object's
         * invalidity state. An empty map signifies a valid object.
         */
        _getInvalidityStateForObject: {
            value: function (object) {
                const invalidityState = new Map();
                const objectDescriptor = this.objectDescriptorForObject(object);

                return objectDescriptor
                    .evaluateObjectValidity(object)
                    .then((validationErrors) => {
                        // Group validation errors by rule name.
                        for (let i = 0, length = validationErrors.length; i < length; i++) {
                            const validationError = validationErrors[i];
                            const rule = validationError.rule;
                            // A single rule can be associated with multiple properties.
                            const associatedProperties = rule.validationProperties || [];

                            for (let j = 0, propsLength = associatedProperties.length; j < propsLength; j++) {
                                const propertyName = associatedProperties[j];

                                if (!invalidityState.has(propertyName)) {
                                    invalidityState.set(propertyName, []);
                                }

                                invalidityState.get(propertyName).push(validationError);
                            }
                        }

                        return invalidityState;
                    })
                    .catch((error) => {
                        // Log the error for debugging but re-throw to let the caller handle it.
                        console.error(`Error evaluating validity for object:`, object, error);
                        throw error;
                    });
            },
        },

        /**
         * Attaches an invalidity state to a data instance as a non-enumerable property.
         * @param {object} object - The data instance to which the invalidity state will be attached.
         * @param {Map<string, ValidationError[]>} invalidityState - The invalidity state to attach.
         * @returns {object} The modified object with the attached invalidity state.
         */
        _setInvalidityStateOnObject: {
            value: function (object, invalidityState) {
                Object.defineProperty(object, "invalidityState", {
                    value: invalidityState,
                    writable: true,
                    configurable: true,
                    enumerable: false,
                });

                return object;
            },
        },

        _promisesByPendingTransactions: {
            value: undefined,
        },
        registerPendingTransactionPromise: {
            value: function (transaction, promise) {
                (this._promisesByPendingTransactions || (this._promisesByPendingTransactions = new Map())).set(
                    transaction,
                    promise
                );
            },
        },
        registeredPromiseForPendingTransaction: {
            value: function (transaction) {
                return this._promisesByPendingTransactions?.get(transaction);
            },
        },

        hasPendingTransaction: {
            get: function () {
                return this._promisesByPendingTransactions && this._promisesByPendingTransactions.size > 0;
            },
        },

        pendingTransactions: {
            get: function () {
                return Array.from(this._promisesByPendingTransactions?.keys());
            },
        },
        pendingTransactionPromises: {
            get: function () {
                return Array.from(this._promisesByPendingTransactions?.values());
            },
        },

        unregisterPendingTransactionPromise: {
            value: function (transaction) {
                if (this._promisesByPendingTransactions) {
                    this._promisesByPendingTransactions.delete(transaction);
                }
            },
        },

        _pendingTransactions: {
            value: undefined,
        },
        addPendingTransaction: {
            value: function (aCreateTransactionOperation) {
                (this._pendingTransactions || (this._pendingTransactions = [])).push(aCreateTransactionOperation);
            },
        },
        removePendingTransaction: {
            value: function (aCreateTransactionOperation) {
                if (this._pendingTransactions) {
                    this._pendingTransactions.delete(aCreateTransactionOperation);
                }
            },
        },

        _dispatchTransactionEventTypeWithObjects: {
            value: function (transaction, eventType, objects) {
                var criteriaIterator = objects.keys(),
                    iteration,
                    iObjectDescriptor,
                    iObjects,
                    iTransactionEvent,
                    propagationPromises,
                    propagationPromise;

                /*
                dispatch transactionCreate()
            */
                while (!(iteration = criteriaIterator.next()).done) {
                    iObjectDescriptor = iteration.value;
                    iObjects = objects.get(iObjectDescriptor);

                    iTransactionEvent = TransactionEvent.checkout();

                    iTransactionEvent.type = eventType;
                    iTransactionEvent.transaction = transaction;
                    iTransactionEvent.data = iObjects;

                    iObjectDescriptor.dispatchEvent(iTransactionEvent);
                    propagationPromise = dataEvent.propagationPromise;
                    if (Promise.is(propagationPromise)) {
                        (propagationPromises || (propagationPromises = [])).push(propagationPromise);
                        propagationPromise.then(function () {
                            eventPool.checkin(dataEvent);
                        });
                    } else {
                        eventPool.checkin(dataEvent);
                    }
                }

                return propagationPromises ? Promise.all(propagationPromises) : null;
            },
        },

        /**
         *
         * Prepare.
         *
         */
        handleTransactionCreateStart: {
            value: function (transactionPrepareStartEvent) {
                var preparingParticipant = transactionPrepareStartEvent.target,
                    handledObjectDescriptors = transactionPrepareStartEvent.data;

                /*
                TODO Future: use handledObjectDescriptors:
                objectDescriptor -> Map {
                    "createdDatabjects" -> Set,
                    "changedDatabjects" -> Set,
                    "deletedDatabjects" -> Set
                }

                along with handleTransationPrepareProgress() to track progress
            */

                //transactionPrepareStartEvent.transaction.createCompletionPromiseForParticipant(preparingParticipant);

                /*
                listen for both complete and fail
            */
                preparingParticipant.addEventListener(TransactionEvent.transationPrepareProgress, this, false);
                preparingParticipant.addEventListener(TransactionEvent.transationPrepareComplete, this, false);
            },
        },

        /**
         *
         * Prepare.
         *
         */

        handleTransactionPrepareStart: {
            value: function (transactionPrepareStartEvent) {
                var preparingParticipant = transactionPrepareStartEvent.target,
                    handledObjectDescriptors = transactionPrepareStartEvent.data;

                /*
                TODO Future: use handledObjectDescriptors:
                objectDescriptor -> Map {
                    "createdDatabjects" -> Set,
                    "changedDatabjects" -> Set,
                    "deletedDatabjects" -> Set
                }

                along with handleTransationPrepareProgress() to track progress
            */

                //transactionPrepareStartEvent.transaction.createCompletionPromiseForParticipant(preparingParticipant);

                /*
                listen for both complete and fail
            */
                preparingParticipant.addEventListener(TransactionEvent.transationPrepareProgress, this, false);
                preparingParticipant.addEventListener(TransactionEvent.transationPrepareComplete, this, false);
            },
        },

        handleTransactionPrepareProgress: {
            value: function (transactionPrepareProgressEvent) {
                var preparingParticipant = transactionPrepareProgressEvent.target;
                //boilerplate for now
            },
        },

        handleTransactionPrepareComplete: {
            value: function (transactionPrepareCompleteEvent) {
                var participant = transactionPrepareCompleteEvent.target,
                    transaction = transactionPrepareCompleteEvent.transaction;

                //resolve the matching completionPromise with the participant.
                //transaction.resolveCompletionPromiseForParticipant(participant);
            },
        },

        handleTransactionPrepareFail: {
            value: function (transactionPrepareFailEvent) {
                var participant = transactionPrepareFailEvent.target,
                    transaction = transactionPrepareFailEvent.transaction,
                    error = transactionPrepareFailEvent.data;

                //reject the matching completionPromise with the participant.
                // transaction.rejectCompletionPromiseForParticipantWithError(participant, error);
            },
        },

        /**
         *
         * Cancel/abort
         *
         */

        handleTransactionRollbackStart: {
            value: function (transactionRollbackStartEvent) {
                var participant = transactionRollbackStartEvent.target,
                    handledObjectDescriptors = participant.data;

                /*
                TODO Future: use handledObjectDescriptors:
                objectDescriptor -> Map {
                    "createdDatabjects" -> Set,
                    "changedDatabjects" -> Set,
                    "deletedDatabjects" -> Set
                }

                along with handleTransationPrepareProgress() to track progress
            */
                //transactionRollbackStartEvent.transaction.createCompletionPromiseForParticipant(participant);

                /*
                listen for both complete and fail
            */
                participant.addEventListener(TransactionEvent.transationCancelProgress, this, false);
                participant.addEventListener(TransactionEvent.transationCancelComplete, this, false);
            },
        },

        handleTransactionRollbackProgress: {
            value: function (transactionRollbackProgressEvent) {
                var participant = transactionRollbackProgressEvent.target;
                //boilerplate for now
            },
        },

        handleTransactionRollbackComplete: {
            value: function (transactionRollbackCompleteEvent) {
                var participant = transactionRollbackCompleteEvent.target,
                    transaction = transactionRollbackCompleteEvent.transaction;

                //resolve the matching completionPromise with the participant.
                //transaction.resolveCompletionPromiseForParticipant(participant);
            },
        },

        handleTransactionRollbackFail: {
            value: function (transactionRollbackFailEvent) {
                var participant = transactionRollbackFailEvent.target,
                    transaction = transactionRollbackFailEvent.transaction,
                    error = transactionRollbackFailEvent.data;

                //reject the matching completionPromise with the participant.
                //transaction.rejectCompletionPromiseForParticipantWithError(participant, error);
            },
        },

        /**
         *
         * Perform/commit.
         *
         */

        handleTransactionCommitStart: {
            value: function (transactionCommitStartEvent) {
                var participant = transactionCommitStartEvent.target,
                    handledObjectDescriptors = participant.data;

                /*
                TODO Future: use handledObjectDescriptors:
                objectDescriptor -> Map {
                    "createdDatabjects" -> Set,
                    "changedDatabjects" -> Set,
                    "deletedDatabjects" -> Set
                }

                along with handleTransationPrepareProgress() to track progress
            */
                //transactionCommitStartEvent.transaction.createCompletionPromiseForParticipant(participant);

                /*
                listen for both complete and fail
            */
                participant.addEventListener(TransactionEvent.transationPerformProgress, this, false);
                participant.addEventListener(TransactionEvent.transationPerformComplete, this, false);
            },
        },

        handleTransactionCommitProgress: {
            value: function (transactionCommitProgressEvent) {
                var participant = transactionCommitProgressEvent.target;
                //boilerplate for now
            },
        },

        handleTransactionCommitComplete: {
            value: function (transactionCommitCompleteEvent) {
                var participant = transactionCommitCompleteEvent.target,
                    transaction = transactionCommitCompleteEvent.transaction;

                //resolve the matching completionPromise with the participant.
                //transaction.resolveCompletionPromiseForParticipant(participant);
            },
        },

        handleTransactionCommitFail: {
            value: function (transactionCommitFailEvent) {
                var participant = transactionCommitFailEvent.target,
                    transaction = transactionCommitFailEvent.transaction,
                    error = transactionCommitFailEvent.data;

                //reject the matching completionPromise with the participant.
                //transaction.rejectCompletionPromiseForParticipantWithError(participant, error);
            },
        },

        /*
         * When it gets time to add/handle timeouts:
         *
         * https://advancedweb.hu/how-to-add-timeout-to-a-promise-in-javascript/
         */
        discardChanges: {
            value: function () {
                this.createdDataObjects.clear();
                this.changedDataObjects.clear();
                this.deletedDataObjects.clear();
                this.dataObjectChanges.clear();
                this.objectDescriptorsWithChanges.clear();
            },
        },

        autosaves: {
            value: false,
        },

        isAutosaveScheduled: {
            value: false,
        },

        saveChanges: {
            value: function () {
                //If nothing to do, we bail out as early as possible.
                if (
                    this.createdDataObjects.size === 0 &&
                    this.changedDataObjects.size === 0 &&
                    this.deletedDataObjects.size === 0
                ) {
                    /*
                    If we have pending transation(s), then it means some logical saves got combined, so until we offer an API for intentional separation of changes,
                    best we can do is return a promise encompasing all pending.

                    If anothe saveChanges were to be called, it may not use that same promise
                */
                    if (this.hasPendingTransaction) {
                        let pendingTransactionPromises = this.pendingTransactionPromises;
                        return pendingTransactionPromises.length === 1
                            ? pendingTransactionPromises[0]
                            : Promise.all(this.pendingTransactionPromises);
                    } else {
                        var noOpOperation = new DataOperation();
                        noOpOperation.type = DataOperation.Type.NoOp;
                        return Promise.resolve(noOpOperation);
                    }
                }

                var transaction = new Transaction(),
                    self = this,
                    //Ideally, this should be saved in IndexedDB/PGLite so if something happen
                    //we can at least try to recover.
                    createdDataObjects = (transaction.createdDataObjects = new Map(this.createdDataObjects)), //Map
                    changedDataObjects = (transaction.updatedDataObjects = new Map(this.changedDataObjects)), //Map
                    deletedDataObjects = (transaction.deletedDataObjects = new Map(this.deletedDataObjects)), //Map
                    dataObjectChanges = (transaction.dataObjectChanges = new Map(this.dataObjectChanges)), //Map
                    objectDescriptorsWithChanges = (transaction.objectDescriptors = new Set(
                        this.objectDescriptorsWithChanges
                    ));

                //console.log("saveChanges: transaction-"+this.identifier, transaction);
                console.log(
                    "saveChanges: createdDataObjects [" + createdDataObjects.length + "]: ",
                    createdDataObjects,
                    "changedDataObjects [" + changedDataObjects.length + "]: ",
                    changedDataObjects,
                    "deletedDataObjects [" + deletedDataObjects.length + "]: ",
                    deletedDataObjects
                );

                // move to _saveChangesForTransaction()
                //this.addPendingTransaction(transaction);

                //We've made copies, so we clear right away to make room for a new cycle:
                this.discardChanges();
                // this.createdDataObjects.clear();
                // this.changedDataObjects.clear();
                // this.deletedDataObjects.clear();
                // this.dataObjectChanges.clear();
                // this.objectDescriptorsWithChanges.clear();

                return this._saveChangesForTransaction(transaction);
            },
        },

        dispatchSaveEventTypeForTransaction: {
            value: function(eventType, aTransaction) {
                let transactionObjectDescriptors = aTransaction.objectDescriptors,
                    uniquePromise,
                    promises;

                for (const iObjectDescriptor of transactionObjectDescriptors) {
                    let iPromise = this.dispatchDataEventTypeForObject(
                            eventType,
                            iObjectDescriptor,
                            {
                                transaction: aTransaction,
                                createdDataObjects: aTransaction.createdDataObjects.get(iObjectDescriptor),
                                updatedDataObjects: aTransaction.updatedDataObjects.get(iObjectDescriptor),
                                deletedDataObjects: aTransaction.deletedDataObjects.get(iObjectDescriptor)
                            }
                        );
                    
                    if(iPromise) {
                        if(!promises) {
                            if(!uniquePromise) {
                                uniquePromise = iPromise;
                            } else {
                                promises = [uniquePromise, iPromise];
                                uniquePromise = null; //not really needed
                            }
                        } else {
                            promises.push(iPromise)
                        }
                    }
                }

                return promises
                    ? Promise.all(promises)
                    : uniquePromise
                        ? uniquePromise
                        : Promise.resolveUndefined;

            }
        },

        dispatchWillSaveForTransaction: {
            value: function(aTransaction) {
                return this.dispatchSaveEventTypeForTransaction(DataEvent.willSave, aTransaction)
            }
        },

        _saveChangesForTransaction: {
            value: function(transaction) {
                let self = this;
                
                this.addPendingTransaction(transaction);

                let pendingTransactionPromise = new Promise(function (resolve, reject) {
                    try {
                        var deletedDataObjectsIterator,
                            operation,
                            transactionObjectDescriptors = transaction.objectDescriptors,
                            iObject,
                            transactionPrepareEvent,
                            transactionCommitEvent,
                            createdDataObjects = transaction.createdDataObjects, //Map
                            changedDataObjects = transaction.updatedDataObjects, //Map
                            deletedDataObjects = transaction.deletedDataObjects; //Map

                        // We first remove from create and update objects that are also deleted:
                        deletedDataObjectsIterator = deletedDataObjects.values();

                        while ((iObject = deletedDataObjectsIterator.next().value)) {
                            createdDataObjects.delete(iObject);
                            changedDataObjects.delete(iObject);
                        }

                        // If nothing to do, we bail out
                        if (
                            createdDataObjects.size === 0 &&
                            changedDataObjects.size === 0 &&
                            deletedDataObjects.size === 0
                        ) {
                            operation = new DataOperation();
                            operation.type = DataOperation.Type.NoOp;
                            // console.log("saveChanges: transaction-"+this.identifier+" <- NoOp", transaction);
                            resolve(operation);
                        }

                        self.dispatchWillSaveForTransaction(transaction)
                        //Validate:
                        .then(() => {
                            /**
                             * TODO: Refactor validation into operation-specific events.
                             * A single validation action is inefficient. We should split it by operation
                             * (e.g., `validateCreate`, `validateUpdate`, `validateDelete`) to run
                             * optimized, context-specific logic (like checking cascade-deletes only on delete).
                             */
                            return Promise.all([
                                // 1. Validate created objects.
                                self._buildInvalidityStateForObjects(createdDataObjects),
                                // 2. Validate updated objects.
                                self._buildInvalidityStateForObjects(changedDataObjects),
                                // 3. Validate deleted objects (e.g., check for rules that block deletion).
                                self._buildInvalidityStateForObjects(deletedDataObjects),
                            ]);
                        })
                        //Dispatch Invalidity if any:
                        .then((validationResults) => {
                            const aggregatedValidationErrors = new Map();

                            // Merge validation results from all operations. (created, changed, deleted)
                            for (const result of validationResults) {
                                if (!result) continue;

                                for (const [dataObject, invalidity] of result) {
                                    // Only add if there are actual validation errors
                                    if (invalidity && invalidity.size > 0) {
                                        aggregatedValidationErrors.set(dataObject, invalidity);

                                        // Dispatch invalid data event for each invalid object
                                        this.dispatchDataEventTypeForObject(
                                            DataEvent.invalid,
                                            dataObject,
                                            invalidity
                                        );
                                    }
                                }
                            }

                            if (aggregatedValidationErrors.size > 0) {
                                const validateFailedOperation = new DataOperation();
                                validateFailedOperation.type = DataOperation.Type.ValidateFailedOperation;
                                validateFailedOperation.target = self.mainService;

                                // Pass the complete set of errors
                                validateFailedOperation.data = aggregatedValidationErrors;

                                // Stop the transaction and resolve with the failure operation
                                resolve(validateFailedOperation);

                                // TODO: @benoit should we not stop/reject the inner promise ?
                                return null;
                            }

                            return transactionObjectDescriptors;
                        }, reject)
                        //Assess potential dependency to other pending transactions
                        .then(function (_transactionObjectDescriptors) {

                            //Before we can get to it, we need to verify that "transaction"'s content has no dependency to a pending transaction
                            //for example an update to an object that's created in a pending transaction that has not completed yet, which can lead to deadlocks.
                            //We're going to start by handling that use-case only



                            let pendingTransactions = self._pendingTransactions;

                            if (pendingTransactions && pendingTransactions.length) {

                                let updatedDataObjectsByObjectDescriptor = transaction.updatedDataObjects, //Map
                                    updatedDataObjectDescriptorsIterator = updatedDataObjectsByObjectDescriptor.keys(),
                                    firstPendingTransactionsCreatingChangedDataObjectsPromise,
                                    pendingTransactionsCreatingChangedDataObjectsPromises,
                                    iObjectDescriptor;

                                /* 
                                    TODO WIP
                                    Nested loop, really need to be optimized as we build up the transactions, 
                                    but let's get to work first and then we'll optimize.

                                    There can only be one pending transaction with the creation of iObject
                                    so we bail out if we find it
                                */

                                //Loop on ObjectDescriptors with instances being updated
                                while ((iObjectDescriptor = updatedDataObjectDescriptorsIterator.next().value)) {
                                    let updatedDataObjects = updatedDataObjectsByObjectDescriptor.get(iObjectDescriptor),
                                        updatedDataObjectsIterator = updatedDataObjects.values(),
                                        iObject;

                                    while ((iObject = updatedDataObjectsIterator.next().value)) {

                                        for (let i = 0, countI = pendingTransactions.length; i < countI; i++) {
                                            let iPendingTransaction = pendingTransactions[i];

                                            if (iPendingTransaction.createdDataObjects.has(iObjectDescriptor)) {
                                                let createdDataObjects = iPendingTransaction.createdDataObjects.get(iObjectDescriptor);

                                                    if(createdDataObjects.has(iObject)) {

                                                        if(!firstPendingTransactionsCreatingChangedDataObjectsPromise) {
                                                            firstPendingTransactionsCreatingChangedDataObjectsPromise = self.registeredPromiseForPendingTransaction(iPendingTransaction);
                                                        } else {
                                                            if(!pendingTransactionsCreatingChangedDataObjectsPromises) {
                                                                pendingTransactionsCreatingChangedDataObjectsPromises = new Set();
                                                                pendingTransactionsCreatingChangedDataObjectsPromises.add(firstPendingTransactionsCreatingChangedDataObjectsPromise);
                                                            }
                                                            pendingTransactionsCreatingChangedDataObjectsPromises.add(self.registeredPromiseForPendingTransaction(iPendingTransaction));
                                                        }
                                                        break;
                                                    }

                                            }
                                        }
                                    }

                                }

                                if(!pendingTransactionsCreatingChangedDataObjectsPromises) {
                                    if(firstPendingTransactionsCreatingChangedDataObjectsPromise) {
                                        return firstPendingTransactionsCreatingChangedDataObjectsPromise;
                                    } else {
                                        return Promise.resolveUndefined;
                                    }
                                } else {
                                    return Promise.all(Array.from(pendingTransactionsCreatingChangedDataObjectsPromises))
                                }
                            } else {
                                return Promise.resolveUndefined
                            }
                        })
                        //Dispatch TransactionEvent.transactionCreate
                        .then(function () {
                            var operationCount =
                                    createdDataObjects.size + changedDataObjects.size + deletedDataObjects.size,
                                currentPropagationPromise,
                                operationIndex = 0,
                                iterator,
                                propagationPromises = [];

                            /*
                                Now that we passed validation, and handling transaction dependencies, we're going to start the transaction
                            */

                            /*
                                Make sure we listen on ourselve (as events from RawDataServices will bubble to main)
                                for "transactionPrepareStart"
                            */
                            //addEventListener(TransactionEvent.transactionCreateStart, self, false);

                            //console.log("saveChanges: dispatchEvent transactionCreateEvent transaction-"+this.identifier, transaction);

                            transactionCreateEvent = TransactionEvent.checkout();

                            transactionCreateEvent.type = TransactionEvent.transactionCreate;
                            transactionCreateEvent.transaction = transaction;
                            TransactionDescriptor.dispatchEvent(transactionCreateEvent);

                            return transactionCreateEvent.propagationPromise || Promise.resolve();
                        })
                        //TransactionEvent.transactionCreate propagation completed
                        .then(function () {
                            return transaction.completionPromise;
                        })
                        //Dispatch TransactionEvent.transactionPrepare
                        .then(function () {
                            /*
                                Make sure we listen on ourselve (as events from RawDataServices will bubble to main)
                                for "transactionPrepareStart"
                            */
                            self.addEventListener(TransactionEvent.transactionPrepareStart, self, false);

                            /*
                                Now dispatch transactionPrepare:

                                Listened to by RawDataServices to know if they should be involved in dealing with transaction.
                            */
                            transactionPrepareEvent = TransactionEvent.checkout();

                            transactionPrepareEvent.type = TransactionEvent.transactionPrepare;
                            transactionPrepareEvent.transaction = transaction;

                            //console.log("saveChanges: dispatchEvent transactionPrepareEvent transaction-"+this.identifier, transaction);

                            TransactionDescriptor.dispatchEvent(transactionPrepareEvent);

                            return transactionPrepareEvent.propagationPromise || Promise.resolve();
                        })
                        //TransactionEvent.transactionPrepare propagation completed
                        .then(function () {
                            /*
                        Return the event to the pool
                    */
                            TransactionEvent.checkin(transactionPrepareEvent);
                            return transaction.completionPromise;
                        })
                        //Dispatch TransactionEvent.transactionCommit
                        .then(function () {
                            /*
                                Now all RawDataServices involved created the data operation they needed.

                                time to dispatch transactionCommit: Once that's done, we wait for completionPromise
                            */

                            /*
                                Make sure we listen on ourselve (as events from RawDataServices will bubble to main)
                                for "transactionPrepareStart"
                            */
                            self.addEventListener(TransactionEvent.transactionCommitStart, self, false);

                            transactionCommitEvent = TransactionEvent.checkout();

                            transactionCommitEvent.type = TransactionEvent.transactionCommit;
                            transactionCommitEvent.transaction = transaction;

                            //console.log("saveChanges: dispatchEvent transactionCommitEvent transaction-"+this.identifier, transaction);

                            TransactionDescriptor.dispatchEvent(transactionCommitEvent);

                            return transactionCommitEvent.propagationPromise
                                ? transactionCommitEvent.propagationPromise
                                : Promise.resolve(true);
                        })
                        //TransactionEvent.transactionCommit propagation completed
                        .then(function () {
                            /*
                                Now transactionCommit has been dispatched to all listeners.

                                transaction.participantCompletionPromises contains the final list of promises for when listeners will be done preaparing for the transation.

                                We make a Promise.all() of it and wait to proceed or fail
                            */

                            /*
                                Return the event to the pool
                            */
                            TransactionEvent.checkin(transactionCommitEvent);

                            return transaction.completionPromise;
                        })
                        .then(function () {
                            /*
                                If we're here, the transaction succeeded, all listeners successfully completed their work.
                            */
                            // dataOperationsByObject = transaction.dataOperationsByObject;

                            // self.didCreateDataObjects(createdDataObjects, dataOperationsByObject);
                            // self.didUpdateDataObjects(changedDataObjects, dataOperationsByObject);
                            // self.didDeleteDataObjects(deletedDataObjects, dataOperationsByObject);

                            /*
                                We could also add an event to advertise teh result, but the transaction object already has everything.
                            */

                            //console.log("saveChanges: done! transaction-"+this.identifier, transaction);
                            self.removePendingTransaction(transaction);
                            self.unregisterPendingTransactionPromise(transaction);

                            self.dispatchDidSaveForTransaction(transaction)
                            .then(() => {
                                resolve(transaction);
                            });
                        })
                        .catch(function (error) {
                            /*
                        TODO:...
                        At least one listener (typically a RawDataService) failed to execute transactionCommit/Commit, we have to return to a stable state.... if possible and finish the process.

                                                /*
                        At least one listener (typically a RawDataService) failed to prepare, we have to abort and return to a stable state....

                        There was a problem executing transactionCreate, at least one RawDataService couldn't create a transaction. DB may not be reachable? Operation may have been refused for lack of authorization?

                        We still need to tell everyone it's off.

                    */
                            //console.log("saveChanges: CANCEL transaction-"+this.identifier, error, transaction);

                            /*
                        If we're here, the transaction failed
                    */
                            return self._cancelTransaction(transaction, error, reject);
                        });
                    } catch (error) {
                        console.error(error)
                        self._cancelTransaction(transaction, error, reject);
                    }
                });

                this.registerPendingTransactionPromise(transaction, pendingTransactionPromise);

                return pendingTransactionPromise;

            }
        },

        dispatchDidSaveForTransaction: {
            value: function(aTransaction) {
                return this.dispatchSaveEventTypeForTransaction(DataEvent.didSave, aTransaction)
            }
        },

        pendingTransactionPromiseForObjects: {
            value: function (objects) {
                let pendingTransactions = this._pendingTransactions;

                if (pendingTransactions && pendingTransactions.length) {

                    let firstPendingTransactionsCreatingChangedDataObjectsPromise,
                        pendingTransactionsCreatingChangedDataObjectsPromises;

                    /* 
                        TODO WIP
                        Nested loop, really need to be optimized as we build up the transactions, 
                        but let's get to work first and then we'll optimize.

                        There can only be one pending transaction with the creation of iObject
                        so we bail out if we find it
                    */

                    //Loop on ObjectDescriptors with instances being updated

                    for (let j = 0, countJ = objects.length; j < countJ; j++) {
                        let object = objects[j];

                        for (let i = 0, countI = pendingTransactions.length; i < countI; i++) {
                            let iPendingTransaction = pendingTransactions[i];

                            if (iPendingTransaction.createdDataObjects.has(object.objectDescriptor)) {
                                let createdDataObjects = iPendingTransaction.createdDataObjects.get(object.objectDescriptor);

                                    if(createdDataObjects.has(object)) {

                                        if(!firstPendingTransactionsCreatingChangedDataObjectsPromise) {
                                            firstPendingTransactionsCreatingChangedDataObjectsPromise = this.registeredPromiseForPendingTransaction(iPendingTransaction);
                                        } else {
                                            if(!pendingTransactionsCreatingChangedDataObjectsPromises) {
                                                pendingTransactionsCreatingChangedDataObjectsPromises = new Set();
                                                pendingTransactionsCreatingChangedDataObjectsPromises.add(firstPendingTransactionsCreatingChangedDataObjectsPromise);
                                            }
                                            pendingTransactionsCreatingChangedDataObjectsPromises.add(this.registeredPromiseForPendingTransaction(iPendingTransaction));
                                        }
                                        break;
                                    }

                            }
                        }
                    }
                        if(!pendingTransactionsCreatingChangedDataObjectsPromises) {
                            if(firstPendingTransactionsCreatingChangedDataObjectsPromise) {
                                return firstPendingTransactionsCreatingChangedDataObjectsPromise;
                            } else {
                                return Promise.resolveUndefined;
                            }
                        } else {
                            return Promise.all(Array.from(pendingTransactionsCreatingChangedDataObjectsPromises))
                        }
                    } else {
                        return Promise.resolveUndefined;
                    }


            }
        },

        _cancelTransaction: {
            value: function (transaction, cancelError, rejectFunction) {
                this.addEventListener(TransactionEvent.transactionRollbackStart, this, false);

                transactionRollbackEvent = TransactionEvent.checkout();

                transactionRollbackEvent.type = TransactionEvent.transactionRollback;
                transactionRollbackEvent.transaction = transaction;
                TransactionDescriptor.dispatchEvent(transactionRollbackEvent);

                return (transactionRollbackEvent.propagationPromise || Promise.resolve())
                    .then(function () {
                        TransactionEvent.checkin(transactionRollbackEvent);
                        return transaction.completionPromise;
                    })
                    .then(function () {
                        rejectFunction(cancelError);
                    })
                    .catch(function (error) {
                        rejectFunction(error);
                    })
                    .finally(() => {
                        this.unregisterPendingTransactionPromise(transaction);
                    });
            },
        },

        /**
         * supportsDataOperation
         *
         * #WARNING Backward compatibility breaking
         * TODO: Plan to remove it once more tests are done with
         * older code base
         *
         * @property {boolean} assess that a DataService supports supportsDataOperations.
         * Legacy ones that don't need to overrides it to false to work as expected
         */

        supportsDataOperation: {
            value: true,
        },

        // operationReferrer: {
        //     value: function(operation) {
        //         return this._pendingOperationById.get(operation.referrerId);
        //     }
        // },

        // registerPendingOperation: {
        //     value: function(operation, referrer) {
        //         this._pendingOperationById.set(operation.id, operation);

        //     }
        // },

        // unregisterOperationReferrer: {
        //     value: function(operation) {
        //         this._pendingOperationById.delete(operation.referrerId);
        //     }
        // },

        // _operationListenerNamesByType: {
        //     value: new Map()
        // },
        // _operationListenerNameForType: {
        //     value: function(type) {
        //         return this._operationListenerNamesByType.get(type) || this._operationListenerNamesByType.set(type,"handle"+type.toCapitalized()).get(type);
        //     }
        // },

        shouldAuthenticateReadOperation: {
            value: false,
        },

        //This probably isn't right and should be fetchRawData, but switching creates a strange error.
        // _fetchDataWithOperation: {
        //     value: function (query, stream) {

        //         var self = this;
        //         stream = stream || new DataStream();
        //         stream.query = query;

        //         // make sure type is an object descriptor or a data object descriptor.
        //         // query.type = this.rootService.objectDescriptorForType(query.type);

        //         var objectDescriptor = query.type,
        //             criteria = query.criteria,
        //             criteriaWithLocale,
        //             parameters,
        //             rawParameters,
        //             readOperation = new DataOperation(),
        //             rawReadExpressions = [],
        //             rawOrderings,
        //             promises;
        //             // localizableProperties = objectDescriptor.localizablePropertyDescriptors;

        //         /*
        //             We need to turn this into a Read Operation. Difficulty is to turn the query's criteria into
        //             one that doesn't rely on objects. What we need to do before handing an operation over to another context
        //             bieng a worker on the client side or a worker on the server side, is to remove references to live objects.
        //             One way to do this is to replace every object in a criteria's parameters by it's data identifier.
        //             Another is to serialize the criteria.
        //         */
        //         readOperation.type = DataOperation.Type.ReadOperation;
        //         readOperation.target = objectDescriptor;
        //         //readOperation.data = {};

        //         //Need to add a check to see if criteria may have more spefific instructions for "locale".
        //         /*
        //             1/19/2021 - we were only adding locale when the object descriptor being fetched has some localizableProperties, but a criteria may involve a subgraph and we wou'd have to go through the syntactic tree of the criteria, and readExpressions, to figure out if anywhere in that subgraph, there might be localizable properties we need to include the locales for.

        //             Since we're localized by default, we're going to include it no matter what, it's going to be more rare that it is not needed than it is.
        //         */
        //         /*
        //             WIP Adds locale as needed. Most common case is that it's left to the framework to qualify what Locale to use.

        //             A core principle is that each data object (DO) has a locale property behaving in the following way:
        //             locales has 1 locale value, a locale object.
        //             This is the most common use case. The property’s getter returns the user’s locale.
        //             Fetching an object with a criteria asking for a specific locale will return an object in that locale.
        //             Changing the locale property of an object to another locale instance (singleton in Locale’s case), updates all the values of its localizable properties to the new locale set.
        //             locales has either no value, or “*” equivalent, an “All Locale Locale”
        //             This feches the json structure and returns all the values in all the locales
        //             locales has an array of locale instances.
        //             If locale’s cardinality is > 1 then each localized property would return a json/dictionary of locale->value instead of 1 value.
        //         */

        //         readOperation.locales = self.userLocales;

        //         if(criteria) {
        //             readOperation.criteria = criteria;
        //         }

        //         if(query.sizeLimit) {
        //             readOperation.data.sizeLimit = query.sizeLimit;
        //         }

        //         if(query.orderings && query.orderings > 0) {
        //             rawOrderings = [];
        //             // self._mapObjectDescriptorOrderingsToRawOrderings(objectDescriptor, query.sortderings,rawOrderings);
        //             // readOperation.data.orderings = rawOrderings;
        //             readOperation.data.orderings = query.orderings;
        //         }

        //         /*
        //             for a read operation, we already have criteria, shouldn't data contains the array of
        //             expressions that are expected to be returned?
        //         */
        //         /*
        //             The following block is from PhrontClientService, we shouldn't map to rawReadExpressions just yet.
        //         */
        //         // self._mapObjectDescriptorReadExpressionToRawReadExpression(objectDescriptor, query.readExpressions,rawReadExpressions);
        //         // if(rawReadExpressions.length) {
        //         //     readOperation.data.readExpressions = rawReadExpressions;
        //         // }
        //         if(query.readExpressions && query.readExpressions.length) {
        //             readOperation.data.readExpressions = query.readExpressions;
        //         }

        //         /*
        //             We need to do this in node's DataWorker, it's likely that we'll want that client side as well, where it's some sort of token set post authorization.
        //         */
        //         if(this.application.identity && this.shouldAuthenticateReadOperation) {
        //             readOperation.identity = this.application.identity;
        //         }

        //         /*

        //             this is half-assed, we're mapping full objects to RawData, but not the properties in the expression.
        //             phront-service does it, but we need to stop doing it half way there and the other half over there.
        //             SaveChanges is cleaner, but the job is also easier there.

        //         */
        //         parameters = criteria ? criteria.parameters : undefined;
        //         rawParameters = parameters;

        //         if(parameters && typeof criteria.parameters === "object") {
        //             var keys = Object.keys(parameters),
        //                 i, countI, iKey, iValue, iRecord;

        //             rawParameters = Array.isArray(parameters) ? [] : {};

        //             for(i=0, countI = keys.length;(i < countI); i++) {
        //                 iKey  = keys[i];
        //                 iValue = parameters[iKey];
        //                 if(!iValue) {
        //                     throw "fetchData: criteria with no value for parameter key "+iKey;
        //                 } else {
        //                     if(iValue.dataIdentifier) {
        //                         /*
        //                             this isn't working because it's causing triggers to fetch properties we don't have
        //                             and somehow fails, but it's wastefull. Going back to just put primary key there.
        //                         */
        //                         // iRecord = {};
        //                         // rawParameters[iKey] = iRecord;
        //                         // (promises || (promises = [])).push(
        //                         //     self._mapObjectToRawData(iValue, iRecord)
        //                         // );
        //                         rawParameters[iKey] = iValue.dataIdentifier.primaryKey;
        //                     } else {
        //                         rawParameters[iKey] = iValue;
        //                     }
        //                 }

        //             }
        //             // if(promises) promises = Promise.all(promises);
        //         }
        //         // if(!promises) promises = Promise.resolve(true);
        //         // promises.then(function() {
        //         if(criteria) {
        //             readOperation.criteria.parameters = rawParameters;
        //         }
        //         //console.log("fetchData operation:",JSON.stringify(readOperation));
        //         self._dispatchReadOperation(readOperation, stream);

        //         if(criteria) {
        //             readOperation.criteria.parameters = parameters;
        //         }

        //         // });

        //         return stream;
        //     }
        // },

        // _dispatchReadOperation: {
        //     value: function(operation, stream) {
        //         this._thenableByOperationId.set(operation.id, stream);
        //         this._dispatchOperation(operation);
        //     }
        // },
        // _dispatchOperation: {
        //     value: function(operation) {
        //         this._pendingOperationById.set(operation.id, operation);

        //         defaultEventManager.handleEvent(operation);

        //         // var serializedOperation = this._serializer.serializeObject(operation);

        //         // // if(operation.type === "batch") {
        //         // //     var deserializer = new Deserializer();
        //         // //     deserializer.init(serializedOperation, require, undefined, module, true);
        //         // //     var deserializedOperation = deserializer.deserializeObject();

        //         // //     console.log(deserializedOperation);

        //         // // }
        //         // console.log("----> send operation "+serializedOperation);
        //         // this._socket.send(serializedOperation);
        //     }
        // },

        // registeredDataStreamForDataOperation: {
        //     value: function(dataOperation) {
        //         return this._thenableByOperationId
        //             ? dataOperation.referrerId
        //                 ? this._thenableByOperationId.get(dataOperation.referrerId)
        //                 : this._thenableByOperationId.get(dataOperation.id)
        //             : undefined;
        //     }
        // },
        // unregisterDataStreamForDataOperation: {
        //     value: function(dataOperation) {
        //         this._thenableByOperationId
        //             ? dataOperation.referrerId
        //                 ? this._thenableByOperationId.delete(dataOperation.referrerId)
        //                 : this._thenableByOperationId.delete(dataOperation.id)
        //             : undefined;
        //     }
        // },

        // handleReadUpdateOperation: {
        //     value: function (operation) {
        //         var referrer = operation.referrerId,
        //             objectDescriptor = operation.target,
        //             records = operation.data,
        //             stream = this._thenableByOperationId.get(referrer),
        //             streamObjectDescriptor;
        //         // if(operation.type === DataOperation.Type.ReadCompletedOperation) {
        //         //     console.log("handleReadCompleted  referrerId: ",operation.referrerId, "records.length: ",records.length);
        //         // } else {
        //         //     console.log("handleReadUpdateOperation  referrerId: ",operation.referrerId, "records.length: ",records.length);
        //         // }
        //         //if(operation.type === DataOperation.Type.ReadUpdateOperation) console.log("handleReadUpdateOperation  referrerId: ",referrer);

        //         if(stream) {
        //             streamObjectDescriptor = stream.query.type;
        //             /*

        //                 We now could get readUpdate that are reads for readExpressions that are properties (with a valueDescriptor) of the ObjectDescriptor of the referrer. So we need to add a check that the obectDescriptor maatch, otherwise, it needs to be assigned to the right instance, or created in memory and mapping/converters will find it.
        //             */

        //             if(streamObjectDescriptor === objectDescriptor) {
        //                 if(records && records.length > 0) {
        //                     //We pass the map key->index as context so we can leverage it to do record[index] to find key's values as returned by RDS Data API
        //                     this.addRawData(stream, records, operation);
        //                 } else if(operation.type !== DataOperation.Type.ReadCompletedOperation){
        //                     console.log("operation of type:"+operation.type+", has no data");
        //                 }
        //             } else {
        //                 console.log("Received "+operation.type+" operation that is for a readExpression of referrer ",referrer);
        //             }
        //         } else {
        //             console.log("receiving operation of type:"+operation.type+", but can't find a matching stream");
        //         }
        //     }
        // },

        // handleReadCompletedOperation: {
        //     value: function (operation) {
        //         this.handleReadUpdateOperation(operation);
        //         //The read is complete
        //         var stream = this._thenableByOperationId.get(operation.referrerId);
        //         if(stream) {
        //             this.rawDataDone(stream);
        //             this._thenableByOperationId.delete(operation.referrerId);
        //         } else {
        //             console.log("receiving operation of type:"+operation.type+", but can't find a matching stream");
        //         }
        //         //console.log("handleReadCompleted -clear _thenableByOperationId- referrerId: ",operation.referrerId);

        //     }
        // },

        handleReadFailedOperation: {
            value: function (operation) {
                var stream = this._thenableByOperationId.get(operation.referrerId);
                if (stream) {
                    this.rawDataError(stream, operation.data);
                    this._thenableByOperationId.delete(operation.referrerId);
                }
            },
        },

        // handleOperationCompleted: {
        //     value: function (operation) {
        //         var referrerOperation = this._pendingOperationById.get(operation.referrerId);

        //         /*
        //             Right now, we listen for the types we care about, on the mainService, so we're receiving it all,
        //             even those from other data services / types we don' care about, like the PlummingIntakeDataService.

        //             One solution is to, when we register the types in the data service, to test if it handles operations, and if it does, the add all listeners. But that's a lot of work which will slows down starting time. A better solution would be to do like what we do with Components, where we find all possibly interested based on DOM structure, and tell them to prepare for a first delivery of that type of event. We could do the same as we know which RawDataService handle what ObjectDescriptor, which would give the RawDataService the ability to addListener() right when it's about to be needed.

        //             Another solution could involve different "pools" of objects/stack, but we'd lose the universal bus.

        //         */
        //         if(!referrerOperation) {
        //             return;
        //         }

        //         /*
        //             After creation we need to do this:                   self.rootService.registerUniqueObjectWithDataIdentifier(object, dataIdentifier);

        //             The referrerOperation could get hold of object, but it doesn't right now.
        //             We could also create a uuid client side and not have to do that and deal wih it all in here which might be cleaner.

        //             Now resolving the promise finishes the job in saveObjectData that has the object in scope.
        //         */
        //         referrerOperation._promiseResolve(operation);
        //     }
        // },

        // handleOperationFailed: {
        //     value: function (operation) {
        //         var referrerOperation = this._pendingOperationById.get(operation.referrerId);

        //         /*
        //             After creation we need to do this:                   self.rootService.registerUniqueObjectWithDataIdentifier(object, dataIdentifier);

        //             The referrerOperation could get hold of object, but it doesn't right now.
        //             We could also create a uuid client side and not have to do that and deal wih it all in here which might be cleaner.

        //             Now resolving the promise finishes the job in saveObjectData that has the object in scope.
        //         */
        //         if(referrerOperation) {
        //                 referrerOperation._promiseResolve(operation);
        //         }
        //     }
        // },

        // handleCreateCompletedOperation: {
        //     value: function (operation) {
        //         this.handleOperationCompleted(operation);
        //     }
        // },

        // handleUpdateCompletedOperation: {
        //     value: function (operation) {
        //         this.handleOperationCompleted(operation);
        //     }
        // },

        /***************************************************************************
         * Fetching Data
         */

        /*
        DataStream cache:

        Map: ObjectDescriptor -> Map: criteriaExpression -> Map: JSON.stringify(criteria.parameters) -> Promise
    */
        _dataStreamByObjectDescriptorByCriteriaExpressionByCriteriaParameters: {
            value: new Map(),
        },

        _dataStreamMapForObjectDescriptor: {
            value: function (objectDescriptor) {
                var map =
                    this._dataStreamByObjectDescriptorByCriteriaExpressionByCriteriaParameters.get(objectDescriptor);
                if (!map) {
                    map = new Map();
                    this._dataStreamByObjectDescriptorByCriteriaExpressionByCriteriaParameters.set(
                        objectDescriptor,
                        map
                    );
                }
                return map;
            },
        },

        _dataStreamMapForObjectDescriptorCriteria: {
            value: function (objectDescriptor, criteria) {
                var objectDescriptorMap = this._dataStreamMapForObjectDescriptor(objectDescriptor),
                    criteriaExpressionMap = objectDescriptorMap.get(criteria.expression);
                if (!criteriaExpressionMap) {
                    criteriaExpressionMap = new Map();
                    objectDescriptorMap.set(criteria.expression, criteriaExpressionMap);
                }
                return criteriaExpressionMap;
            },
        },

        makeCriteriaParametersReplacer: {
            value: function () {
                let isInitial = true;

                return (key, value) => {
                    if (isInitial) {
                        isInitial = false;
                        return value;
                    }
                    if (key === "") {
                        // Omit all properties with name "" (except the initial object)
                        return undefined;
                    }

                    return this._criteriaParametersReplacer(key, value);
                };
            },
        },

        _criteriaParametersReplacer: {
            value: function (key, value) {
                return typeof value === "object"
                    ? key === ""
                        ? JSON.stringify(value, this._criteriaParametersReplacer)
                        : value?.dataIdentifier
                        ? value.dataIdentifier
                        : !!value
                        ? value.toString()
                        : null
                    : isArray(value)
                    ? value.map(this._criteriaParametersReplacer)
                    : value;
            },
        },

        _criteriaExpressionMapKeyForDataQuery: {
            value: function (dataQuery) {
                return typeof (dataQuery.criteria || Criteria.thatEvaluatesToTrue).parameters === "string"
                    ? dataQuery.readExpressions
                        ? `${JSON.stringify(dataQuery.readExpressions)}-${
                              (dataQuery.criteria || Criteria.thatEvaluatesToTrue).parameters
                          }`
                        : (dataQuery.criteria || Criteria.thatEvaluatesToTrue).parameters
                    : dataQuery.readExpressions
                    ? `${JSON.stringify(dataQuery.readExpressions)}-${JSON.stringify(
                          (dataQuery.criteria || Criteria.thatEvaluatesToTrue).parameters,
                          this.makeCriteriaParametersReplacer()
                      )}`
                    : JSON.stringify(
                          (dataQuery.criteria || Criteria.thatEvaluatesToTrue).parameters,
                          this.makeCriteriaParametersReplacer()
                      );
            },
        },

        registeredDataStreamMapForDataQuery: {
            value: function (dataQuery) {
                var objectDescriptor = dataQuery.type,
                    criteria = dataQuery.criteria || Criteria.thatEvaluatesToTrue,
                    criteriaExpressionMap = this._dataStreamMapForObjectDescriptorCriteria(objectDescriptor, criteria);

                return criteriaExpressionMap.get(this._criteriaExpressionMapKeyForDataQuery(dataQuery));
            },
        },

        registerDataStream: {
            value: function (dataStream) {
                var objectDescriptor = dataStream.query.type,
                    criteria = dataStream.query.criteria || Criteria.thatEvaluatesToTrue,
                    criteriaExpressionMap = this._dataStreamMapForObjectDescriptorCriteria(objectDescriptor, criteria);

                return criteriaExpressionMap.set(
                    this._criteriaExpressionMapKeyForDataQuery(dataStream.query),
                    dataStream
                );
            },
        },
        unregisterDataStream: {
            value: function (dataStream) {
                var objectDescriptor = dataStream.query.type,
                    criteria = dataStream.query.criteria || Criteria.thatEvaluatesToTrue,
                    criteriaExpressionMap = this._dataStreamMapForObjectDescriptorCriteria(objectDescriptor, criteria);

                return criteriaExpressionMap.delete(this._criteriaExpressionMapKeyForDataQuery(dataStream.query));
            },
        },

        /*
        DataStream cache:

        Map: ObjectDescriptor -> Map: criteriaExpression -> Map: JSON.stringify(criteria.parameters) -> Promise
    */
        __rawDataServiceHandlersByReadEventId: {
            value: undefined,
        },
        _rawDataServiceHandlersByReadEventId: {
            get: function () {
                return (
                    this.__rawDataServiceHandlersByReadEventId ||
                    (this.__rawDataServiceHandlersByReadEventId = new Map())
                );
            },
        },
        registerReadEvent: {
            value: function (readEvent) {
                this._rawDataServiceHandlersByReadEventId.set(readEvent.id, undefined);
            },
        },

        __rawDataServiceHandlersByReadOperation: {
            value: undefined,
        },
        _rawDataServiceHandlersByReadOperation: {
            get: function () {
                return (
                    this.__rawDataServiceHandlersByReadOperation ||
                    (this.__rawDataServiceHandlersByReadOperation = new Map())
                );
            },
        },

        registerRawDataServiceForReadOperation: {
            value: function (rawDataService, readOperation) {
                let handlers = this._rawDataServiceHandlersByReadOperation.get(readOperation);
                if (!handlers) {
                    this._rawDataServiceHandlersByReadOperation.set(readOperation, (handlers = []));
                }
                handlers.push(rawDataService);

                //When readOperation's referrer was a readEvent
                //this.registerRawDataServiceHandlerForReadEventId(rawDataService, readOperation.referrerId);
                this.registerRawDataServiceHandlerForReadEventId(rawDataService, readOperation.id);
            },
        },

        registerRawDataServiceHandlerForReadEventId: {
            value: function (rawDataService, readEventId) {
                let handlers = this._rawDataServiceHandlersByReadEventId.get(readEventId);
                if (!handlers) {
                    this._rawDataServiceHandlersByReadEventId.set(readEventId, (handlers = []));
                }
                handlers.push(rawDataService);
            },
        },
        unregisterRawDataServiceHandlerForReadEventId: {
            value: function (rawDataService, readEventId) {
                let handlers = this._rawDataServiceHandlersByReadEventId.get(readEventId);
                if (handlers) {
                    handlers.delete(rawDataService);
                }
            },
        },
        hasRegisteredRawDataServiceHandlerForReadEvent: {
            value: function (readEvent) {
                let handlers = this._rawDataServiceHandlersByReadEventId.get(readEvent.id);
                return handlers && handlers.length > 0;
            },
        },
        unregisterReadEvent: {
            value: function (readEvent) {
                if (!this.hasRegisteredRawDataServiceHandlerForReadEvent(readEvent)) {
                    /*
                    This means no RawDataService were able to handle that read.
                    We need to report am error
                */
                    /*
                    REFACTOR: There could be more than one rawDataService handling a read operation.

                    RawDataService in handleRead used to create a readDataOperation for itself,
                    and set itself as:
                                readOperation.rawDataService = this;
                    Now in captureReadOperation(), it's missing...

                */
                    //readEvent.dataStream.dataError(new Error("No RawDataService to handle query for "+readEvent.dataStream.query.type.name));
                }

                this._rawDataServiceHandlersByReadEventId.delete(readEvent.id);
                ReadEvent.checkin(readEvent);
            },
        },

        /**
         * Fetch data from the service using its child services.
         *
         * This method accept [types]{@link DataObjectDescriptor} as alternatives to
         * [queries]{@link DataQuery}, and its [stream]{DataStream} argument is
         * optional, but when it calls its child services it will provide them with
         * a [query]{@link DataQuery}, it provide them with a
         * [stream]{DataStream}, creating one if necessary, and the stream will
         * include a reference to the query. Also, if a child service's
         * implementation of this method return `undefined` or `null`, this method
         * will return the stream passed in to the call to that child.
         *
         * The requested data may be fetched asynchronously, in which case the data
         * stream will be returned immediately but the stream's data will be added
         * to the stream at a later time.
         *
         * @method
         * @argument {DataQuery|DataObjectDescriptor|ObjectDescriptor|Function|String}
         *           queryOrType   - If this argument's value is a query
         *                              it will define what type of data should
         *                              be returned and what criteria that data
         *                              should satisfy. If the value is a type
         *                              it will only define what type of data
         *                              should be returned, and the criteria
         *                              that data should satisfy can be defined
         *                              using the `criteria` argument.  A type
         *                              is defined as either a DataObjectDesc-
         *                              riptor, an Object Descriptor, a Construct-
         *                              or the string module id.  The method will
         *                              convert the passed in type to a Data-
         *                              ObjectDescriptor (deprecated) or an
         *                              ObjectDescriptor.  This is true whether
         *                              passing in a DataQuery or a type.
         * @argument {?Object}
         *           optionalCriteria - If the first argument's value is a
         *                              type this argument can optionally be
         *                              provided to defines the criteria which
         *                              the returned data should satisfy.
         *                              If the first argument's value is a
         *                              query this argument should be
         *                              omitted and will be ignored if it is
         *                              provided.
         * @argument {?DataStream}
         *           optionalStream   - The stream to which the provided data
         *                              should be added. If no stream is
         *                              provided a stream will be created and
         *                              returned by this method.
         * @returns {?DataStream} - The stream to which the fetched data objects
         * were or will be added, whether this stream was provided to or created by
         * this method.
         */
        fetchData: {
            value: function (queryOrType, optionalCriteria, optionalStream) {
                if (!queryOrType) {
                    return Promise.resolveNull;
                }

                var self = this,
                    isSupportedType = !(queryOrType instanceof DataQuery),
                    type = isSupportedType && queryOrType,
                    criteria = optionalCriteria instanceof DataStream ? undefined : optionalCriteria,
                    query = type ? DataQuery.withTypeAndCriteria(type, criteria) : queryOrType,
                    stream = optionalCriteria instanceof DataStream ? optionalCriteria : optionalStream;

                // make sure type is an object descriptor or a data object descriptor.
                query.type = this.objectDescriptorForType(query.type);

                if (this.supportsDataOperation) {
                    //Check if we already have a DataStream pending for that same query:
                    if ((stream = this.registeredDataStreamMapForDataQuery(query))) {
                        //console.debug("registeredDataStreamMapForDataQuery found for "+query.type.name+", criteria:",query.criteria);
                        return stream;
                    }
                }

                // Set up the stream.
                stream = stream || new DataStream();
                stream.query = query;
                stream.dataExpression = query.selectExpression;

                //Now before going further, quick check to see if we may have local read-only objects fitting the bill
                let readOnlyDataObjectsRegisteredForObjectDescriptor =
                    this.readOnlyDataObjectsRegisteredForObjectDescriptor(query.type);
                if (readOnlyDataObjectsRegisteredForObjectDescriptor) {
                    let result = readOnlyDataObjectsRegisteredForObjectDescriptor.filter(criteria.predicateFunction);
                    if (result && result.length > 0) {
                        stream.addData(result);

                        let dataDoneTimeputId = setTimeout(() => {
                            clearTimeout(dataDoneTimeputId);
                            dataDoneTimeputId = null;
                            stream.dataDone();
                        }, 0);
                    }
                }

                //Register it for possible reuse by other callers needing the same data:
                this.registerDataStream(stream);

                this._dataServiceByDataStream.set(
                    stream,
                    this._childServiceRegistrationPromise.then(function () {
                        /*
                    This a switch for 0% operations vs 100% operations. It should be possible to mix but it's more risky for side effects in older versions.

                    In early versions of montage data, Data Objects and their Object Descriptors did not inherit from Target and therefore didn't respond to the .dispatchEvent() method. So we can use that to for the logic between new and old.

                    supportsDataOperation will be determined by all RawDataServices supportsDataOperation
                */

                        if (self.supportsDataOperation && query.type.dispatchEvent) {
                            // try {

                            //     var readEvent = ReadEvent.checkout();

                            //     readEvent.type = ReadEvent.read;
                            //     readEvent.query = query;
                            //     readEvent.dataStream = stream;

                            //     self.registerReadEvent(readEvent);

                            //     query.type.dispatchEvent(readEvent);
                            //     if(readEvent.propagationPromise) {
                            //         readEvent.propagationPromise.finally(() => {
                            //             self.unregisterReadEvent(readEvent);
                            //         });
                            //     } else {
                            //         self.unregisterReadEvent(readEvent);
                            //     }
                            // } catch (e) {
                            //     stream.dataError(e);
                            // }

                            try {
                                var readOperation = new DataOperation();

                                readOperation.type = DataOperation.Type.ReadOperation;
                                readOperation.target = query.type;

                                if (query.identity) {
                                    readOperation.identity = query.identity;
                                } else if (self.identity) {
                                    readOperation.identity = self.identity;
                                }

                                //Need to add a check to see if criteria may have more spefific instructions for "locale".
                                /*
                            1/19/2021 - we were only adding locale when the object descriptor being fetched has some localizableProperties, but a criteria may involve a subgraph and we wou'd have to go through the syntactic tree of the criteria, and readExpressions, to figure out if anywhere in that subgraph, there might be localizable properties we need to include the locales for.

                            Since we're localized by default, we're going to include it no matter what, it's going to be more rare that it is not needed than it is.
                        */
                                /*
                            WIP Adds locale as needed. Most common case is that it's left to the framework to qualify what Locale to use.

                            A core principle is that each data object (DO) has a locale property behaving in the following way:
                            locales has 1 locale value, a locale object.
                            This is the most common use case. The property’s getter returns the user’s locale.
                            Fetching an object with a criteria asking for a specific locale will return an object in that locale.
                            Changing the locale property of an object to another locale instance (singleton in Locale’s case), updates all the values of its localizable properties to the new locale set.
                            locales has either no value, or “*” equivalent, an “All Locale Locale”
                            This feches the json structure and returns all the values in all the locales
                            locales has an array of locale instances.
                            If locale’s cardinality is > 1 then each localized property would return a json/dictionary of locale->value instead of 1 value.
                        */

                                readOperation.locales = self.userLocales;

                                if (query.criteria) {
                                    //readOperation.criteria = criteria.clone();
                                    readOperation.criteria = query.criteria;
                                }
                                if (query.sizeLimit) {
                                    readOperation.data.sizeLimit = query.sizeLimit;
                                }
                                if (query.batchSize) {
                                    readOperation.data.batchSize = query.batchSize;
                                }
                                if (query.orderings && query.orderings > 0) {
                                    rawOrderings = [];
                                    // self._mapObjectDescriptorOrderingsToRawOrderings(objectDescriptor, query.sortderings,rawOrderings);
                                    // readOperation.data.orderings = rawOrderings;
                                    readOperation.data.orderings = query.orderings;
                                }
                                if (query.readExpressions && query.readExpressions.length) {
                                    readOperation.data.readExpressions = query.readExpressions;
                                }
                                /*
                            We need to do this in node's DataWorker, it's likely that we'll want that client side as well, where it's some sort of token set post authorization.
                        */
                                if (self.application.identity && self.shouldAuthenticateReadOperation) {
                                    readOperation.identity = self.application.identity;
                                }

                                /* to save bandwidth, if it's true - the default, we won't include the key */
                                if (!query.includesChildObjectDescriptors) {
                                    readOperation.data.includesChildObjectDescriptors =
                                        query.includesChildObjectDescriptors;
                                }

                                if (query.hints) {
                                    readOperation.hints = query.hints;
                                }

                                /*
                        this is half-assed, we're mapping full objects to RawData, but not the properties in the expression.
                        phront-service does it, but we need to stop doing it half way there and the other half over there.
                        SaveChanges is cleaner, but the job is also easier there.
                    */
                                let criteria = query.criteria,
                                    parameters = criteria ? criteria.parameters : undefined;
                                rawParameters = parameters;

                                // if (parameters && typeof criteria.parameters === "object") {
                                //     var keys = Object.keys(parameters),
                                //         i,
                                //         countI,
                                //         iKey,
                                //         iValue,
                                //         iRecord,
                                //         criteriaClone;

                                //     //rawParameters = Array.isArray(parameters) ? [] : {};

                                //     for (i = 0, countI = keys.length; i < countI; i++) {
                                //         iKey = keys[i];
                                //         iValue = parameters[iKey];
                                //         if (!iValue) {
                                //             console.warn(
                                //                 "fetchData: criteria ",
                                //                 criteria,
                                //                 "has value: " + value + " for parameter key " + iKey
                                //             );
                                //         } else {
                                //             if (iValue.dataIdentifier) {
                                //                 if (!criteriaClone) {
                                //                     criteriaClone = criteria.clone();
                                //                     rawParameters = criteriaClone.parameters;
                                //                 }
                                //                 /*
                                //             this isn't working because it's causing triggers to fetch properties we don't have
                                //             and somehow fails, but it's wastefull. Going back to just put primary key there.
                                //         */
                                //                 // iRecord = {};
                                //                 // rawParameters[iKey] = iRecord;
                                //                 // (promises || (promises = [])).push(
                                //                 //     self._mapObjectToRawData(iValue, iRecord)
                                //                 // );
                                //                 rawParameters[iKey] = iValue.dataIdentifier.primaryKey;
                                //             }
                                //             // else {
                                //             //     rawParameters[iKey] = iValue;
                                //             // }
                                //         }
                                //     }

                                //     if (criteriaClone) {
                                //         readOperation.criteria = criteriaClone;
                                //     }
                                // }

                                readOperation.dataStream = stream;

                                self.registerReadEvent(readOperation);

                                query.type.dispatchEvent(readOperation);
                                if (readOperation.propagationPromise) {
                                    readOperation.propagationPromise.finally(() => {
                                        self.unregisterReadEvent(readOperation);
                                    });
                                } else {
                                    self.unregisterReadEvent(readOperation);
                                }
                            } catch (e) {
                                stream.dataError(e);
                            }

                            // try {
                            //     self._fetchDataWithOperation(query, stream);
                            // } catch (e) {
                            //     stream.dataError(e);
                            // }
                        } else {
                            var service;
                            //This is a workaround, we should clean that up so we don't
                            //have to go up to answer that question. The difference between
                            //.TYPE and Objectdescriptor still creeps-in when it comes to
                            //the service to answer that to itself
                            if (
                                self.parentService &&
                                self.parentService.childServiceForType(query.type) === self &&
                                typeof self.fetchRawData === "function"
                            ) {
                                service = self;
                                service._fetchRawData(stream);
                            } else {
                                // Use a child service to fetch the data.
                                try {
                                    service = self.childServiceForType(query.type);
                                    if (service) {
                                        //Here we end up creating an extra stream for nothing because it should be third argument.
                                        stream = service.fetchData(query, stream) || stream;
                                        self._dataServiceByDataStream.set(stream, service);
                                    } else {
                                        throw new Error(
                                            "Can't fetch data of unknown type - " +
                                                (query.type.typeName || query.type.name) +
                                                "/" +
                                                query.type.uuid
                                        );
                                    }
                                } catch (e) {
                                    stream.dataError(e);
                                }
                            }
                            return service;
                        }
                    })
                );

                //Ensure we clean up after all client processing the DataStream are done
                //Don't like creating a dummy array though...
                Promise.allSettled([stream]).then((results) => {
                    this.unregisterDataStream(stream);
                });

                // Return the passed in or created stream.
                return stream;
            },
        },

        _fetchRawData: {
            value: function (stream) {
                var self = this,
                    childService = this._childServiceForQuery(stream.query);

                if (childService) {
                    childService._fetchRawData(stream);
                } else {
                    //this is the new path for services with a authenticationPolicy
                    if (this.authenticationPolicy) {
                        var identityPromise, shouldAuthenticate;
                        //If this is the service providing providesIdentity for the query's type: IdentityService for the Identity type required.
                        //the query is either for the Identity itself, or something else.
                        //If it's for the user identity itself, it's a simple fetch
                        //but if it's for something else, we may need to fetch the identity first, and then move on to the query at hand.
                        if (this.providesIdentity) {
                            //Regardless of the policy, we're asked to fetch a user identity
                            var streamQuery = stream.query;
                            if (stream.query.criteria) {
                                stream.query = self.mapQueryToRawDataQuery(streamQuery);
                            }
                            this.fetchRawData(stream);
                            //Switch it back
                            stream.query = streamQuery;
                        } else {
                            if (stream.query.identity) {
                                identityPromise = Promise.resolve(stream.query.identity);
                            } else if (!this.identity) {
                                if (this.identityPromise) {
                                    identityPromise = this.identityPromise;
                                } else if (
                                    this.authenticationPolicy ===
                                        AuthenticationPolicyType.UpfrontAuthenticationPolicy ||
                                    (this.authenticationPolicy === AuthenticationPolicy.ON_DEMAND &&
                                        (shouldAuthenticate = typeof this.queryRequireAuthentication === "function") &&
                                        this.queryRequireAuthentication(stream.query))
                                ) {
                                    this.identityPromise = identityPromise = new Promise(function (resolve, reject) {
                                        var identityServices = this.identityServices,
                                            identityObjectDescriptors,
                                            selfUserCriteria,
                                            identityQuery;

                                        //Shortcut, there could be multiple one we need to flatten.
                                        identityObjectDescriptors = identityServices[0].types;
                                        //selfUserCriteria = new Criteria().initWithExpression("identity == $", "self");
                                        identityQuery = DataQuery.withTypeAndCriteria(identityObjectDescriptors[0]);

                                        this.rootService.fetchData(identityQuery).then(
                                            function (userIdenties) {
                                                self.identity = userIdenties[0];
                                                resolve(self.identity);
                                            },
                                            function (error) {
                                                console.error(error);
                                                reject(error);
                                            }
                                        );
                                    });
                                } else identityPromise = Promise.resolve(true);
                            } else {
                                identityPromise = Promise.resolve(true);
                            }

                            identityPromise
                                .then(function (identity) {
                                    var streamSelector = stream.query;
                                    stream.query = self.mapQueryToRawDataQuery(streamSelector);
                                    self.fetchRawData(stream);
                                    stream.query = streamSelector;
                                })
                                .catch(function (e) {
                                    stream.dataError(e);
                                    self.identityPromise = Promise.resolve(null);
                                });
                        }
                    } else {
                        if (this.authorizationPolicy === AuthorizationPolicy.ON_DEMAND) {
                            var prefetchAuthorization =
                                typeof this.shouldAuthorizeForQuery === "function" &&
                                this.shouldAuthorizeForQuery(stream.query);
                            if (prefetchAuthorization || !this.authorization) {
                                this.authorizationPromise = exports.DataService.authorizationManager
                                    .authorizeService(this, prefetchAuthorization)
                                    .then(function (authorization) {
                                        self.authorization = authorization;
                                        return authorization;
                                    });
                            }
                        }

                        this.authorizationPromise
                            .then(function (authorization) {
                                var streamSelector = stream.query;
                                stream.query = self.mapQueryToRawDataQuery(streamSelector);
                                self.fetchRawData(stream);
                                stream.query = streamSelector;
                            })
                            .catch(function (e) {
                                stream.dataError(e);
                                self.authorizationPromise = Promise.resolve(null);
                            });
                    }
                }
            },
        },

        /*
        ObjectDescriptors are what should dispatch events, as well as model objec intances
        So an imperative method on DataService would internally create the operation/event and dispatch it on the object descriptor. It would internally addEventListener for the "symetric event", for a Read, it would be a ReadUpdated, for a ReadUpdate/ a ReadUpdated as well.

        This would help re-implementing fetchData to be backward compatible.

        What is clear is that we need for a read for example, a stable array that can be relied on by bindings and be mutated over time.

        If we have anObjecDescriptor.dispatchEvent("read"), then someone whose job it to act on that read is an EventListener for it, and that's the RawDataServices running in the DataServiceWorker. This is where we need an intermediary whose job is to send these events over postMesssage so they get dispatched in the DataServiceWorker.

        So as a developer what am I writing if I'm not doing

            mainService.fetchData(query); //?

            mainService.readData(query); //?
            mainService.saveData(query); //?

            mainService.performOperation(readOperation);


    */

        readData: {
            value: function (dataOperation, optionalStream) {
                var self = this,
                    objectDescriptor = dataOperation.objectDescriptor || dataOperation.dataType,
                    stream = optionalStream,
                    dataService,
                    dataServicePromise;

                // Set up the stream.
                stream = stream || new DataStream();
                stream.operation = dataOperation;

                if (!(dataService = this._dataServiceByDataStream.get(stream))) {
                    this._dataServiceByDataStream.set(
                        stream,
                        (dataServicePromise = this._childServiceRegistrationPromise.then(function () {
                            var service;
                            //This is a workaround, we should clean that up so we don't
                            //have to go up to answer that question. The difference between
                            //.TYPE and Objectdescriptor still creeps-in when it comes to
                            //the service to answer that to itself
                            if (
                                self.parentService &&
                                self.parentService.childServiceForType(objectDescriptor) === self &&
                                typeof self.fetchRawData === "function"
                            ) {
                                service = self;
                                service._fetchRawData(stream);
                            } else {
                                // Use a child service to fetch the data.
                                service = self.childServiceForType(objectDescriptor);
                                if (service) {
                                    //Here we end up creating an extra stream for nothing because it should be third argument.
                                    self._dataServiceByDataStream.set(stream, service);
                                } else {
                                    throw new Error("Can't fetch data of unknown type - " + objectDescriptor.name);
                                }
                            }

                            return service;
                        }))
                    );
                } else {
                    dataServicePromise = Promise.resolve(dataService);
                }

                dataServicePromise.then(function (dataService) {
                    try {
                        //Direct access for now
                        stream = dataService.handleRead(dataOperation);
                    } catch (e) {
                        stream.dataError(e);
                    }
                });

                // Return the passed in or created stream.
                return stream;
            },
        },

        _childServiceForQuery: {
            value: function (query) {
                var serviceModuleID = this._serviceIdentifierForQuery(query),
                    service = serviceModuleID && this._childServicesByIdentifier.get(serviceModuleID);

                if (!service && this._childServicesByType.has(query.type)) {
                    service = this._childServicesByType.get(query.type);
                    service = service && service[0];
                }

                return service || null;
            },
        },

        _serviceIdentifierForQuery: {
            value: function (query) {
                var parameters = query && query.criteria ? query.criteria.parameters : null,
                    serviceModuleID = parameters && parameters.serviceIdentifier,
                    mapping,
                    propertyName;

                if (!serviceModuleID) {
                    mapping = this.mappingForType(query.type);
                    propertyName = mapping && parameters && parameters.propertyName;
                    serviceModuleID = propertyName && mapping.serviceIdentifierForProperty(propertyName);
                }

                return serviceModuleID;
            },
        },

        __dataServiceByDataStream: {
            value: null,
        },

        _dataServiceByDataStream: {
            get: function () {
                return this.__dataServiceByDataStream || (this.__dataServiceByDataStream = new WeakMap());
            },
        },

        dataServiceForDataStream: {
            get: function (dataStream) {
                return this._dataServiceByDataStream.get(dataStream);
            },
        },

        /**
         * To be called to indicates that the consumer has lost interest in the passed DataStream.
         * This will allow the RawDataService feeding the stream to take appropriate measures.
         *
         * @method
         * @argument {DataStream} [dataStream] - The DataStream to cancel
         * @argument {Object} [reason] - An object indicating the reason to cancel.
         *
         */
        cancelDataStream: {
            value: function (dataStream, reason) {
                if (dataStream) {
                    var rawDataService = this._dataServiceByDataStream.get(dataStream),
                        self = this;

                    if (Promise.is(rawDataService)) {
                        rawDataService.then(function (service) {
                            self._cancelServiceDataStream(service, dataStream, reason);
                        });
                    } else {
                        this._cancelServiceDataStream(rawDataService, dataStream, reason);
                    }
                }
            },
        },

        _cancelServiceDataStream: {
            value: function (rawDataService, dataStream, reason) {
                rawDataService.cancelRawDataStream(dataStream, reason);
                this._dataServiceByDataStream.delete(dataStream);
            },
        },

        /**
     * update data - potentially multiple instances - using the service using its child services,
     * without requiring to fetch them as much as possible, depending on the capabilities of DataServices involved.

     * the changes will be regsitered in the data service and applied when  mainDataService.saveChanges() is called.
     *
     * Later on support should be added for the ability to have multiple transactions being worked on in parallel. While it would be possible here
     * de pass a transaction instance as an argument, we can't really do that when automatically tracking changes on
     * instances. To do so, we can't beat the notion of an "EditingContex". I would make sense that EditingContext
     * become the side of DataService exposed to the app side.
     *
     *
     * @method
     * @argument {ObjectDescriptor|Function|String}
     *                      objectDescriptorOrType   - defines what type of data
     *                              should be updated, and the criteria
     *                              that data should satisfy can be defined
     *                              using the `criteria` argument.  A type
     *                              is defined as either a DataObjectDesc-
     *                              riptor, an Object Descriptor, a Construct-
     *                              or the string module id.  The method will
     *                              convert the passed in type to a Data-
     *                              ObjectDescriptor (deprecated) or an
     *                              ObjectDescriptor.  This is true whether
     *                              passing in a DataQuery or a type.
     * @argument {?Criteria}
     *                      optionalCriteria - If provided, defines the criteria which
     *                              data to update should satisfy.
     * @argument {Object}
     *                      values   - The values to apply to data described by optionalCriteria. Follows the shape used internally by DataService to track changes.
     *                              "toOneProperty": value,
     *                              "toManyProperty": {
     *                                    addedValues: [],
     *                                    removedValues: []
     *                               }
     *
     * @returns undefined
     *
     */
        updateData: {
            value: function (objectDescriptorOrTypeOrString, criteria, values) {
                this.registerDataUpdate(
                    objectDescriptorOrTypeOrString instanceof ObjectDescriptor
                        ? objectDescriptorOrTypeOrString
                        : this.objectDescriptorForType(objectDescriptorOrTypeOrString)
                );
            },
        },
        dataUpdates: {
            get: function () {
                if (this.isRootService) {
                    if (!this._dataUpdates) {
                        this._dataUpdates = new Map();
                    }
                    return this._dataUpdates;
                } else {
                    return this.rootService.dataUpdates;
                }
            },
        },

        registerDataUpdate: {
            value: function (objectDescriptor, criteria, changes) {
                var dataUpdates = this.dataUpdates,
                    value = dataUpdates.get(objectDescriptor);
                if (!value) {
                    dataUpdates.set(objectDescriptor, (value = new Map()));
                }
                value.set(criteria, changes);
                this.objectDescriptorsWithChanges.add(objectDescriptor);
            },
        },

        unregisterDataUpdate: {
            value: function (objectDescriptor, criteria, changes) {
                var value = this.dataUpdates.get(objectDescriptor);
                if (value) {
                    value.delete(criteria);
                    this.objectDescriptorsWithChanges.delete(objectDescriptor);
                }
            },
        },

        /**
         * delete data - potentially multiple instances - using the service using and it's child services,
         * without requiring to fetch them as much as possible, depending on the capabilities of DataServices involved.
         *
         * the changes will be regsitered in the data service and applied when  mainDataService.saveChanges() is called.
         *
         * Later on support should be added for the ability to have multiple transactions. While it would be possible here
         * de pass a transaction instance as an argument, we can't really do that when automatically tracking changes on
         * instances. To do so, we can't beat the notion of an "EditingContex". I would make sense that EditingContext
         * become the side of DataService exposed to the app side.
         *
         * The requested data may be fetched asynchronously, in which case the data
         * stream will be returned immediately but the stream's data will be added
         * to the stream at a later time.
         *
         * @method
         * @argument {ObjectDescriptor|Function|String}
         *                      objectDescriptorOrType   - defines what type of data
         *                              should be updated, and the criteria
         *                              that data should satisfy can be defined
         *                              using the `criteria` argument.  A type
         *                              is defined as either a DataObjectDesc-
         *                              riptor, an Object Descriptor, a Construct-
         *                              or the string module id.  The method will
         *                              convert the passed in type to a Data-
         *                              ObjectDescriptor (deprecated) or an
         *                              ObjectDescriptor.  This is true whether
         *                              passing in a DataQuery or a type.
         * @argument {?Criteria}
         *                      optionalCriteria - If provided, defines the criteria which
         *                              data to delete should satisfy.
         *
         * @returns undefined
         *
         */
        deleteData: {
            value: function (objectDescriptorOrTypeOrString, criteria) {
                this.registerDataDelete(
                    objectDescriptorOrTypeOrString instanceof ObjectDescriptor
                        ? objectDescriptorOrTypeOrString
                        : this.objectDescriptorForType(objectDescriptorOrTypeOrString)
                );
            },
        },
        dataDeletes: {
            get: function () {
                if (this.isRootService) {
                    if (!this._dataDeletes) {
                        this._dataDeletes = new Map();
                    }
                    return this._dataDeletes;
                } else {
                    return this.rootService.dataDeletes;
                }
            },
        },

        registerDataDelete: {
            value: function (objectDescriptor, criteria) {
                var dataDeletes = this.dataDeletes,
                    value = dataDeletes.get(objectDescriptor);
                if (!value) {
                    dataDeletes.set(objectDescriptor, (value = new Set()));
                } else {
                    if (value.has(null)) {
                        if (criteria) {
                            console.warn(
                                "All instances of " +
                                    objectDescriptor.name +
                                    " have been set to be deleted, but the current call uses a criteria: ",
                                criteria
                            );
                        }
                    } else if (!criteria) {
                        console.warn(
                            "Some instances of " +
                                objectDescriptor.name +
                                " have been set to be deleted if matching criteria: ",
                            criteria,
                            " but the current delete will delete all instances"
                        );
                    }
                }

                value.add(criteria || null);

                this.objectDescriptorsWithChanges.add(objectDescriptor);
            },
        },

        unregisterDataDelete: {
            value: function (objectDescriptor, criteria) {
                var value = this.dataDeletes.get(objectDescriptor);
                if (value) {
                    value.delete(criteria);
                    this.objectDescriptorsWithChanges.delete(objectDescriptor);
                }
            },
        },

        /**
         * EventChange handler, begining of tracking objects changes via Triggers right now,
         * which are installed on propertyDescriptors. We might need to refine that by adding the
         * ability to model wether a property is persisted or not. If it's not meant to be persisted,
         * then a DataService most likely doesn't have much to do with it.
         * Right now, this is unfortunately called even during the mapRawDataToObject.
         * We need a way to ignore this as early as possible
         *
         * @method
         * @argument {ChangeEvent} [changeEvent] - The changeEvent
         *
         */
        handleChange: {
            value: function (changeEvent) {
                //Adding check to avoid changes from property-fetching
                let trigger = this._triggerForObjectProperty(changeEvent.target, changeEvent.key),
                    triggerValueStatus = trigger._getValueStatus(changeEvent.target);

                /*
                If triggerValueStatus is a promise, then we know the property is being fetched.
                BUT HOW CAN WE BE SURE THAT THIS CHANGE IS THE RESULT OF THE FETCH?

                But that that specific change Event could still be a change coming from user-side?

                - The snapshot may not help us since it could be a property resolved off the primary key
                    if(trigger._getValueStatus(object) == )

            */
                //Commentting out the restriction to exclude created objects as we might want to
                //use it for them as well

                // if(!this._createdDataObjects || (this._createdDataObjects && !this._createdDataObjects.has(changeEvent.target))) {
                //Needs to register the change so saving changes / update operations can use it later to decise what to send
                //console.log("handleChange:",changeEvent);
                this.registerDataObjectChangesFromEvent(changeEvent);
                //}
            },
        },

        /***************************************************************************
         * Saving Data
         */

        /**
         * Delete a data object.
         *
         * @method
         * @argument {Object} object - The object whose data should be deleted.
         * @returns {external:Promise} - A promise fulfilled when the object has
         * been deleted.
         */
        deleteDataObject: {
            value: function (object) {
                var saved = !this.isObjectCreated(object);
                this.registerDeletedDataObject(object);
                return this._updateDataObject(object, saved && "deleteDataObject");
            },
        },

        /**
         * Resets an object to the last value in the snapshot.
         * @method
         * @argument {Object} object - The object who will be reset.
         * @returns {external:Promise} - A promise fulfilled when the object has
         * been mapped back to its last known state.
         */
        resetDataObject: {
            value: function (object) {
                var service = this._getChildServiceForObject(object),
                    promise;

                if (service) {
                    promise = service.resetDataObject(object);
                }

                return promise;
            },
        },

        /**
         * Save changes made to a data object.
         *
         * @method
         * @argument {Object} object - The object whose data should be saved.
         * @returns {external:Promise} - A promise fulfilled when all of the data in
         * the changed object has been saved.
         */
        saveDataObject: {
            value: function (object) {
                //return this._updateDataObject(object, "saveDataObject");

                //TODO
                //First thing we should be doing here is run validation
                //on the object, using objectDescriptor's
                //draft: - could/should become async and return a promise.
                //var validatity = this.objectDescriptorForObject(object).evaluateRules(object);

                var self = this,
                    service,
                    promise = this.nullPromise,
                    mappingPromise;

                if (this.parentService && this.parentService._getChildServiceForObject(object) === this) {
                    var record = {};
                    mappingPromise = this._mapObjectToRawData(object, record);
                    if (!mappingPromise) {
                        mappingPromise = this.nullPromise;
                    }
                    return mappingPromise.then(function () {
                        return self.saveRawData(record, object).then(function (data) {
                            self.rootService.createdDataObjects.delete(object);
                            return data;
                        });
                    });
                } else {
                    service = this._getChildServiceForObject(object);
                    if (service) {
                        var result = service.saveDataObject(object);
                        if (result) {
                            return result.then(
                                function (success) {
                                    self.rootService.createdDataObjects.delete(object);
                                    //Duck test of an operation
                                    // if(success.data) {
                                    //     return success.data;
                                    // }
                                    // else {
                                    return success;
                                    // }
                                },
                                function (error) {
                                    console.error(error);
                                    return Promise.reject(error);
                                }
                            );
                        }
                    } else {
                        return promise;
                    }
                }
            },
        },

        _updateDataObject: {
            value: function (object, action) {
                var self = this,
                    service,
                    promise = this.nullPromise;

                if (this.parentService && this.parentService._getChildServiceForObject(object) === this) {
                    service = action && this;
                } else {
                    service = action && this._getChildServiceForObject(object);
                    if (service) {
                        return service._updateDataObject(object, action);
                    }
                }

                if (!action) {
                    self.unregisterCreatedDataObject(object);
                } else if (service) {
                    promise = service[action](object).then(function () {
                        self.unregisterCreatedDataObject(object);
                        return null;
                    });
                }
                return promise;
            },
        },

        _saveDataObject: {
            value: function (object) {
                var record = {};
                this._mapObjectToRawData(object, record);
                return this.saveRawData(record, object);
            },
        },
        // _updateDataObject: {
        //     value: function (object, action) {
        //         var self = this,
        //             service = action && this._getChildServiceForObject(object),
        //             promise = this.nullPromise;

        //         if (!action) {
        //             self.createdDataObjects.delete(object);
        //         } else if (service) {
        //             promise = service[action](object).then(function () {
        //                 self.createdDataObjects.delete(object);
        //                 return null;
        //             });
        //         }
        //         return promise;
        //     }
        // },

        /**
         * Returns a pomise of a DataOperation to save (create/updates) pending changes to an object
         * @method
         * @argument {Object} object - The object who will be reset.
         * @returns {external:Promise} - A promise fulfilled when the data operation is ready.
         */
        saveDataOperationFoObject: {
            value: function (object) {},
        },

        /**
         * Save all changes made since the last call. This method currently delegates to rawDataServices for the actual work
         * Some of it might migrate back up here later when the dust settles.
         *
         * TEMPORARY implementation assuming a single RawDataService that creates
         * operations. We might need to officially make that kind of subclass the
         * mainService.
         *
         * @method
         * @returns {external:Promise} - A promise fulfilled when the save operation is complete or failed.
         */

        // saveChanges: {
        //     value: function () {
        //         var self = this,
        //             promise = this.nullPromise,
        //             service = this.childServices[0];

        //             if (service && typeof service.saveChanges === "function") {
        //                 return service.saveChanges();
        //             }
        //             else {
        //                 return promise;
        //             }
        //         }
        // },

        /***************************************************************************
         * Offline
         */

        _initializeOffline: {
            value: function () {
                // TODO: This code assumes that the first instance of DataService or
                // of one of its subclasses is either the
                // root service, and that no instance of DataService subclasses are.
                // This needs to be fixed to allow DataService child services and
                // DataService subclass root services.
                var self = this;
                if (
                    typeof global.addEventListener === "function" &&
                    !exports.DataService.prototype._isOfflineInitialized
                ) {
                    exports.DataService.prototype._isOfflineInitialized = true;
                    global.addEventListener("online", function (event) {
                        self.rootService.isOffline = false;
                    });
                    global.addEventListener("offline", function (event) {
                        self.rootService.isOffline = true;
                    });
                }
            },
        },

        _isOfflineInitialized: {
            value: false,
        },

        /**
         * Returns a value derived from and continuously updated with the value of
         * [navigator.onLine]{@link https://developer.mozilla.org/en-US/docs/Web/API/NavigatorOnLine/onLine}.
         *
         * Root services are responsible for tracking offline status, and subclasses
         * not designed to be root services should override this property to get
         * its value from their root service.
         *
         * @type {boolean}
         */
        isOffline: {
            get: function () {
                if (this._isOffline === undefined) {
                    // Determine the initial value from the navigator state and call
                    // the public setter so _goOnline() is invoked if appropriate.
                    this.isOffline = !navigator.onLine;
                }
                return this._isOffline;
            },
            set: function (offline) {
                var self = this;
                if (this._willBeOffline === null) {
                    // _goOnline() just finished, set _isOffline to the desired
                    // value and clear the "just finished" flag in _willBeOffline.
                    this._isOffline = offline ? true : false;
                    this._willBeOffline = undefined;
                } else if (this._willBeOffline !== undefined) {
                    // _goOnline() is in progress, just record the future value.
                    this._willBeOffline = offline ? true : false;
                } else if (this._isOffline === false) {
                    // Already online and not starting up, no need for _goOnline().
                    this._isOffline = offline ? true : false;
                } else if (!offline) {
                    // Going from offline to online, or starting up online, so
                    // assume we were last offline, call _goOnline(), and only
                    // change the value  when that's done.
                    this._isOffline = true;
                    this._willBeOffline = false;
                    this._goOnline().then(function () {
                        var offline = self._willBeOffline;
                        self._willBeOffline = null;
                        self.isOffline = offline;
                        return null;
                    });
                }
            },
        },

        _isOffline: {
            // `undefined` on startup, otherwise always `true` or `false`.
            value: false,
        },

        _willBeOffline: {
            // `true` or `false` while _goOnline() is in progress, `null` just after
            // it's done, `undefined` otherwise.
            value: undefined,
        },

        _goOnline: {
            value: function () {
                var self = this;
                return this.readOfflineOperations()
                    .then(function (operations) {
                        operations.sort(this._compareOfflineOperations);
                        return self.performOfflineOperations(operations);
                    })
                    .catch(function (e) {
                        console.error(e);
                    });
            },
        },

        _compareOfflineOperations: {
            value: function (operation1, operation2) {
                // TODO: Remove reference to `lastModified` once child services have
                // been udpated to use `time` instead.
                return operation1.lastModified < operation2.lastModified
                    ? -1
                    : operation1.lastModified > operation2.lastModified
                    ? 1
                    : operation1.time < operation2.time
                    ? -1
                    : operation1.time > operation2.time
                    ? 1
                    : operation1.index < operation2.index
                    ? -1
                    : operation1.index > operation2.index
                    ? 1
                    : 0;
            },
        },

        /**
         * Reads all the offline operations recorded on behalf of this service.
         *
         * The default implementation aggregates this service children's offline
         * operations, keeping track of which child service is responsible for each
         * operation.
         *
         * Subclasses that provide offline support should override this method to
         * return the operations that have been performed while offline.
         *
         * @method
         */
        readOfflineOperations: {
            value: function () {
                // TODO: Get rid of the dummy WeakMap passed to children once the
                // children's readOfflineOperations code has been updated to not
                // expect it.
                // This implementation avoids creating promises for services with no
                // children or whose children don't have offline operations.
                var self = this,
                    dummy = new WeakMap(),
                    services = this._offlineOperationServices,
                    array,
                    promises;
                this.childServices.forEach(function (child) {
                    var promise = child.readOfflineOperations(dummy);
                    if (promise !== self.emptyArrayPromise) {
                        array = array || [];
                        promises = promises || [];
                        promises.push(
                            promise.then(function (operations) {
                                var i, n;
                                for (i = 0, n = operations && operations.length; i < n; i += 1) {
                                    services.set(operations[i], child);
                                    array.push(operations[i]);
                                }
                                return null;
                            })
                        );
                    }
                });
                return promises
                    ? Promise.all(promises).then(function () {
                          return array;
                      })
                    : this.emptyArrayPromise;
            },
        },

        /**
         * @private
         * @type {Map<DataOperation, DataService>}
         */
        _offlineOperationServices: {
            get: function () {
                if (!this.__offlineOperationServices) {
                    this.__offlineOperationServices = new WeakMap();
                }
                return this.__offlineOperationServices;
            },
        },

        __offlineOperationServices: {
            value: undefined,
        },

        /**
         * Perform operations recorded while offline. This will be invoked when the
         * service comes online after being offline.
         *
         * The default implementation delegates performance of each operation to
         * the child service responsible for that operation, as determined by
         * [readOfflineOperations()]{@link DataService#readOfflineOperations}. It
         * will batch operations if several consecutive operations belong to the
         * same child service.
         *
         * For each operation not handled by a child service, the default
         * implementation calls a method named `performFooOfflineOperation()`, if
         * such a method exists in this service where `foo` is the operation's
         * [data type]{@link DataOperation#dataType}. If no such method exists,
         * [readOfflineOperation()]{@link DataService#readOfflineOperation} is
         * called instead.
         *
         * Subclasses that provide offline support should implement these
         * `performFooOfflineOperation()` methods or override the
         * `readOfflineOperation()` method to perform each operation, or they can
         * override this `performOfflineOperations()` method instead.
         *
         * Subclass overriding this method are responsible for
         * [deleting]{@link DataService#deleteOfflineOperations} operations after
         * they have been performed. Subclasses implementing
         * `performFooOfflineOperation()` methods or overriding the
         * `readOfflineOperation()` method are not.
         *
         * @method
         * @argument {Array.<DataOperation>} - operations
         * @returns {Promise} - A promise fulfilled with a null value when the
         * operations have been performed, or rejected if a problem occured that
         * should prevent following operations from being performed.
         */
        performOfflineOperations: {
            value: function (operations) {
                var services = this._offlineOperationServices,
                    promise = this.nullPromise,
                    child,
                    i,
                    j,
                    n,
                    jOperation,
                    jOperationChanges,
                    jService,
                    jOperationType,
                    jTableSchema,
                    jForeignKeys,
                    OfflineService = OfflineService,
                    k,
                    countK,
                    kForeignKey,
                    kOnlinePrimaryKey;

                // Perform each operation, batching if possible, and collecting the
                // results in a chain of promises.
                for (i = 0, n = operations.length; i < n; i = j) {
                    // Find the service responsible for this operation.
                    child = services.get(operations[i]);
                    // Find the end of a batch of operations for this service.
                    j = i + 1;
                    while (j < n && child && (jService = services.get((jOperation = operations[j]))) === child) {
                        ++j;
                    }
                    // Add the promise to perform this batch of operations to the
                    // end of the chain of promises to fulfill all operations.
                    promise = this._performOfflineOperationsBatch(promise, child, operations, i, j);
                }
                // Return a promise for the sequential fulfillment of all operations.
                return promise;
            },
        },

        _performOfflineOperationsBatch: {
            value: function (promise, child, operations, start, end) {
                var self = this;
                return promise.then(function () {
                    return child
                        ? child.performOfflineOperations(operations.slice(start, end))
                        : self._performAndDeleteOfflineOperation(operations[start]);
                });
            },
        },

        _performAndDeleteOfflineOperation: {
            value: function (operation) {
                //Before we perform an operation, we need to look a foreignKeys in jOperation changes to update if needed before performing the operation
                //if we don't have a known list of foreign keys, we'll consider all potential candidate
                var self = this,
                    operationType = operation.type,
                    tableSchema,
                    foreignKeys,
                    k,
                    countK,
                    kOnlinePrimaryKey,
                    kForeignKey;

                if (this.offlineService) {
                    tableSchema = this.offlineService.schema[operationType];
                    foreignKeys = tableSchema.foreignKeys;
                }

                if (!foreignKeys) {
                    foreignKeys =
                        tableSchema._computedForeignKeys ||
                        (tableSchema._computedForeignKeys = Object.keys(operation.changes));
                }

                for (k = 0, countK = foreignKeys.length; k < countK; k++) {
                    kForeignKey = foreignKeys[k];
                    //If a previous operation resulted in an online primaryKey replacing an offline one,
                    //we update the operation's changes accordingly
                    if (
                        (kOnlinePrimaryKey = this.onlinePrimaryKeyForOfflinePrimaryKey(operation.changes[kForeignKey]))
                    ) {
                        operation.changes[kForeignKey] = kOnlinePrimaryKey;
                    }
                }

                return this._performTypedOfflineOperation(operation).then(function () {
                    return self.deleteOfflineOperations([operation]);
                });
            },
        },

        _performTypedOfflineOperation: {
            value: function (operation) {
                // TODO: Remove support for operation.type once all child services
                // have been updated to provide an operation.dataType instead.
                var type = operation.dataType || operation.type,
                    method = type && this[this._getOfflineOperationMethodName(type)];
                return typeof method === "function"
                    ? method.call(this, operation)
                    : this.performOfflineOperation(operation);
            },
        },

        _getOfflineOperationMethodName: {
            value: function (type) {
                var isString = typeof type === "string",
                    name = isString && this._offlineOperationMethodNames.get(type);
                if (isString && !name) {
                    name = "perform";
                    name += type[0].toUpperCase();
                    name += type.slice(1);
                    name += "OfflineOperation";
                    this._offlineOperationMethodNames.set(type, name);
                }
                return name;
            },
        },

        _offlineOperationMethodNames: {
            value: new Map(),
        },

        /**
         * Called from
         * [performOfflineOperations()]{@link DataService#performOfflineOperations}
         * to perform a particular operation when no more specific
         * `performFooOfflineOperation()` method is available for that operation,
         * where `Foo` is the operation's [data type]{@link DataOperation#dataType}.
         *
         * The default implementation does nothing.
         *
         * Subclass overriding this method do not need to
         * [delete]{@link DataService#deleteOfflineOperations} the passed in
         * operation after it has successfully been performed: The method calling
         * this method will take care of that.
         *
         * @method
         * @argument {DataOperation} operation
         * @returns {Promise} - A promise fulfilled with a null value when the
         * operation has been performed, or rejected if a problem occured that
         * should prevent following operations from being performed.
         */
        performOfflineOperation: {
            value: function (operation) {
                // To be overridden by subclasses that use offline operations.
                return this.nullPromise;
            },
        },

        // To be overridden by subclasses as necessary
        onlinePrimaryKeyForOfflinePrimaryKey: {
            value: function (offlinePrimaryKey) {
                return this.offlineService
                    ? this.offlineService.onlinePrimaryKeyForOfflinePrimaryKey(offlinePrimaryKey)
                    : null;
            },
        },

        /**
         * Delete operations recorded while offline.
         *
         * Services overriding the (plural)
         * [performOfflineOperations()]{@link DataService#performOfflineOperations}
         * method must invoke this method after each operation they perform is
         * successfully performed.
         *
         * This method will be called automatically for services that perform
         * operations by implementing a
         * [performOfflineOperation()]{@link DataService#performOfflineOperation}
         * or `performFooOfflineOperation()` methods (where `foo` is an operation
         * [data type]{@link DataOperation#dataType}).
         *
         * Subclasses that provide offline operations support must override this
         * method to delete the specified offline operations from their records.
         *
         * @method
         * @argument {Array.<Object>} operations
         * @returns {Promise} - A promise fulfilled with a null value when the
         * operations have been deleted.
         */
        deleteOfflineOperations: {
            value: function (operations) {
                // To be overridden by subclasses that use offline operations.
                return this.nullPromise;
            },
        },

        /***************************************************************************
         *
         * Access Control related methods
         *
         ***************************************************************************/

        _performsAccessControl: {
            value: false,
        },
        performsAccessControl: {
            get: function () {
                return this._performsAccessControl;
            },
            set: function (value) {
                if (this._performsAccessControl !== value) {
                    /*
                    We're now doing work unrelated to acces control in captureReadOperation,
                    so we don't need to do this here anymore
                */
                    // if(this._performsAccessControl && !value) {
                    //     this.application.removeEventListener(DataOperation.Type.ReadOperation,this,true);
                    // }
                    this._performsAccessControl = value;

                    //Until we have a generic prepareForActivation
                    //Intended for access control: we capture at the highest level:
                    if (this.performsAccessControl) {
                        /*
                        We're now doing work unrelated to acces control in captureReadOperation,
                        so we don't need to do this here anymore
                    */
                        //this.application.addEventListener(DataOperation.Type.ReadOperation,this,true);
                        /*
                        To assess ObjectDescriptor-level access
                    */
                        this.application.addEventListener(DataOperation.Type.CreateTransactionOperation, this, true);

                        /*
                        To assess AppendTransactionOperation's operations access
                    */
                        this.application.addEventListener(DataOperation.Type.AppendTransactionOperation, this, true);

                        /*
                        To assess PerformTransactionOperation's operations access
                    */
                        this.application.addEventListener(DataOperation.Type.PerformTransactionOperation, this, true);
                    }
                }
            },
        },

        _accessPolicies: {
            value: undefined,
        },
        accessPolicies: {
            get: function () {
                if (!this._accessPolicies) {
                    this._accessPolicies = [];
                    this._accessPolicies.addRangeChangeListener(this, "accessPolicies");
                }
                return this._accessPolicies;
            },
        },
        handleAccessPoliciesRangeChange: {
            value: function (plus, minus, index) {
                //if (!this.isDeserializing) {
                this._registerAccessPoliciesByObjectDescriptor(plus);
                this._unregisterAccessPoliciesByObjectDescriptor(minus);
                //}

                // var i, countI, iAccessPolicy, iObjectDescriptor,
                //     j, countJ, jOperationTypes;
                // for(i=0, countI = plus.length; (i<countI); i++) {
                //     iAccessPolicy = plus[i];
                //     iObjectDescriptor = iAccessPolicy.objectDescriptor;
                //     jOperationTypes = Object.keys(iAccessPolicy.dataOperationTypePolicyRules);

                //     for(j=0, countJ = jOperationTypes.length; (j < countJ); j++) {
                //         this.registerAccessPolicyForDataOperationTypeOnObjectDescriptor(iAccessPolicy, jOperationTypes[j], iObjectDescriptor);
                //     }
                // }

                // for(i=0, countI = minus.length; (i<countI); i++) {
                //     iAccessPolicy = minus[i];
                //     iObjectDescriptor = iAccessPolicy.objectDescriptor;
                //     jOperationTypes = Object.keys(iAccessPolicy.dataOperationTypePolicyRules);

                //     for(j=0, countJ = jOperationTypes.length; (j < countJ); j++) {
                //         this.unregisterAccessPolicyForDataOperationTypeOnObjectDescriptor(iAccessPolicy, jOperationTypes[j], iObjectDescriptor);
                //     }

                // }
            },
        },

        _registerAccessPoliciesByObjectDescriptor: {
            value: function (accessPolicies) {
                var i, countI, iAccessPolicy;

                for (i = 0, countI = accessPolicies.length; i < countI; i++) {
                    iAccessPolicy = accessPolicies[i];
                    iAccessPolicy.dataService = this;
                    this.registerAccessPolicyForObjectDescriptor(iAccessPolicy, iAccessPolicy.objectDescriptor);
                }
            },
        },

        _unregisterAccessPoliciesByObjectDescriptor: {
            value: function (accessPolicies) {
                var i, countI, iAccessPolicy;

                for (i = 0, countI = accessPolicies.length; i < countI; i++) {
                    iAccessPolicy = accessPolicies[i];
                    this.unregisterAccessPolicyForObjectDescriptor(iAccessPolicy, iAccessPolicy.objectDescriptor);
                }
            },
        },

        __accessPoliciesByObjectDescriptor: {
            value: undefined,
        },
        _accessPoliciesByObjectDescriptor: {
            get: function () {
                return this.__accessPoliciesByObjectDescriptor || (this.__accessPoliciesByObjectDescriptor = new Map());
            },
        },

        /*
        We're also keeping a similar indexing inside a DataAccessPolicy which still needs to do a lookup on data operation type to get to the rules to evalutate.
    */
        registerAccessPolicyForObjectDescriptor: {
            value: function (accessPolicy, objectDescriptor) {
                var accessPolicies = this._accessPoliciesByObjectDescriptor.get(objectDescriptor);

                if (!accessPolicies) {
                    this._accessPoliciesByObjectDescriptor.set(objectDescriptor, [accessPolicy]);
                } else {
                    accessPolicies.push(accessPolicy);
                }
            },
        },
        unregisterAccessPolicyForObjectDescriptor: {
            value: function (accessPolicy, objectDescriptor) {
                var accessPolicies = this._accessPoliciesByObjectDescriptorByOperationType.get(objectDescriptor),
                    index;

                if (accessPolicies && (index = accessPolicies.indexOf(accessPolicy)) !== -1) {
                    accessPolicies.splice(index, 1);
                }
            },
        },

        /***************************************************************************
         *
         * Read Access Control related methods:
         *
         ***************************************************************************/

        _captureReadOperationPostAccessPoliciesEvaluation: {
            value: function (readOperation) {
                if (!this.isDataOperationAuthorized(readOperation)) {
                    readOperation.stopImmediatePropagation();

                    var readFailedOperation = new DataOperation();

                    readFailedOperation.referrerId = readOperation.id;
                    readFailedOperation.type = DataOperation.Type.ReadFailedOperation;
                    readFailedOperation.target = readOperation.target;
                    readFailedOperation.context = readOperation.context;
                    readFailedOperation.clientId = readOperation.clientId;
                    readFailedOperation.data = new Error("Unauthorized");

                    //console.log("Unauthorized Read Operation for type: "+readOperation.target.name, readOperation);
                    console.log(
                        "Unauthorized " + readOperation.type + " for type: " + readOperation.target.name,
                        readOperation
                    );

                    readFailedOperation.target.dispatchEvent(readFailedOperation);
                    return readFailedOperation;
                } else {
                    return readOperation;
                }
            },
        },
        captureReadOperation: {
            value: function (readOperation) {
                if (readOperation.rawDataService) {
                    this.registerRawDataServiceForReadOperation(readOperation.rawDataService, readOperation);
                }

                //console.log("captureReadOperation: "+readOperation.target.name+", criteria.expression: "+readOperation.criteria.expression+", criteria.parameters: "+JSON.stringify(readOperation.criteria.parameters), readOperation);
                if (this.performsAccessControl) {
                    var self = this,
                        result = this.evaluateAccessPoliciesForDataOperation(readOperation);

                    if (this._isAsync(result)) {
                        /*
                        Returning a promise from the event handler ensures the next listener inline doesn't get involed until we're done.
                    */
                        return result.then(function (value) {
                            return self._captureReadOperationPostAccessPoliciesEvaluation(readOperation);
                        });
                    } else {
                        self._captureReadOperationPostAccessPoliciesEvaluation(readOperation);
                    }
                }
            },
        },

        /***************************************************************************
         *
         * Transaction Access Control related methods:
         *
         ***************************************************************************/
        _captureCreateTransactionOperationPostAccessPoliciesEvaluation: {
            value: function (createTransactionOperation) {
                if (!this.isDataOperationAuthorized(createTransactionOperation)) {
                    createTransactionOperation.stopImmediatePropagation();

                    var createTransactionFailedOperation = new DataOperation();

                    createTransactionFailedOperation.referrerId = createTransactionOperation.id;
                    createTransactionFailedOperation.type = DataOperation.Type.CreateTransactionFailedOperation;
                    createTransactionFailedOperation.target = createTransactionOperation.target;
                    createTransactionFailedOperation.context = createTransactionOperation.context;
                    createTransactionFailedOperation.clientId = createTransactionOperation.clientId;
                    createTransactionFailedOperation.data = new Error("Unauthorized");

                    // console.log("Unauthorized Read Operation for type: "+createTransactionOperation.target.name, createTransactionOperation);
                    console.log(
                        "Unauthorized " +
                            createTransactionOperation.type +
                            " for type: " +
                            createTransactionOperation.target.name,
                        createTransactionOperation
                    );

                    createTransactionFailedOperation.target.dispatchEvent(createTransactionFailedOperation);
                }
            },
        },

        /*

        The core strategy for access control here is to either:
            - look at the difference between the object descriptors in the transaction and a list of authorized ones. That difference should be empty.

            https://medium.com/@alvaro.saburido/set-theory-for-arrays-in-es6-eb2f20a61848

            let difference = arrA.filter(x => !arrB.includes(x));

            or

            - look at the intersection between the object descriptors in the transaction and a list of non-authorized ones. That intersection should be empty.

    */
        captureCreateTransactionOperation: {
            value: function (createTransactionOperation) {
                //console.log("captureCreateTransactionOperation: "+createTransactionOperation.target.name+", criteria.expression: "+createTransactionOperation.criteria.expression+", criteria.parameters: "+JSON.stringify(createTransactionOperation.criteria.parameters), createTransactionOperation);

                //console.log("objectDescriptors: ", createTransactionOperation.objectDescriptors);

                if (this.performsAccessControl) {
                    var self = this,
                        result = this.evaluateAccessPoliciesForDataOperation(createTransactionOperation);

                    if (this._isAsync(result)) {
                        /*
                        Returning a promise from the event handler ensures the next listener inline doesn't get involed until we're done.
                    */
                        return result.then(function (value) {
                            return self._captureCreateTransactionOperationPostAccessPoliciesEvaluation(
                                createTransactionOperation
                            );
                        });
                    } else {
                        this._captureCreateTransactionOperationPostAccessPoliciesEvaluation(createTransactionOperation);
                    }
                }
            },
        },

        /**
         * If the operation isn't authorized, stopImmediatePropagation and dispatch the appropriate operation/event to say so.
         * Returns the fail operation if created.
         *
         * @method
         * @argument {DataOperation} appendTransactionOperation
         * @returns undefined
         */
        _dispatchTransactionFailedOperationFor: {
            value: function (transactionOperation, error) {
                transactionOperation.stopImmediatePropagation();

                var appendTransactionFailedOperation = new DataOperation();

                appendTransactionFailedOperation.referrerId = transactionOperation.id;
                //Make it work for both AppendTransactionOperation and PerformTransactionOperation
                appendTransactionFailedOperation.type =
                    transactionOperation.type === DataOperation.Type.AppendTransactionOperation
                        ? DataOperation.Type.AppendTransactionFailedOperation
                        : DataOperation.Type.PerformTransactionFailedOperation;
                appendTransactionFailedOperation.target = transactionOperation.target;
                appendTransactionFailedOperation.context = transactionOperation.context;
                appendTransactionFailedOperation.clientId = transactionOperation.clientId;
                appendTransactionFailedOperation.data = error ? error : new Error("Unauthorized");

                console.log(
                    "Unauthorized " + transactionOperation.type + " for type: " + transactionOperation.target.name,
                    transactionOperation
                );

                appendTransactionFailedOperation.target.dispatchEvent(appendTransactionFailedOperation);
                return appendTransactionFailedOperation;
            },
        },

        __evaluateCaptureTransactionOperationAuthorized: {
            value: function (iOperation, failedOperations) {
                var result;

                result = this.evaluateAccessPoliciesForDataOperation(iOperation);
                if (this._isAsync(result)) {
                    /*
                    Returning a promise from the event handler ensures the next listener inline doesn't get involed until we're done.
                */
                    var self = this;
                    return result.then(function (value) {
                        if (!self.isDataOperationAuthorized(iOperation)) {
                            failedOperations.push(iOperation);
                            return false;
                        } else {
                            return true;
                        }
                    });
                } else {
                    if (!this.isDataOperationAuthorized(iOperation)) {
                        failedOperations.push(iOperation);
                        return false;
                    } else {
                        return true;
                    }
                }
            },
        },

        /**
         * Returns the first Fail Operation if evaluation is synchronous so we can stop as early as possible
         *
         * @type {Set}
         */
        _evaluateCaptureTransactionOperationAuthorized: {
            value: function (
                transactionOperation,
                operations,
                failedOperations,
                operationAccessPoliciesEvaluationPromises,
                abortAtFirstNonAuthorized
            ) {
                var self = this,
                    i,
                    countI,
                    iOperation,
                    iResult,
                    iFailOperation,
                    iPromise;

                for (i = 0, countI = operations.length; i < countI; i++) {
                    iOperation = operations[i];

                    /*
                    So far, we've been setting the clientId as the WebSocket connectionId given by AWS API Gateway, from the lambda, which saves having to send it back en forth which HTTP connection would have to do.

                    But we're setting that on the appendTransaction operation, which contains others, so to avoid looping on all to do it, we do it as we go.
                */
                    if (!iOperation.clientId) {
                        iOperation.clientId = transactionOperation.clientId;
                    }
                    if (!iOperation.identity) {
                        iOperation.identity = transactionOperation.identity;
                    }
                    if (!iOperation.context) {
                        iOperation.context = transactionOperation.context;
                    }

                    iResult = this.__evaluateCaptureTransactionOperationAuthorized(iOperation, failedOperations);

                    if (this._isAsync(iResult)) {
                        (
                            operationAccessPoliciesEvaluationPromises ||
                            (operationAccessPoliciesEvaluationPromises = [])
                        ).push(
                            (iPromise = iResult.then(function (isAuthorized) {
                                if (!isAuthorized && abortAtFirstNonAuthorized) {
                                    // iFailOperation = self._dispatchTransactionFailedOperationFor(transactionOperation);
                                    throw new Error("Not Authorized");
                                }
                            }))
                        );
                        return iPromise;
                    } else if (!iResult /*isAuthorized*/ && abortAtFirstNonAuthorized) {
                        //iFailOperation = self._dispatchTransactionFailedOperationFor(transactionOperation);
                        return iResult;
                    }
                }

                return true;
            },
        },

        captureAppendTransactionOperation: {
            value: function (appendTransactionOperation) {
                return this.performsAccessControlForTransactionOperation(appendTransactionOperation);
            },
        },

        performsAccessControlForTransactionOperation: {
            value: function (transactionOperation) {
                if (this.performsAccessControl) {
                    /*
                    Returning a promise from the event handler ensures the next listener inline doesn't get involed until we're done.
                */
                    var self = this;
                    return new Promise(function (resolve, reject) {
                        try {
                            var operations = transactionOperation.data.operations,
                                objectDescriptorModuleIds = Object.keys(operations),
                                i,
                                countI,
                                iOperation,
                                iOperationsByType,
                                iResult,
                                isAuthorized,
                                operationAccessPoliciesEvaluationPromises = [],
                                operationAccessPoliciesEvaluationPromise,
                                push = Array.prototype.push,
                                /*
                                For debug purpose this could be turned to false
                            */
                                abortAtFirstNonAuthorized = true,
                                failedOperations = [];

                            /*

                            operations is an object: {
                                "moduleId": {
                                    "createOperations": [],
                                    "updateOperations": [],
                                    "deleteOperations": []
                                }
                            }
                        */

                            for (i = 0, countI = objectDescriptorModuleIds.length; i < countI; i++) {
                                iObjectDescriptorModuleId = objectDescriptorModuleIds[i];
                                iOperationsByType = operations[iObjectDescriptorModuleId];

                                if (iOperationsByType.createOperations) {
                                    isAuthorized = self._evaluateCaptureTransactionOperationAuthorized(
                                        transactionOperation,
                                        iOperationsByType.createOperations,
                                        failedOperations,
                                        operationAccessPoliciesEvaluationPromises,
                                        abortAtFirstNonAuthorized
                                    );
                                    if (
                                        typeof isAuthorized === "boolean" &&
                                        !isAuthorized &&
                                        abortAtFirstNonAuthorized
                                    ) {
                                        break;
                                    }
                                }
                                if (iOperationsByType.updateOperations) {
                                    isAuthorized = self._evaluateCaptureTransactionOperationAuthorized(
                                        transactionOperation,
                                        iOperationsByType.updateOperations,
                                        failedOperations,
                                        operationAccessPoliciesEvaluationPromises,
                                        abortAtFirstNonAuthorized
                                    );
                                    if (
                                        typeof isAuthorized === "boolean" &&
                                        !isAuthorized &&
                                        abortAtFirstNonAuthorized
                                    ) {
                                        break;
                                    }
                                }
                                if (iOperationsByType.mergeOperations) {
                                    isAuthorized = self._evaluateCaptureTransactionOperationAuthorized(
                                        transactionOperation,
                                        iOperationsByType.mergeOperations,
                                        failedOperations,
                                        operationAccessPoliciesEvaluationPromises,
                                        abortAtFirstNonAuthorized
                                    );
                                    if (
                                        typeof isAuthorized === "boolean" &&
                                        !isAuthorized &&
                                        abortAtFirstNonAuthorized
                                    ) {
                                        break;
                                    }
                                }
                                if (iOperationsByType.deleteOperations) {
                                    isAuthorized = self._evaluateCaptureTransactionOperationAuthorized(
                                        transactionOperation,
                                        iOperationsByType.deleteOperations,
                                        failedOperations,
                                        operationAccessPoliciesEvaluationPromises,
                                        abortAtFirstNonAuthorized
                                    );
                                    if (
                                        typeof isAuthorized === "boolean" &&
                                        !isAuthorized &&
                                        abortAtFirstNonAuthorized
                                    ) {
                                        break;
                                    }
                                }
                            }

                            // for(i = 0, countI = operations.length; (i<count); i++) {
                            //     iOperation = operations[i];

                            //     iResult = this.__evaluateCaptureTransactionOperationAuthorized(iOperation, failedOperations);

                            //     if(this._isAsync(iResult)) {
                            //         (operationAccessPoliciesEvaluationPromises || (operationAccessPoliciesEvaluationPromises = [])).push(
                            //             iResult.then(function(isAuthorized) {
                            //                 if(!isAuthorized && abortAtFirstNonAuthorized) {
                            //                     iFailOperation = self._dispatchTransactionFailedOperationFor(transactionOperation);

                            //                     reject(iFailOperation.data);
                            //                 }
                            //             }));

                            //     } else if(!iResult/*isAuthorized*/ && abortAtFirstNonAuthorized ) {
                            //         iFailOperation = self._dispatchTransactionFailedOperationFor(transactionOperation);

                            //         reject(iFailOperation.data);
                            //         break;
                            //     }
                            // }

                            /*
                            If we havent' failed yet with a sync non-authorized, we wait for all promises:
                        */
                            if (typeof isAuthorized !== "boolean") {
                                if (
                                    operationAccessPoliciesEvaluationPromises &&
                                    operationAccessPoliciesEvaluationPromises.length
                                ) {
                                    return Promise.all(operationAccessPoliciesEvaluationPromises)
                                        .then(function () {
                                            if (failedOperations && failedOperations.length > 0) {
                                                if (!self.delegate) {
                                                    iFailOperation =
                                                        self._dispatchTransactionFailedOperationFor(
                                                            transactionOperation
                                                        );
                                                    reject(iFailOperation.data);
                                                } else {
                                                    if (
                                                        self.callDelegateMethod(
                                                            "dataServiceAccessControlFailedForOperations",
                                                            self,
                                                            failedOperations
                                                        )
                                                    ) {
                                                        iFailOperation =
                                                            self._dispatchTransactionFailedOperationFor(
                                                                transactionOperation
                                                            );
                                                        reject(iFailOperation.data);
                                                    } else {
                                                        resolve(true);
                                                    }
                                                }
                                            } else {
                                                resolve(true);
                                            }
                                        })
                                        .catch(function (error) {
                                            if (!self.delegate) {
                                                iFailOperation = self._dispatchTransactionFailedOperationFor(
                                                    transactionOperation,
                                                    error
                                                );
                                                reject(iFailOperation.data);
                                            } else {
                                                if (
                                                    self.callDelegateMethod(
                                                        "dataServiceAccessControlFailedForOperations",
                                                        self,
                                                        failedOperations
                                                    )
                                                ) {
                                                    iFailOperation = self._dispatchTransactionFailedOperationFor(
                                                        transactionOperation,
                                                        error
                                                    );
                                                    reject(iFailOperation.data);
                                                } else {
                                                    resolve(true);
                                                }
                                            }
                                        });
                                } else {
                                    if (!self.delegate) {
                                        iFailOperation = self._dispatchTransactionFailedOperationFor(
                                            transactionOperation,
                                            new Error("Unauthorized")
                                        );
                                        reject(iFailOperation.data);
                                    } else {
                                        if (
                                            self.callDelegateMethod(
                                                "dataServiceAccessControlFailedForOperations",
                                                self,
                                                failedOperations
                                            )
                                        ) {
                                            iFailOperation = self._dispatchTransactionFailedOperationFor(
                                                transactionOperation,
                                                new Error("Unauthorized")
                                            );
                                            reject(iFailOperation.data);
                                        } else {
                                            resolve(true);
                                        }
                                    }
                                }
                            }
                        } catch (error) {
                            iFailOperation = self._dispatchTransactionFailedOperationFor(transactionOperation, error);
                            reject(error);
                        }
                    });
                }
            },
        },

        capturePerformTransactionOperation: {
            value: function (performTransactionOperation) {
                return this.performsAccessControlForTransactionOperation(performTransactionOperation);
            },
        },

        captureCreateOperation: {
            value: function (readOperation) {},
        },

        accessPoliciesForDataOperation: {
            value: function (dataOperation) {
                return this.accessPolicies;

                if (!this.__accessPoliciesByObjectDescriptor) {
                    this._registerAccessPoliciesByObjectDescriptor(this._accessPolicies);
                }

                var accessPolicies = this._accessPoliciesByObjectDescriptor.get(dataOperation.target);

                return accessPolicies ? accessPolicies : null;
            },
        },
        /**
         * Assess wether a DataService (and it's children data services can perform an operation.
         *
         * Implemented by default by delegating to DataAccessPolicy
         * @method
         * @argument {DataOperation} authorizeConnectionOperation
         * @returns {Promise} - A promise fulfilled with a boolean value.
         *
         */

        //isDataOperationAuthorized:
        isDataOperationAuthorized: {
            value: function (dataOperation) {
                return dataOperation.isAuthorized;
            },
        },

        authorizesDataOperationsWithoutAccessPolicy: {
            value: false,
        },

        _evaluatedAccessPoliciesByDataOperation: {
            value: new WeakMap(),
        },
        evaluateAccessPoliciesForDataOperation: {
            value: function (dataOperation) {
                var evaluationResult = this._evaluatedAccessPoliciesByDataOperation.get(dataOperation);

                if (!evaluationResult) {
                    evaluationResult = this._evaluateAccessPoliciesForDataOperation(dataOperation);

                    this._evaluatedAccessPoliciesByDataOperation.set(dataOperation, evaluationResult);
                }

                return evaluationResult;
            },
        },

        _evaluateAccessPoliciesForDataOperation: {
            value: function (dataOperation) {
                //console.log("evaluateAccessPoliciesForDataOperation "+dataOperation.type+" "+dataOperation.target.name,dataOperation);

                // var shouldEvaluateAccessPoliciesForDataOperation = this.callDelegateMethod("dataServiceShouldEvaluateAccessPoliciesForDataOperation", this, dataOperation);

                // if(shouldEvaluateAccessPoliciesForDataOperation === undefined) {
                //     shouldEvaluateAccessPoliciesForDataOperation = dataOperation.clientId && !this.currentEnvironment.isNode;
                // }
                //Let's try that if an operation is coming from inside the DataWorker, it's authorized.
                // if(!shouldEvaluateAccessPoliciesForDataOperation) {
                if (!dataOperation.clientId && this.currentEnvironment.isNode) {
                    return Promise.resolve((dataOperation.isAuthorized = true));
                } else {
                    var accessPolicies = this.accessPoliciesForDataOperation(dataOperation);

                    if (!accessPolicies || (accessPolicies && accessPolicies.length === 0)) {
                        console.log(
                            "accessPolicies: this.authorizesDataOperationsWithoutAccessPolicy is ",
                            this.authorizesDataOperationsWithoutAccessPolicy
                        );
                        return Promise.resolve(
                            (dataOperation.isAuthorized = this.authorizesDataOperationsWithoutAccessPolicy)
                        );
                    } else {
                        var i,
                            countI,
                            iAccessPolicy,
                            iAccessPolicyEvaluation,
                            iAccessPolicyEvaluationPromises,
                            self = this;

                        for (i = 0, countI = accessPolicies ? accessPolicies.length : 0; i < countI; i++) {
                            iAccessPolicy = accessPolicies[i];
                            iAccessPolicyEvaluation = iAccessPolicy.evaluate(dataOperation);

                            if (this._isAsync(iAccessPolicyEvaluation)) {
                                (iAccessPolicyEvaluationPromises || (iAccessPolicyEvaluationPromises = [])).push(
                                    iAccessPolicyEvaluation
                                );
                            }

                            /* If sync so far... */
                            if (!iAccessPolicyEvaluationPromises && !this.isDataOperationAuthorized(dataOperation)) {
                                return Promise.resolve(false);
                            }
                        }

                        if (iAccessPolicyEvaluationPromises && iAccessPolicyEvaluationPromises.length > 0) {
                            return Promise.all(iAccessPolicyEvaluationPromises).then(function () {
                                return self.isDataOperationAuthorized(dataOperation);
                            });
                        } else {
                            //whatever the rules do, they set a state on the dataOperation, so nothing to resolve.
                            return Promise.resolve(this.isDataOperationAuthorized(dataOperation));
                        }
                    }
                }
            },
        },

        /**
         * Answers wether logged-in application user can create a DataObject.
         *
         * Services overriding the (plural)
         * @method
         * @argument {ObjectDescriptor} dataObjectDescriptor
         * @returns {Promise} - A promise fulfilled with a boolean value.
         *
         */
        canUserCreateDataObject: {
            value: function (dataObjectDescriptor) {
                /*
                TODO: implement by leveraging Expression Based Access Control mapping/rules if available
            */
                return Promise.resolve(true);
            },
        },

        /**
         * Answers wether logged-in application user can edit/update? a DataObject.
         *
         * Services overriding the (plural)
         * @method
         * @argument {Object} dataObject
         * @returns {Promise} - A promise fulfilled with a boolean value.
         *
         */
        canUserEditDataObject: {
            value: function (dataObject) {
                /*
                return this.canPerfomDataOperation(DataOperation.toUpdateDataObject(dataObject));
            */
                return Promise.resolve(true);
            },
        },
        canUserDeleteDataObject: {
            value: function (dataObject) {
                /*
                	return this.canPerfomDataOperation(DataOperation.toDeleteDataObject(dataObject));
            */
                return Promise.resolve(true);
            },
        },

        objectStoreCreateOperationForObjectDescriptor: {
            value: function (objectDescriptor) {
                var iOperation = new DataOperation();

                iOperation.type = DataOperation.Type.CreateOperation;
                iOperation.data = objectDescriptor;
                iOperation.target = ObjectStoreDescriptor;
                iOperation.rawDataService = this;

                return iOperation;
            },
        },

        objectPropertyStoreCreateOperationForPropertyDescriptor: {
            value: function (propertyDescriptor, objectDescriptor) {
                var iOperation = new DataOperation();

                iOperation.type = DataOperation.Type.CreateOperation;
                iOperation.data = {
                    propertyDescriptor: propertyDescriptor,
                    objectDescriptor: objectDescriptor,
                };
                iOperation.target = ObjectPropertyStoreDescriptor;
                iOperation.rawDataService = this;

                return iOperation;
            },
        },

        // responseOperationForCreateStorageOperation: {
        //     value: function (createOperation, err, data) {

        //     }
        // },

        /*
        WIP: now that we use the ObjectStore object descriptor as the target for objectstore creation,
        we can clean up. However, since the objectDescriptor is now the data of the CreateCompletedOperation,
        if it fails, the data of the CreateFailedOperation would be the error. Right now, we just return the error
        from the raw layer, but we can and should create our own Erro so we can pass the objectDescriptor
    */
        handleObjectStoreCreateCompletedOperation: {
            value: function (operation) {
                if (operation.rawDataService === this) {
                    this._objectDescriptorStoreExistsCache.set(operation.data, true);
                    operation.resolveCompletionPromise?.(operation);
                }
            },
        },

        handleObjectStoreCreateFailedOperation: {
            value: function (operation) {
                if (operation.rawDataService === this) {
                    this._objectDescriptorStoreExistsCache.set(operation.data.objectDescriptor, operation.data);
                    operation.rejectCompletionPromise?.(operation);
                }
            },
        },

        registerForObjectStoreCreateOperation: {
            value: function () {
                this.addEventListener(DataOperation.Type.CreateCompletedOperation, this, false);
                this.addEventListener(DataOperation.Type.CreateFailedOperation, this, false);
            },
        },
        unregisterForObjectStoreCreateOperation: {
            value: function () {
                this.removeEventListener(DataOperation.Type.CreateCompletedOperation, this, false);
                this.removeEventListener(DataOperation.Type.CreateFailedOperation, this, false);
            },
        },

        createObjectStoreForObjectDescriptor: {
            value: function (objectDescriptor) {
                //console.log("create "+objectDescriptor.name);
                var iOperation = this.createObjectStoreOperationForObjectDescriptor(objectDescriptor),
                    self = this;

                var createPromise = new Promise(function (resolve, reject) {
                    iOperation.resolveCompletionPromise = resolve;
                    iOperation.rejectCompletionPromise = reject;

                    /*
                    The reason we're creating anonymous event handlers like this is that we're missing the semantic of having a "RawObjectDescriptor"
                    that should be the target of this operation, which would mean that we could implement handleCreateCompletedOperation() and
                    handleCreateFailedOperation() to handles propagation would deliver the relevant operations to us.
                    So if a subclass needed to do something to handle a failure, it would only have to override the handleCreateFailedOperation() method,
                    before callig super here that would then take care of the promise aspect.
                */

                    // function createCompletedHandler(operation) {
                    //     if(operation.referrerId === iOperation.id) {
                    //         cleanupdHandlers();
                    //         self._objectDescriptorStoreExistsCache.set(objectDescriptor,true);
                    //         resolve(operation);
                    //     }
                    // };

                    // function createFailedHandler(operation) {
                    //     if(operation.referrerId === iOperation.id) {
                    //         cleanupdHandlers();
                    //         self._objectDescriptorStoreExistsCache.set(objectDescriptor,operation.data);
                    //         reject(operation.data);
                    //     }
                    // };

                    // function cleanupdHandlers() {
                    //     self.removeEventListener(DataOperation.Type.CreateCompletedOperation,createCompletedHandler, false);
                    //     self.removeEventListener(DataOperation.Type.createFailedHandler,createCompletedHandler, false);
                    // };

                    self.registerForObjectStoreCreateOperation();
                    // self.addEventListener(DataOperation.Type.CreateCompletedOperation, createCompletedHandler, false);
                    // self.addEventListener(DataOperation.Type.CreateFailedOperation, createFailedHandler, false);

                    iOperation.target.dispatchEvent(iOperation);
                });

                return createPromise;
            },
        },

        __objectDescriptorStoreExistsCache: {
            value: undefined,
        },
        _objectDescriptorStoreExistsCache: {
            get: function () {
                return this.__objectDescriptorStoreExistsCache || (this.__objectDescriptorStoreExistsCache = new Map());
            },
        },

        createObjectStoreForObjectDescriptorIfNeeded: {
            value: function (type) {
                var objectDescriptor = this.objectDescriptorForType(type),
                    cachedValue =
                        this._objectDescriptorStoreExistsCache &&
                        this._objectDescriptorStoreExistsCache.get(objectDescriptor),
                    self = this;

                if (cachedValue !== undefined) {
                    return Promise.is(cachedValue) ? cachedValue : Promise.resolve(cachedValue);
                } else {
                    var query = DataQuery.withTypeAndCriteria(objectDescriptor),
                        queryPromise;

                    //console.log("PlummingIntakeDataService _createObjectDescriptorStoreForTypeIfNeeded() --> fetchData to see if "+objectDescriptor.name+ " table exists");

                    query.sizeLimit = 1;

                    queryPromise = this.fetchData(query).then(
                        (result) => {
                            //console.log("PlummingIntakeDataService _createObjectDescriptorStoreForTypeIfNeeded() --> "+objectDescriptor.name+ " table exists");
                            this._objectDescriptorStoreExistsCache.set(objectDescriptor, false);
                            return false;
                        },
                        (error) => {
                            if (error.name === DataOperationErrorNames.ObjectDescriptorStoreMissing) {
                                return self
                                    .createObjectStoreForObjectDescriptor(objectDescriptor)
                                    .then(() => {
                                        // console.log("mainService.createObjectStoreForObjectDescriptor("+objectDescriptor.name+") COMPLETED!");
                                        // self._objectDescriptorStoreExistsCache.set(objectDescriptor,true);
                                        return true;
                                    })
                                    .catch((error) => {
                                        console.error(
                                            "mainService.createObjectStoreForObjectDescriptor(" +
                                                objectDescriptor.name +
                                                ") Error!",
                                            error
                                        );
                                        // self._objectDescriptorStoreExistsCache.set(objectDescriptor,error);
                                        return Promise.reject(error);
                                    });
                            } else {
                                //That moved into createObjectStoreForObjectDescriptor(), we shouldn't keep that here
                                self._objectDescriptorStoreExistsCache.set(objectDescriptor, error);
                                return Promise.reject(error);
                            }
                        }
                    );

                    this._objectDescriptorStoreExistsCache.set(objectDescriptor, queryPromise);

                    return queryPromise;
                }
            },
        },

        /***************************************************************************
         * Utilities
         */

        /**
         * A function that does nothing but returns null, useful for terminating
         * a promise chain that needs to return null, as in the following code:
         *
         *     var self = this;
         *     return this.fetchSomethingAsynchronously().then(function (data) {
         *         return self.doSomethingAsynchronously(data.part);
         *     }).then(this.nullFunction);
         *
         * @type {function}
         */
        nullFunction: {
            value: function () {
                return null;
            },
        },

        /**
         * A shared promise resolved with a value of
         * `null`, useful for returning from methods like
         * [fetchObjectProperty()]{@link DataService#fetchObjectProperty}
         * when the requested data is already there.
         *
         * @type {external:Promise}
         */
        nullPromise: {
            get: function () {
                if (!exports.DataService._nullPromise) {
                    exports.DataService._nullPromise = Promise.resolve(null);
                }
                return exports.DataService._nullPromise;
            },
        },

        _nullPromise: {
            value: undefined,
        },

        /**
         * @todo Document.
         */
        emptyArrayPromise: {
            get: function () {
                if (!exports.DataService._emptyArrayPromise) {
                    exports.DataService._emptyArrayPromise = Promise.resolve([]);
                }
                return exports.DataService._emptyArrayPromise;
            },
        },

        _emptyArrayPromise: {
            value: undefined,
        },
        _emptyArray: {
            value: Object.freeze([]),
        },

        /**
         * A possibly shared promise resolved in the next cycle of the event loop
         * or soon thereafter, at which point the current event handling will be
         * complete. This is useful for services that need to buffer up actions so
         * they're committed only once in a given event loop.
         *
         * @type {external:Promise}
         */
        eventLoopPromise: {
            get: function () {
                var self = this;
                if (!this._eventLoopPromise) {
                    this._eventLoopPromise = new Promise(function (resolve, reject) {
                        setTimeout(function () {
                            self._eventLoopPromise = undefined;
                            resolve();
                        }, 0);
                    });
                }
                return this._eventLoopPromise;
            },
        },

        /**
         * Splice an array into another array.
         *
         * @method
         * @argument {Array} array   - The array to modify.
         * @argument {Array} insert  - The items to splice into that array.
         * @argument {number} index  - The index at which to splice those items, by
         *                             default `0`.
         * @argument {number} length - The number of items of the original array to
         *                             replace with items from the spliced array, by
         *                             default `array.length`.
         */
        spliceWithArray: {
            value: function (array, insert, index, length) {
                index = index || 0;
                length = length || length === 0 ? length : Infinity;
                return insert ? array.splice.apply(array, [index, length].concat(insert)) : array.splice(index, length);
            },
        },

        /**
         * Returns by default an array the Locale.systemLocale
         * Subclasses have the opporyunity to oveorrides to get useLocale
         * from more specific data objects (DO)
         *
         * @property Array {Locale}
         */

        _userLocales: {
            value: undefined,
        },

        userLocales: {
            get: function () {
                return this.isRootService
                    ? this._userLocales || ((this._userLocales = [Locale.systemLocale]) && this._userLocales)
                    : this.rootService.userLocales;
            },
            set: function (value) {
                if (value !== this._userLocales) {
                    this._userLocales = value;
                }
            },
        },

        _userLocalesCriteria: {
            value: undefined,
        },

        userLocalesCriteria: {
            get: function () {
                return this.isRootService
                    ? this._userLocalesCriteria || (this._userLocalesCriteria = this._createUserLocalesCriteria())
                    : this.rootService.userLocalesCriteria;
            },
            set: function (value) {
                if (value !== this._userLocalesCriteria) {
                    this._userLocalesCriteria = value;
                }
            },
        },

        _createUserLocalesCriteria: {
            value: function () {
                return new Criteria().initWithExpression("locales == $DataServiceUserLocales", {
                    DataServiceUserLocales: this.userLocales,
                });
            },
        },

        handleUserLocalesChange: {
            value: function (value, key, object) {
                this.userLocalesCriteria = this._createUserLocalesCriteria();
            },
        },

        handleUserLocalesRangeChange: {
            value: function (plus, minus) {
                this.userLocalesCriteria = this._createUserLocalesCriteria();
            },
        },

        /**
         * Returns the locales for a specific object's locale. Default implementation
         * returns userLocales. Subclasses can override to offer a per-object
         * localization to be different than the session's one.
         * Subclasses have the opporyunity to oveorrides to get useLocale
         * from more specific data objects (DO)
         *
         * @returns Array{Locale}
         */

        localesForObject: {
            value: function (object) {
                return object.locales || this.userLocales;
            },
        },

        /**
         * Returns a criteria the locales for a specific object. Default implementation
         * returns userLocales. Subclasses can override to offer a per-object
         * localization to be different than the session's one.
         * Subclasses have the opporyunity to oveorrides to get useLocale
         * from more specific data objects (DO)
         *
         * @returns Array{Locale}
         */

        localesCriteriaForObject: {
            value: function (object) {
                return this.userLocalesCriteria;
            },
        },

        /**
         * The DataTrigger class used by the montage data stack
         *
         * @property {DataTrigger}
         */

        DataTrigger: {
            value: DataTrigger,
        },
    },
    /** @lends DataService */ {
        /***************************************************************************
         * Service Hierarchy
         */

        /**
         * A reference to the application's main service.
         *
         * Applications typically have one and only one
         * [root service]{@link DataService#rootService} to which all data requests
         * are sent, and this is called the application's main service. That service
         * can in turn delegate handling of different types of data to child
         * services specialized by type.
         *
         * This property will be set automatically if the {@link DataService}
         * constructor is called and if the first service created is either the
         * main service or a descendent of the main service.
         *
         * @type {DataService}
         */
        mainService: {
            get: function () {
                if (this._mainService && this._mainService.parentService) {
                    this._mainService = this._mainService.rootService;
                }
                return this._mainService;
            },
            set: function (service) {
                //console.debug("mainService set: ",service);
                this._mainService = service;
                if (service) {
                    service.isMainService = true;
                }
            },
        },

        /***************************************************************************
         * Authorization
         */

        AuthorizationPolicyType: {
            value: AuthorizationPolicyType,
        },

        AuthorizationPolicy: {
            value: AuthorizationPolicy,
        },

        authorizationManager: {
            value: AuthorizationManager,
        },

        /***************************************************************************
         * Debugging
         */

        debugProperties: {
            value: new Set(),
        },
    }
);

DataService.defineBinding("mainService", { "<-": "application.mainService", source: defaultEventManager });

//WARNING Shouldn't be a problem, but avoiding a potential require-cycle for now:
DataStream.DataService = exports.DataService;


/******
 * Tracks the changes to a collection between saves
 */

function CollectionChanges() {}
Object.defineProperties(CollectionChanges.prototype, {


    /***
     *  The ids of the Change Events recorded in this object
     *   @property {Set}
    ***/
    _trackedEventIds: {
        get: function () {
            return this.__trackedEventIds || (this.__trackedEventIds = new Set());
        }
    },

    /***
     *  The ordered changes for the tracked collection. The structure of each item in this array will change
     *  based on the type of collection being tracked. 
     * 
     * Array: 
     *  {
     *    index: integer
     *    addedValues: Array
     *    removedValues: Array
     *  }
     * 
     * Set: (no current use case)
     *  {
     *    addedValues: Set
     *    removedValues: Set
     *  }
     * 
     *  Map: (no current use case)
     *  {
     *    addedValues: Array -- [{key: key, value: value}]
     *    removedValues: Array
     *  }
     *   @property {Array}
    ***/
    changes: {
        get: function () {
            return this._changes || (this._changes = []);
        }
    },

    hasChanges: {
        get: function () {

            //FIXME: Use/test this._changes?.length > 0
            return this._changes && this._changes.length > 0;
        }
    },

    /***
     *  All values added to the collection
     *   @property {Set}
    ***/
    addedValues: {
        get: function () {
            return this._addedValues || (this._addedValues = new Set());
        }
    },

    /***
     *  Returns whether any values have been added or removed
     *   @property {Set}
    ***/
    hasAddedOrRemovedValues: {
        get: function () {
            //FIXME: Use/test this._changes?.length > 0
            return (this._addedValues && this._addedValues.size > 0) || (this._removedValues && this._removedValues.size > 0);
        }
    },

    /***
     *  All values removed from the collection
     *   @property {Set}
    ***/
    removedValues: {
        get: function () {
            return this._removedValues || (this._removedValues = new Set());
        }
    },

    /***
     *  Add an entry to the changes array for a given change event
     * 
     * This could be updated to:
     * - Add values to addedValues
     * - Add values to removedValues
     * - Check the type of the property to add an object with the correct structure to changes
    ***/
    trackChangeEvent: {
        value: function (changeEvent) {
            if (!this._trackedEventIds.has(changeEvent.id)) {
                this._trackedEventIds.add(changeEvent.id);
                this.changes.push({
                    index: changeEvent.index,
                    addedValues: changeEvent.addedValues,
                    removedValues: changeEvent.removedValues
                })
            }
        }
    }

})
