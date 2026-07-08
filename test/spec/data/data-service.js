var DataService = require("mod/data/service/data-service").DataService,
    DataObjectDescriptor = require("mod/data/model/data-object-descriptor").DataObjectDescriptor,
    ExpressionDataMapping = require("mod/data/service/expression-data-mapping").ExpressionDataMapping,
    ModuleObjectDescriptor = require("mod/core/meta/module-object-descriptor").ModuleObjectDescriptor,
    ModuleReference = require("mod/core/module-reference").ModuleReference,
    RawDataService = require("mod/data/service/raw-data-service").RawDataService,
    defaultEventManager = require("mod/core/event/event-manager").defaultEventManager;

const AnimatedMovieDescriptor = require("spec/data/logic/model/animated-movie.mjson").montageObject;
const CategoyDescriptor = require("spec/data/logic/model/category.mjson").montageObject;
const ConstructedModelDescriptor = require("spec/data/logic/model/constructed-model.mjson").montageObject;
const ConstructedSpecializedModelDescriptor = require("spec/data/logic/model/constructed-specialized-model.mjson").montageObject;
const movieDescriptor = require("spec/data/logic/model/movie.mjson").montageObject;

describe("A DataService", function () {
    it("can be created", function () {
        expect(new DataService()).toBeDefined();
    });

    it("initially has no parent and is a root service", function () {
        var service = new DataService();
        // Verify that the service has no parent and is the root.
        expect(service.parentService).toBeUndefined();
        expect(service.rootService).toEqual(service);
    });

    it("DataService.mainService is set to application's mainService", function () {
        DataService.mainService = undefined;
        var service = new DataService();
        defaultEventManager.application.mainService = service;
        expect(DataService.mainService).toEqual(service);
    });

    it("can be a parent, child, or grandchild service", function () {
        var parent, child, grandchild;

        // Create the parent, child, and grandchild after resetting the main
        // service, and tie them all together.
        DataService.mainService = undefined;
        parent = new RawDataService();
        parent.NAME = "PARENT";
        parent.jasmineToString = function () {
            return "PARENT";
        };
        defaultEventManager.application.mainService = parent;
        child = new RawDataService();
        child.NAME = "CHILD";
        child.jasmineToString = function () {
            return "CHILD";
        };
        grandchild = new RawDataService();
        grandchild.NAME = "GRANDCHILD";
        grandchild.jasmineToString = function () {
            return "GRANDCHILD";
        };
        parent.addChildService(child);
        child.addChildService(grandchild);

        // Verify that the parents, roots, and main are correct.
        expect(parent.parentService).toBeUndefined();
        expect(parent.rootService).toEqual(parent);
        expect(child.parentService).toEqual(parent);
        expect(child.rootService).toEqual(parent);
        expect(grandchild.parentService).toEqual(child);
        expect(grandchild.rootService).toEqual(parent);
        expect(DataService.mainService).toEqual(parent);

        // Try to set new parents and verify again.
        parent.parentService = new RawDataService();
        child.parentService = new RawDataService();
        grandchild.parentService = new RawDataService();
        expect(parent.parentService).toBeUndefined();
        expect(parent.rootService).toEqual(parent);
        expect(child.parentService).toEqual(parent);
        expect(child.rootService).toEqual(parent);
        expect(grandchild.parentService).toEqual(child);
        expect(grandchild.rootService).toEqual(parent);
        expect(DataService.mainService).toEqual(parent);
    });

    it("manages children correctly", function () {
        var toString, Types, objects, Child, children, parent;

        // Define test types with ObjectDescriptors.
        toString = function () {
            return "TYPE-" + this.id;
        };
        Types = [0, 1, 2, 3].map(function () {
            return function () {};
        });
        Types.forEach(function (type) {
            type.TYPE = new DataObjectDescriptor();
        });
        Types.forEach(function (type) {
            type.TYPE.jasmineToString = toString;
        });
        Types.forEach(function (type, index) {
            type.TYPE.id = index;
        });

        // Define test objects for each of the test types.
        toString = function () {
            return "OBJECT-" + this.id;
        };
        objects = Types.map(function (type) {
            return new type();
        });
        objects.forEach(function (object) {
            object.jasmineToString = toString;
        });
        objects.forEach(function (object, index) {
            object.id = index;
        });

        // Create test children with unique identifiers to help with debugging.
        toString = function () {
            return "CHILD-" + this.id;
        };
        children = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(function () {
            return new RawDataService();
        });
        children.forEach(function (child) {
            child.jasmineToString = toString;
        });
        children.forEach(function (child, index) {
            child.id = index;
        });

        // Define a variety of types for the test children. Children with an
        // undefined, null, or empty types array will be "all types" children.
        children.forEach(function (child) {
            Object.defineProperty(child, "types", { writable: true });
        });
        children[0].types = [Types[0].TYPE];
        children[1].types = [Types[0].TYPE];
        children[2].types = [Types[1].TYPE];
        children[3].types = [Types[0].TYPE, Types[1].TYPE];
        children[4].types = [Types[0].TYPE, Types[2].TYPE];
        children[5].types = [Types[1].TYPE, Types[2].TYPE];
        children[6].types = [Types[0].TYPE, Types[1].TYPE, Types[2].TYPE];
        children[7].types = undefined;
        children[8].types = null;
        children[9].types = [];

        // Create a service with the desired children.
        parent = new DataService();
        parent.jasmineToString = function () {
            return "PARENT";
        };
        children.forEach(function (child) {
            parent.addChildService(child);
        });

        // Verify the initial parents, types, and type-to-child mapping.
        expect(parent.parentService).toBeUndefined();
        expect(children[0].parentService).toEqual(parent);
        expect(children[1].parentService).toEqual(parent);
        expect(children[2].parentService).toEqual(parent);
        expect(children[3].parentService).toEqual(parent);
        expect(children[4].parentService).toEqual(parent);
        expect(children[5].parentService).toEqual(parent);
        expect(children[6].parentService).toEqual(parent);
        expect(children[7].parentService).toEqual(parent);
        expect(children[8].parentService).toEqual(parent);
        expect(children[9].parentService).toEqual(parent);
        expect(parent.types.sort()).toEqual([Types[0].TYPE, Types[1].TYPE, Types[2].TYPE]);
        expect(children[0].types.sort()).toEqual([Types[0].TYPE]);
        expect(children[1].types.sort()).toEqual([Types[0].TYPE]);
        expect(children[2].types.sort()).toEqual([Types[1].TYPE]);
        expect(children[3].types.sort()).toEqual([Types[0].TYPE, Types[1].TYPE]);
        expect(children[4].types.sort()).toEqual([Types[0].TYPE, Types[2].TYPE]);
        expect(children[5].types.sort()).toEqual([Types[1].TYPE, Types[2].TYPE]);
        expect(children[6].types.sort()).toEqual([Types[0].TYPE, Types[1].TYPE, Types[2].TYPE]);
        expect(children[7].types).toBeUndefined();
        expect(children[8].types).toBeNull();
        expect(children[9].types).toEqual([]);
        expect(parent.childServiceForType(Types[0].TYPE)).toEqual(children[0]);
        expect(parent.childServiceForType(Types[1].TYPE)).toEqual(children[2]);
        expect(parent.childServiceForType(Types[2].TYPE)).toEqual(children[4]);
        expect(parent.childServiceForType(Types[3].TYPE)).toEqual(children[7]);
        expect(parent._getChildServiceForObject(objects[0])).toEqual(children[0]);
        expect(parent._getChildServiceForObject(objects[1])).toEqual(children[2]);
        expect(parent._getChildServiceForObject(objects[2])).toEqual(children[4]);
        expect(parent._getChildServiceForObject(objects[3])).toEqual(children[7]);

        // Modify the children and verify the resulting service parent, types,
        // and type-to-child mapping.
        parent.removeChildService(children[0]);
        parent.removeChildService(children[1]);
        expect(parent.parentService).toBeUndefined();
        expect(children[0].parentService).toBeUndefined();
        expect(children[1].parentService).toBeUndefined();
        expect(children[2].parentService).toEqual(parent);
        expect(children[3].parentService).toEqual(parent);
        expect(children[4].parentService).toEqual(parent);
        expect(children[5].parentService).toEqual(parent);
        expect(children[6].parentService).toEqual(parent);
        expect(children[7].parentService).toEqual(parent);
        expect(children[8].parentService).toEqual(parent);
        expect(children[9].parentService).toEqual(parent);
        expect(parent.types.sort()).toEqual([Types[0].TYPE, Types[1].TYPE, Types[2].TYPE]);
        expect(children[0].types.sort()).toEqual([Types[0].TYPE]);
        expect(children[1].types.sort()).toEqual([Types[0].TYPE]);
        expect(children[2].types.sort()).toEqual([Types[1].TYPE]);
        expect(children[3].types.sort()).toEqual([Types[0].TYPE, Types[1].TYPE]);
        expect(children[4].types.sort()).toEqual([Types[0].TYPE, Types[2].TYPE]);
        expect(children[5].types.sort()).toEqual([Types[1].TYPE, Types[2].TYPE]);
        expect(children[6].types.sort()).toEqual([Types[0].TYPE, Types[1].TYPE, Types[2].TYPE]);
        expect(children[7].types).toBeUndefined();
        expect(children[8].types).toBeNull();
        expect(children[9].types).toEqual([]);
        expect(parent.childServiceForType(Types[0].TYPE)).toEqual(children[3]);
        expect(parent.childServiceForType(Types[1].TYPE)).toEqual(children[2]);
        expect(parent.childServiceForType(Types[2].TYPE)).toEqual(children[4]);
        expect(parent.childServiceForType(Types[3].TYPE)).toEqual(children[7]);
        expect(parent._getChildServiceForObject(objects[0])).toEqual(children[3]);
        expect(parent._getChildServiceForObject(objects[1])).toEqual(children[2]);
        expect(parent._getChildServiceForObject(objects[2])).toEqual(children[4]);
        expect(parent._getChildServiceForObject(objects[3])).toEqual(children[7]);

        // Modify and verify some more.
        parent.removeChildService(children[3]);
        expect(parent.parentService).toBeUndefined();
        expect(children[0].parentService).toBeUndefined();
        expect(children[1].parentService).toBeUndefined();
        expect(children[2].parentService).toEqual(parent);
        expect(children[3].parentService).toBeUndefined();
        expect(children[4].parentService).toEqual(parent);
        expect(children[5].parentService).toEqual(parent);
        expect(children[6].parentService).toEqual(parent);
        expect(children[7].parentService).toEqual(parent);
        expect(children[8].parentService).toEqual(parent);
        expect(children[9].parentService).toEqual(parent);
        expect(parent.types.sort()).toEqual([Types[0].TYPE, Types[1].TYPE, Types[2].TYPE]);
        expect(children[0].types.sort()).toEqual([Types[0].TYPE]);
        expect(children[1].types.sort()).toEqual([Types[0].TYPE]);
        expect(children[2].types.sort()).toEqual([Types[1].TYPE]);
        expect(children[3].types.sort()).toEqual([Types[0].TYPE, Types[1].TYPE]);
        expect(children[4].types.sort()).toEqual([Types[0].TYPE, Types[2].TYPE]);
        expect(children[5].types.sort()).toEqual([Types[1].TYPE, Types[2].TYPE]);
        expect(children[6].types.sort()).toEqual([Types[0].TYPE, Types[1].TYPE, Types[2].TYPE]);
        expect(children[7].types).toBeUndefined();
        expect(children[8].types).toBeNull();
        expect(children[9].types).toEqual([]);
        expect(parent.childServiceForType(Types[0].TYPE)).toEqual(children[4]);
        expect(parent.childServiceForType(Types[1].TYPE)).toEqual(children[2]);
        expect(parent.childServiceForType(Types[2].TYPE)).toEqual(children[4]);
        expect(parent.childServiceForType(Types[3].TYPE)).toEqual(children[7]);
        expect(parent._getChildServiceForObject(objects[0])).toEqual(children[4]);
        expect(parent._getChildServiceForObject(objects[1])).toEqual(children[2]);
        expect(parent._getChildServiceForObject(objects[2])).toEqual(children[4]);
        expect(parent._getChildServiceForObject(objects[3])).toEqual(children[7]);

        // Modify and verify some more. After the modification there will be no
        // more children for Types[0] so the first "all types" child should be
        // returned for that type.
        parent.removeChildService(children[4]);
        parent.removeChildService(children[6]);
        expect(parent.parentService).toBeUndefined();
        expect(children[0].parentService).toBeUndefined();
        expect(children[1].parentService).toBeUndefined();
        expect(children[2].parentService).toEqual(parent);
        expect(children[3].parentService).toBeUndefined();
        expect(children[4].parentService).toBeUndefined();
        expect(children[5].parentService).toEqual(parent);
        expect(children[6].parentService).toBeUndefined();
        expect(children[7].parentService).toEqual(parent);
        expect(children[8].parentService).toEqual(parent);
        expect(children[9].parentService).toEqual(parent);
        expect(parent.types.sort()).toEqual([Types[1].TYPE, Types[2].TYPE]);
        expect(children[0].types.sort()).toEqual([Types[0].TYPE]);
        expect(children[1].types.sort()).toEqual([Types[0].TYPE]);
        expect(children[2].types.sort()).toEqual([Types[1].TYPE]);
        expect(children[3].types.sort()).toEqual([Types[0].TYPE, Types[1].TYPE]);
        expect(children[4].types.sort()).toEqual([Types[0].TYPE, Types[2].TYPE]);
        expect(children[5].types.sort()).toEqual([Types[1].TYPE, Types[2].TYPE]);
        expect(children[6].types.sort()).toEqual([Types[0].TYPE, Types[1].TYPE, Types[2].TYPE]);
        expect(children[7].types).toBeUndefined();
        expect(children[8].types).toBeNull();
        expect(children[9].types).toEqual([]);
        expect(parent.childServiceForType(Types[0].TYPE)).toEqual(children[7]);
        expect(parent.childServiceForType(Types[1].TYPE)).toEqual(children[2]);
        expect(parent.childServiceForType(Types[2].TYPE)).toEqual(children[5]);
        expect(parent.childServiceForType(Types[3].TYPE)).toEqual(children[7]);
        expect(parent._getChildServiceForObject(objects[0])).toEqual(children[7]);
        expect(parent._getChildServiceForObject(objects[1])).toEqual(children[2]);
        expect(parent._getChildServiceForObject(objects[2])).toEqual(children[5]);
        expect(parent._getChildServiceForObject(objects[3])).toEqual(children[7]);

        // Modify and verify some more.
        parent.removeChildService(children[5]);
        parent.removeChildService(children[7]);
        expect(parent.parentService).toBeUndefined();
        expect(children[0].parentService).toBeUndefined();
        expect(children[1].parentService).toBeUndefined();
        expect(children[2].parentService).toEqual(parent);
        expect(children[3].parentService).toBeUndefined();
        expect(children[4].parentService).toBeUndefined();
        expect(children[5].parentService).toBeUndefined();
        expect(children[6].parentService).toBeUndefined();
        expect(children[7].parentService).toBeUndefined();
        expect(children[8].parentService).toEqual(parent);
        expect(children[9].parentService).toEqual(parent);
        expect(parent.types.sort()).toEqual([Types[1].TYPE]);
        expect(children[0].types.sort()).toEqual([Types[0].TYPE]);
        expect(children[1].types.sort()).toEqual([Types[0].TYPE]);
        expect(children[2].types.sort()).toEqual([Types[1].TYPE]);
        expect(children[3].types.sort()).toEqual([Types[0].TYPE, Types[1].TYPE]);
        expect(children[4].types.sort()).toEqual([Types[0].TYPE, Types[2].TYPE]);
        expect(children[5].types.sort()).toEqual([Types[1].TYPE, Types[2].TYPE]);
        expect(children[6].types.sort()).toEqual([Types[0].TYPE, Types[1].TYPE, Types[2].TYPE]);
        expect(children[7].types).toBeUndefined();
        expect(children[8].types).toBeNull();
        expect(children[9].types).toEqual([]);
        expect(parent.childServiceForType(Types[0].TYPE)).toEqual(children[8]);
        expect(parent.childServiceForType(Types[1].TYPE)).toEqual(children[2]);
        expect(parent.childServiceForType(Types[2].TYPE)).toEqual(children[8]);
        expect(parent.childServiceForType(Types[3].TYPE)).toEqual(children[8]);
        expect(parent._getChildServiceForObject(objects[0])).toEqual(children[8]);
        expect(parent._getChildServiceForObject(objects[1])).toEqual(children[2]);
        expect(parent._getChildServiceForObject(objects[2])).toEqual(children[8]);
        expect(parent._getChildServiceForObject(objects[3])).toEqual(children[8]);

        // Modify and verify some more.
        parent.removeChildService(children[2]);
        parent.removeChildService(children[8]);
        expect(parent.parentService).toBeUndefined();
        expect(children[0].parentService).toBeUndefined();
        expect(children[1].parentService).toBeUndefined();
        expect(children[2].parentService).toBeUndefined();
        expect(children[3].parentService).toBeUndefined();
        expect(children[4].parentService).toBeUndefined();
        expect(children[5].parentService).toBeUndefined();
        expect(children[6].parentService).toBeUndefined();
        expect(children[7].parentService).toBeUndefined();
        expect(children[8].parentService).toBeUndefined();
        expect(children[9].parentService).toEqual(parent);
        expect(parent.types.sort()).toEqual([]);
        expect(children[0].types.sort()).toEqual([Types[0].TYPE]);
        expect(children[1].types.sort()).toEqual([Types[0].TYPE]);
        expect(children[2].types.sort()).toEqual([Types[1].TYPE]);
        expect(children[3].types.sort()).toEqual([Types[0].TYPE, Types[1].TYPE]);
        expect(children[4].types.sort()).toEqual([Types[0].TYPE, Types[2].TYPE]);
        expect(children[5].types.sort()).toEqual([Types[1].TYPE, Types[2].TYPE]);
        expect(children[6].types.sort()).toEqual([Types[0].TYPE, Types[1].TYPE, Types[2].TYPE]);
        expect(children[7].types).toBeUndefined();
        expect(children[8].types).toBeNull();
        expect(children[9].types).toEqual([]);
        expect(parent.childServiceForType(Types[0].TYPE)).toEqual(children[9]);
        expect(parent.childServiceForType(Types[1].TYPE)).toEqual(children[9]);
        expect(parent.childServiceForType(Types[2].TYPE)).toEqual(children[9]);
        expect(parent.childServiceForType(Types[3].TYPE)).toEqual(children[9]);
        expect(parent._getChildServiceForObject(objects[0])).toEqual(children[9]);
        expect(parent._getChildServiceForObject(objects[1])).toEqual(children[9]);
        expect(parent._getChildServiceForObject(objects[2])).toEqual(children[9]);
        expect(parent._getChildServiceForObject(objects[3])).toEqual(children[9]);

        // Modify and verify some more.
        parent.removeChildService(children[9]);
        expect(parent.parentService).toBeUndefined();
        expect(children[0].parentService).toBeUndefined();
        expect(children[1].parentService).toBeUndefined();
        expect(children[2].parentService).toBeUndefined();
        expect(children[3].parentService).toBeUndefined();
        expect(children[4].parentService).toBeUndefined();
        expect(children[5].parentService).toBeUndefined();
        expect(children[6].parentService).toBeUndefined();
        expect(children[7].parentService).toBeUndefined();
        expect(children[8].parentService).toBeUndefined();
        expect(children[9].parentService).toBeUndefined();
        expect(parent.types.sort()).toEqual([]);
        expect(children[0].types.sort()).toEqual([Types[0].TYPE]);
        expect(children[1].types.sort()).toEqual([Types[0].TYPE]);
        expect(children[2].types.sort()).toEqual([Types[1].TYPE]);
        expect(children[3].types.sort()).toEqual([Types[0].TYPE, Types[1].TYPE]);
        expect(children[4].types.sort()).toEqual([Types[0].TYPE, Types[2].TYPE]);
        expect(children[5].types.sort()).toEqual([Types[1].TYPE, Types[2].TYPE]);
        expect(children[6].types.sort()).toEqual([Types[0].TYPE, Types[1].TYPE, Types[2].TYPE]);
        expect(children[7].types).toBeUndefined();
        expect(children[8].types).toBeNull();
        expect(children[9].types).toEqual([]);
        expect(parent.childServiceForType(Types[0].TYPE)).toBeNull();
        expect(parent.childServiceForType(Types[1].TYPE)).toBeNull();
        expect(parent.childServiceForType(Types[2].TYPE)).toBeNull();
        expect(parent.childServiceForType(Types[3].TYPE)).toBeNull();
        expect(parent._getChildServiceForObject(objects[0])).toBeNull();
        expect(parent._getChildServiceForObject(objects[1])).toBeNull();
        expect(parent._getChildServiceForObject(objects[2])).toBeNull();
        expect(parent._getChildServiceForObject(objects[3])).toBeNull();
    });

    it("can handle child services with an async types property using the register/unregister API", function (done) {
        var parent, syncChild, asyncChild, moduleReference, type, registerPromises, unregisterPromises;

        // Create a sample type
        // type = Function.noop;
        // type.TYPE = new DataObjectDescriptor();
        // type.TYPE.jasmineToString = function () { return "TYPE-" + this.id; };
        // type.TYPE.id = 1;

        moduleReference = new ModuleReference().initWithIdAndRequire("spec/data/logic/model/movie", require);
        type = new ModuleObjectDescriptor().initWithModuleAndExportName(moduleReference, "Movie");
        // Create the main service
        parent = new RawDataService();
        parent.NAME = "PARENT";
        parent.jasmineToString = function () {
            return "PARENT";
        };

        // Create a child with regular sync types
        syncChild = new RawDataService();
        Object.defineProperty(syncChild, "types", {
            get: function () {
                return [type];
            },
        });

        // Create a child with an async types property
        asyncChild = new RawDataService();
        Object.defineProperty(asyncChild, "types", {
            get: function () {
                return Promise.resolve([type]);
            },
        });

        // Test that parent references are added and removed correctly
        registerPromises = [syncChild, asyncChild].map(function (c) {
            return parent.registerChildService(c);
        });
        Promise.all(registerPromises)
            .then(function () {
                expect(syncChild.parentService).toBe(parent);
                expect(asyncChild.parentService).toBe(parent);
                unregisterPromises = [syncChild, asyncChild].map(function (c) {
                    return parent.unregisterChildService(c);
                });

                return Promise.all(unregisterPromises);
            })
            .then(function () {
                expect(syncChild.parentService).toBeUndefined();
                expect(asyncChild.parentService).toBeUndefined();
                done();
            });
    });

    it("has a fetchData() method", function () {
        expect(new DataService().fetchData).toEqual(jasmine.any(Function));
    });

    xit("has a fetchData() method that uses the passed in stream when one is specified", function () {});

    xit("has a fetchData() method that creates and return a new stream when none is passed in", function () {});

    xit("has a fetchData() method that sets its stream's criteria", function () {});

    xit("has a registerService() method that needs to be further tested", function () {});

    xit("has a mainService class variable that needs to be further tested", function () {});

    it("runs ES class constructors when creating data objects", async function () {
        var mainService = new DataService(),
            modelService = new RawDataService(),
            model;

        defaultEventManager.application.mainService = mainService;
        await mainService.registerChildService(modelService, ConstructedModelDescriptor);

        model = mainService.createDataObject(ConstructedModelDescriptor);

        expect(model.wasConstructed).toBe(true);
    });

    it("keeps DataTrigger accessors after running ES class constructors", async function () {
        var mainService = new DataService(),
            modelService = new RawDataService(),
            model;

        defaultEventManager.application.mainService = mainService;
        await mainService.registerChildService(modelService, ConstructedModelDescriptor);

        model = mainService.createDataObject(ConstructedModelDescriptor);

        expect(model.wasConstructed).toBe(true);
        expect(model.computedValue).toBe("constructed");
    });

    it("runs ES parent and specialize constructors when creating data objects", async function () {
        var mainService = new DataService(),
            modelService = new RawDataService(),
            model;

        defaultEventManager.application.mainService = mainService;
        await mainService.registerChildService(modelService, ConstructedSpecializedModelDescriptor);

        model = mainService.createDataObject(ConstructedSpecializedModelDescriptor);

        expect(model.wasConstructed).toBe(true);
        expect(model.wasSpecializedConstructed).toBe(true);
    });

    it("does not fetch scalar properties when their getter is read", async function () {
        var mainService = new DataService(),
            modelService = new RawDataService(),
            model;

        defaultEventManager.application.mainService = mainService;
        await mainService.registerChildService(modelService, ConstructedModelDescriptor);
        spyOn(modelService, "fetchObjectProperty").and.returnValue(Promise.resolve());

        model = mainService.createDataObject(ConstructedModelDescriptor);
        mainService.unregisterCreatedDataObject(model);

        expect(model.id).toBeUndefined();
        expect(modelService.fetchObjectProperty).not.toHaveBeenCalled();

        model._id = "constructed-model-1";

        expect(model.id).toBe("constructed-model-1");
        expect(modelService.fetchObjectProperty).not.toHaveBeenCalled();
    });

    it("does not fetch primary-key scalar properties when they are in the snapshot", async function () {
        var mainService = new DataService(),
            modelService = new RawDataService(),
            mapping = new ExpressionDataMapping().initWithServiceObjectDescriptorAndSchema(modelService, ConstructedModelDescriptor),
            model;

        mapping.rawDataPrimaryKeys = ["id"];
        mapping.addObjectMappingRule("id", {"<-": "id"});
        modelService.addMappingForType(mapping, ConstructedModelDescriptor);

        defaultEventManager.application.mainService = mainService;
        await mainService.registerChildService(modelService, ConstructedModelDescriptor);

        model = modelService.getDataObject(ConstructedModelDescriptor, {id: "constructed-model-2"});
        model._id = undefined;
        spyOn(modelService, "fetchObjectProperty").and.returnValue(Promise.resolve());

        await mainService.getObjectProperties(model, "id");

        expect(model.id).toBe("constructed-model-2");
        expect(modelService.fetchObjectProperty).not.toHaveBeenCalled();
    });

    describe("saveObject()", () => {
        let animatedMovieService;
        let movieService;
        let mainService;
        let movie;
        let animatedMovie;
        let categoryService;

        beforeEach(async () => {
            mainService = new DataService();
            defaultEventManager.application.mainService = mainService;

            movieService = new RawDataService();
            animatedMovieService = new RawDataService();
            categoryService = new RawDataService();

            await mainService.registerChildService(movieService, movieDescriptor);
            await mainService.registerChildService(animatedMovieService, AnimatedMovieDescriptor);
            await mainService.registerChildService(categoryService, CategoyDescriptor);

            movie = mainService.createDataObject(movieDescriptor);
            animatedMovie = mainService.createDataObject(AnimatedMovieDescriptor);
        });

        describe("Single Object Validation on saveChanges()", () => {
            it("should validate an object with a valid title", async () => {
                // Setup: A valid title.
                movie.title = "Inception";

                // Execute:
                await mainService.saveChanges();

                // Assert:
                expect(movie.invalidityState).toBeDefined();
                expect(movie.invalidityState.size).toBe(0);
            });

            it("should invalidate an object with a title that is too short", async () => {
                // Setup:
                movie.title = "A";

                // Execute:
                await mainService.saveChanges();

                // Assert:
                expect(movie.invalidityState.size).toBe(1);
                expect(movie.invalidityState.has("title")).toBe(true);
                const titleErrors = movie.invalidityState.get("title");
                expect(titleErrors.length).toBe(1);
                expect(titleErrors[0].message).toContain("at least 2 characters");
            });

            it("should invalidate an object with a title containing forbidden characters", async () => {
                // Setup:
                movie.title = "Movie@Title";

                // Execute:
                await mainService.saveChanges();

                // Assert:
                expect(movie.invalidityState.size).toBe(1);
                expect(movie.invalidityState.has("title")).toBe(true);
                const titleErrors = movie.invalidityState.get("title");
                expect(titleErrors.length).toBe(1);
                expect(titleErrors[0].message).toContain("cannot contain the '@'");
            });

            it("should report multiple errors for a single property that violates multiple rules", async () => {
                // Setup: The title is both too short and contains an invalid character.
                movie.title = "@";

                // Execute:
                await mainService.saveChanges();

                // Assert:
                expect(movie.invalidityState.size).toBe(1);
                expect(movie.invalidityState.has("title")).toBe(true);
                const titleErrors = movie.invalidityState.get("title");
                expect(titleErrors.length).toBe(2);

                // Check that both expected error messages are present.
                expect(titleErrors.some((err) => err.message.includes("at least 2 characters"))).toBe(true);
                expect(titleErrors.some((err) => err.message.includes("cannot contain the '@'"))).toBe(true);
            });

            it("should report errors for multiple invalid properties on the same object", async () => {
                // Setup:
                movie.title = "T"; // Invalid: too short
                movie.releaseDate = new Date("2050-01-01"); // Invalid: in the future

                // Execute:
                await mainService.saveChanges();

                // Assert:
                expect(movie.invalidityState.size).toBe(2); // One entry for each invalid property.
                expect(movie.invalidityState.has("title")).toBe(true);
                expect(movie.invalidityState.has("releaseDate")).toBe(true);

                // Verify title error
                const titleErrors = movie.invalidityState.get("title");
                expect(titleErrors.length).toBe(1);
                expect(titleErrors[0].message).toContain("at least 2 characters");

                // Verify releaseDate error
                const dateErrors = movie.invalidityState.get("releaseDate");
                expect(dateErrors.length).toBe(1);
                expect(dateErrors[0].message).toContain("before 2042");
            });

            it("should clear the invalidity state after correcting a property and saving again", async () => {
                // Setup: Make the object invalid first.
                movie.title = "T";
                await mainService.saveChanges();

                // Assert initial invalid state
                expect(movie.invalidityState.size).toBe(1);
                expect(movie.invalidityState.has("title")).toBe(true);

                // Execute: Correct the property and save again.
                movie.title = "The Corrected Title";
                await mainService.saveChanges();

                // Assert final valid state
                expect(movie.invalidityState.size).toBe(0);
            });

            it("should add to the invalidity state after making a valid object invalid", async () => {
                // Setup: Start with a valid object.
                movie.title = "A Valid Title";
                await mainService.saveChanges();

                // Assert initial valid state
                expect(movie.invalidityState.size).toBe(0);

                // Execute: Make the property invalid and save again.
                movie.title = "T";
                await mainService.saveChanges();

                // Assert final invalid state
                expect(movie.invalidityState.size).toBe(1);
                expect(movie.invalidityState.has("title")).toBe(true);
            });

            it("should report errors for an invalid title and invalid animationStyle", async () => {
                // Setup:
                movie.title = "A Valid Title";
                animatedMovie.title = "T"; // Invalid: too short
                animatedMovie.animationStyle = "Live Action"; // Invalid: not '2d' or '3d'

                // Execute:
                await mainService.saveChanges();

                // Assert:
                expect(animatedMovie.invalidityState.size).toBe(2); // One entry for each invalid property.
                expect(animatedMovie.invalidityState.has("title")).toBe(true);
                expect(animatedMovie.invalidityState.has("animationStyle")).toBe(true);

                // Verify title error
                const titleErrors = animatedMovie.invalidityState.get("title");
                expect(titleErrors.length).toBe(1);
                expect(titleErrors[0].message).toContain("at least 2 characters");

                // Verify animationStyle error
                const styleErrors = animatedMovie.invalidityState.get("animationStyle");
                expect(styleErrors.length).toBe(1);
                expect(styleErrors[0].message).toBe("Animation style must be either '2d' or '3d'.");
            });

            it("should not report errors for an object when its descriptor has no validation rules", async () => {
                const category = mainService.createDataObject(CategoyDescriptor);

                // Verify valid state with no additional data.
                await mainService.saveChanges();

                expect(category.invalidityState).toBeDefined();
                expect(category.invalidityState.size).toBe(0);
            });
        });
    });
});
