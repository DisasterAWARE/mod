var DataService = require("mod/data/service/data-service").DataService,
    RawDataService = require("mod/data/service/raw-data-service").RawDataService,
    Promise = require("mod/core/promise").Promise;

describe("DataService property fetch routing", function () {
    var service, object, propertyDescriptor;

    beforeEach(function () {
        propertyDescriptor = {};
        object = {
            objectDescriptor: {
                propertyDescriptorForName: function () {
                    return propertyDescriptor;
                }
            }
        };
        service = new RawDataService();
        service.handlesType = function () { return true; };
        service.childServicesForType = function () { return []; };
        service.mappingForType = function () { return null; };
        service._propertyDescriptorForObjectAndName = function () { return propertyDescriptor; };
        service.isObjectCreated = function () { return false; };
        spyOn(service, "fetchRawObjectProperty").and.returnValue(Promise.resolve());
        spyOn(service, "_fetchObjectPropertyWithPropertyDescriptor").and.returnValue(Promise.resolve());
    });

    it("fetches a file through its named delegate before the generic raw fetch", function (done) {
        var file = {}, delegateThis, delegateObject;
        service.fetchFileProperty = jasmine.createSpy("fetchFileProperty").and.callFake(function (value) {
            delegateThis = this;
            delegateObject = value;
            return Promise.resolve().then(function () {
                value.file = file;
            });
        });

        service.fetchObjectProperty(object, "file").then(function () {
            expect(object.file).toBe(file);
            expect(delegateThis).toBe(service);
            expect(delegateObject).toBe(object);
            expect(service.fetchRawObjectProperty).not.toHaveBeenCalled();
            expect(service._fetchObjectPropertyWithPropertyDescriptor).not.toHaveBeenCalled();
            done();
        }).catch(done.fail);
    });

    it("uses the generic raw fetch when there is no named delegate", function () {
        service.fetchObjectProperty(object, "file");
        expect(service.fetchRawObjectProperty).toHaveBeenCalledWith(object, "file");
        expect(service._fetchObjectPropertyWithPropertyDescriptor).not.toHaveBeenCalled();
    });

    it("maps relationships instead of passing them to the generic raw fetch", function () {
        propertyDescriptor._valueDescriptorReference = {};
        service.fetchObjectProperty(object, "file");
        expect(service.fetchRawObjectProperty).not.toHaveBeenCalled();
        expect(service._fetchObjectPropertyWithPropertyDescriptor)
            .toHaveBeenCalledWith(object, "file", propertyDescriptor, false);
    });

    it("preserves named relationship delegates", function () {
        propertyDescriptor._valueDescriptorReference = {};
        service.fetchFileProperty = jasmine.createSpy("fetchFileProperty").and.returnValue(Promise.resolve());
        service.fetchObjectProperty(object, "file");
        expect(service.fetchFileProperty).toHaveBeenCalledWith(object);
        expect(service.fetchRawObjectProperty).not.toHaveBeenCalled();
        expect(service._fetchObjectPropertyWithPropertyDescriptor).not.toHaveBeenCalled();
    });

    it("forwards an unmapped file property from a root service to its owning child", function (done) {
        var parent = new DataService(), file = {};
        parent.handlesType = function () { return true; };
        parent.childServicesForType = function () { return [service]; };
        parent._getChildServiceForObject = function () { return service; };
        parent.isObjectCreated = function () { return false; };
        service.fetchFileProperty = function (value) {
            return Promise.resolve().then(function () { value.file = file; });
        };
        parent.fetchObjectProperty(object, "file").then(function () {
            expect(object.file).toBe(file);
            expect(service.fetchRawObjectProperty).not.toHaveBeenCalled();
            done();
        }).catch(done.fail);
    });

    it("keeps unmapped scalar properties local when the child has no named delegate", function () {
        var parent = new DataService();
        parent.handlesType = function () { return true; };
        parent.childServicesForType = function () { return [service]; };
        parent._getChildServiceForObject = function () { return service; };
        parent.isObjectCreated = function () { return false; };
        spyOn(service, "fetchObjectProperty");
        parent.fetchObjectProperty(object, "file");
        expect(service.fetchObjectProperty).not.toHaveBeenCalled();
    });

    it("resolves an unsupported property without a child or local fetcher", function (done) {
        var parent = new DataService();
        parent.handlesType = function () { return true; };
        parent.childServicesForType = function () { return []; };
        parent._getChildServiceForObject = function () { return null; };
        parent.isObjectCreated = function () { return false; };
        parent.fetchObjectProperty(object, "file").then(function () {
            expect(object.file).toBeUndefined();
            done();
        }).catch(done.fail);
    });

    it("forwards to the child when the parent does not handle the object type", function () {
        var child = {fetchObjectProperty: jasmine.createSpy("child fetch").and.returnValue(Promise.resolve())};
        service.handlesType = function () { return false; };
        service.childServicesForType = function () { return [child]; };
        service._getChildServiceForObject = function () { return child; };
        service.fetchFileProperty = jasmine.createSpy("parent file fetch");
        service.fetchObjectProperty(object, "file", false, true);
        expect(child.fetchObjectProperty).toHaveBeenCalledWith(object, "file", false, true);
        expect(service.fetchFileProperty).not.toHaveBeenCalled();
        expect(service.fetchRawObjectProperty).not.toHaveBeenCalled();
    });

    it("propagates named delegate failures without falling back to a raw fetch", function (done) {
        var error = new Error("File download failed");
        service.fetchFileProperty = function () { return Promise.reject(error); };
        service.fetchObjectProperty(object, "file").then(function () {
            done.fail("Expected the file delegate rejection");
        }, function (reason) {
            expect(reason).toBe(error);
            expect(service.fetchRawObjectProperty).not.toHaveBeenCalled();
            done();
        }).catch(done.fail);
    });
});
