var eventManager = require("mod/core/event/event-manager").defaultEventManager,
    MutableEvent = require("mod/core/event/mutable-event").MutableEvent,
    Component = require("mod/ui/component").Component,
    PressComposer = require("mod/composer/press-composer").PressComposer,
    TranslateComposer = require("mod/composer/translate-composer").TranslateComposer;

describe("Pointer input", function () {
    var storage = eventManager._pointerStorage,
        previousMemory, previousStoring, previousDragging, previousMouseOnly,
        element, component, composer;

    function pointer(type, kind, id, x, time) {
        var event = new PointerEvent(type, {
            bubbles: true, cancelable: true, pointerType: kind, pointerId: id,
            isPrimary: true, button: type === "pointermove" ? -1 : 0,
            buttons: type === "pointerup" || type === "pointercancel" ? 0 : 1,
            clientX: x || 0, clientY: 20
        });
        if (time !== undefined) {
            Object.defineProperty(event, "timeStamp", {value: time});
        }
        return event;
    }

    function store(type, kind, id, x, time) {
        var event = MutableEvent.fromEvent(pointer(type, kind, id, x, time));
        storage.storeEvent(event);
        return event;
    }

    function mount(Composer) {
        element = document.createElement("div");
        element.style.cssText = "position:fixed;left:0;top:0;width:100px;height:100px";
        document.body.appendChild(element);
        component = new Component();
        component.hasTemplate = false;
        component.element = element;
        composer = new Composer();
        composer.component = component;
        composer.element = element;
        composer.load();
        return composer;
    }

    beforeEach(function () {
        previousMemory = storage.memory;
        previousStoring = eventManager.isStoringPointerEvents;
        previousDragging = eventManager._isMouseDragging;
        previousMouseOnly = eventManager.isStoringMouseEventsWhileDraggingOnly;
        storage.memory = {};
        eventManager._isMouseDragging = false;
        eventManager.isStoringMouseEventsWhileDraggingOnly = true;
        eventManager.isStoringPointerEvents = true;
    });

    afterEach(function () {
        if (composer) {
            if (composer instanceof PressComposer) {
                composer.cancelPress();
            } else if (composer._observedPointer !== null) {
                composer._releaseInterest();
            }
            composer.unload();
            element.remove();
            composer = component = element = null;
        }
        eventManager.isStoringPointerEvents = previousStoring;
        storage.memory = previousMemory;
        eventManager._isMouseDragging = previousDragging;
        eventManager.isStoringMouseEventsWhileDraggingOnly = previousMouseOnly;
    });

    ["pen", "touch", "mouse"].forEach(function (kind) {
        var key = kind === "mouse" ? "mouse" : 41;

        it("tracks " + kind + " movement and releases history on pointerup", function () {
            store("pointerdown", kind, 41, 10, 100);
            var move = store("pointermove", kind, 41, 30, 120);
            expect(storage.getMemory(key).size).toBe(2);
            expect(move.velocity.x).toBeGreaterThan(0);
            var up = store("pointerup", kind, 41, 50, 140);
            expect(up.velocity.speed).toBeGreaterThan(0);
            storage.removeEvent(up);
            expect(!!storage.isStored(key)).toBe(false);
            expect(function () { return up.velocity; }).not.toThrow();
            expect(up.velocity).toBeUndefined();
        });

        it("cleans up cancelled " + kind + " history", function () {
            store("pointerdown", kind, 41, 10, 100);
            storage.removeEvent(pointer("pointercancel", kind, 41));
            expect(!!storage.isStored(key)).toBe(false);
            expect(eventManager._isMouseDragging).toBe(false);
        });

        it("dispatches a press from DOM " + kind + " input", function () {
            mount(PressComposer);
            var press = jasmine.createSpy("press");
            composer.addEventListener("press", press);
            element.dispatchEvent(pointer("pointerdown", kind, 41, 20));
            expect(composer.state).toBe(PressComposer.PRESSED);
            element.dispatchEvent(pointer("pointerup", kind, 41, 20));
            expect(press.calls.count()).toBe(1);
            expect(composer.state).toBe(PressComposer.UNPRESSED);
        });

        it("cancels an active DOM " + kind + " drag", function () {
            mount(TranslateComposer);
            var cancel = jasmine.createSpy("translateCancel");
            composer.addEventListener("translateCancel", cancel);
            element.dispatchEvent(pointer("pointerdown", kind, 41, 10));
            element.dispatchEvent(pointer("pointermove", kind, 41, 30));
            element.dispatchEvent(pointer("pointercancel", kind, 41));
            expect(cancel.calls.count()).toBe(1);
            expect(composer._observedPointer).toBeNull();
            expect(composer.animateMomentum).toBe(false);
        });

        it("drags and releases with DOM " + kind + " input", function () {
            mount(TranslateComposer);
            composer.hasMomentum = false;
            var end = jasmine.createSpy("translateEnd");
            composer.addEventListener("translateEnd", end);
            element.dispatchEvent(pointer("pointerdown", kind, 41, 10, 100));
            element.dispatchEvent(pointer("pointermove", kind, 41, 30, 120));
            element.dispatchEvent(pointer("pointermove", kind, 41, 50, 140));
            expect(composer.translateX).toBeGreaterThan(0);
            element.dispatchEvent(pointer("pointerup", kind, 41, 50, 160));
            expect(end.calls.count()).toBe(1);
            expect(composer._observedPointer).toBeNull();
        });
    });

    it("keeps simultaneous pen and touch movement histories separate", function () {
        store("pointerdown", "pen", 41, 10, 100);
        store("pointerdown", "touch", 42, 100, 100);
        var pen = store("pointermove", "pen", 41, 30, 120),
            touch = store("pointermove", "touch", 42, 80, 120);
        expect(pen.velocity.x).toBeGreaterThan(0);
        expect(touch.velocity.x).toBeLessThan(0);
        expect(storage.getMemory("mouse")).toBeUndefined();
        storage.removeEvent(pointer("pointercancel", "touch", 42));
        expect(storage.isStored(41)).toBe(true);
        expect(!!storage.isStored(42)).toBe(false);
    });

    it("ignores cancellation of another pointer during a pen drag", function () {
        mount(TranslateComposer);
        composer.hasMomentum = false;
        var cancel = jasmine.createSpy("translateCancel");
        composer.addEventListener("translateCancel", cancel);
        element.dispatchEvent(pointer("pointerdown", "pen", 41, 10));
        element.dispatchEvent(pointer("pointermove", "pen", 41, 30));
        element.dispatchEvent(pointer("pointercancel", "touch", 42));
        expect(composer._observedPointer).toBe(41);
        expect(cancel).not.toHaveBeenCalled();
        element.dispatchEvent(pointer("pointercancel", "pen", 41));
        expect(cancel.calls.count()).toBe(1);
        expect(composer._observedPointer).toBeNull();
        expect(!!storage.isStored(41)).toBe(false);
    });

    it("cancels a pen press without dispatching an action and accepts the next press", function () {
        mount(PressComposer);
        var press = jasmine.createSpy("press"), cancel = jasmine.createSpy("pressCancel");
        composer.addEventListener("press", press);
        composer.addEventListener("pressCancel", cancel);
        element.dispatchEvent(pointer("pointerdown", "pen", 41, 20));
        element.dispatchEvent(pointer("pointercancel", "touch", 42, 20));
        expect(composer.state).toBe(PressComposer.PRESSED);
        element.dispatchEvent(pointer("pointercancel", "pen", 41, 20));
        expect(cancel.calls.count()).toBe(1);
        expect(press).not.toHaveBeenCalled();
        element.dispatchEvent(pointer("pointerdown", "pen", 43, 20));
        element.dispatchEvent(pointer("pointerup", "pen", 43, 20));
        expect(press.calls.count()).toBe(1);
    });

    it("calculates pen momentum from its own movement history", function () {
        mount(TranslateComposer);
        composer.hasMomentum = true;
        spyOn(composer, "_animationInterval");
        element.dispatchEvent(pointer("pointerdown", "pen", 41, 10, 100));
        element.dispatchEvent(pointer("pointermove", "pen", 41, 30, 120));
        element.dispatchEvent(pointer("pointermove", "pen", 41, 50, 140));
        element.dispatchEvent(pointer("pointerup", "pen", 41, 70, 160));
        expect(composer.animateMomentum).toBe(true);
        expect(isFinite(composer.momentumX)).toBe(true);
        expect(composer.momentumX).not.toBe(0);
        expect(composer._animationInterval).toHaveBeenCalled();
        expect(composer._observedPointer).toBeNull();
    });

    it("ignores framework events without a native event while tracking input", function () {
        var event = MutableEvent.fromType("action", true, true);
        expect(function () {
            storage.storeEvent(event);
            storage.removeEvent(event);
        }).not.toThrow();
        expect(Object.keys(storage.memory).length).toBe(0);
    });

    it("safely reads velocity without recorded movement", function () {
        var event = MutableEvent.fromEvent(pointer("pointermove", "pen", 999, 10));
        expect(function () { return event.velocity; }).not.toThrow();
        expect(event.velocity).toBeUndefined();
    });

    it("can disable and re-enable pointer tracking", function () {
        eventManager.isStoringPointerEvents = false;
        expect(function () { eventManager.isStoringPointerEvents = true; }).not.toThrow();
        var event = store("pointerdown", "pen", 41, 10, 100);
        expect(event.velocity).toBeDefined();
    });

    it("retains legacy mouse event tracking without pointerType", function () {
        var down = MutableEvent.fromEvent(new MouseEvent("mousedown", {clientX: 10}));
        storage.storeEvent(down);
        expect(storage.isStored("mouse")).toBe(true);
        expect(down.velocity).toBeDefined();
        storage.removeEvent(new MouseEvent("mouseup"));
        expect(!!storage.isStored("mouse")).toBe(false);
    });

    it("retains legacy touch event tracking and cancellation without pointerType", function () {
        if (!window.TouchEvent) { pending("TouchEvent is unavailable in this browser"); return; }
        var down = new TouchEvent("touchstart"), cancel = new TouchEvent("touchcancel"),
            touches = [{identifier: 41, clientX: 10, clientY: 20}];
        Object.defineProperty(down, "touches", {value: touches});
        Object.defineProperty(cancel, "changedTouches", {value: touches});
        storage.storeEvent(MutableEvent.fromEvent(down));
        expect(storage.isStored(41)).toBe(true);
        storage.removeEvent(cancel);
        expect(!!storage.isStored(41)).toBe(false);
    });
});
