var Component = require("mod/ui/component").Component;

exports.Main = Component.specialize(/** @lends Main# */ {

    /**
     * Drives the condition using the default "remove" removal strategy.
     */
    removeValue: {
        value: true
    },

    /**
     * Drives the condition using the "hide" removal strategy.
     */
    hideValue: {
        value: true
    },

    /**
     * Starts false so the bound condition exercises the
     * deserialization-time content clearing path.
     */
    initiallyFalseValue: {
        value: false
    }

});
