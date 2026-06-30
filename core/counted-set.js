const   Set = require("./collections/set"),
        Montage = require("./core").Montage;


/**
 * The CountedSet keeps a counter associated with object inserted into it. It keeps track of the number of times objects are inserted and objects are really removed when they've been removed the same number of times.
 *
 * @class CountedSet
 * @classdesc todo
 * @extends Set
 */

const CountedSet = exports.CountedSet = class CountedSet extends Set {

    static {

        Montage.defineProperties(this.prototype, {
            __contentCount: {value: null}
        });

    }

    constructor (...args) {
        super(...args);
    }

    get _contentCount() {
        return this.__contentCount || (this.__contentCount = new Map());
    }

    add(value) {
        var currentCount = this._contentCount.get(value) || (this.has(value) ? 1 : 0);
        if(currentCount === 0) {
            super.add(value);
        }
        this._contentCount.set(value,++currentCount);
        return this;
    }

    delete(value) {
        var currentCount = (this.__contentCount?.get(value) || (this.has(value) ? 1 : 0));

        if(currentCount) {
            this._contentCount.set(value,--currentCount);
            if(currentCount === 0) {
                if(!this.has(value)) {
                    console.error("Attempt to delete object that is actually gone, mismatch in add/delete?");
                }
                this._contentCount.delete(value);
                super.delete(value);
                return true;
            }
        }
        return false;
    }

    clear() {
        this.__contentCount?.clear();
        super.clear();
    }

    countFor(value) {
        return this.__contentCount?.get(value) || 0;
    }

};


// var CountedSet = exports.CountedSet = function CountedSet(iterable) {
//     // var element;


//     // for (element of iterable) {
//     //     this.add(element);
//     // }
//     // return this;

//     var inst = new Set(iterable);
//     inst.__proto__ = CountedSet.prototype;
//     inst._contentCount = new Map();
//     return inst;

// }

// CountedSet.prototype = Object.create(Set.prototype);

// CountedSet.prototype._add = Set.prototype.add;
// CountedSet.prototype.add = function(value) {
//     var currentCount = this._contentCount.get(value) || (this.has(value) ? 1 : 0);
//     if(currentCount === 0) {
//         this._add(value);
//     }
//     this._contentCount.set(value,++currentCount);
//     return this;
//     //console.log("CountedSet add: countFor "+value.identifier.primaryKey+" is ",currentCount);
// }
// CountedSet.prototype._delete = Set.prototype.delete;
// CountedSet.prototype.delete = function(value) {
//     var currentCount = this._contentCount.get(value) || (this.has(value) ? 1 : 0);
//     if(currentCount) {
//         this._contentCount.set(value,--currentCount);
//         if(currentCount === 0) {
//             if(!this.has(value)) {
//                 console.error("Attempt to delete object that is actually gone, mismatch in add/delete?");
//             }
//             this._contentCount.delete(value);
//             this._delete(value);
//             return true;
//         }
//     }
//     return false;
//     //console.log("CountedSet delete: countFor "+value.identifier.primaryKey+" is ",currentCount);
// }

// CountedSet.prototype._clear = Set.prototype.clear;
// CountedSet.prototype.clear = function(value) {
//     this._contentCount.clear();
//     this._clear();
// };


// CountedSet.prototype.countFor = function(value) {
//     return this._contentCount.get(value) || 0;
// }
