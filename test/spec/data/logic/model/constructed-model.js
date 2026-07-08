var DataObject = require("mod/data/model/data-object").DataObject;

exports.ConstructedModel = class ConstructedModel extends DataObject {
    constructor() {
        super();
        this.wasConstructed = true;
        this.baseValue = "constructed";
    }
};

exports.ConstructedSpecializedModel = exports.ConstructedModel.specialize({
    constructor: {
        value: function ConstructedSpecializedModel() {
            this.wasSpecializedConstructed = true;
        }
    }
});
