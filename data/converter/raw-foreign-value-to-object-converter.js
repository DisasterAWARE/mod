var RawValueToObjectConverter = require("./raw-value-to-object-converter").RawValueToObjectConverter,
    Criteria = require("../../core/criteria").Criteria,
    DataQuery = require("../model/data-query").DataQuery,
    Map = require("../../core/collections/map").Map,
    syntaxProperties = require("../../core/frb/syntax-properties"),
    Uuid = require("core/uuid").Uuid,
    Promise = require("../../core/promise").Promise;
/**
 * @class RawForeignValueToObjectConverter
 * @classdesc Converts a property value of raw data to the referenced object.
 * @extends RawValueToObjectConverter
 */
exports.RawForeignValueToObjectConverter = RawValueToObjectConverter.specialize( /** @lends RawForeignValueToObjectConverter# */ {

    canConvertValueArray: {
        value: true
    },

    canRevertValueArray: {
        value: true
    },

    /*********************************************************************
     * Serialization
     */

    serializeSelf: {
        value: function (serializer) {

            this.super(serializer);

            serializer.setProperty("combinesFetchData", this.combinesFetchData);
            

        }
    },

    deserializeSelf: {
        value: function (deserializer) {

            this.super(deserializer);

            var value = deserializer.getProperty("combinesFetchData");
            if (value !== undefined) {
                this.combinesFetchData = value;
            }
        }
    },

    /*
        cache:

        Map: ObjectDescriptor -> Map: criteriaExpression -> Map: JSON.stringify(criteria.parameters) -> Promise

    */
    _fetchPromiseByObjectDescriptorByCriteriaExpressionByCriteriaParameters: {
        value: new Map()
    },

    _fetchPromiseMapForObjectDescriptor: {
        value: function(objectDescriptor) {
            var map = this._fetchPromiseByObjectDescriptorByCriteriaExpressionByCriteriaParameters.get(objectDescriptor);
            if(!map) {
                map = new Map();
                this._fetchPromiseByObjectDescriptorByCriteriaExpressionByCriteriaParameters.set(objectDescriptor,map);
            }
            return map;
        }
    },

    _fetchPromiseMapForObjectDescriptorCriteria: {
        value: function(objectDescriptor, criteria) {
            var objectDescriptorMap = this._fetchPromiseMapForObjectDescriptor(objectDescriptor),
                criteriaExpressionMap = objectDescriptorMap.get(criteria.expression);
            if(!criteriaExpressionMap) {
                criteriaExpressionMap = new Map();
                objectDescriptorMap.set(criteria.expression,criteriaExpressionMap);
            }
            return criteriaExpressionMap;
        }
    },

    _registeredFetchPromiseMapForObjectDescriptorCriteria: {
        value: function(objectDescriptor, criteria) {
            var criteriaExpressionMap = this._fetchPromiseMapForObjectDescriptorCriteria(objectDescriptor,criteria),
                parametersKey = typeof criteria.parameters === "string" ? criteria.parameters : JSON.stringify(criteria.parameters);

            return criteriaExpressionMap.get(parametersKey);
        }
    },

    _registerFetchPromiseForObjectDescriptorCriteria: {
        value: function(fetchPromise, objectDescriptor, criteria) {
            var criteriaExpressionMap = this._fetchPromiseMapForObjectDescriptorCriteria(objectDescriptor,criteria),
                parametersKey = typeof criteria.parameters === "string" ? criteria.parameters : JSON.stringify(criteria.parameters);

            return criteriaExpressionMap.set(parametersKey,fetchPromise);
        }
    },
    _unregisterFetchPromiseForObjectDescriptorCriteria: {
        value: function(objectDescriptor, criteria) {
            var criteriaExpressionMap = this._fetchPromiseMapForObjectDescriptorCriteria(objectDescriptor,criteria),
            parametersKey = typeof criteria.parameters === "string" ? criteria.parameters : JSON.stringify(criteria.parameters);

            return criteriaExpressionMap.delete(parametersKey);
        }
    },
    __areCriteriaSyntaxPropertiesRawDataPrimaryKeys: {
        value: undefined
    },
    _areCriteriaSyntaxPropertiesRawDataPrimaryKeys: {
        value: function(typeToFetch, criteria, service) {
            if(this.__areCriteriaSyntaxPropertiesRawDataPrimaryKeys === undefined) {
                this.__areCriteriaSyntaxPropertiesRawDataPrimaryKeys = service.areCriteriaSyntaxPropertiesRawDataPrimaryKeys(typeToFetch, criteria);
            }
            return this.__areCriteriaSyntaxPropertiesRawDataPrimaryKeys
        }
    },
    _lookupExistingObjectForObjectDescriptorCriteria: {
        value: function(typeToFetch, criteria, service) {
            return service.objectWithDescriptorMatchingRawDataPrimaryKeyCriteria(typeToFetch, criteria);
        }
    },
    _fetchConvertedDataForObjectDescriptorCriteria: {
        value: function(typeToFetch, criteria, currentRule, registerMappedPropertiesAsChanged) {
            var self = this;

            return this.service ? this.service.then(function (service) {

                var localResult = self._lookupExistingObjectForObjectDescriptorCriteria(typeToFetch, criteria, service),
                //var localResult,
                    localPartialResult;

                /*
                    Leaving a trace of localPartialResult here. Unless I'm missing something, the problem with a partial result 
                    is that we don't really have an easy way to return a partial result with the promise-based API, 
                    and we still need to get the rest, and that will brinf all values back, 
                    the mapping will be faster for the objects that already are in memnory though
                */
                if(localResult) {
                    if(Array.isArray(localResult)) {
                        //This is a to-one and we found one result, great!
                        if(currentRule.propertyDescriptor.cardinality === 1 && localResult.length === 1) {
                            return localResult;
                        }
                        else if(criteria.parameters.length > 0) {
                            if(localResult.length) {
                                //We found some locally but not all
                                localPartialResult = localResult;
                            } else {
                                //we didn't find anything locally
                                localPartialResult = null;
                            }
                        } else {
                            /*
                                We found everything locally, we're done
                            */
                            return localResult;
                        }

                    } else {
                        //We found it, we're done:
                        //return Promise.resolve(localResult);
                        return localResult;
                    }
                }


                if (self.serviceIdentifier) {
                    criteria.parameters.serviceIdentifier = this.serviceIdentifier;
                }

                var fetchPromise = self._registeredFetchPromiseMapForObjectDescriptorCriteria(typeToFetch,criteria);

                if(!self.combinesFetchData) {
                    //console.log("_fetchConvertedDataForObjectDescriptorCriteria()",typeToFetch, criteria, currentRule);

                    if(!fetchPromise) {

                        /* HACK BEGIN - TO GET originId sent in DataOperation without impacting main postgreSQL path */
                        var sourceType = currentRule && currentRule.propertyDescriptor && currentRule.propertyDescriptor.owner,
                            mapping = sourceType && service.mappingForType(sourceType),
                            rawDataPrimaryKeys = mapping && mapping.rawDataPrimaryKeys,
                            dataIdentifier,
                            sourceObjectSnapshot;

                        if(rawDataPrimaryKeys && rawDataPrimaryKeys.has(currentRule.sourcePath) && service.addsOriginIdToReadOperationContext) {
                            if(typeof criteria.parameters === "string") {
                                dataIdentifier = service.dataIdentifierForTypePrimaryKey(sourceType,criteria.parameters);
                            } else {
                                console.warn("TODO");
                            }
                            if(dataIdentifier) {
                                sourceObjectSnapshot = service.snapshotForDataIdentifier(dataIdentifier);
                                if(sourceObjectSnapshot.hasOwnProperty("originId")) {
                                    /*
                                        TEMP HACK until find a better solution. This will allow the handleRead logic to get it and set it 
                                        on the data operation's context.
                                    */
                                    criteria._scope.originId = sourceObjectSnapshot.originId;
                                }
                            }

                        }
                        /* HACK END — TO GET originId sent in DataOperation without impacting main postgreSQL path */

                        var query = DataQuery.withTypeAndCriteria(typeToFetch, criteria);

                        query.hints = {rawDataService: service};

                        if(registerMappedPropertiesAsChanged){
                            query.hints.registerMappedPropertiesAsChanged = registerMappedPropertiesAsChanged;
                        }

                        if(sourceObjectSnapshot && sourceObjectSnapshot.originDataSnapshot) {
                            query.hints.originDataSnapshot = sourceObjectSnapshot.originDataSnapshot;
                        }

                        /*
                            Sounds twisted, but this is to deal with the case where we need to fetch to resolve a property of the object itself.
                        */
                        if(currentRule && currentRule.propertyDescriptor && (((!currentRule.propertyDescriptor._valueDescriptorReference || !currentRule.propertyDescriptor.valueDescriptor) && !(query.readExpressions && query.readExpressions.includes(currentRule.targetPath))) || (currentRule.propertyDescriptor._valueDescriptorReference === currentRule.propertyDescriptor.owner))) {
                            query.readExpressions = [currentRule.targetPath];
                        }

                        if (typeof document !== "undefined" && document.documentElement && currentRule && currentRule.targetPath === "preferences") {
                            document.documentElement.setAttribute("data-preferences-foreign-fetch", JSON.stringify({
                                stage: "fetch",
                                type: typeToFetch && typeToFetch.name,
                                criteria: criteria && criteria.expression,
                                parameterKeys: criteria && criteria.parameters ? Object.keys(criteria.parameters) : [],
                                ownerType: criteria && criteria.parameters && criteria.parameters.ownerType,
                                id: criteria && criteria.parameters && criteria.parameters.id,
                                hasOwner: !!(criteria && criteria.parameters && criteria.parameters.owner),
                                readExpressions: query.readExpressions
                            }));
                        }

                    /*
                        When we fetch objects that have inverse relationships on each others none can complete their mapRawDataProcess because the first one's promise for mapping the relationship to the second never commpletes because the second one itself has it's raw data the foreignKey to the first and attemps to do so by default on processing operations, where the previous way was only looping on requisite proprties. If both relationships were requisite, on each side we'd end up with the same problem.

                        When the second try to map it's foreignKey relationship back to the first, the first exists, and is being mapped, which we can know by checking:
                                if(!this.service._objectsBeingMapped.has(object)) {}

                        So let's try to find a local object that we may already have. This is a specific converter to resolve foreign keys, but we should be able to run the criteria on all local instances' snapshots. We don't have right now an indexation of the snapshots by type, just by dataIdentifier.

                        However, we could start by identifying if the criteria's property involves the typeToFetch's primary key.

                        We also now know currentRule = this.currentRule;

                        Quick draft bellow, un-tested to be refined and continued to.

                        One more thought that's been on my mind. We want to leverage indexedDB anyway so the app has data offline as needed, or to be able to do edge machine learning or keep private data there. If we need to build an index to find objects known client side, we might be able to kill 2 birds with one stone to look for them in the indexedDB directly, where we wou;d build index to match foreign relationships etc...
                    */

                    /*

                    var criteria = query.criteria;

                    if(criteria.syntax.type === "equals") {
                        var args = criteria.syntax.args,
                            parameters = criteria.parameters,
                            parameterValue,
                            propertySyntax;

                            // propertySyntax = args[0].type === "property"
                            //     ? args[0]
                            //     : args[1].type === "property"
                            //         ? args[1]
                            //         : null;
                        if(args[0].type === "property") {
                            if(args[1].type === "parameters") {
                                //parameterSyntax = args[1];
                                parameterValue = parameters;
                                propertySyntax = args[0];
                            } else if(args[1].type === "property") {
                                if(args[1].args[0].type === "parameters") {
                                    parameterValue = parameters[args[1].args[1].value];
                                    propertySyntax = args[0];
                                } else {
                                    parameterValue = parameters[args[0].args[1].value];
                                    propertySyntax = args[1];
                                }
                            }
                        } else if(args[1].type === "property") {
                            if(args[0].type === "parameters") {
                                //parameterSyntax = args[1];
                                parameterValue = parameters;
                                propertySyntax = args[1];
                            } else if(args[0].type === "property") {
                                if(args[0].args[0].type === "parameters") {
                                    parameterValue = parameters[args[0].args[1].value];
                                    propertySyntax = args[1];
                                } else {
                                    parameterValue = parameters[args[1].args[1].value];
                                    propertySyntax = args[0];
                                }
                            }
                        }

                        if(propertySyntax) {
                            var propertyArgs = propertySyntax.args,
                                propertyName = propertyArgs[0].type === "literal"
                                    ? propertyArgs[0].value
                                    : propertyArgs[1].type === "literal"
                                        ? propertyArgs[1].value
                                        : null;

                            if(propertyName && self._owner.rawDataPrimaryKeys.indexOf(propertyName) !== -1) {
                                //Our criteria is about a primary key, let's find the value:
                                var primaryKeyValue = parameterValue;

                            }
                        }
                    }

                    */

                        fetchPromise = service.rootService.fetchData(query)
                                .then(function(value) {
                                    if (typeof document !== "undefined" && document.documentElement && currentRule && currentRule.targetPath === "preferences") {
                                        document.documentElement.setAttribute("data-preferences-foreign-fetch", JSON.stringify({
                                            stage: "fetched",
                                            count: value && value.length
                                        }));
                                    }
                                    self._unregisterFetchPromiseForObjectDescriptorCriteria(typeToFetch, criteria);
                                    return value;
                                });

                        self._registerFetchPromiseForObjectDescriptorCriteria(fetchPromise, typeToFetch, criteria);
                    } else {
                        fetchPromise = fetchPromise.then(function(value) {
                            /*
                                #WARNING here we're piggy-backing on an existing promise. Upper layers (expression data mapping) typically directly assign this returned array to the object's property it belongs to, assuming it's unique because fetched.

                                So to truly behave like a fetch that would return results in a new unique array, we're going to return a clone of it. Because if returned directly, the same array could end up being used by different objects, creating changes in the other objects listeners (in DataTrigger) which leads to bugs.

                                While Array.from() is the fastest on WebKit, Array.slice() is the overal fastest choice.
                                DO NOT REMOVE THIS .slice() !! SEE EXPLAINATION ABOVE
                            */

                            return Array.isArray(value) ? value.slice() : value;
                        });
                    }
                } else {

                    //console.log("_fetchConvertedDataForObjectDescriptorCriteria()",typeToFetch, criteria, currentRule);

                    /*
                        If there wasn't one registered for this already, we still need an individual promise that will resolve to the value for (typeToFetch, criteria) once we filter the combined fetched values to dispatch back to the caller of convert().
                    */
                    if(!fetchPromise) {

                        var fetchPromiseResolve, fetchPromiseReject;
                        fetchPromise = new Promise(function(resolve, reject) {
                            fetchPromiseResolve = resolve;
                            fetchPromiseReject = reject;
                        });
                        fetchPromise.resolve = fetchPromiseResolve;
                        fetchPromise.reject = fetchPromiseReject;

                        self._registerFetchPromiseForObjectDescriptorCriteria(fetchPromise, typeToFetch, criteria);

                        /*
                            The structure behind _registeredFetchPromiseMapForObjectDescriptorCriteria() ensures that different instances of criteria are uniqued by their expression and parameters
                        */
                        //Add to the structure combineFetchDataMicrotask() will use:
                        var queryParts = self._pendingCriteriaByTypeToCombine.get(typeToFetch);
                        if(!queryParts) {
                            queryParts = {
                                criteria: [],
                                readExpressions: []/*,
                                hints: {}*/
                            };
                            self._pendingCriteriaByTypeToCombine.set(typeToFetch, queryParts);
                        }
                        queryParts.criteria.push(criteria);

                        /*
                            Sounds twisted, but this is to deal with the case where we need to fetch to resolve a property of the object itself.
                            added check to avoid duplicates

                            11/29/2025 FIXME - Running into a case where a single raw property value is used to fetch multiple different object properties.
                            So the only way to handle that in an HTTP Service to decide what URL/API End point to reach is to have the readExpressions.
                            It turns out that in that case, both properties points to the same type, which is the same as the type of the data instance for
                            which we're resolving a property. So to not risk a regression, I'm adding an or of  

                                currentRule.propertyDescriptor._valueDescriptorReference === typeToFetch
                            
                            To make sure we're not breaking existing behavior. BUT this needs to be re-assessed and simplified, I think now we should always
                            that extra bit of important information and I don't think it will create a problem, but we need to test and assess 
                            with a current working setup, and eventually add test/specs. 
                        */
                        //if((currentRule && (!currentRule.propertyDescriptor._valueDescriptorReference || !currentRule.propertyDescriptor.valueDescriptor)) && !(queryParts.readExpressions.includes(currentRule.targetPath))) {
                        if(((currentRule && (!currentRule.propertyDescriptor._valueDescriptorReference || !currentRule.propertyDescriptor.valueDescriptor)) && !(queryParts.readExpressions.includes(currentRule.targetPath))) || (currentRule.propertyDescriptor._valueDescriptorReference === currentRule.propertyDescriptor.owner)) {
                        //if(((currentRule && (!currentRule.propertyDescriptor._valueDescriptorReference || !currentRule.propertyDescriptor.valueDescriptor)) && !(queryParts.readExpressions.includes(currentRule.targetPath))) || (currentRule.propertyDescriptor._valueDescriptorReference === typeToFetch)) {
                            queryParts.readExpressions.push(currentRule.targetPath);
                        }


                        /*

                        queryParts.hints.dataInstance = 
                        queryParts.hints.dataInstancePropertyName = currentRule.targetPath;

                        */

                        /*
                            Now we need to scheduled a queueMicrotask() if it's not done.
                        */
                        if(!self.constructor.prototype._isCombineFetchDataMicrotaskQueued) {
                            self.constructor.prototype._isCombineFetchDataMicrotaskQueued = true;
                            queueMicrotask(function() {
                                self._combineFetchDataMicrotask(service, registerMappedPropertiesAsChanged)
                            });
                        }

                    }
                    // else {
                    //     fetchPromise = fetchPromise.then(function(value) {
                    //         /*
                    //             #WARNING here we're piggy-backing on an existing promise. Upper layers (expression data mapping) typically directly assign this returned array to the object's property it belongs to, assuming it's unique because fetched.

                    //             So to truly behave like a fetch that would return results in a new unique array, we're going to return a clone of it. Because if returned directly, the same array could end up being used by different objects, creating changes in the other objects listeners (in DataTrigger) which leads to bugs.

                    //             While Array.from() is the fastest on WebKit, Array.slice() is the overal fastest choice.
                    //             DO NOT REMOVE THIS .slice() !! SEE EXPLAINATION ABOVE
                    //         */

                    //         return Array.isArray(value) ? value.slice() : value;
                    //     });
                    // }


                    /*
                        We probably need only one queueMicrotask() for all types/criteria

                        Then when that function fires:
                            - loop on each type:
                                Build a or of all registered criteria

                                        var fetchPromise = self._registeredFetchPromiseMapForObjectDescriptorCriteria(typeToFetch,criteria);

                    */

                }


                return fetchPromise;
            }) : null;

        }
    },

    _pendingCriteriaByTypeToCombine: {
        value: new Map()
    },

    combinesFetchData: {
        value: true
    },
    _isCombineFetchDataMicrotaskQueued: {
        value: false
    },

    _combineFetchDataMicrotaskFunctionForTypeQueryParts: {
        value: function(type, queryParts, service, rootService, registerMappedPropertiesAsChanged) {
            var self = this,
                combinedCriteria = queryParts.criteria.length > 1 ? Criteria.or(queryParts.criteria) : queryParts.criteria[0],
                //query = DataQuery.withTypeAndCriteria(type, combinedCriteria),
                query,
                mapIterationFetchPromise;

            if(queryParts.criteria.length > 1) {
                combinedCriteria.name = this.constructor.RawForeignValueToObjectConverterCombinedCriteria;
            }

            //console.log("A combinedCriteria syntax:" + JSON.stringify(combinedCriteria.syntax));
            // var testOrCriteria = (new Criteria).initWithExpression(
            //     "a == $.a || b == $.b || c == $.c || d == $.d || e == $.e", {
            //         a: 1,
            //         b: 2,
            //         c: 3,
            //         d: 4,
            //         e: 5
            //     }
            // );
            // console.log(testOrCriteria.syntax);

            //DEBUGGING THE SYNTAX creation
            // if( queryParts.criteria.length > 1) {
            //     var criteria = queryParts.criteria,
            //         previousCriteria;
            //     combinedCriteria = criteria[0];
            //     for(var i=1, countI = criteria.length; (i<countI); i++) {
            //         previousCriteria = combinedCriteria;
            //         combinedCriteria = combinedCriteria.or(criteria[i]);
            //         console.log("combinedCriteria: ",combinedCriteria);
            //     }
            // }
            // console.log("B combinedCriteria syntax:" + JSON.stringify(combinedCriteria.syntax));

            query = DataQuery.withTypeAndCriteria(type, combinedCriteria);

            query.hints = {rawDataService: service};

            if (typeof document !== "undefined" && document.documentElement) {
                document.documentElement.setAttribute("data-raw-foreign-stage", JSON.stringify({
                    stage: "fetch",
                    type: type && type.name,
                    criteria: combinedCriteria && combinedCriteria.expression,
                    readExpressions: queryParts.readExpressions
                }));
            }

            if(queryParts.readExpressions && queryParts.readExpressions.length > 0) {
                query.readExpressions = queryParts.readExpressions;
            }

            if(registerMappedPropertiesAsChanged) {
                query.hints.registerMappedPropertiesAsChanged = registerMappedPropertiesAsChanged;
            }

            //console.log("_combineFetchDataMicrotaskFunctionForTypeQueryParts query:",query);

            mapIterationFetchPromise = rootService.fetchData(query)
            .then(function(combinedFetchedValues) {
                if (typeof document !== "undefined" && document.documentElement) {
                    document.documentElement.setAttribute("data-raw-foreign-stage", JSON.stringify({
                        stage: "fetched",
                        type: type && type.name,
                        count: combinedFetchedValues && combinedFetchedValues.length
                    }));
                }
                /*
                    value contains all the instances matching any of the combined criteria. Each criteria is expressed in term of raw data, so we need to evaluate it on the snapshots of these objects.

                    So we're going to loop on the objects, and for each object's snapshot, we're going to evaluate it on each criteria.
                */

                //console.log("_combineFetchDataMicrotaskFunctionForTypeQueryParts results:",combinedFetchedValues, " query:",query);

                var i, countI, iCriteria, criteria = queryParts.criteria, combinedFetchedValuesSnapshots, iFetchPromise,
                    j, countJ = combinedFetchedValues.length, jValue, jSnapshot, jFetchPromise;

                    for(i=0, countI = criteria.length; (i<countI); i++) {
                        iCriteria = criteria[i];

                        /*
                            We lazily get the iFetchPromise if a criteria finds a match
                        */
                        iFetchPromise = null;

                        for(j=0; (j < countJ); j++) {
                            jValue = combinedFetchedValues[j];
                            jSnapshot = combinedFetchedValuesSnapshots && combinedFetchedValuesSnapshots[j];
                            if(!jSnapshot) {
                                //Now in a multi-origin world, we have to use where the current object actually came from:
                                // jSnapshot = service.snapshotForObject(jValue);
                                //From bugfix/data branch
                                jSnapshot = service.dataIdentifierForObject(jValue).dataService.snapshotForObject(jValue);
                                //commented line bellow from main
                                //jSnapshot = jValue.dataIdentifier.dataService.snapshotForObject(jValue);
                                (combinedFetchedValuesSnapshots || (combinedFetchedValuesSnapshots = []))[j] = jSnapshot;
                            }

                            iFetchPromise = (iFetchPromise || (iFetchPromise = self._registeredFetchPromiseMapForObjectDescriptorCriteria(type,iCriteria)));

                            if((jSnapshot && iCriteria.evaluate(jSnapshot)) || (countI === 1 && combinedFetchedValues.length === 1)) {
                                //console.debug("!!! MATCH "+ JSON.stringify(jSnapshot)+" FOUND for criteria "+iCriteria);
                                (iFetchPromise.result || (iFetchPromise.result = [])).push(jValue);

                            }
                        }

                        if(countJ == 0) {
                            if(iFetchPromise = self._registeredFetchPromiseMapForObjectDescriptorCriteria(type,iCriteria)) {
                                iFetchPromise.resolve(i === 0 ? combinedFetchedValues : combinedFetchedValues.slice());
                            } else {
                                iFetchPromise.resolve(null);
                            }

                        } else if(iFetchPromise) {
                            if(iFetchPromise.result) {
                                iFetchPromise.result.objectDescriptor = combinedFetchedValues.objectDescriptor;
                                iFetchPromise.resolve(iFetchPromise.result);
                            } else {
                                iFetchPromise.resolve(null);
                            }

                            // ??
                            // self._unregisterFetchPromiseForObjectDescriptorCriteria(type, iCriteria);

                        } else {
                            throw "RawForeignValueToObjectConverter._combineFetchDataMicrotaskFunctionForTypeQueryParts() shouldn't be here"
                        }

                        self._unregisterFetchPromiseForObjectDescriptorCriteria(type, iCriteria);

                    }



            //    var i, countI, iValue, iValueSnapshot, criteria = queryParts.criteria,
            //         j, countJ = criteria.length, jCriteria;
            //    for(i=0, countI = combinedFetchedValues.length; (i<countI); i++) {
            //         iValue = combinedFetchedValues[i];
            //         iValueSnapshot = service.snapshotForObject(iValue);

            //         for(j=0; (j < countJ); j++) {
            //             if(criteria[j].evaluate(iValueSnapshot)) {
            //                 jFetchPromise = this._registeredFetchPromiseMapForObjectDescriptorCriteria(type,criteria[j]);
            //                 (fetchPromise.result || (fetchPromise.result = [])).push(iValue);

            //             }
            //         }
            //    }

            //     self._unregisterFetchPromiseForObjectDescriptorCriteria(type, criteria);
            //     return value;
            });

        }
    },

    _combineFetchDataMicrotask: {
        value: function(service, registerMappedPropertiesAsChanged) {

            //console.log("_combineFetchDataMicrotask("+this._pendingCriteriaByTypeToCombine.size+")");
            var mapIterator = this._pendingCriteriaByTypeToCombine.entries(),
                mapIterationEntry,
                mapIterationType,
                mapIterationQueryParts;

            while ((mapIterationEntry = mapIterator.next().value)) {
                mapIterationType = mapIterationEntry[0];
                mapIterationQueryParts = mapIterationEntry[1];

                this._combineFetchDataMicrotaskFunctionForTypeQueryParts(mapIterationType, mapIterationQueryParts, service, service.rootService, registerMappedPropertiesAsChanged);
            }

            this.constructor.prototype._isCombineFetchDataMicrotaskQueued = false;
            this._pendingCriteriaByTypeToCombine.clear();
        }
    },


    /*
        To open the ability to get derived values from non-saved objects, some failsafes blocking a non-saved created object to get any kind of property resolved/fetched were removed. So we need to be smarter here and do the same.

        If an object is created (which we don't know here, but we can check), fetching a property relies on the primary key and that the primarty key is one property only (like a uuid) and there's already a value (client-side generated like uuid can be), than it can't be fetched and we shoould resolve to undefined.

    */

    convertCriteriaForValue: {
        value: function(value) {
            var criteria = new Criteria().initWithSyntax(this.convertSyntax, value);
            criteria._expression = this.convertExpression;
            return criteria;
        }
    },


    _convertFetchPromisesByValue: {
        value: undefined
    },

    /*********************************************************************
     * Public API
     */

    /**
     * Converts the fault for the relationship to an actual object that has an ObjectDescriptor.
     * @function
     * @param {Property} v The value to format.
     * @returns {Promise} A promise for the referenced object.  The promise is
     * fulfilled after the object is successfully fetched.
     *    __foreignDescriptorMappingsByObjectyDescriptor: {
        value: undefined
    },
    _foreignDescriptorMappingsByObjectyDescriptor: {
        get: function() {
            if(!this.__foreignDescriptorMappingsByObjectyDescriptor) {
                for(var i=0, mappings = this.foreignDescriptorMappings, countI = mappings.length, iMapping, mappingByObjectDescriptor = new Map();(i<countI);i++) {
                    mappingByObjectDescriptor.set(mappings[i].type,mappings[i]);
                }
                this.__foreignDescriptorMappingsByObjectyDescriptor = mappingByObjectDescriptor;
            }
            return this.__foreignDescriptorMappingsByObjectyDescriptor;
        }
    },

    rawDataTypeMappingForForeignDescriptor: {
        value: function(anObjectDescriptor) {
            return this._foreignDescriptorMappingsByObjectyDescriptor.get(anObjectDescriptor);
        }
    },    __foreignDescriptorMappingsByObjectyDescriptor: {
        value: undefined
    },
    _foreignDescriptorMappingsByObjectyDescriptor: {
        get: function() {
            if(!this.__foreignDescriptorMappingsByObjectyDescriptor) {
                for(var i=0, mappings = this.foreignDescriptorMappings, countI = mappings.length, iMapping, mappingByObjectDescriptor = new Map();(i<countI);i++) {
                    mappingByObjectDescriptor.set(mappings[i].type,mappings[i]);
                }
                this.__foreignDescriptorMappingsByObjectyDescriptor = mappingByObjectDescriptor;
            }
            return this.__foreignDescriptorMappingsByObjectyDescriptor;
        }
    },

    rawDataTypeMappingForForeignDescriptor: {
        value: function(anObjectDescriptor) {
            return this._foreignDescriptorMappingsByObjectyDescriptor.get(anObjectDescriptor);
        }
    },
     */

    convert: {
        value: function (scope) {
            return this.service.then((service) => {
                return this._convert(scope, service);
            });
        }
    },

    uuidNoValue: {
        value: Uuid.noValue
    },

   _convert: {
        value: function (scope, service) {
            var v = scope.value;
            if((v && !(v instanceof Array )) || (v instanceof Array && v.length > 0)) {
                var self = this,
                    //We put it in a local variable so we have the right value in the closure
                    currentRule = this.currentRule,
                    registerMappedPropertiesAsChanged = this.registerMappedPropertiesAsChanged,
                    criteria,
                    query;

                if(this.foreignDescriptorMappings) {
                    /*
                        Needs to loop on the mapping and evaluate value. If v is an array, it's possible
                        there could be foreignKeys in that array going to different ObjectDescriptor
                        and therefore requiring different queries, but there could be multiple of the same kind. So we need to loop on values and group by it before building a criteria for each.
                    */

                    if((v instanceof Array )) {
                        var i, countI, iValue, iValueDescriptor, groupMap = new Map(), iGroupValue;
                        for(i=0, countI = v.length;(i<countI);i++) {
                            iValue = v[i];
                            iValueDescriptor = this.foreignDescriptorForValue(iValue);
                            if(!iValueDescriptor) {
                                console.warn("Didn't find a RawDataTypeMapping matching rawData to convert:",this.foreignDescriptorMappings,iValue);
                            } else {
                                iGroupValue = groupMap.get(iValueDescriptor);
                                if(!iGroupValue) {
                                    groupMap.set(iValueDescriptor, (iGroupValue = []))
                                }
                                iGroupValue.push(iValue);
                            }
                        }

                        //Now walk the map and build the queries:
                        var mapIterator = groupMap.keys(),
                            anObjectDescriptor,
                            promises = [],
                            aCriteria;
                        while (anObjectDescriptor = mapIterator.next().value) {
                            aCriteria = this.convertCriteriaForValue(groupMap.get(anObjectDescriptor));
                            promises.push(this._fetchConvertedDataForObjectDescriptorCriteria(anObjectDescriptor, aCriteria, currentRule, registerMappedPropertiesAsChanged));

                        }

                        return Promise.all(promises).then(function(fetchResults) {
                            //each fetchResults contains a DataStream. So we need to gather each dataStream's data into one array.
                            var result = [], i, countI, iDataStream;

                            for(i=0, countI = fetchResults.length;(i<countI); i++) {
                                result.push(fetchResults[i].data);
                            }

                            return result;
                        })

                    } else {
                        /*
                            if valueDescriptor were a Promise, we'd have a problem.
                            Keep an eye on that.
                        */
                        var valueDescriptor = this.foreignDescriptorForValue(v);

                        if(valueDescriptor) {
                            var rawDataProperty = self.rawDataPropertyForForeignDescriptor(valueDescriptor),
                            foreignKeyValue = v[rawDataProperty],
                            aCriteria = this.convertCriteriaForValue(foreignKeyValue);

                            return this._fetchConvertedDataForObjectDescriptorCriteria(valueDescriptor, aCriteria, currentRule, registerMappedPropertiesAsChanged);

                        } else {
                            return Promise.resolve(null);
                        }
                    }

                } else if(v === this.uuidNoValue) {
                    /*
                        the uuid noValue - '00000000-0000-0000-0000-000000000000'
                        means there's nothing to be found, we can resolve this right now!
                    */
                    return Promise.resolveNull;
                } else {
                    criteria = this.convertCriteriaForValue(v);

                    // console.log("RawForeignValueToObjectConverter fetching for value:",v);

                    return Promise.resolve(this._descriptorToFetch).then(function (typeToFetch) {

                        return self._fetchConvertedDataForObjectDescriptorCriteria(typeToFetch, criteria, currentRule, registerMappedPropertiesAsChanged);

                        // if (self.serviceIdentifier) {
                        //     criteria.parameters.serviceIdentifier = self.serviceIdentifier;
                        // }

                        // query = DataQuery.withTypeAndCriteria(typeToFetch, criteria);

                        // return self.service ? self.service.then(function (service) {
                        //     return service.rootService.fetchData(query);
                        // }) : null;
                    }, function(error) {
                        console.log(error);
                        return Promise.reject(error);
                    });
                }
            }
            else {
                /*
                    if we don't have a foreign key value, where we can do:

                            We're already using in fetchObjectProperty:
                                    objectCriteria = new Criteria().initWithExpression("id == $id", {id: object.dataIdentifier.primaryKey});
                            on the client side to do so, id here is on the table fetched, for gettin more inline values.


                    we have the primary key, and the foreign key, so we should be able to do something with it:

                    For example, with Event having a property
                        "respondentQuestionnaires": {
                        "<->": "respondentQuestionnaireIds",
                        "converter": {"@": "respondentQuestionnairesForeignKeyConverter"}
                    }
                    and
                    "convertExpression": "$.has(id)"

                        if we replace $ which so far has been a value, by the type qualified symbol, it would becomes:
                        "$type.respondentQuestionnaireIds.has(id)", {
                            "type":"data/main.mod/model/event"
                        }

                    Adding what we do for readExpression:
                    Type to fetch is RespondentQuestionnaire
                        "$type.respondentQuestionnaireIds.has(id) && id == $id", {
                            "type":"data/main.mod/model/event",
                            "id": object.dataIdentifier.primaryKey
                        }

                */

                // var currentRule = this.currentRule,
                //     requirements = currentRule && currentRule.requirements,
                //     self = this;

                // // if(requirements && requirements.length > 0) {
                //     //Loop and call fetchObjectProperty
                //     (this.service
                //         ? this.service.then(function (service) {
                //             var promises;

                //             for(var i=0, countI = requirements.length;(i<countI); i++) {
                //                 //This should use a readExpression and get us the raw value
                //                 (promises || (promises = [])).push(service.fetchObjectProperty(currentRule.targetPath);
                //             }
                //             return Promise.all(promises);
                //         })
                //         : Promise.resolve(null)
                //     )
                //     .then(function(values) {
                //         //Have they been added to the snapshot? Needs to check.

                //         //Now have the foreignKey we need, we can just call our convert() method again passing that value and we're done.

                //     });
                // } else {
                    return Promise.resolveNull;
                //}

            }
        }
    },



    /**
     * Reverts the relationship back to raw data.
     * @function
     * @param {Scope} v The value to revert.
     * @returns {Promise} v
     */
    revert: {
        value: function (v) {
            if (v) {
                //No specific instruction, so we return the primary keys using default assumptions.
                if (!this.compiledRevertSyntax) {
                    var self = this,
                        //We put it in a local variable so we have the right value in the closure
                        currentRule = this.currentRule;
                    return this.service ? this.service.then(function (service) {

                        if(v instanceof Array) {
                            var result=[];
                            //forEach skipps over holes of a sparse array
                            v.forEach(function(value) {
                                /*
                                    Make sure we have a valid data object anf not null nor undefined before trying to get their primary key
                                */
                                if(value) {
                                    result.push(service.dataIdentifierForObject(value).primaryKey);
                                } else {
                                    //TODO: Is this safe? It was added because, in some cases, you may want to preserve a sparse array. E.g. The
                                    //array has a fixed length, but not all values are defined
                                    result.push(value);
                                }
                            });
                            currentRule = null;
                            return result;
                        }
                        else {
                            if(self.foreignDescriptorMappings) {
                                var valueObjectDescriptor = service.objectDescriptorForObject(v),
                                    rawDataProperty = self.rawDataPropertyForForeignDescriptor(valueObjectDescriptor);

                                if(rawDataProperty === currentRule.targetPath) {
                                    currentRule = null;
                                    return service.dataIdentifierForObject(v).primaryKey;
                                } else {
                                    currentRule = null;
                                    return undefined;
                                }
                            } else {
                                currentRule = null;
                                return service.dataIdentifierForObject(v).primaryKey;
                            }
                        }

                    }) : (currentRule = null) && Promise.resolve(service.dataIdentifierForObject(v).primaryKey);
                } else {
                    var scope = this.scope;
                    //Parameter is what is accessed as $ in expressions
                    scope.parameters = v;
                    scope.value = this;
                    return Promise.resolve(this.compiledRevertSyntax(scope));
                }

            } else {
                return v;
                // return Promise.resolve();
            }
        }
    }

}, {
    RawForeignValueToObjectConverterCombinedCriteria: {
        value: "RawForeignValueToObjectConverterCombinedCriteria"
    }
});
