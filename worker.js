/*jshint node:true, worker:false */
/*global importScripts, self */

var worker,
    globalEval = self.eval;

(function (root, factory) {
    root.ModWorker = factory({}, {}, {});
}(this, function (require, exports, module) {
    var global = typeof globalThis !== "undefined" ? globalThis : self;

    function fetchText(request) {
        return self.fetch(request).then(function (response) {
            var status = response.status,
                isSuccess = status === 0 || status === 200,
                canReturnEmpty = status === 200;

            return isSuccess ? response.text().then(function (text) {
                return canReturnEmpty ? text :
                       text           ? text :
                                        null;
            }) : null;
        });
    }

    function read(request) {
        return fetchText(request).then(function (text) {
            if (text === null) {
                throw new Error("Can't fetch " + JSON.stringify(request));
            }
            return text;
        });
    }

    function loadModule(config, location, module) {
        return config.read(location, module).then(function (text) {
            if (module.type === undefined) {
                module.type = "javascript";
            }
            if (module.text === undefined) {
                module.text = text;
            }
            if (module.location === undefined) {
                module.location = location;
            }
        });
    }

    var DoubleUnderscore = "__",
        Underscore = "_",
        globalEvalConstantA = "(function ",
        globalEvalConstantB = "(require, exports, module, global) {",
        globalEvalConstantC = "//*/\n})\n//# sourceURL=",
        globalConcatenator = [globalEvalConstantA, undefined, globalEvalConstantB, undefined, globalEvalConstantC, undefined],
        nameRegex = /[^\w\d]/g,
        supportsTemplateLiterals = false;

    try {
        eval("`foo`");
        supportsTemplateLiterals = true;
    } catch (e) {
    }

    function compiler(config) {
        return function (module) {
            var displayName;

            if (module.location && module.location.endsWith(".mjson")) {
                return module;
            }
            if (module.factory || module.text === void 0) {
                return module;
            }
            if (config.useScriptInjection) {
                throw new Error("Can't use eval.");
            }

            if (!supportsTemplateLiterals) {
                globalConcatenator[1] = [DoubleUnderscore, module.require.config.name, Underscore, module.id].join("").replace(nameRegex, Underscore);
                globalConcatenator[3] = module.text;
                globalConcatenator[5] = module.location;

                module.factory = globalEval(globalConcatenator.join(""));
                module.factory.displayName = globalConcatenator[1];
                module.text = globalConcatenator[1] = globalConcatenator[3] = globalConcatenator[5] = null;
            } else {
                displayName = (DoubleUnderscore + module.require.config.name + Underscore + module.id).replace(nameRegex, Underscore);
                module.factory = globalEval(globalEvalConstantA + displayName + globalEvalConstantB + module.text + globalEvalConstantC + module.location);
                module.factory.displayName = displayName;
            }

            return module;
        };
    }

    worker = {

        makeResolve: function () {
            try {
                var testHost = "http://example.org",
                    testPath = "/test.html",
                    resolved = new URL(testPath, testHost).href;

                if (!resolved || resolved !== testHost + testPath) {
                    throw new Error("NotSupported");
                }

                return function (base, relative) {
                    return new URL(relative, base).href;
                };
            } catch (err) {
                return function (base, relative) {
                    return base + relative;
                };
            }
        },

        read: read,

        load: function (location, loadCallback) {
            this.read(location).then(function (text) {
                globalEval(text);
                if (loadCallback) {
                    loadCallback(location);
                }
            });
        },

        _callListenerWithEvent:function (listener, event) {
            if (typeof listener === "function") {
                listener(event);
            } else if (listener.handleEvent) {
                listener.handleEvent(event);
            } else {
                console.warn("Worker platform could not call listener for event", event.type, listener);
            }
        },

        _initializeGlobalListeners: function () {
            var self = this,
                globalEvents = ["activate", "install", "message", "offline", "online", "periodicsync", "sync"],
                nativeAddEventListener = global.addEventListener;

            global.__ModGlobalListeners__ = new Map();
            global.__ModGlobalEventsDispatched__ = new Map();

            globalEvents.forEach(function (eventName) {
                self._initializeGlobalListener(eventName);
            });

            function addEventListenerWrapper() {
                var eventName = arguments[0],
                    handler = arguments[1],
                    events = global.__ModGlobalEventsDispatched__.has(eventName) && global.__ModGlobalEventsDispatched__.get(eventName);

                if (events && Array.isArray(events)) {
                    events.forEach(function (event) {
                        self._callListenerWithEvent(handler, event);
                    });
                    global.__ModGlobalEventsDispatched__.set(eventName, null);
                }
                if (global.__ModGlobalListeners__.has(eventName)) {
                    global.__ModGlobalListeners__.get(eventName).push(handler);
                } else {
                    return nativeAddEventListener.apply(global, arguments);
                }
            }

            try {
                Object.defineProperty(global, "addEventListener", {
                    value: addEventListenerWrapper
                });
            } catch (error) {
                global.addEventListener = addEventListenerWrapper;
            }
        },

        _initializeGlobalListener: function (eventName) {
            var self = this;
            global.__ModGlobalListeners__.set(eventName, []);
            global.addEventListener(eventName, function (event) {
                var listeners = global.__ModGlobalListeners__.get(eventName);
                if (!global.__ModGlobalEventsDispatched__.has(eventName)) {
                    global.__ModGlobalEventsDispatched__.set(eventName, [event]);
                } else if (Array.isArray(global.__ModGlobalEventsDispatched__.get(eventName))) {
                    global.__ModGlobalEventsDispatched__.get(eventName).push(event);
                }
                listeners.forEach(function (listener) {
                    self._callListenerWithEvent(listener, event);
                });
            });
        },

        getParams: function () {
            var path;
            if (!this._params) {
                if (self.MontageParams) {
                    this._params = Object.assign({}, self.MontageParams);
                } else {
                    path = self.PATH_TO_MOD || self.PATH_TO_MONTAGE;
                    if (!path) {
                        path = self.registration.scope.replace(/[^\/]*\.html$/, "");
                        path = path.replace(/[^\/]*\/?$/, "");
                    }
                    this._params = {
                        montageLocation: path
                    };
                }
            }
            return this._params;
        },

        bootstrap: function (callback) {
            var params = this.getParams(),
                resolve = this.makeResolve(),
                applicationPath = resolve(global.location.href, "./"),
                pending = {
                    "require": "core/mr/require.js"
                },
                definitions = {},
                bootModules = {};

            this._initializeGlobalListeners();

            if (typeof self.skipWaiting === "function") {
                self.addEventListener("install", function () {
                    self.skipWaiting();
                });
            }

            function bootRequire(id) {
                if (!bootModules[id] && definitions[id]) {
                    var moduleExports = bootModules[id] = {};
                    bootModules[id] = definitions[id](bootRequire, moduleExports) || moduleExports;
                }
                return bootModules[id];
            }

            function allModulesLoaded() {
                var URL = bootRequire("mini-url"),
                    Promise = bootRequire("promise"),
                    Require = bootRequire("require");

                exports.Require = Require;
                Require.read = worker.read;
                Require.Compiler = compiler;
                Require.overlays = ["worker", "browser", "mod", "montage"];
                Require.makeLoader = function (config) {
                    return Require.ModLoader(config,
                        Require.MappingsLoader(
                            config,
                            Require.LocationLoader(
                                config,
                                Require.MemoizedLoader(
                                    config,
                                    loadModule.bind(null, config)
                                )
                            )
                        )
                    );
                };
                Require.getLocation = function () {
                    return applicationPath;
                };
                delete global.bootstrap;
                callback(Require, Promise, URL);
            }

            global.bootstrap = function (id, factory) {
                definitions[id] = factory;
                delete pending[id];
                for (id in pending) {
                    if (pending.hasOwnProperty(id)) {
                        return;
                    }
                }
                allModulesLoaded();
            };

            var promiseLocation = params.promiseLocation ?
                    resolve(global.location.href, params.promiseLocation) :
                    resolve(global.location.href, "../node_modules/bluebird/js/browser/bluebird.min.js"),
                modLocation = resolve(global.location.href, params.montageLocation);

            worker.load(promiseLocation, function () {
                global.bootstrap("bluebird", function () {
                    return global.Promise;
                });
                global.bootstrap("promise", function () {
                    return global.Promise;
                });
                global.bootstrap("../promise", function () {
                    return {Promise: global.Promise};
                });
                global.bootstrap("mini-url", function (require, exports) {
                    exports.resolve = resolve;
                });
                worker.load(resolve(modLocation, pending.require));
            });
        },

        initMontage: function (montageRequire, applicationRequire, params) {
            var dependencies = [
                    "core/core",
                    "core/promise",
                    "core/event/event-manager",
                    "core/serialization/deserializer/montage-reviver",
                    "core/logger"
                ],
                Promise = global.Promise,
                deepLoadPromises = [],
                i,
                dependency;

            for (i = 0; (dependency = dependencies[i]); i++) {
                deepLoadPromises.push(montageRequire.deepLoad(dependency));
            }

            if (typeof Promise.onPossiblyUnhandledRejection === "function") {
                Promise.onPossiblyUnhandledRejection(function (e) {
                    console.warn("[Bluebird] Unhandled Rejection: " + e.message);
                    console.warn(e);
                });
            }

            return Promise.all(deepLoadPromises).then(function () {
                var defaultEventManager,
                    MontageDeserializer,
                    MontageReviver,
                    application,
                    appProto,
                    applicationLocation,
                    appModulePromise;

                for (i = 0; (dependency = dependencies[i]); i++) {
                    montageRequire(dependency);
                }

                defaultEventManager = montageRequire("core/event/event-manager").defaultEventManager;
                MontageDeserializer = montageRequire("core/serialization/deserializer/montage-deserializer").MontageDeserializer;
                MontageReviver = montageRequire("core/serialization/deserializer/montage-reviver").MontageReviver;

                exports.MontageDeserializer = MontageDeserializer;

                if (typeof global.montageWillLoad === "function") {
                    global.montageWillLoad();
                }

                appProto = applicationRequire.packageDescription.workerApplicationPrototype;
                if (appProto) {
                    applicationLocation = MontageReviver.parseObjectLocationId(appProto);
                    appModulePromise = applicationRequire.async(applicationLocation.moduleId);
                } else {
                    appModulePromise = montageRequire.async("core/worker-application");
                }

                return appModulePromise.then(function (moduleExports) {
                    var WorkerApplication = moduleExports[(applicationLocation ? applicationLocation.objectName : "WorkerApplication")];
                    application = new WorkerApplication();
                    defaultEventManager.application = application;
                    application.eventManager = defaultEventManager;

                    return application._load(applicationRequire, function () {
                        if (params.module) {
                            applicationRequire.async(params.module);
                        }
                        if (typeof global.montageDidLoad === "function") {
                            global.montageDidLoad();
                        }
                    });
                });
            });
        }
    };

    global.worker = worker;

    exports.compileMJSONFile = function (mjson, require, moduleId) {
        var deserializer = new exports.MontageDeserializer();
        deserializer.init(mjson, require, void 0, require.location + moduleId);
        return deserializer.deserializeObject();
    };

    return exports;
}));
